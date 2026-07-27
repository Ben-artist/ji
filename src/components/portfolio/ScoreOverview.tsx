import { Info, Loader2 } from 'lucide-react'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import type { ScoreMetric } from '#/lib/portfolio/types'

interface ScoreOverviewProps {
  scores: ScoreMetric[]
  summary: string
  updatedAt: string
}

type Severity = 'good' | 'warn' | 'bad'

/**
 * 按指标含义映射红黄绿严重等级。
 * 健康度/集中度：分高更好；波动风险：分高更差。
 * @param metric 评分项
 * @returns 严重等级
 */
function severityOf(metric: ScoreMetric): Severity {
  if (metric.key === 'risk') {
    if (metric.score >= 75) return 'bad'
    if (metric.score >= 55) return 'warn'
    return 'good'
  }
  if (metric.score >= 75) return 'good'
  if (metric.score >= 55) return 'warn'
  return 'bad'
}

const severityStyles: Record<
  Severity,
  { card: string; score: string; badge: string }
> = {
  good: {
    card: 'border-emerald-500/35 bg-[color-mix(in_oklab,var(--surface-strong)_82%,#10b981_18%)]',
    score: 'text-emerald-600 dark:text-emerald-400',
    badge:
      'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  warn: {
    card: 'border-amber-500/35 bg-[color-mix(in_oklab,var(--surface-strong)_82%,#f59e0b_18%)]',
    score: 'text-amber-600 dark:text-amber-400',
    badge:
      'border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300',
  },
  bad: {
    card: 'border-rose-500/35 bg-[color-mix(in_oklab,var(--surface-strong)_82%,#f43f5e_18%)]',
    score: 'text-rose-600 dark:text-rose-400',
    badge:
      'border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300',
  },
}

/**
 * 持仓分析概览：三项主评分 + AI 总结。
 */
export function ScoreOverview({
  scores,
  summary,
  updatedAt,
}: ScoreOverviewProps) {
  const time = new Date(updatedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <section className="island-shell rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
          健康度 · 集中度 · 风险
        </h2>
        <p className="m-0 text-xs text-[var(--sea-ink-soft)]">更新于 {time}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {scores.map((metric) => {
          const severity = severityOf(metric)
          const styles = severityStyles[severity]
          return (
            <article
              key={metric.key}
              className={`rounded-xl border p-4 ${styles.card}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
                  {metric.label}
                </p>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-[var(--sea-ink-soft)]"
                      aria-label={`查看${metric.label}说明`}
                    >
                      <Info className="size-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {metric.label}：{metric.score}
                      </DialogTitle>
                      <DialogDescription>{metric.explanation}</DialogDescription>
                    </DialogHeader>
                    <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-[var(--sea-ink-soft)]">
                      {metric.drivers.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </DialogContent>
                </Dialog>
              </div>
              <p
                className={`m-0 text-3xl font-bold tracking-tight ${styles.score}`}
              >
                {metric.score}
              </p>
              <Badge className={`mt-2 ${styles.badge}`}>{metric.level}</Badge>
            </article>
          )
        })}
      </div>

      <div className="mt-4 rounded-xl border border-[var(--line)] bg-[rgba(79,184,178,0.08)] p-4">
        <h3 className="mt-0 mb-2 text-sm font-semibold text-[var(--sea-ink)]">
          分析总结
        </h3>
        <p className="m-0 text-sm leading-relaxed text-[var(--sea-ink)]">
          {summary}
        </p>
      </div>
    </section>
  )
}

/**
 * OCR 完成后、组合分析未就绪时的占位。
 */
export function ScoreOverviewLoading() {
  return (
    <section className="island-shell flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl p-8">
      <Loader2 className="size-6 animate-spin text-[var(--lagoon-deep)]" />
      <p className="m-0 text-base font-medium text-[var(--sea-ink)]">AI 分析中…</p>
      <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
        正在根据重仓拆解板块与评分，请稍候
      </p>
    </section>
  )
}
