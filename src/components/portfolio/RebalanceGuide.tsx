import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

import { Badge } from '#/components/ui/badge'
import type { RebalanceAction } from '#/lib/portfolio/types'

interface RebalanceGuideProps {
  actions: RebalanceAction[]
}

/**
 * 展示加减仓方向（板块 / 大类），不点名买卖具体基金。
 * @param props.actions 调仓方向列表
 */
export function RebalanceGuide({ actions }: RebalanceGuideProps) {
  const reduce = actions.filter((a) => a.direction === 'reduce')
  const increase = actions.filter((a) => a.direction === 'increase')

  return (
    <section className="island-shell rounded-2xl p-5 sm:p-6">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
        <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
          调仓方向
        </h2>
        <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
          按板块 / 大类 · 不荐具体基金
        </p>
      </div>
      <p className="mb-5 mt-0 text-sm leading-relaxed text-[var(--sea-ink-soft)]">
        根据当前暴露与集中度，标出更值得核对的「减配」与「增配」方向。仅为结构诊断，不构成投资建议。
      </p>

      {actions.length === 0 ? (
        <p className="m-0 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-5 text-sm text-[var(--sea-ink-soft)]">
          当前大类与板块集中度尚可，暂无突出的加减方向。市场波动后可再跑一次分析。
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ActionColumn
            title="关注减配"
            empty="暂无明显过重方向"
            tone="reduce"
            items={reduce}
          />
          <ActionColumn
            title="关注增配"
            empty="暂无优先补齐方向"
            tone="increase"
            items={increase}
          />
        </div>
      )}
    </section>
  )
}

interface ActionColumnProps {
  title: string
  empty: string
  tone: 'reduce' | 'increase'
  items: RebalanceAction[]
}

/**
 * 减配或增配一列。
 */
function ActionColumn({ title, empty, tone, items }: ActionColumnProps) {
  const isReduce = tone === 'reduce'
  return (
    <div
      className={`rounded-xl border p-4 ${
        isReduce
          ? 'border-rose-500/25 bg-[color-mix(in_oklab,var(--surface-strong)_88%,#f43f5e_12%)]'
          : 'border-emerald-500/25 bg-[color-mix(in_oklab,var(--surface-strong)_88%,#10b981_12%)]'
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`flex size-7 items-center justify-center rounded-full ${
            isReduce
              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          }`}
          aria-hidden
        >
          {isReduce ? (
            <ArrowDownRight className="size-4" />
          ) : (
            <ArrowUpRight className="size-4" />
          )}
        </span>
        <h3 className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
          {title}
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="m-0 text-sm text-[var(--sea-ink-soft)]">{empty}</p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-[var(--line)] bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-3 py-2.5"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--sea-ink)]">
                  {item.target}
                </span>
                <Badge variant="secondary" className="font-normal">
                  {item.kind === 'sector' ? '板块' : '大类'} · 当前{' '}
                  {item.currentWeight}%
                </Badge>
                {item.priority === 'high' ? (
                  <Badge
                    className={
                      isReduce
                        ? 'border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    }
                  >
                    优先
                  </Badge>
                ) : null}
              </div>
              <p className="mb-1 mt-0 text-sm font-medium text-[var(--lagoon-deep)]">
                {item.targetHint}
              </p>
              <p className="m-0 text-xs leading-relaxed text-[var(--sea-ink-soft)]">
                {item.reason}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
