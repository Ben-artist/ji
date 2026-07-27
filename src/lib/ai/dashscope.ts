/**
 * DashScope（千问）服务端配置，仅用于对话。
 * @returns API Key、Base URL、聊天模型
 * @throws 未配置 DASHSCOPE_API_KEY 时抛错
 */
export function getDashScopeConfig() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env
  const apiKey = (
    process.env.DASHSCOPE_API_KEY ||
    env?.DASHSCOPE_API_KEY ||
    ''
  ).trim()
  if (!apiKey) {
    throw new Error('缺少 DASHSCOPE_API_KEY，请在 .env 中配置（千问对话用）')
  }
  return {
    apiKey,
    baseUrl: (
      process.env.DASHSCOPE_BASE_URL ||
      env?.DASHSCOPE_BASE_URL ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1'
    ).trim(),
    chatModel: (
      process.env.DASHSCOPE_CHAT_MODEL ||
      env?.DASHSCOPE_CHAT_MODEL ||
      'qwen-plus'
    ).trim(),
  }
}

interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionResult {
  content: string
}

/**
 * 调用千问文本对话（OpenAI 兼容接口）。
 * @param messages 消息列表
 * @returns 助手文本
 */
export async function qwenChat(
  messages: ChatMessageInput[],
): Promise<ChatCompletionResult> {
  const { apiKey, baseUrl, chatModel } = getDashScopeConfig()
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: chatModel,
      messages,
      temperature: 0.3,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`千问对话失败 (${res.status}): ${text.slice(0, 300)}`)
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('千问返回空内容')
  return { content }
}

/**
 * 千问流式对话，逐段回调文本增量。
 * @param messages 消息列表
 * @param onDelta 收到增量时的回调
 * @returns 完整助手文本
 */
export async function qwenChatStream(
  messages: ChatMessageInput[],
  onDelta: (delta: string) => void,
): Promise<string> {
  const { apiKey, baseUrl, chatModel } = getDashScopeConfig()
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: chatModel,
      messages,
      temperature: 0.3,
      stream: true,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`千问流式对话失败 (${res.status}): ${text.slice(0, 300)}`)
  }
  if (!res.body) throw new Error('千问未返回流式响应体')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onDelta(delta)
        }
      } catch {
        // 忽略不完整 JSON 行
      }
    }
  }

  if (!full.trim()) throw new Error('千问流式返回空内容')
  return full
}

/**
 * 从模型输出中提取 JSON 对象文本。
 * @param raw 原始回复
 * @returns JSON 字符串
 */
export function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) return raw.slice(start, end + 1)
  return raw.trim()
}

/**
 * 把 OCR 纯文本整理成持仓 JSON（由千问结构化）。
 * @param ocrText 阿里云 OCR 文本
 * @returns JSON 字符串
 */
export async function structureHoldingsFromOcrText(
  ocrText: string,
): Promise<string> {
  const { content } = await qwenChat([
    {
      role: 'system',
      content:
        '你是基金持仓结构化助手。根据 OCR 文本提取持仓，只输出 JSON，不要 markdown。格式：{"items":[{"code":"六位基金代码或空字符串","name":"基金名称","amount":持仓金额数字元,"weight":持仓比例数字可空}]}。amount 为金额（元）；若只有市值填市值；无法识别的字段用空字符串或 null，不要输出警告字段。',
    },
    {
      role: 'user',
      content: `OCR 文本如下：\n${ocrText.slice(0, 12000)}`,
    },
  ])
  return content
}

/** 单只基金的重仓股摘要，供 AI 推断暴露 */
export interface FundStockSnapshot {
  code: string
  name: string
  stocks: Array<{
    code: string
    name: string
    weight: number
    industry?: string
  }>
}

/** AI 返回的单基暴露 */
export interface AiFundExposure {
  code: string
  sectors: Record<string, number>
  themes: Array<{ name: string; parentSector: string; weight: number }>
}

/**
 * 根据各基金十大重仓，用千问动态推断一级板块与细分子赛道（不限固定标签表）。
 * @param funds 基金及重仓股
 * @returns 每只基金的 sectors / themes
 */
