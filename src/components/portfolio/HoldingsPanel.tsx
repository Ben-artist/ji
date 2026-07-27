import { ListOrdered, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  getFundTopHoldings,
  getStockBrief,
  prepareFundHolding,
  searchFunds,
} from '#/lib/portfolio/analyze.functions'
import { formatYuan, syncWeightsFromAmounts } from '#/lib/portfolio/analyze'
import type { Holding } from '#/lib/portfolio/types'

interface HoldingsPanelProps {
  holdings: Holding[]
  onChange: (next: Holding[]) => void
  onRecalculate: () => void
  isAnalyzing: boolean
}

/**
 * 我的持仓：编辑金额（比例自动重算）、删除、手动添加。
 */
export function HoldingsPanel({
  holdings,
  onChange,
  onRecalculate,
  isAnalyzing,
}: HoldingsPanelProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<
    Awaited<ReturnType<typeof searchFunds>>
  >([])
  const [amountInput, setAmountInput] = useState('50000')
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')

  const totalAmount = useMemo(
    () => holdings.reduce((s, h) => s + h.amount, 0),
    [holdings],
  )

  const [adding, setAdding] = useState(false)
  const [topOpen, setTopOpen] = useState(false)
  const [topLoading, setTopLoading] = useState(false)
  const [topTitle, setTopTitle] = useState('')
  const [topDate, setTopDate] = useState<string | null>(null)
  const [topStocks, setTopStocks] = useState<
    Array<{ code: string; name: string; weight: number; industry?: string }>
  >([])
  const [briefOpen, setBriefOpen] = useState(false)
  const [stockBriefTitle, setStockBriefTitle] = useState('')
  const [stockBrief, setStockBrief] = useState('')
  const [stockBriefLoading, setStockBriefLoading] = useState(false)
  const stockBriefCache = useRef(new Map<string, string>())

  /**
   * 查看基金十大重仓股。
   * @param holding 持仓
   */
  async function openTopHoldings(holding: Holding) {
    if (!holding.code || holding.code === 'CASH' || holding.code === 'UNKNOWN') {
      return
    }
    setTopTitle(`${holding.name}（${holding.code}）`)
    setTopOpen(true)
    setTopLoading(true)
    setBriefOpen(false)
    setStockBrief('')
    setStockBriefTitle('')
    try {
      const result = await getFundTopHoldings({ data: { code: holding.code } })
      setTopStocks(result.stocks)
      setTopDate(result.reportDate)
    } catch {
      setTopStocks([])
      setTopDate(null)
    } finally {
      setTopLoading(false)
    }
  }

  /**
   * 点击重仓股，弹窗展示公司业务简介。
   * @param stock 重仓股
   */
  async function openStockBrief(stock: {
    code: string
    name: string
    industry?: string
  }) {
    const key = stock.code || stock.name
    setStockBriefTitle(`${stock.name}（${stock.code}）`)
    setBriefOpen(true)
    const cached = stockBriefCache.current.get(key)
    if (cached) {
      setStockBrief(cached)
      setStockBriefLoading(false)
      return
    }
    setStockBrief('')
    setStockBriefLoading(true)
    try {
      const { brief } = await getStockBrief({
        data: {
          code: stock.code,
          name: stock.name,
          industry: stock.industry,
        },
      })
      stockBriefCache.current.set(key, brief)
      setStockBrief(brief)
    } catch {
      setStockBrief('暂时无法生成该公司简介，请稍后再试。')
    } finally {
      setStockBriefLoading(false)
    }
  }

  /**
   * 打开添加弹窗时拉取基金目录。
   * @param open 是否打开
   */
  async function handleOpenAdd(open: boolean) {
    setAddOpen(open)
    if (open) {
      setResults([])
      setSelectedCode(null)
      setQuery('')
      setAmountInput('50000')
    }
  }

  /**
   * 按关键字搜索基金。
   * @param value 搜索词
   */
  async function handleSearch(value: string) {
    setQuery(value)
    const list = await searchFunds({ data: { q: value } })
    setResults(list)
  }

  /**
   * 将选中基金按金额加入持仓（天天基金补全重仓暴露）。
   */
  async function handleAdd() {
    const fund = results.find((f) => f.code === selectedCode)
    const amount = Number(amountInput)
    if (!fund || !Number.isFinite(amount) || amount <= 0) return
    setAdding(true)
    try {
      const next = await prepareFundHolding({
        data: { code: fund.code, name: fund.name, amount },
      })
      onChange(syncWeightsFromAmounts([...holdings, next]))
      setAddOpen(false)
    } finally {
      setAdding(false)
    }
  }

  /**
   * 提交金额编辑并重算比例。
   * @param id 持仓 id
   */
  function commitEdit(id: string) {
    const next = Number(editAmount)
    if (!Number.isFinite(next) || next < 0) {
      setEditingId(null)
      return
    }
    onChange(
      syncWeightsFromAmounts(
        holdings.map((h) =>
          h.id === id ? { ...h, amount: next, needsReview: false } : h,
        ),
      ),
    )
    setEditingId(null)
  }

  return (
    <section className="island-shell rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
          共 {holdings.length} 只 · {formatYuan(totalAmount)}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Dialog open={addOpen} onOpenChange={handleOpenAdd}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Plus className="size-4" />
                添加基金
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>手动添加基金</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fund-q">搜索代码或名称</Label>
                  <Input
                    id="fund-q"
                    value={query}
                    onChange={(e) => void handleSearch(e.target.value)}
                    placeholder="例如 510300"
                  />
                </div>
                <ul className="m-0 max-h-48 list-none space-y-1 overflow-auto p-0">
                  {results.map((f) => (
                    <li key={f.code}>
                      <button
                        type="button"
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                          selectedCode === f.code
                            ? 'border-[var(--lagoon-deep)] bg-[rgba(79,184,178,0.12)]'
                            : 'border-[var(--line)]'
                        }`}
                        onClick={() => setSelectedCode(f.code)}
                      >
                        <span>
                          {f.name}
                          <span className="ml-2 text-[var(--sea-ink-soft)]">
                            {f.code}
                          </span>
                        </span>
                        <Badge variant="secondary">{f.fundType}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="space-y-1.5">
                  <Label htmlFor="fund-amt">持仓金额（元）</Label>
                  <Input
                    id="fund-amt"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => void handleAdd()}
                  disabled={!selectedCode || adding}
                >
                  {adding ? '拉取重仓中…' : '加入持仓'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            type="button"
            size="sm"
            onClick={onRecalculate}
            disabled={isAnalyzing || holdings.length === 0}
          >
            {isAnalyzing ? '分析中…' : '重新计算'}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)]">
              <th className="px-2 py-2 font-semibold text-[var(--sea-ink-soft)]">
                基金名称
              </th>
              <th className="px-2 py-2 font-semibold text-[var(--sea-ink-soft)]">
                持仓金额
              </th>
              <th className="px-2 py-2 font-semibold text-[var(--sea-ink-soft)]">
                持仓比例
              </th>
              <th className="px-2 py-2 font-semibold text-[var(--sea-ink-soft)]">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--line)] last:border-0"
              >
                <td className="px-2 py-3 align-middle">
                  <span className="font-medium text-[var(--sea-ink)]">
                    {row.name}
                  </span>
                  <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
                    {row.code}
                  </p>
                </td>
                <td className="px-2 py-3 align-middle">
                  {editingId === row.id ? (
                    <Input
                      className="h-8 w-28"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      onBlur={() => commitEdit(row.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit(row.id)
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-sm font-medium text-[var(--sea-ink)]"
                      onClick={() => {
                        setEditingId(row.id)
                        setEditAmount(String(row.amount))
                      }}
                    >
                      {formatYuan(row.amount)}
                      <Pencil className="size-3.5 opacity-50" />
                    </button>
                  )}
                </td>
                <td className="px-2 py-3 align-middle text-[var(--sea-ink-soft)]">
                  {row.weight.toFixed(2)}%
                </td>
                <td className="px-2 py-3 align-middle">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`查看${row.name}十大重仓`}
                    disabled={
                      !row.code ||
                      row.code === 'CASH' ||
                      row.code === 'UNKNOWN'
                    }
                    onClick={() => void openTopHoldings(row)}
                  >
                    <ListOrdered className="size-4 text-[var(--sea-ink-soft)]" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`删除${row.name}`}
                    onClick={() =>
                      onChange(
                        syncWeightsFromAmounts(
                          holdings.filter((h) => h.id !== row.id),
                        ),
                      )
                    }
                  >
                    <Trash2 className="size-4 text-[var(--sea-ink-soft)]" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 mb-0 text-xs text-[var(--sea-ink-soft)]">
        点击金额可编辑；比例随总金额自动变化。列表图标可查看天天基金十大重仓。改完后点「重新计算」刷新分析。
      </p>

      <Dialog open={topOpen} onOpenChange={setTopOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{topTitle} · 十大重仓</DialogTitle>
          </DialogHeader>
          {topLoading ? (
            <p className="text-sm text-[var(--sea-ink-soft)]">加载中…</p>
          ) : topStocks.length === 0 ? (
            <p className="text-sm text-[var(--sea-ink-soft)]">
              暂无股票重仓数据（债券/货币或未披露）。
            </p>
          ) : (
            <div className="space-y-2">
              <p className="mb-3 mt-0 text-xs text-[var(--sea-ink-soft)]">
                报告期：{topDate ?? '未知'}（季度披露，非实时）。点击股票可查看公司简介。
              </p>
              <ul className="m-0 list-none space-y-2 p-0">
                {topStocks.map((s, i) => (
                  <li key={`${s.code}-${i}`}>
                    <button
                      type="button"
                      onClick={() => void openStockBrief(s)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-left text-sm transition hover:border-[var(--lagoon-deep)] hover:bg-[var(--link-bg-hover)]"
                    >
                      <span>
                        {i + 1}. {s.name}
                        <span className="ml-2 text-[var(--sea-ink-soft)]">
                          {s.code}
                          {s.industry ? ` · ${s.industry}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium">{s.weight}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={briefOpen} onOpenChange={setBriefOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{stockBriefTitle || '公司简介'}</DialogTitle>
          </DialogHeader>
          <p className="m-0 text-sm leading-relaxed text-[var(--sea-ink-soft)]">
            {stockBriefLoading ? '正在生成简介…' : stockBrief}
          </p>
        </DialogContent>
      </Dialog>
    </section>
  )
}
