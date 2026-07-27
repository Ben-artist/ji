import { createServiceSupabase } from './server'

export interface CachedTopStock {
  code: string
  name: string
  weight: number
  industry?: string
}

/**
 * 读取缓存的基金十大重仓；没有则返回 null。
 * @param fundCode 基金代码
 * @returns 重仓与报告期
 */
export async function getCachedFundTopHoldings(fundCode: string): Promise<{
  stocks: CachedTopStock[]
  reportDate: string | null
} | null> {
  const db = createServiceSupabase()
  const { data, error } = await db
    .from('fund_top_holdings')
    .select('report_date, stock_code, stock_name, weight, industry, rank')
    .eq('fund_code', fundCode)
    .order('rank', { ascending: true })

  if (error || !data?.length) return null

  const reportDate = data[0]?.report_date ?? null
  const latest = data.filter((r) => r.report_date === reportDate)
  return {
    reportDate,
    stocks: latest.map((r) => ({
      code: r.stock_code,
      name: r.stock_name,
      weight: Number(r.weight),
      industry: r.industry ?? undefined,
    })),
  }
}

/**
 * 写入基金与十大重仓缓存。
 * @param fund 基金信息
 * @param reportDate 报告期
 * @param stocks 重仓列表
 */
export async function saveFundTopHoldingsCache(
  fund: { code: string; name: string; fundType?: string; assetClass?: string },
  reportDate: string | null,
  stocks: CachedTopStock[],
): Promise<void> {
  if (!reportDate || stocks.length === 0) return
  const db = createServiceSupabase()
  await db.from('funds').upsert({
    code: fund.code,
    name: fund.name,
    fund_type: fund.fundType ?? null,
    asset_class: fund.assetClass ?? null,
    updated_at: new Date().toISOString(),
  })

  await db
    .from('fund_top_holdings')
    .delete()
    .eq('fund_code', fund.code)
    .eq('report_date', reportDate)

  await db.from('fund_top_holdings').insert(
    stocks.map((s, i) => ({
      fund_code: fund.code,
      report_date: reportDate,
      stock_code: s.code,
      stock_name: s.name,
      weight: s.weight,
      industry: s.industry ?? null,
      rank: i + 1,
    })),
  )

  for (const s of stocks) {
    if (!s.code) continue
    const { data: existing } = await db
      .from('stocks')
      .select('code')
      .eq('code', s.code)
      .maybeSingle()
    if (existing) {
      await db
        .from('stocks')
        .update({
          name: s.name,
          industry: s.industry ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('code', s.code)
    } else {
      await db.from('stocks').insert({
        code: s.code,
        name: s.name,
        industry: s.industry ?? null,
        updated_at: new Date().toISOString(),
      })
    }
  }
}

const BRIEF_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * 读取未过期的股票简介。
 * @param stockCode 股票代码
 * @returns 简介或 null
 */
export async function getCachedStockBrief(
  stockCode: string,
): Promise<string | null> {
  const db = createServiceSupabase()
  const { data } = await db
    .from('stocks')
    .select('brief, brief_updated_at')
    .eq('code', stockCode)
    .maybeSingle()
  if (!data?.brief || !data.brief_updated_at) return null
  const age = Date.now() - new Date(data.brief_updated_at).getTime()
  if (age > BRIEF_TTL_MS) return null
  return data.brief
}

/**
 * 写入股票简介。
 * @param stock 股票信息与简介
 */
export async function saveStockBrief(stock: {
  code: string
  name: string
  industry?: string
  brief: string
}): Promise<void> {
  const db = createServiceSupabase()
  const now = new Date().toISOString()
  await db.from('stocks').upsert({
    code: stock.code,
    name: stock.name,
    industry: stock.industry ?? null,
    brief: stock.brief,
    brief_updated_at: now,
    updated_at: now,
  })
}
