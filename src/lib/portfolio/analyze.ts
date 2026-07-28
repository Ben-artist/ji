import type {
  AssetAllocationItem,
  AssetClass,
  Holding,
  PortfolioAnalysis,
  RebalanceAction,
  ScoreMetric,
  SectorDetail,
  SectorOverlapItem,
  SubThemeBreakdown,
  Suggestion,
} from './types'

/**
 * 根据持仓金额重算比例。
 * @param holdings 原始持仓
 * @returns 带最新 weight 的持仓
 */
export function syncWeightsFromAmounts(holdings: Holding[]): Holding[] {
  const total = holdings.reduce((sum, h) => sum + Math.max(0, h.amount), 0)
  if (total <= 0) {
    return holdings.map((h) => ({ ...h, weight: 0 }))
  }
  return holdings.map((h) => ({
    ...h,
    amount: Math.max(0, h.amount),
    weight: Number(((Math.max(0, h.amount) / total) * 100).toFixed(2)),
  }))
}

/**
 * 组合总金额。
 * @param holdings 持仓
 * @returns 总金额（元）
 */
export function totalAmountOf(holdings: Holding[]): number {
  return holdings.reduce((sum, h) => sum + Math.max(0, h.amount), 0)
}

/**
 * 计算大类资产配置。
 * @param holdings 持仓（已按金额同步比例）
 * @returns 按权重降序的大类列表
 */
export function calcAllocation(holdings: Holding[]): AssetAllocationItem[] {
  const map = new Map<AssetClass, { weight: number; amount: number }>()
  for (const h of holdings) {
    const prev = map.get(h.assetClass) ?? { weight: 0, amount: 0 }
    map.set(h.assetClass, {
      weight: prev.weight + h.weight,
      amount: prev.amount + h.amount,
    })
  }
  return [...map.entries()]
    .map(([assetClass, v]) => ({
      assetClass,
      weight: Number(v.weight.toFixed(2)),
      amount: Number(v.amount.toFixed(2)),
    }))
    .sort((a, b) => b.weight - a.weight)
}

/**
 * 计算板块加权暴露与重叠度。
 * @param holdings 持仓
 * @returns 重叠列表与解读
 */
export function calcSectorOverlap(holdings: Holding[]): {
  overlaps: SectorOverlapItem[]
  overlapScore: number
  overlapLevel: string
  overlapInsight: string
} {
  const sectorWeight = new Map<string, number>()
  const sectorAmount = new Map<string, number>()
  const sectorFunds = new Map<string, Set<string>>()

  for (const h of holdings) {
    if (h.assetClass === '现金' || h.assetClass === '债券') continue
    for (const [sector, ratio] of Object.entries(h.sectors)) {
      if (sector === '债券' || sector === '现金') continue
      const w = h.weight * ratio
      const amt = h.amount * ratio
      sectorWeight.set(sector, (sectorWeight.get(sector) ?? 0) + w)
      sectorAmount.set(sector, (sectorAmount.get(sector) ?? 0) + amt)
      const set = sectorFunds.get(sector) ?? new Set()
      set.add(h.code)
      sectorFunds.set(sector, set)
    }
  }

  const overlaps: SectorOverlapItem[] = [...sectorWeight.entries()]
    .map(([sector, portfolioWeight]) => {
      const fundCount = sectorFunds.get(sector)?.size ?? 0
      const overlapScore = Math.min(
        100,
        Math.round(portfolioWeight * 1.2 + Math.max(0, fundCount - 1) * 12),
      )
      return {
        sector,
        fundCount,
        overlapScore,
        portfolioWeight: Number(portfolioWeight.toFixed(1)),
        amount: Number((sectorAmount.get(sector) ?? 0).toFixed(2)),
      }
    })
    .sort((a, b) => b.portfolioWeight - a.portfolioWeight)

  const top = overlaps.slice(0, 3)
  const topWeight = top.reduce((s, i) => s + i.portfolioWeight, 0)
  const multiFundSectors = overlaps.filter((o) => o.fundCount >= 2).length
  const overlapScore = Math.min(
    100,
    Math.round(topWeight * 0.9 + multiFundSectors * 6),
  )
  const overlapLevel =
    overlapScore >= 75 ? '集中度较高' : overlapScore >= 55 ? '中度集中' : '相对分散'
  const topNames = top.map((t) => t.sector).join('、') || '暂无'
  const overlapInsight = `整体仓位在${topNames}等方向重叠较多，共有 ${multiFundSectors} 个板块被多只基金同时持有。可点选板块查看 AI 拆解的子赛道占比。`

  return {
    overlaps: overlaps.slice(0, 8),
    overlapScore,
    overlapLevel,
    overlapInsight,
  }
}

