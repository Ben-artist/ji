import { analyzeFundExposuresWithAi } from '#/lib/ai/dashscope'
import { fetchFundTopHoldings } from '#/lib/fund/tiantian'
import {
  getCachedFundTopHoldings,
  saveFundTopHoldingsCache,
} from '#/lib/supabase/cache'
import type { Holding } from './types'

const VAGUE_SECTORS = new Set(['其他', '周期', '综合', '未知'])

/** 笼统标签 → 更具体板块（AI 仍输出时兜底） */
const SECTOR_REWRITE: Record<string, string> = {
  其他: '科技',
  周期: '化工',
  综合: '科技',
  未知: '科技',
}

/**
 * 是否含笼统板块名，需要重新 AI 拆解。
 * @param holding 持仓
 * @returns 是否需要 enrich
 */
function needsSectorRefresh(holding: Holding): boolean {
  if (
    !holding.themeSectors ||
    Object.keys(holding.themeSectors).length === 0 ||
    Object.keys(holding.subThemes).length === 0
  ) {
    return true
  }
  return Object.keys(holding.sectors).some((s) => VAGUE_SECTORS.has(s))
}

/**
 * 去掉笼统板块名并归一化。
 * @param sectors 原始板块
 * @returns 清洗后的板块
 */
function sanitizeSectors(
  sectors: Record<string, number>,
): Record<string, number> {
  const cleaned: Record<string, number> = {}
  for (const [k, v] of Object.entries(sectors)) {
    if (!Number.isFinite(v) || v <= 0) continue
    const name = SECTOR_REWRITE[k] ?? k
    if (VAGUE_SECTORS.has(name)) continue
    cleaned[name] = (cleaned[name] ?? 0) + v
  }
  return normalizeWeights(cleaned)
}

/**
 * 拉取重仓并用千问刷新一级板块 / 子赛道；失败时保留原启发式结果。
 * @param holdings 当前持仓
 * @returns 带 AI 子赛道的持仓副本
 */
export async function enrichHoldingsExposureWithAi(
  holdings: Holding[],
): Promise<Holding[]> {
  const equityLike = holdings.filter(
    (h) =>
      h.assetClass === '股票' &&
      h.code &&
      h.code !== 'UNKNOWN' &&
      /^\d{6}$/.test(h.code),
  )
  if (equityLike.length === 0) return holdings

  // 已有可用 AI 细分且无笼统板块时跳过（例如只改金额）
  const needsEnrich = equityLike.some((h) => needsSectorRefresh(h))
  if (!needsEnrich) return holdings

  const snapshots = await Promise.all(
    equityLike.map(async (h) => {
      try {
        const cached = await getCachedFundTopHoldings(h.code)
        if (cached?.stocks.length) {
          return { code: h.code, name: h.name, stocks: cached.stocks }
        }
        const { stocks, reportDate } = await fetchFundTopHoldings(h.code)
        try {
          await saveFundTopHoldingsCache(
            {
              code: h.code,
              name: h.name,
              fundType: h.fundType,
              assetClass: h.assetClass,
            },
            reportDate,
            stocks,
          )
        } catch {
          // ignore cache write errors
        }
        return { code: h.code, name: h.name, stocks }
      } catch {
        return { code: h.code, name: h.name, stocks: [] }
      }
    }),
  )

  const withStocks = snapshots.filter((s) => s.stocks.length > 0)
  if (withStocks.length === 0) return holdings

  let aiRows
  try {
    aiRows = await analyzeFundExposuresWithAi(withStocks)
  } catch {
    return holdings.map((h) =>
      equityLike.some((e) => e.id === h.id)
        ? { ...h, sectors: sanitizeSectors(h.sectors) }
        : h,
    )
  }

  const byCode = new Map(aiRows.map((r) => [r.code, r]))

  return holdings.map((h) => {
    const ai = byCode.get(h.code)
    if (!ai) {
      return equityLike.some((e) => e.id === h.id)
        ? { ...h, sectors: sanitizeSectors(h.sectors) }
        : h
    }

    const baseSectors =
      Object.keys(ai.sectors).length > 0 ? { ...ai.sectors } : { ...h.sectors }

    const subThemes: Record<string, number> = {}
    const themeSectors: Record<string, string> = {}
    for (const theme of ai.themes) {
      const key = theme.name
      const parent = SECTOR_REWRITE[theme.parentSector] ?? theme.parentSector
      if (VAGUE_SECTORS.has(parent)) continue
      // AI 偶发返回百分数（如 9.5），统一收成 0~1 比例
      let weight = theme.weight
      if (weight > 1) weight = weight / 100
      if (weight <= 0) continue
      subThemes[key] = (subThemes[key] ?? 0) + weight
      themeSectors[key] = parent
      if (!(parent in baseSectors)) {
        baseSectors[parent] = Math.max(weight, baseSectors[parent] ?? 0)
      }
    }

    return {
      ...h,
      sectors: sanitizeSectors(baseSectors),
      subThemes,
      themeSectors,
    }
  })
}

/**
 * 将权重归一化为和约 1。
 * @param weights 原始权重
 * @returns 归一化后的权重
 */
function normalizeWeights(
  weights: Record<string, number>,
): Record<string, number> {
  const entries = Object.entries(weights).filter(
    ([, v]) => Number.isFinite(v) && v > 0,
  )
  const sum = entries.reduce((s, [, v]) => s + v, 0)
  if (sum <= 0) return { 科技: 1 }
  const out: Record<string, number> = {}
  for (const [k, v] of entries) {
    out[k] = Number((v / sum).toFixed(4))
  }
  return out
}
