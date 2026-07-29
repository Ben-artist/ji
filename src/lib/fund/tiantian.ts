import type { AssetClass, FundType, Holding } from '#/lib/portfolio/types'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/** 十大重仓股一项 */
export interface FundTopStock {
  code: string
  name: string
  weight: number
  industry?: string
}

/** 基金搜索结果 */
export interface FundSearchItem {
  code: string
  name: string
  fundType: FundType
  assetClass: AssetClass
}

/**
 * 将天天基金类型映射到产品内类型。
 * @param ftype 接口返回的 FTYPE
 * @returns 基金类型与大类资产
 */
export function mapFundType(ftype: string | undefined): {
  fundType: FundType
  assetClass: AssetClass
} {
  const t = ftype ?? ''
  if (t.includes('货币')) return { fundType: '货币型', assetClass: '现金' }
  if (t.includes('债券') || t.includes('纯债'))
    return { fundType: '债券型', assetClass: '债券' }
  if (t.includes('指数') || t.includes('ETF'))
    return { fundType: '指数型', assetClass: '股票' }
  if (t.includes('QDII')) return { fundType: 'QDII', assetClass: '股票' }
  if (t.includes('混合')) return { fundType: '混合型', assetClass: '股票' }
  if (t.includes('股票')) return { fundType: '股票型', assetClass: '股票' }
  return { fundType: '其他', assetClass: '另类' }
}

/**
 * 搜索天天基金。
 * @param keyword 代码或名称
 * @returns 搜索列表
 */
export async function searchTiantianFunds(
  keyword: string,
): Promise<FundSearchItem[]> {
  const q = keyword.trim()
  if (!q) return []
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(q)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://fund.eastmoney.com/' },
  })
  if (!res.ok) throw new Error(`基金搜索失败 (${res.status})`)
  const json = (await res.json()) as {
    Datas?: Array<{
      CODE?: string
      NAME?: string
      FundBaseInfo?: { FTYPE?: string; SHORTNAME?: string; FCODE?: string }
    }>
  }
  const list = json.Datas ?? []
  return list
    .filter((item) => item.CODE || item.FundBaseInfo?.FCODE)
    .slice(0, 20)
    .map((item) => {
      const code = item.CODE || item.FundBaseInfo?.FCODE || ''
      const name =
        item.NAME || item.FundBaseInfo?.SHORTNAME || code
      const { fundType, assetClass } = mapFundType(item.FundBaseInfo?.FTYPE)
      return { code, name, fundType, assetClass }
    })
}

/**
 * 查询基金概况与最新净值（东财移动端接口）。
 * @param fundCode 基金代码
 * @returns 概况；失败返回 null
 */
export async function fetchFundBasicInfo(fundCode: string): Promise<{
  code: string
  name: string
  fundType: string
  nav: number | null
  dayChangePct: number | null
  navDate: string | null
  company: string | null
  riskLevel: string | null
} | null> {
  const code = fundCode.trim()
  if (!code || code === 'CASH') return null
  const url = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNNBasicInformation?FCODE=${encodeURIComponent(code)}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://fund.eastmoney.com/' },
  })
  if (!res.ok) throw new Error(`基金概况查询失败 (${res.status})`)
  const json = (await res.json()) as {
    Success?: boolean
    Datas?: {
      FCODE?: string
      SHORTNAME?: string
      FTYPE?: string
      DWJZ?: string
      RZDF?: string
      FSRQ?: string
      JJGS?: string
      RISKLEVEL?: string
    }
  }
  if (!json.Success || !json.Datas) return null
  const d = json.Datas
  const nav = Number(d.DWJZ)
  const dayChangePct = Number(d.RZDF)
  return {
    code: d.FCODE || code,
    name: d.SHORTNAME || code,
    fundType: d.FTYPE || '',
    nav: Number.isFinite(nav) ? nav : null,
    dayChangePct: Number.isFinite(dayChangePct) ? dayChangePct : null,
    navDate: d.FSRQ || null,
    company: d.JJGS || null,
    riskLevel: d.RISKLEVEL || null,
  }
}

/**
 * 查询基金十大重仓股（季度披露）。
 * @param fundCode 基金代码
 * @returns 重仓列表与报告期
 */