/**
 * 计算一级板块下的子赛道拆解（子赛道由 AI 动态命名并映射 parent）。
 * @param holdings 持仓
 * @returns 各板块详情
 */
export function calcSectorDetails(holdings: Holding[]): SectorDetail[] {
  const sectorPortW = new Map<string, number>()
  const sectorAmt = new Map<string, number>()
  const themeBySector = new Map<
    string,
    Map<string, { portfolioWeight: number; amount: number }>
  >()

  for (const h of holdings) {
    if (h.assetClass === '现金' || h.assetClass === '债券') continue

    for (const [sector, ratio] of Object.entries(h.sectors)) {
      if (sector === '债券' || sector === '现金' || sector === '贵金属') continue
      sectorPortW.set(sector, (sectorPortW.get(sector) ?? 0) + h.weight * ratio)
      sectorAmt.set(sector, (sectorAmt.get(sector) ?? 0) + h.amount * ratio)
    }

    for (const [theme, ratio] of Object.entries(h.subThemes)) {
      if (theme === '其他') continue
      const parent =
        h.themeSectors?.[theme] ??
        // 兜底：若缺映射，挂到该基金权重最大的一级板块
        Object.entries(h.sectors).sort((a, b) => b[1] - a[1])[0]?.[0]
      if (!parent) continue
      const bucket =
        themeBySector.get(parent) ??
        new Map<string, { portfolioWeight: number; amount: number }>()
      const prev = bucket.get(theme) ?? { portfolioWeight: 0, amount: 0 }
      bucket.set(theme, {
        portfolioWeight: prev.portfolioWeight + h.weight * ratio,
        amount: prev.amount + h.amount * ratio,
      })
      themeBySector.set(parent, bucket)
    }
  }

  const details: SectorDetail[] = [...sectorPortW.entries()].map(
    ([sector, portfolioWeight]) => {
      const themesRaw = themeBySector.get(sector)
      const themes: SubThemeBreakdown[] = themesRaw
        ? [...themesRaw.entries()]
            .map(([name, v]) => ({
              name,
              portfolioWeight: Number(v.portfolioWeight.toFixed(2)),
              sectorWeight:
                portfolioWeight > 0
                  ? Number(((v.portfolioWeight / portfolioWeight) * 100).toFixed(1))
                  : 0,
              amount: Number(v.amount.toFixed(2)),
            }))
            .sort((a, b) => b.portfolioWeight - a.portfolioWeight)
        : []

      return {
        sector,
        portfolioWeight: Number(portfolioWeight.toFixed(1)),
        amount: Number((sectorAmt.get(sector) ?? 0).toFixed(2)),
        themes,
      }
    },
  )

  return details.sort((a, b) => b.portfolioWeight - a.portfolioWeight)
}

/**
 * 根据配置与重叠生成三项主评分。
 * @param holdings 持仓
 * @param allocation 大类配置
 * @param overlapScore 重叠分
 * @returns 健康度 / 集中度 / 风险
 */
