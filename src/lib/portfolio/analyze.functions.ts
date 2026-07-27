import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  describeListedCompany,
  extractJsonObject,
  structureHoldingsFromOcrText,
} from '#/lib/ai/dashscope'
import { aliyunOcrRecognizeText } from '#/lib/ai/aliyun-ocr'
import {
  buildHoldingFromFund,
  fetchFundTopHoldings,
  searchTiantianFunds,
} from '#/lib/fund/tiantian'
import {
  getCachedFundTopHoldings,
  getCachedStockBrief,
  saveFundTopHoldingsCache,
  saveStockBrief,
} from '#/lib/supabase/cache'
import { consumeQuota } from '#/lib/supabase/server'
import { analyzePortfolio } from './analyze'
import { enrichHoldingsExposureWithAi } from './enrich-exposure'
import type { Holding, OcrImportResult, PortfolioAnalysis } from './types'

const holdingSchema = z.object({
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
})

const ocrItemSchema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  amount: z.number().optional().nullable(),
  weight: z.number().optional().nullable(),
})

/**
 * 对用户提交的持仓重新分析。
 * @returns 分析结果
 */
export const runPortfolioAnalysis = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z
      .object({
        accessToken: z.string().min(20),
        holdings: z.array(holdingSchema),
        /** 识别后紧接着分析时可跳过，避免连扣两次 */
        skipQuota: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<PortfolioAnalysis> => {
    if (!data.skipQuota) {
      await consumeQuota(data.accessToken, 1)
    }
    const enriched = await enrichHoldingsExposureWithAi(
      data.holdings as Holding[],
    )
    return analyzePortfolio(enriched)
  })

/**
 * 使用阿里云 OCR 识别截图，再用千问结构化为持仓（支持多张 data URL）。
 * @returns 合并后的持仓识别结果
 */
export const recognizePortfolioImages = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z
      .object({
        accessToken: z.string().min(20),
        images: z.array(z.string().min(32)).min(1).max(5),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<OcrImportResult> => {
    await consumeQuota(data.accessToken, 1)
    const warnings: string[] = []
    const merged = new Map<string, Holding>()

    for (const [index, image] of data.images.entries()) {
      try {
        const ocrText = await aliyunOcrRecognizeText(image)
        const structured = await structureHoldingsFromOcrText(ocrText)
        const raw = extractJsonObject(structured)
        const parsed = JSON.parse(raw) as {
          items?: unknown
        }
        const items = z.array(ocrItemSchema).parse(parsed.items ?? [])
        for (const item of items) {
          const name = (item.name ?? '').trim()
          let code = (item.code ?? '').trim()
          if (!name && !code) continue

          let amount = Number(item.amount ?? 0)
          if (!Number.isFinite(amount) || amount <= 0) {
            const w = Number(item.weight ?? 0)
            amount = Number.isFinite(w) && w > 0 ? w * 1000 : 0
          }
          if (amount <= 0) {
            continue
          }

          if (!code && name) {
            try {
              const hits = await searchTiantianFunds(name)
              code = hits[0]?.code ?? ''
            } catch {
              // 无代码仍可按名称入库
            }
          }

          const key = code || name
          const existing = merged.get(key)
          if (existing) {
            existing.amount += amount
            existing.needsReview = true
            continue
          }

          if (code) {
            try {
              const hits = await searchTiantianFunds(code)
              const hit = hits.find((h) => h.code === code) ?? hits[0]
              if (hit) {
                const holding = await buildHoldingFromFund(hit, amount)
                holding.needsReview = true
                if (name) holding.name = name
                merged.set(key, holding)
                continue
              }
            } catch {
              // fall through
            }
          }

          merged.set(key, {
            id: `ocr-${index}-${merged.size}`,
            code: code || 'UNKNOWN',
            name: name || code || '未命名基金',
            fundType: '其他',
            amount,
            weight: 0,
            assetClass: '股票',
            sectors: { 科技: 1 },
            subThemes: {},
            needsReview: true,
          })
        }
      } catch (err) {
        warnings.push(
          `第 ${index + 1} 张图识别失败：${err instanceof Error ? err.message : '未知错误'}`,
        )
      }
    }

    const holdings = [...merged.values()]
    if (holdings.length === 0) {
      return {
        holdings: [],
        recognizedCount: 0,
        successRate: 0,
        warnings: warnings.length
          ? warnings
          : ['未识别到有效持仓，请换更清晰的截图'],
      }
    }

    return {
      holdings,
      recognizedCount: holdings.length,
      successRate: Math.min(
        98,
        Math.round((holdings.length / Math.max(holdings.length, 1)) * 90 + 8),
      ),
      warnings: [],
    }
  })

/**
 * 搜索可添加基金（天天基金）。
 * @returns 匹配的基金列表
 */
export const searchFunds = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    z.object({ q: z.string().default('') }).parse(data ?? { q: '' }),
  )
  .handler(async ({ data }) => {
    const q = data.q.trim()
    if (!q) return []
    const hits = await searchTiantianFunds(q)
    return hits.map((h) => ({
      code: h.code,
      name: h.name,
      fundType: h.fundType,
      assetClass: h.assetClass,
      sectors: { 科技: 1 } as Record<string, number>,
      subThemes: {} as Record<string, number>,
    }))
  })

/**
 * 查询单只基金十大重仓股（优先读库缓存）。
 * @returns 重仓列表与报告期
 */
export const getFundTopHoldings = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    z.object({ code: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) => {
    const cached = await getCachedFundTopHoldings(data.code)
    if (cached?.stocks.length) return cached

    const fresh = await fetchFundTopHoldings(data.code)
    try {
      await saveFundTopHoldingsCache(
        { code: data.code, name: data.code },
        fresh.reportDate,
        fresh.stocks,
      )
    } catch {
      // 缓存失败不影响主流程
    }
    return fresh
  })

/**
 * 生成上市公司业务简介（优先读库缓存）。
 * @returns 简介文本
 */
export const getStockBrief = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z
      .object({
        code: z.string().min(1),
        name: z.string().min(1),
        industry: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const cached = await getCachedStockBrief(data.code)
    if (cached) return { brief: cached }

    const brief = await describeListedCompany(data)
    try {
      await saveStockBrief({ ...data, brief })
    } catch {
      // ignore
    }
    return { brief }
  })

/**
 * 按代码/金额生成完整持仓条目（含重仓推断）。
 * @returns Holding
 */
export const prepareFundHolding = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z
      .object({
        code: z.string().min(1),
        name: z.string().optional(),
        amount: z.number().positive(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const hits = await searchTiantianFunds(data.code)
    const hit =
      hits.find((h) => h.code === data.code) ??
      hits[0] ?? {
        code: data.code,
        name: data.name || data.code,
        fundType: '其他' as const,
        assetClass: '股票' as const,
      }
    if (data.name) hit.name = data.name
    return buildHoldingFromFund(hit, data.amount)
  })