export async function fetchFundTopHoldings(fundCode: string): Promise<{
  stocks: FundTopStock[]
  reportDate: string | null
}> {
  const code = fundCode.trim()
  if (!code || code === 'CASH') {
    return { stocks: [], reportDate: null }
  }
  const url = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition?FCODE=${encodeURIComponent(code)}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&Uid=`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://fund.eastmoney.com/' },
  })
  if (!res.ok) throw new Error(`重仓查询失败 (${res.status})`)
  const json = (await res.json()) as {
    Success?: boolean
    Expansion?: string
    Datas?: {
      fundStocks?: Array<{
        GPDM?: string
        GPJC?: string
        JZBL?: string
        INDEXNAME?: string
      }>
    }
  }
  if (!json.Success) {
    return { stocks: [], reportDate: json.Expansion ?? null }
  }
  const stocks = (json.Datas?.fundStocks ?? []).slice(0, 10).map((s) => ({
    code: s.GPDM ?? '',
    name: s.GPJC ?? '',
    weight: Number(s.JZBL ?? 0),
    industry: s.INDEXNAME,
  }))
  return { stocks, reportDate: json.Expansion ?? null }
}

/**
 * 根据重仓股行业粗略生成一级板块暴露（子赛道交给 AI）。
 * @param stocks 十大重仓
 * @returns sectors / 空 subThemes
 */
export function inferExposureFromStocks(stocks: FundTopStock[]): {
  sectors: Record<string, number>
  subThemes: Record<string, number>
} {
  if (stocks.length === 0) {
    return { sectors: { 科技: 1 }, subThemes: {} }
  }
  const sectorMap = new Map<string, number>()
  let total = 0
  for (const s of stocks) {
    const w = Math.max(0, s.weight)
    total += w
    const industry = s.industry || '其他'
    const sector = industryToSector(industry, s.name)
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + w)
  }
  const denom = total > 0 ? total : 1
  const sectors: Record<string, number> = {}
  for (const [k, v] of sectorMap) {
    sectors[k] = Number((v / denom).toFixed(4))
  }
  return { sectors, subThemes: {} }
}

/**
 * 行业名映射到具体一级板块（避免「其他」「周期」笼统桶）。
 * @param industry 行业
 * @param stockName 股票名
 * @returns 一级板块
 */
function industryToSector(industry: string, stockName: string): string {
  const text = `${industry}${stockName}`
  if (/半导体|芯片|集成电路/.test(text)) return '半导体'
  if (/通信|5G|基站|光模块/.test(text)) return '通信'
  if (/计算机|软件|互联网|云计算/.test(text)) return '计算机'
  if (/电子|电路|元件|元器件|PCB|FPC/.test(text)) return '电子'
  if (/传媒|游戏|广告/.test(text)) return '传媒'
  if (/医药|生物|医疗|中药|器械/.test(text)) return '医药生物'
  if (/光伏|电池|储能|锂电|风电|新能源/.test(text)) return '新能源'
  if (/电力设备|电气设备/.test(text)) return '电力设备'
  if (/汽车|整车|零部件/.test(text)) return '汽车'
  if (/白酒|食品|饮料/.test(text)) return '食品饮料'
  if (/家电|白电|厨电/.test(text)) return '家电'
  if (/消费|零售|纺织|服装|化妆品/.test(text)) return '消费'
  if (/银行/.test(text)) return '银行'
  if (/证券|券商/.test(text)) return '券商'
  if (/保险|非银|金融/.test(text)) return '金融'
  if (/有色|铜|铝|锂|稀土/.test(text)) return '有色金属'
  if (/化工|化学|材料/.test(text)) return '化工'
  if (/钢铁/.test(text)) return '钢铁'
  if (/煤炭|煤炭/.test(text)) return '煤炭'
  if (/石油|石化|油气/.test(text)) return '石油石化'
  if (/建材|水泥|玻璃/.test(text)) return '建材'
  if (/建筑|工程/.test(text)) return '建筑'
  if (/电力|公用事业/.test(text)) return '电力'
  if (/军工|航空|航天|国防/.test(text)) return '军工'
  if (/机械|设备|工控|自动化/.test(text)) return '机械设备'
  if (/房地产|地产/.test(text)) return '房地产'
  if (/交运|物流|航运|航空运输/.test(text)) return '交通运输'
  if (/农业|养殖|种植/.test(text)) return '农业'
  if (/科技/.test(text)) return '科技'
  // 东财行业字段本身较具体时直接用，避免落入「其他」
  const cleaned = industry.replace(/\s+/g, '').trim()
  if (cleaned && cleaned !== '其他' && cleaned !== '周期' && cleaned !== '综合') {
    return cleaned
  }
  return '机械设备'
}

/**
 * 把搜索到的基金转成可加入持仓的条目（含重仓推断暴露）。
 * @param item 搜索结果
 * @param amount 金额
 * @returns Holding
 */
export async function buildHoldingFromFund(
  item: FundSearchItem,
  amount: number,
): Promise<Holding> {
  let sectors: Record<string, number> = { 科技: 1 }
  let subThemes: Record<string, number> = {}
  try {
    const { stocks } = await fetchFundTopHoldings(item.code)
    const inferred = inferExposureFromStocks(stocks)
    if (Object.keys(inferred.sectors).length) sectors = inferred.sectors
    subThemes = inferred.subThemes
  } catch {
    // 债券/货币等可能无股票重仓，保留默认
    if (item.assetClass === '债券') sectors = { 债券: 1 }
    if (item.assetClass === '现金') sectors = { 现金: 1 }
  }
  return {
    id: `tt-${item.code}-${Date.now()}`,
    code: item.code,
    name: item.name,
    fundType: item.fundType,
    amount,
    weight: 0,
    assetClass: item.assetClass,
    sectors,
    subThemes,
  }
}