export async function analyzeFundExposuresWithAi(
  funds: FundStockSnapshot[],
): Promise<AiFundExposure[]> {
  if (funds.length === 0) return []

  const payload = funds.map((f) => ({
    code: f.code,
    name: f.name,
    topHoldings: f.stocks.slice(0, 10).map((s) => ({
      name: s.name,
      code: s.code,
      weightPct: s.weight,
      industry: s.industry ?? '',
    })),
  }))

  const { content } = await qwenChat([
    {
      role: 'system',
      content: [
        '你是公募基金持仓赛道分析师。根据各基金十大重仓股，推断一级板块与细分子赛道暴露。',
        '只输出 JSON，不要 markdown。格式：',
        '{"funds":[{"code":"六位代码","sectors":{"科技":0.4,"消费":0.2},"themes":[{"name":"动态子赛道名","parentSector":"科技","weight":0.15}]}]}',
        '规则：',
        '1. sectors 为一级板块占比，键名必须用具体行业板块，优先从下列选用：科技、半导体、通信、计算机、电子、医药生物、新能源、电力设备、汽车、消费、食品饮料、家电、金融、银行、券商、有色金属、化工、钢铁、煤炭、石油石化、建材、建筑、电力、军工、机械设备、房地产、交通运输、传媒、农业。禁止使用「其他」「周期」「综合」等笼统标签。',
        '2. themes 为细分子赛道：必须根据实际重仓内容动态命名（如白酒、创新药、光通信、工业自动化、AI算力、动力电池等），不要套用固定名单；没有明显细分可返回空数组。',
        '3. theme.weight 为该子赛道占该基金净值比例（可由重仓股权重近似）；parentSector 必须是 sectors 中的某个一级板块。',
        '4. 同一板块下合并相近主题，每只基金 themes 不超过 6 个；忽略过小暴露（单主题 <2% 可并入相近项或省略）。',
        '5. 无法归类时，用更接近的具体板块（如化工、机械设备、电子），不要输出「其他」或「周期」。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `请分析以下基金重仓：\n${JSON.stringify(payload).slice(0, 14000)}`,
    },
  ])

  const raw = extractJsonObject(content)
  const parsed = JSON.parse(raw) as { funds?: unknown }
  const list = Array.isArray(parsed.funds) ? parsed.funds : []
  const result: AiFundExposure[] = []

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as {
      code?: unknown
      sectors?: unknown
      themes?: unknown
    }
    const code = String(row.code ?? '').trim()
    if (!code) continue

    const sectors: Record<string, number> = {}
    if (row.sectors && typeof row.sectors === 'object') {
      for (const [k, v] of Object.entries(row.sectors as Record<string, unknown>)) {
        const n = Number(v)
        if (k && Number.isFinite(n) && n > 0) sectors[k] = n
      }
    }

    const themes: AiFundExposure['themes'] = []
    if (Array.isArray(row.themes)) {
      for (const t of row.themes) {
        if (!t || typeof t !== 'object') continue
        const theme = t as {
          name?: unknown
          parentSector?: unknown
          weight?: unknown
        }
        const name = String(theme.name ?? '').trim()
        const parentSector = String(theme.parentSector ?? '').trim()
        const weight = Number(theme.weight)
        if (!name || !parentSector || !Number.isFinite(weight) || weight <= 0) {
          continue
        }
        themes.push({ name, parentSector, weight })
      }
    }

    result.push({ code, sectors, themes })
  }

  return result
}

/**
 * 用千问生成 A 股上市公司一句话业务简介。
 * @param stock 股票代码、名称、行业
 * @returns 简介正文（纯文本，约 2～4 句）
 */
export async function describeListedCompany(stock: {
  code: string
  name: string
  industry?: string
}): Promise<string> {
  const { content } = await qwenChat([
    {
      role: 'system',
      content:
        '你是A股投研助手。根据股票代码与名称，用中文写一段公司业务简介：做什么、主要产品/服务、所处赛道。2～4 句，口语清晰，不要荐股，不要编造具体财务数字；不确定处用「主要从事…」等稳妥表述。只输出简介正文，不要标题或列表。',
    },
    {
      role: 'user',
      content: `股票：${stock.name}（${stock.code}）${stock.industry ? `；行业：${stock.industry}` : ''}`,
    },
  ])
  return content
}