export function calcScores(
  holdings: Holding[],
  allocation: AssetAllocationItem[],
  overlapScore: number,
): ScoreMetric[] {
  const equity = allocation.find((a) => a.assetClass === '股票')?.weight ?? 0
  const bond = allocation.find((a) => a.assetClass === '债券')?.weight ?? 0
  const cash =
    (allocation.find((a) => a.assetClass === '现金')?.weight ?? 0) +
    (allocation.find((a) => a.assetClass === '货币')?.weight ?? 0)

  const topHolding = Math.max(...holdings.map((h) => h.weight), 0)
  const concentrationPenalty =
    Math.max(0, topHolding - 15) * 1.5 + overlapScore * 0.25
  const concentrationScore = Math.max(
    0,
    Math.min(100, Math.round(100 - concentrationPenalty)),
  )

  const riskRaw = equity * 0.7 + overlapScore * 0.25 - bond * 0.35 - cash * 0.2
  const riskScore = Math.max(0, Math.min(100, Math.round(riskRaw)))

  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          Math.abs(equity - 70) * 0.4 -
          Math.max(0, overlapScore - 50) * 0.35 -
          Math.max(0, topHolding - 18) * 1.2,
      ),
    ),
  )

  const levelOf = (score: number, invert = false) => {
    if (invert) {
      // 波动风险：分越高越严重
      if (score >= 75) return '偏高'
      if (score >= 55) return '中等'
      return '可控'
    }
    if (score >= 75) return '较好'
    if (score >= 55) return '中等'
    return '需关注'
  }

  return [
    {
      key: 'health',
      label: '持仓健康度',
      score: healthScore,
      level: levelOf(healthScore),
      explanation:
        '综合大类是否失衡、单基是否过重、板块是否过度重叠。分数越高表示结构更均衡。',
      drivers: [
        `股票仓位约 ${equity.toFixed(0)}%`,
        `单基最高 ${topHolding.toFixed(1)}%`,
        `板块重叠分 ${overlapScore}`,
      ],
    },
    {
      key: 'concentration',
      label: '集中度',
      score: concentrationScore,
      level: levelOf(concentrationScore),
      explanation:
        '分数越高表示越分散。单基权重过高或多只基金押同一板块会拉低分数。',
      drivers: [
        `单基最高占比 ${topHolding.toFixed(1)}%`,
        `板块重叠分 ${overlapScore}`,
        `持股数量 ${holdings.length}`,
      ],
    },
    {
      key: 'risk',
      label: '波动风险',
      score: riskScore,
      level: levelOf(riskScore, true),
      explanation:
        '以权益仓位与板块集中度估算组合波动倾向。分数越高风险越高（演示规则，非历史回测）。',
      drivers: [
        `权益仓位 ${equity.toFixed(0)}%`,
        `债券 ${bond.toFixed(0)}% / 现金类 ${cash.toFixed(0)}%`,
        `板块集中贡献约 ${(overlapScore * 0.25).toFixed(0)} 分`,
      ],
    },
  ]
}

/**
 * 生成可执行建议。
 * @param holdings 持仓
 * @param allocation 大类
 * @param overlaps 重叠
 * @param sectorDetails 板块细分
 * @returns 建议列表
 */
export function buildSuggestions(
  holdings: Holding[],
  allocation: AssetAllocationItem[],
  overlaps: SectorOverlapItem[],
  sectorDetails: SectorDetail[],
): Suggestion[] {
  const suggestions: Suggestion[] = []
  const equity = allocation.find((a) => a.assetClass === '股票')?.weight ?? 0
  const bond = allocation.find((a) => a.assetClass === '债券')?.weight ?? 0
  const top = overlaps[0]
  const heaviest = [...holdings].sort((a, b) => b.weight - a.weight)[0]
  const topTheme = sectorDetails
    .flatMap((s) =>
      s.themes.map((t) => ({
        sector: s.sector,
        ...t,
      })),
    )
    .sort((a, b) => b.portfolioWeight - a.portfolioWeight)[0]

  if (top && top.portfolioWeight >= 25) {
    suggestions.push({
      id: 's1',
      title: '降低核心赛道重叠',
      detail: `${top.sector} 方向组合暴露约 ${top.portfolioWeight}%，且有 ${top.fundCount} 只基金同时持有。可减持相关主题基金或换成宽基。`,
      priority: 'high',
    })
  }

  if (topTheme && topTheme.portfolioWeight >= 4) {
    suggestions.push({
      id: 's-theme',
      title: `关注「${topTheme.name}」集中度`,
      detail: `「${topTheme.name}」约占组合 ${topTheme.portfolioWeight}%（在「${topTheme.sector}」板块内约 ${topTheme.sectorWeight}%）。若多只基金押同一细分子赛道，注意景气波动带来的回撤。`,
      priority: topTheme.portfolioWeight >= 8 ? 'medium' : 'low',
    })
  }

  if (equity >= 80) {
    suggestions.push({
      id: 's2',
      title: '适当分散大类配置',
      detail: `股票仓位约 ${equity.toFixed(0)}%，债券仅 ${bond.toFixed(0)}%。可增配利率债或短债，降低单一权益周期冲击。`,
      priority: 'high',
    })
  } else if (bond < 10 && equity >= 60) {
    suggestions.push({
      id: 's2',
      title: '补一点稳健底仓',
      detail: `当前债券仓位偏低（${bond.toFixed(0)}%）。建议用纯债或短债打底，目标债券占比 10–20%。`,
      priority: 'medium',
    })
  }

  if (heaviest && heaviest.weight >= 15) {
    suggestions.push({
      id: 's3',
      title: '控制单基仓位',
      detail: `${heaviest.name} 金额 ${formatYuan(heaviest.amount)}，占比 ${heaviest.weight.toFixed(2)}%。建议单基不超过 15%。`,
      priority: 'medium',
    })
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: 's0',
      title: '维持现有结构并定期复盘',
      detail: '当前大类与重叠尚可。建议市场大幅波动后重新分析一次。',
      priority: 'low',
    })
  }

  return suggestions.slice(0, 5)
}

