import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { qwenChatStream } from '#/lib/ai/dashscope'
import { fetchFundTopHoldings } from '#/lib/fund/tiantian'
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
              // 先推状态；聊天不再重跑耗时 enrich，尽快进入流式
              sendEvent(controller, encoder, {
                type: 'status',
                status: 'thinking',
              })

              await consumeQuota(parsed.accessToken, 1)

              // 持仓在首页分析时已 enrich，对话只做本地重算
              const analysis = analyzePortfolio(parsed.holdings as Holding[])

              const codeMatch = parsed.message.match(/\b(\d{6})\b/)
              let topHoldingsNote = ''
              if (codeMatch) {
                try {
                  const top = await fetchFundTopHoldings(codeMatch[1])
                  if (top.stocks.length) {
                    topHoldingsNote = `\n基金 ${codeMatch[1]} 十大重仓（报告期 ${top.reportDate ?? '未知'}）：${top.stocks
                      .map((s) => `${s.name}(${s.code}) ${s.weight}%`)
                      .join('；')}`
                  }
                } catch {
                  topHoldingsNote = `\n未能拉取基金 ${codeMatch[1]} 的重仓数据。`
                }
              }

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
                      content:
                        '你是基金持仓分析助手「基今」。根据给定 JSON 上下文回答用户问题，简洁、可执行，不要编造未提供的数据。可用 Markdown。结尾可提醒：内容仅供参考，不构成投资建议。',
                    },
                    {
                      role: 'user',
                      content: `持仓分析上下文：\n${JSON.stringify(context)}\n${topHoldingsNote}\n\n用户问题：${parsed.message}`,
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
                const fallback = `${answerPortfolioChat(parsed.message, analysis)}${topHoldingsNote}`
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
            // 告诉 Nginx 不要缓冲 SSE，否则会整段攒完再吐
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
