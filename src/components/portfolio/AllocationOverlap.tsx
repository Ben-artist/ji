import { Badge } from '#/components/ui/badge'
import { Progress } from '#/components/ui/progress'
import { formatYuan } from '#/lib/portfolio/analyze'
import type { SectorDetail, SectorOverlapItem } from '#/lib/portfolio/types'

interface AllocationOverlapProps {
  overlaps: SectorOverlapItem[]
  sectorDetails: SectorDetail[]
  selectedSector: string | null
  onSelectSector: (sector: string) => void
  overlapScore: number
  overlapLevel: string
  overlapInsight: string
}

/**
 * 板块重叠；点击板块可看 AI 拆解的子赛道。
 */
export function AllocationOverlap({
  overlaps,
  sectorDetails,
  selectedSector,
  onSelectSector,
  overlapScore,
  overlapLevel,
  overlapInsight,
}: AllocationOverlapProps) {
  const active =
    sectorDetails.find((s) => s.sector === selectedSector) ??
    sectorDetails[0] ??
    null

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="island-shell rounded-2xl p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
            点选板块看细分
          </h2>
          <div className="text-right">
            <p className="m-0 text-3xl font-bold text-[var(--sea-ink)]">
              {overlapScore}
            </p>
            <Badge variant="secondary">{overlapLevel}</Badge>
          </div>
        </div>
        <p className="mb-4 mt-0 text-sm leading-relaxed text-[var(--sea-ink-soft)]">
          {overlapInsight}
        </p>
        <ul className="m-0 list-none space-y-2 p-0">
          {overlaps.slice(0, 6).map((item) => {
            const selected = (selectedSector ?? active?.sector) === item.sector
            return (
              <li key={item.sector}>
                <button
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    selected
                      ? 'border-[var(--lagoon-deep)] bg-[rgba(79,184,178,0.12)]'
                      : 'border-[var(--line)] hover:bg-[var(--link-bg-hover)]'
                  }`}
                  onClick={() => onSelectSector(item.sector)}
                >
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-[var(--sea-ink)]">
                      {item.sector}
                    </span>
                    <span className="text-[var(--sea-ink-soft)]">
                      {item.portfolioWeight}% · {formatYuan(item.amount)}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, item.overlapScore)}
                    className="h-1.5"
                  />
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {active ? (
        <div className="island-shell rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
              {active.sector} · 子赛道占比
            </h2>
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              板块合计 {active.portfolioWeight}% · {formatYuan(active.amount)}
            </p>
          </div>
          {active.themes.length === 0 ? (
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              该板块暂无细分子赛道拆解，可稍后再分析或换更清晰的持仓数据。
            </p>
          ) : (
            <ul className="m-0 list-none space-y-3 p-0">
              {active.themes.map((theme) => (
                <li
                  key={theme.name}
                  className="rounded-xl border border-[var(--line)] p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--sea-ink)]">
                      {theme.name}
                    </span>
                    <Badge variant="secondary">
                      板块内 {theme.sectorWeight}%
                    </Badge>
                  </div>
                  <p className="mb-2 mt-0 text-sm text-[var(--sea-ink-soft)]">
                    占组合 {theme.portfolioWeight}% · {formatYuan(theme.amount)}
                  </p>
                  <Progress
                    value={Math.min(100, theme.sectorWeight)}
                    className="h-2"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
