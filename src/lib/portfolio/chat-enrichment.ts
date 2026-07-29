import { describeListedCompany } from '#/lib/ai/dashscope'
import {
  fetchFundBasicInfo,
  fetchFundTopHoldings,
  searchTiantianFunds,
} from '#/lib/fund/tiantian'
import type { Holding } from '#/lib/portfolio/types'
import {
  getCachedStockBrief,
  saveStockBrief,
} from '#/lib/supabase/cache'

/**
 * 从用户问题与持仓中解析要补充资料的基金代码（最多 3 只）。
 * @param message 用户问题
 * @param holdings 当前持仓
 * @returns 基金代码列表
 */
async function resolveFundCodes(
  message: string,
  holdings: Holding[],
): Promise<string[]> {
  const codes = new Set<string>()
  for (const m of message.matchAll(/\b(\d{6})\b/g)) {
    codes.add(m[1])
  }

  const sortedHoldings = [...holdings].sort(
    (a, b) => b.name.length - a.name.length,
  )
  for (const h of sortedHoldings) {
    if (h.code && h.code !== 'UNKNOWN' && message.includes(h.name)) {
      codes.add(h.code)
    }
  }

  if (codes.size === 0) {
    // 未命中代码时，用问题里像基金名的片段去搜索（去掉常见虚词）
    const cleaned = message
      .replace(
        /今天|怎么样|如何|怎样|涨跌|净值|重仓|公司|简介|情况|分析|风险|适合|吗|呢|啊|的|了|吧/g,
        ' ',
      )
      .trim()
    const keyword = cleaned.split(/\s+/).find((s) => s.length >= 4)
    if (keyword) {
      try {
        const hits = await searchTiantianFunds(keyword)
        if (hits[0]?.code) codes.add(hits[0].code)
      } catch {
        // ignore
      }
    }
  }

  return [...codes].slice(0, 3)
}

/**
 * 为自由问答拉取基金/公司补充资料（净值、重仓、公司简介）。
 * @param message 用户问题
 * @param holdings 当前持仓
 * @returns 拼进 prompt 的文本；无需补充时为空串
 */
export async function buildFundChatEnrichment(
  message: string,
  holdings: Holding[],
): Promise<string> {
  const codes = await resolveFundCodes(message, holdings)
  if (codes.length === 0) return ''

  const blocks: string[] = []
  const stockCandidates: Array<{
    code: string
    name: string
    industry?: string
  }> = []

  for (const code of codes) {
    const parts: string[] = [`【基金 ${code}】`]
    try {
      const basic = await fetchFundBasicInfo(code)
      if (basic) {
        parts.push(
          `名称 ${basic.name}；类型 ${basic.fundType || '未知'}；管理人 ${basic.company || '未知'}`,
        )
        if (basic.nav != null) {
          parts.push(
            `最新净值 ${basic.nav}${basic.navDate ? `（${basic.navDate}）` : ''}${
              basic.dayChangePct != null
                ? `；日涨跌 ${basic.dayChangePct}%`
                : ''
            }`,
          )
        }
      }
    } catch {
      parts.push('净值概况拉取失败')
    }

    try {
      const top = await fetchFundTopHoldings(code)
      if (top.stocks.length) {
        parts.push(
          `十大重仓（报告期 ${top.reportDate ?? '未知'}）：${top.stocks
            .map((s) => `${s.name}(${s.code}) ${s.weight}%`)
            .join('；')}`,
        )
        for (const s of top.stocks.slice(0, 5)) {
          if (s.code && s.name) {
            stockCandidates.push({
              code: s.code,
              name: s.name,
              industry: s.industry,
            })
          }
        }
      }
    } catch {
      parts.push('重仓数据拉取失败')
    }

    blocks.push(parts.join('\n'))
  }

  // 用户点名公司/重仓股时补业务简介
  const mentionedStocks = stockCandidates.filter(
    (s) => message.includes(s.name) || message.includes(s.code),
  )
  const stocksToBrief =
    mentionedStocks.length > 0
      ? mentionedStocks.slice(0, 2)
      : /公司|主营|做什么|业务|简介/.test(message)
        ? stockCandidates.slice(0, 2)
        : []

  for (const stock of stocksToBrief) {
    try {
      let brief = await getCachedStockBrief(stock.code)
      if (!brief) {
        brief = await describeListedCompany(stock)
        try {
          await saveStockBrief({ ...stock, brief })
        } catch {
          // ignore cache write
        }
      }
      blocks.push(`【公司 ${stock.name}(${stock.code})】\n${brief}`)
    } catch {
      // ignore
    }
  }

  if (blocks.length === 0) return ''
  return `\n\n以下为系统实时补充的基金/公司资料（可引用；未出现的数字不要编造）：\n${blocks.join('\n\n')}`
}

/** 自由问答系统提示：持仓内 + 基金/公司相关均可答，拒绝无关闲聊 */
export const PORTFOLIO_CHAT_SYSTEM_PROMPT = `你是基金持仓分析助手「基今」。

你可回答的范围：
1. 用户当前持仓结构、集中度、板块暴露、调仓方向（优先用「持仓分析上下文」）
2. 基金产品本身：类型、风格、净值/涨跌（若资料里有）、重仓、管理人等
3. 上市公司/重仓股：业务是做什么的、所处赛道（用补充资料；不要编造精确财务数据）

不要回答：与基金、持仓、上市公司投资研究无关的日常闲聊（如纯闲聊、与投资无关的生活问题）。此类请一句礼貌拒绝，并提示可问基金或持仓相关问题。

规则：
- 有补充资料时如实引用；没有实时行情就明确说「当前没有该数据」，不要编造涨跌幅或财报数字
- 区分「组合里的权重/风险」和「基金自身涨跌/基本面」，用户问「今天怎么样」时两者都可提但要分开说
- 简洁、可用 Markdown；结尾提醒：内容仅供参考，不构成投资建议`
