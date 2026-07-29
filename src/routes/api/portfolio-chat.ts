import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { qwenChatStream } from '#/lib/ai/dashscope'
import {
  buildFundChatEnrichment,
  PORTFOLIO_CHAT_SYSTEM_PROMPT,
} from '#/lib/portfolio/chat-enrichment'
import {
  analyzePortfolio,
  answerPortfolioChat,
} from '#/lib/portfolio/analyze'
import type { Holding } from '#/lib/portfolio/types'
import { consumeQuota } from '#/lib/supabase/server'

const bodySchema = z.object({
  accessToken: z.string().min(20),
  message: z.string().min(1).max(2000),
  holdings: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      fundType: z.enum([
        '股票型',
        '混合型',
        '债券型',
        '指数型',
        '货币型',
        'QDII',
        '其他',
      ]),
      amount: z.number(),
      weight: z.number(),
      sectors: z.record(z.string(), z.number()),
      subThemes: z.record(z.string(), z.number()),
      themeSectors: z.record(z.string(), z.string()).optional(),
      assetClass: z.enum(['股票', '债券', '货币', '另类', '现金']),
      needsReview: z.boolean().optional(),
    }),
  ),
})

/**
 * 写一条 SSE data 行。
 * @param controller 流控制器
 * @param encoder 文本编码器
 * @param payload 事件对象
 */
function sendEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: Record<string, unknown>,
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
}

export const Route = createFileRoute('/api/portfolio-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof bodySchema>
        try {
          parsed = bodySchema.parse(await request.json())
        } catch {
          return Response.json({ error: '请求参数无效' }, { status: 400 })
        }

        const encoder = new TextEncoder()
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              sendEvent(controller, encoder, {
                type: 'status',
                status: 'thinking',
              })

              await consumeQuota(parsed.accessToken, 1)

              const holdings = parsed.holdings as Holding[]
              const analysis = analyzePortfolio(holdings)
              const enrichment = await buildFundChatEnrichment(
                parsed.message,
                holdings,
              )

              const context = {
                summary: analysis.summary,
                scores: analysis.scores,
                overlaps: analysis.overlaps.slice(0, 5),
                sectorDetails: analysis.sectorDetails.slice(0, 4).map((s) => ({
                  sector: s.sector,
                  portfolioWeight: s.portfolioWeight,
                  themes: s.themes.slice(0, 6),
                })),
                suggestions: analysis.suggestions,
                rebalanceActions: analysis.rebalanceActions,
                holdings: analysis.holdings.map((h) => ({
                  code: h.code,
                  name: h.name,
                  amount: h.amount,
                  weight: h.weight,
                  fundType: h.fundType,
                })),
                totalAmount: analysis.totalAmount,
              }

              sendEvent(controller, encoder, {
                type: 'status',
                status: 'streaming',
              })

              try {
                await qwenChatStream(
                  [
                    {
                      role: 'system',
                      content: PORTFOLIO_CHAT_SYSTEM_PROMPT,
                    },
                    {
                      role: 'user',
                      content: `持仓分析上下文：\n${JSON.stringify(context)}${enrichment}\n\n用户问题：${parsed.message}`,
                    },
                  ],
                  (delta) => {
                    sendEvent(controller, encoder, {
                      type: 'delta',
                      text: delta,
                    })
                  },
                )
              } catch {
                const fallback = `${answerPortfolioChat(parsed.message, analysis)}${enrichment}`
                sendEvent(controller, encoder, {
                  type: 'delta',
                  text: fallback,
                })
              }

              sendEvent(controller, encoder, {
                type: 'done',
                analysis,
              })
            } catch (err) {
              sendEvent(controller, encoder, {
                type: 'error',
                message:
                  err instanceof Error ? err.message : '对话失败，请稍后重试',
              })
            } finally {
              controller.close()
            }
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
