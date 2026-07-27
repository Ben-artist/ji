import { ImagePlus, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'

interface UploadPanelProps {
  onRecognize: (images: string[]) => void
  isImporting: boolean
  isAnalyzing?: boolean
  error?: string | null
  lastImport?: {
    recognizedCount: number
    successRate: number
  } | null
}

/**
 * 将文件读为 data URL。
 * @param file 图片文件
 * @returns data URL
 */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 截图导入区：阿里云 OCR + 千问结构化。
 */
export function UploadPanel({
  onRecognize,
  isImporting,
  isAnalyzing = false,
  error = null,
  lastImport,
}: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const busy = isImporting || isAnalyzing

  /**
   * 选择本地截图（追加到已有预览，最多 5 张）。
   * @param files 文件列表
   */
  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const selected = [...files]
    const urls = await Promise.all(selected.map((f) => readAsDataUrl(f)))
    setPreviews((prev) => [...prev, ...urls].slice(0, 5))
    // 清空 value，否则再次选同一文件时 onChange 不会触发
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <section className="island-shell rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mt-0 mb-0 text-lg font-semibold text-[var(--sea-ink)]">
            上传持仓截图
          </h2>
        </div>
        <Button
          type="button"
          onClick={() => {
            if (previews.length) onRecognize(previews)
            else inputRef.current?.click()
          }}
          disabled={busy}
          className="shrink-0"
        >
          <Upload className="size-4" />
          {isImporting
            ? '识别中…'
            : isAnalyzing
              ? 'AI分析中…'
              : previews.length
                ? `识别 ${previews.length} 张图`
                : '选择截图'}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {previews.length > 0 ? (
          previews.map((src, i) => (
            <div
              key={`${i}-${src.slice(-24)}`}
              className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[var(--line)]"
            >
              <img
                src={src}
                alt={`持仓截图 ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          ))
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--line)] bg-[color-mix(in_oklab,var(--surface)_90%,white_10%)] text-[var(--sea-ink-soft)]"
          >
            <ImagePlus className="mb-2 size-6 opacity-60" />
            <span className="text-xs">点击选择截图</span>
          </button>
        )}
        {previews.length < 5 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--lagoon-deep)] bg-[rgba(79,184,178,0.08)] text-sm font-medium text-[var(--lagoon-deep)] disabled:opacity-50"
          >
            <Upload className="mb-2 size-5" />
            添加截图
          </button>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-rose-300/70 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-200"
        >
          {error}
        </div>
      ) : null}

      {lastImport ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
          <Badge>识别完成</Badge>
          <span className="text-[var(--sea-ink)]">
            已识别 {lastImport.recognizedCount} 只基金
            {lastImport.successRate
              ? `，成功率 ${lastImport.successRate}%`
              : ''}
          </span>
        </div>
      ) : null}
    </section>
  )
}
