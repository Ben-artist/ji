/** 基金类型 */
export type FundType = '股票型' | '混合型' | '债券型' | '指数型' | '货币型' | 'QDII' | '其他'

/** 大类资产 */
export type AssetClass = '股票' | '债券' | '货币' | '另类' | '现金'

/** 持仓条目（用户侧编辑金额，比例由金额推导） */
export interface Holding {
  id: string
  code: string
  name: string
  fundType: FundType
  /** 持仓金额（元） */
  amount: number
  /** 持仓比例（%），由金额 / 总金额 计算 */
  weight: number
  /** 一级板块暴露，权重之和约 1 */
  sectors: Record<string, number>
  /**
   * 细分子赛道暴露（占该基金净值比例），名称由 AI 按重仓动态生成。
   */
  subThemes: Record<string, number>
  /** 子赛道 → 所属一级板块（由 AI 给出，供板块下钻聚合） */
  themeSectors?: Record<string, string>
  assetClass: AssetClass
  /** 是否来自 OCR，待校对 */
  needsReview?: boolean
}

/** 单项评分（0-100） */
export interface ScoreMetric {
  key: 'health' | 'concentration' | 'risk'
  label: string
  score: number
  level: string
  explanation: string
  drivers: string[]
}

/** 大类配置一项 */
export interface AssetAllocationItem {
  assetClass: AssetClass
  weight: number
  amount: number
}

/** 板块重叠一项 */
export interface SectorOverlapItem {
  sector: string
  fundCount: number
  overlapScore: number
  portfolioWeight: number
  amount: number
}

/** 板块内子赛道占比 */
export interface SubThemeBreakdown {
  name: string
  /** 占全组合比例 % */
  portfolioWeight: number
  /** 占该一级板块比例 % */
  sectorWeight: number
  amount: number
}

/** 一级板块详情（含下钻） */
export interface SectorDetail {
  sector: string
  portfolioWeight: number
  amount: number
  themes: SubThemeBreakdown[]
}

/** 可执行建议 */
export interface Suggestion {
  id: string
  title: string
  detail: string
  priority: 'high' | 'medium' | 'low'
}

/** 调仓方向：减配 / 增配（板块或大类，不点名买卖具体基金） */
export type RebalanceDirection = 'reduce' | 'increase'

export interface RebalanceAction {
  id: string
  direction: RebalanceDirection
  /** 板块名或大类名 */
  target: string
  /** 目标类型，便于展示 */
  kind: 'sector' | 'asset'
  /** 当前组合占比 % */
  currentWeight: number
  /** 方向提示，如「降至 20% 附近」 */
  targetHint: string
  reason: string
  priority: 'high' | 'medium' | 'low'
}

/** 基准对比 */
export interface BenchmarkCompare {
  name: string
  note: string
  equityGap: number
  topSectorVsBenchmark: string
}

/** 对话消息 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

/** 完整分析结果 */
export interface PortfolioAnalysis {
  updatedAt: string
  holdings: Holding[]
  totalAmount: number
  totalWeight: number
  scores: ScoreMetric[]
  summary: string
  allocation: AssetAllocationItem[]
  overlaps: SectorOverlapItem[]
  sectorDetails: SectorDetail[]
  overlapScore: number
  overlapLevel: string
  overlapInsight: string
  suggestions: Suggestion[]
  /** 加减仓方向（板块 / 大类） */
  rebalanceActions: RebalanceAction[]
  benchmark: BenchmarkCompare
}

/** 模拟 OCR 导入结果 */
export interface OcrImportResult {
  holdings: Holding[]
  recognizedCount: number
  successRate: number
  warnings: string[]
}