/**
 * 生成加减仓方向：只到板块 / 大类，不点名买卖具体基金。
 * @param holdings 持仓
 * @param allocation 大类
 * @param overlaps 重叠
 * @param sectorDetails 板块细分
 * @returns 调仓方向列表
 */
export function buildRebalanceActions(
  holdings: Holding[],
  allocation: AssetAllocationItem[],
  overlaps: SectorOverlapItem[],
  sectorDetails: SectorDetail[],
): RebalanceAction[] {
  const actions: RebalanceAction[] = []
  const equity = allocation.find((a) => a.assetClass === '股票')?.weight ?? 0
  const bond = allocation.find((a) => a.assetClass === '债券')?.weight ?? 0

  const top = overlaps[0]
  if (top && top.portfolioWeight >= 28) {
    const hint =
      top.portfolioWeight >= 40
        ? '建议逐步降至 25% 附近'
        : '建议逐步降至 20%–25% 附近'
    actions.push({
      id: `reduce-sector-${top.sector}`,
      direction: 'reduce',
      target: top.sector,
      kind: 'sector',
      currentWeight: top.portfolioWeight,
      targetHint: hint,
      reason: `该方向约占组合 ${top.portfolioWeight}%，且有 ${top.fundCount} 只基金共同暴露。优先核对相关主题基金是否重复押注，而不是一次性清仓。`,
      priority: top.portfolioWeight >= 40 ? 'high' : 'medium',
    })
  }

  // 第二重板块若也偏高，再给一条减配
  const second = overlaps[1]
  if (
    second &&
    second.portfolioWeight >= 22 &&
    (!top || second.sector !== top.sector)
  ) {
    actions.push({
      id: `reduce-sector-${second.sector}`,
      direction: 'reduce',
      target: second.sector,
      kind: 'sector',
      currentWeight: second.portfolioWeight,
      targetHint: '可考虑略降至 15%–20% 附近',
      reason: `次高暴露板块约占 ${second.portfolioWeight}%。若与第一重赛道同属成长/周期风格，组合波动会叠加。`,
      priority: 'medium',
    })
  }

  const topTheme = sectorDetails
    .flatMap((s) =>
      s.themes.map((t) => ({
        sector: s.sector,
        ...t,
      })),
    )
    .sort((a, b) => b.portfolioWeight - a.portfolioWeight)[0]

  if (topTheme && topTheme.portfolioWeight >= 8) {
    actions.push({
      id: `reduce-theme-${topTheme.name}`,
      direction: 'reduce',
      target: `${topTheme.sector} · ${topTheme.name}`,
      kind: 'sector',
      currentWeight: topTheme.portfolioWeight,
      targetHint: '建议关注是否过度集中于同一子赛道',
      reason: `「${topTheme.name}」约占组合 ${topTheme.portfolioWeight}%（在「${topTheme.sector}」内约 ${topTheme.sectorWeight}%）。景气回落时回撤往往更集中。`,
      priority: topTheme.portfolioWeight >= 12 ? 'high' : 'medium',
    })
  }

  if (equity >= 80) {
    actions.push({
      id: 'reduce-equity',
      direction: 'reduce',
      target: '股票（权益）',
      kind: 'asset',
      currentWeight: Number(equity.toFixed(1)),
      targetHint: '可考虑将权益仓位降到 70% 附近',
      reason: `股票仓位约 ${equity.toFixed(0)}%，对单一权益周期更敏感。可用纯债/短债替换部分高波动权益暴露。`,
      priority: 'high',
    })
  }

  if (bond < 10 && equity >= 55) {
    actions.push({
      id: 'increase-bond',
      direction: 'increase',
      target: '债券',
      kind: 'asset',
      currentWeight: Number(bond.toFixed(1)),
      targetHint: '可考虑增配至 10%–20%',
      reason: `当前债券约 ${bond.toFixed(0)}%，缓冲偏薄。增配利率债或短债，优先补「稳」而不是追收益。`,
      priority: equity >= 75 ? 'high' : 'medium',
    })
  }

  // 权益偏高且前两大板块合计很重时，提示增配「相对分散」的宽基方向（仍不点名基金）
  const topTwoWeight =
    (overlaps[0]?.portfolioWeight ?? 0) + (overlaps[1]?.portfolioWeight ?? 0)
  if (equity >= 60 && topTwoWeight >= 45 && overlaps.length >= 2) {
    actions.push({
      id: 'increase-diversify',
      direction: 'increase',
      target: '宽基 / 低相关板块',
      kind: 'sector',
      currentWeight: Number(topTwoWeight.toFixed(1)),
      targetHint: '用宽基或低相关方向稀释前两大赛道',
      reason: `前两大板块合计约 ${topTwoWeight.toFixed(0)}%。增配时优先选与现有赛道相关度更低的方向，避免「换基金不换风格」。`,
      priority: 'medium',
    })
  }

  const heaviest = [...holdings].sort((a, b) => b.weight - a.weight)[0]
  if (heaviest && heaviest.weight >= 18) {
    // 不点名单基买卖，引导为「降低单一持仓集中度」
    actions.push({
      id: 'reduce-single-holding',
      direction: 'reduce',
      target: '单一基金集中度',
      kind: 'asset',
      currentWeight: Number(heaviest.weight.toFixed(2)),
      targetHint: '建议单基占比控制在 15% 以内',
      reason: `当前最高单基约占 ${heaviest.weight.toFixed(1)}%（${heaviest.name}）。优先核对是否超额集中，而不是根据短期涨跌追买追卖。`,
      priority: heaviest.weight >= 25 ? 'high' : 'medium',
    })
  }

  const priorityRank = { high: 0, medium: 1, low: 2 } as const
  const sorted = [...actions].sort(
    (a, b) => priorityRank[a.priority] - priorityRank[b.priority],
  )

  // 每侧最多各保留若干条，避免清单过长
  const reduce = sorted.filter((a) => a.direction === 'reduce').slice(0, 3)
  const increase = sorted.filter((a) => a.direction === 'increase').slice(0, 3)
  return [...reduce, ...increase]
}

