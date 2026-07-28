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
  { chip: string; badge: string; dot: string }
> = {
  good: {
    chip: 'border-emerald-500/30 bg-[color-mix(in_oklab,var(--surface-strong)_90%,#10b981_10%)]',
    badge:
      'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  warn: {
    chip: 'border-amber-500/30 bg-[color-mix(in_oklab,var(--surface-strong)_90%,#f59e0b_10%)]',
    badge:
      'border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  bad: {
    chip: 'border-rose-500/30 bg-[color-mix(in_oklab,var(--surface-strong)_90%,#f43f5e_10%)]',
    badge:
      'border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
}

/**
 * 组合体检：结论优先，三项状态作辅助参考。
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
          组合体检
        </h2>
        <p className="m-0 text-xs text-[var(--sea-ink-soft)]">更新于 {time}</p>
      </div>

      <div className="rounded-xl border border-[rgba(79,184,178,0.35)] bg-[rgba(79,184,178,0.1)] p-4 sm:p-5">
        <h3 className="mt-0 mb-2 text-sm font-semibold text-[var(--sea-ink)]">
          一句话结论
        </h3>
        <p className="m-0 text-[15px] leading-relaxed text-[var(--sea-ink)] sm:text-base">
          {summary}
        </p>
      </div>

      <div className="mt-4">
        <p className="mb-2 mt-0 text-xs text-[var(--sea-ink-soft)]">
          三项参考状态（点 i 看依据，分数仅作辅助）
        </p>
        <div className="flex flex-wrap gap-2">
          {scores.map((metric) => {
            const severity = severityOf(metric)
            const styles = severityStyles[severity]
            return (
              <div
                key={metric.key}
                className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${styles.chip}`}
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${styles.dot}`}
                  aria-hidden
                />
                <span className="text-[var(--sea-ink)]">{metric.label}</span>
                <Badge className={`font-normal ${styles.badge}`}>
                  {metric.level}
                </Badge>
                <span className="tabular-nums text-xs text-[var(--sea-ink-soft)]">
                  {metric.score}
                </span>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-6 text-[var(--sea-ink-soft)]"
                      aria-label={`查看${metric.label}说明`}
                    >
                      <Info className="size-3.5" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {metric.label}：{metric.score}（{metric.level}）
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
            )
          })}
        </div>
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