/**
 * 格式化金额。
 * @param yuan 元
 * @returns 中文金额文案
 */
export function formatYuan(yuan: number): string {
  if (yuan >= 10000) {
    return `${(yuan / 10000).toFixed(2)} 万`
  }
  return `${yuan.toFixed(0)} 元`
}

/**
 * 生成分析总结：先讲结构与问题，再给下一步看哪里；少提裸分数。
 * @param allocation 大类
 * @param overlaps 重叠
 * @param scores 评分
 * @param sectorDetails 细分
 * @param rebalanceActions 调仓方向
 * @returns 总结文案
 */
export function buildSummary(
  allocation: AssetAllocationItem[],
  overlaps: SectorOverlapItem[],
  scores: ScoreMetric[],
  sectorDetails: SectorDetail[],
  rebalanceActions: RebalanceAction[] = [],
): string {
  const equity = allocation.find((a) => a.assetClass === '股票')?.weight ?? 0
  const bond = allocation.find((a) => a.assetClass === '债券')?.weight ?? 0
  const top = overlaps[0]
  const second = overlaps[1]
  const health = scores.find((s) => s.key === 'health')
  const concentration = scores.find((s) => s.key === 'concentration')
  const risk = scores.find((s) => s.key === 'risk')
  const topDetail = sectorDetails[0]
  const topTheme = topDetail?.themes[0]

  const structureParts: string[] = []
  if (top) {
    const sectorLine = second
      ? `${top.sector}（约 ${top.portfolioWeight}%）、${second.sector}（约 ${second.portfolioWeight}%）`
      : `${top.sector}（约 ${top.portfolioWeight}%）`
    structureParts.push(`持仓主要压在 ${sectorLine}`)
  } else {
    structureParts.push('持仓板块较分散')
  }
  structureParts.push(`股票仓位约 ${equity.toFixed(0)}%`)
  if (bond < 10 && equity >= 55) {
    structureParts.push(`债券仅约 ${bond.toFixed(0)}%`)
  }

  const issueParts: string[] = []
  if (top && top.portfolioWeight >= 28) {
    issueParts.push(`「${top.sector}」暴露偏重`)
  }
  if (topTheme && topTheme.portfolioWeight >= 8) {
    issueParts.push(
      `「${topTheme.name}」子赛道约占组合 ${topTheme.portfolioWeight}%`,
    )
  }
  if (risk && risk.score >= 75) {
    issueParts.push('波动风险偏高')
  } else if (concentration && concentration.score < 55) {
    issueParts.push('集中度需要留意')
  } else if (health && health.score < 55) {
    issueParts.push('整体结构偏紧')
  }

  const reduce = rebalanceActions.find((a) => a.direction === 'reduce')
  const increase = rebalanceActions.find((a) => a.direction === 'increase')
  let nextStep = '可先点选下方板块看细分，再对照调仓方向核对。'
  if (reduce && increase) {
    nextStep = `下一步优先看：减配「${reduce.target}」，增配「${increase.target}」（详见下方调仓方向）。`
  } else if (reduce) {
    nextStep = `下一步优先核对是否减配「${reduce.target}」（详见下方调仓方向）。`
  } else if (increase) {
    nextStep = `下一步可关注增配「${increase.target}」（详见下方调仓方向）。`
  }

  const line1 = `${structureParts.join('，')}。`
  const line2 =
    issueParts.length > 0
      ? `主要问题：${issueParts.join('；')}。`
      : '当前结构尚可，无明显过重方向。'
  return `${line1}${line2}${nextStep}`
}

/**
 * 对持仓运行完整分析。
 * @param holdings 用户持仓
 * @returns 分析结果
 */
export function analyzePortfolio(holdings: Holding[]): PortfolioAnalysis {
  const normalized = syncWeightsFromAmounts(holdings)
  const totalAmount = totalAmountOf(normalized)
  const allocation = calcAllocation(normalized)
  const { overlaps, overlapScore, overlapLevel, overlapInsight } =
    calcSectorOverlap(normalized)
  const sectorDetails = calcSectorDetails(normalized)
  const scores = calcScores(normalized, allocation, overlapScore)
  const suggestions = buildSuggestions(
    normalized,
    allocation,
    overlaps,
    sectorDetails,
  )
  const rebalanceActions = buildRebalanceActions(
    normalized,
    allocation,
    overlaps,
    sectorDetails,
  )
  const summary = buildSummary(
    allocation,
    overlaps,
    scores,
    sectorDetails,
    rebalanceActions,
  )
  const equity = allocation.find((a) => a.assetClass === '股票')?.weight ?? 0

  return {
    updatedAt: new Date().toISOString(),
    holdings: normalized,
    totalAmount,
    totalWeight: Number(
      normalized.reduce((s, h) => s + h.weight, 0).toFixed(2),
    ),
    scores,
    summary,
    allocation,
    overlaps,
    sectorDetails,
    overlapScore,
    overlapLevel,
    overlapInsight,
    suggestions,
    rebalanceActions,
    benchmark: {
      name: '沪深300',
      note: '演示对比：相对宽基的权益仓位与赛道偏离（非真实跟踪误差）。',
      equityGap: Number((equity - 100).toFixed(1)),
      topSectorVsBenchmark: overlaps[0]
        ? `相对宽基，您在「${overlaps[0].sector}」暴露更高（约 ${overlaps[0].portfolioWeight}%）`
        : '赛道偏离不明显',
    },
  }
}

/**
 * 基于分析结果回答用户自由提问（规则引擎，后续可接 LLM）。
 * @param message 用户问题
 * @param analysis 当前分析
 * @returns 助手回复
 */
export function answerPortfolioChat(
  message: string,
  analysis: PortfolioAnalysis,
): string {
  const q = message.trim()
  const lower = q.toLowerCase()
  const equity =
    analysis.allocation.find((a) => a.assetClass === '股票')?.weight ?? 0
  const risk = analysis.scores.find((s) => s.key === 'risk')
  const concentration = analysis.scores.find((s) => s.key === 'concentration')

  const findTheme = (name: string) => {
    for (const sector of analysis.sectorDetails) {
      const hit = sector.themes.find(
        (t) =>
          t.name.toLowerCase() === name.toLowerCase() ||
          t.name.includes(name) ||
          name.includes(t.name),
      )
      if (hit) return { sector: sector.sector, theme: hit, parent: sector }
    }
    return null
  }

  // 用户提到某个已识别子赛道名时，直接答占比
  const allThemes = analysis.sectorDetails.flatMap((s) =>
    s.themes.map((t) => t.name),
  )
  const mentioned = allThemes.find(
    (name) => q.includes(name) || lower.includes(name.toLowerCase()),
  )
  if (mentioned) {
    const hit = findTheme(mentioned)
    if (hit) {
      return `「${mentioned}」当前约占组合 ${hit.theme.portfolioWeight}%（约 ${formatYuan(hit.theme.amount)}），在「${hit.sector}」板块内占比约 ${hit.theme.sectorWeight}%。该板块整体占组合 ${hit.parent.portfolioWeight}%。`
    }
  }

  const sectorHit = analysis.sectorDetails.find((s) => q.includes(s.sector))
  if (sectorHit) {
    const topThemes = sectorHit.themes
      .slice(0, 5)
      .map((t) => `${t.name} ${t.portfolioWeight}%（板块内 ${t.sectorWeight}%）`)
      .join('；')
    return `「${sectorHit.sector}」约占组合 ${sectorHit.portfolioWeight}%（${formatYuan(sectorHit.amount)}）。细分：${topThemes || '暂无子赛道拆解'}。`
  }

  if (q.includes('风险') || lower.includes('risk')) {
    return `波动风险评分 ${risk?.score ?? '-'}（${risk?.level ?? ''}）。权益仓位约 ${equity.toFixed(0)}%。${risk?.drivers.join('；') ?? ''}`
  }
  if (q.includes('重叠') || q.includes('集中')) {
    const top = analysis.overlaps
      .slice(0, 3)
      .map((o) => `${o.sector} ${o.portfolioWeight}%`)
      .join('、')
    return `集中度 ${concentration?.score ?? '-'}；重叠分 ${analysis.overlapScore}（${analysis.overlapLevel}）。靠前板块：${top}。${analysis.overlapInsight}`
  }
  if (q.includes('股票') || q.includes('仓位') || q.includes('配置')) {
    const alloc = analysis.allocation
      .map((a) => `${a.assetClass} ${a.weight.toFixed(1)}%`)
      .join('，')
    return `总市值约 ${formatYuan(analysis.totalAmount)}。大类：${alloc}。股票约 ${equity.toFixed(0)}%。`
  }
  if (
    q.includes('建议') ||
    q.includes('怎么调') ||
    q.includes('优化') ||
    q.includes('加仓') ||
    q.includes('减仓') ||
    q.includes('调仓')
  ) {
    if (analysis.rebalanceActions.length > 0) {
      const lines = analysis.rebalanceActions.map((a, i) => {
        const dir = a.direction === 'reduce' ? '关注减配' : '关注增配'
        return `${i + 1}. 【${dir}】${a.target}（当前约 ${a.currentWeight}%）：${a.targetHint}。${a.reason}`
      })
      return `${lines.join('\n')}\n\n以上为组合结构诊断方向，不构成对具体基金的买卖建议。`
    }
    return analysis.suggestions
      .map((s, i) => `${i + 1}. ${s.title}：${s.detail}`)
      .join('\n')
  }
  if (q.includes('总结') || q.includes('怎么样') || q.includes('如何')) {
    return analysis.summary
  }

  return `${analysis.summary}\n\n你也可以直接问某个板块的细分占比，或「整体风险高吗」「怎么降低集中度」。`
}
