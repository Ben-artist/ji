import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { useAuth } from '#/components/auth/AuthProvider'
import { AllocationOverlap } from '#/components/portfolio/AllocationOverlap'
import { HoldingsPanel } from '#/components/portfolio/HoldingsPanel'
import {
  ScoreOverview,
  ScoreOverviewLoading,
} from '#/components/portfolio/ScoreOverview'
import { SuggestionsChat } from '#/components/portfolio/SuggestionsChat'
import { UploadPanel } from '#/components/portfolio/UploadPanel'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  recognizePortfolioImages,
  runPortfolioAnalysis,
} from '#/lib/portfolio/analyze.functions'
import { checkIsAdmin } from '#/lib/supabase/admin.functions'
import type { ChatMessage, Holding, PortfolioAnalysis } from '#/lib/portfolio/types'

export const Route = createFileRoute('/')({
  component: AnalyzePage,
})

/**
 * 从服务端/客户端错误中取出可读文案。
 * @param err 未知错误
 * @param fallback 默认文案
 * @returns 用户可见消息
 */
function getErrorMessage(err: unknown, fallback = '操作失败，请稍后重试'): string {
  if (!err) return fallback
  if (typeof err === 'string' && err.trim()) return err.trim()
  if (err instanceof Error && err.message.trim()) {
    const m = err.message.trim()
    const quoted = m.match(/message["']?\s*[:=]\s*["']([^"']+)["']/)
    if (quoted?.[1]) return quoted[1]
    return m
  }
  if (typeof err === 'object' && err !== null) {
    const o = err as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim()
    if (o.data !== undefined) return getErrorMessage(o.data, fallback)
    if (o.error !== undefined) return getErrorMessage(o.error, fallback)
  }
  return fallback
}

function AnalyzePage() {
  const queryClient = useQueryClient()
  const { ready, session, accessToken, quota, refreshQuota, bindInviteCode } =
    useAuth()
  const [bindCode, setBindCode] = useState('')
  const [bindBusy, setBindBusy] = useState(false)
  const [bindError, setBindError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null)
  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasUploaded, setHasUploaded] = useState(false)
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [chatSending, setChatSending] = useState(false)
  const [chatThinking, setChatThinking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [lastImport, setLastImport] = useState<{
    recognizedCount: number
    successRate: number
  } | null>(null)

  useEffect(() => {
    if (!accessToken) {
      setIsAdmin(false)
      return
    }
    let cancelled = false
    void checkIsAdmin({ data: { accessToken } }).then((r) => {
      if (!cancelled) setIsAdmin(r.isAdmin)
    })
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const analyzeMutation = useMutation({
    mutationFn: (next: Holding[]) => {
      if (!accessToken) throw new Error('请先登录')
      return runPortfolioAnalysis({
        data: { accessToken, holdings: next },
      })
    },
    onMutate: () => {
      setActionError(null)
      setAiAnalyzing(true)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['portfolio-analysis'], data)
      setAnalysis(data)
      setHoldings(data.holdings)
      setSelectedSector((prev) =>
        data.sectorDetails.some((s) => s.sector === prev)
          ? prev
          : (data.sectorDetails[0]?.sector ?? null),
      )
      void refreshQuota()
    },
    onError: (err) => {
      setActionError(getErrorMessage(err, '重新分析失败'))
      void refreshQuota()
    },
    onSettled: () => {
      setAiAnalyzing(false)
    },
  })

  const recognizeMutation = useMutation({
    mutationFn: (images: string[]) => {
      if (!accessToken) throw new Error('请先登录')
      return recognizePortfolioImages({ data: { accessToken, images } })
    },
    onMutate: () => {
      setActionError(null)
    },
    onSuccess: async (result) => {
      setLastImport({
        recognizedCount: result.recognizedCount,
        successRate: result.successRate,
      })
      void refreshQuota()
      if (!result.holdings.length) {
        setHasUploaded(false)
        setHoldings([])
        setAnalysis(null)
        setAiAnalyzing(false)
        setActionError('未能识别到基金持仓，请换更清晰的截图后重试')
        return
      }
      setHasUploaded(true)
      setHoldings(result.holdings)
      setAnalysis(null)
      setMessages([])
      setAiAnalyzing(true)
      try {
        if (!accessToken) throw new Error('请先登录')
        const data = await runPortfolioAnalysis({
          data: {
            accessToken,
            holdings: result.holdings,
            skipQuota: true,
          },
        })
        queryClient.setQueryData(['portfolio-analysis'], data)
        setAnalysis(data)
        setHoldings(data.holdings)
        setSelectedSector(data.sectorDetails[0]?.sector ?? null)
        void refreshQuota()
      } catch (err) {
        setActionError(getErrorMessage(err, 'AI 分析失败'))
        void refreshQuota()
      } finally {
        setAiAnalyzing(false)
      }
    },
    onError: (err) => {
      setActionError(getErrorMessage(err, '识别失败'))
      void refreshQuota()
    },
  })

  /**
   * 流式发送自由提问。
   * @param message 用户问题
   */
  async function sendChat(message: string) {
    if (chatSending || !message.trim() || !accessToken) return
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: message.trim(),
    }
    const assistantId = `a-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '' },
    ])
    setChatSending(true)
    setChatThinking(true)

    try {
      const res = await fetch('/api/portfolio-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          message: message.trim(),
          holdings,
        }),
      })
      if (!res.ok || !res.body) {
        throw new Error(`对话请求失败 (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.startsWith('data:'))
          if (!line) continue
          const raw = line.slice(5).trim()
          if (!raw) continue
          let event: {
            type?: string
            status?: string
            text?: string
            message?: string
            analysis?: PortfolioAnalysis
          }
          try {
            event = JSON.parse(raw)
          } catch {
            continue
          }

          if (event.type === 'status') {
            if (event.status === 'thinking') setChatThinking(true)
            if (event.status === 'streaming') setChatThinking(false)
          } else if (event.type === 'delta' && event.text) {
            setChatThinking(false)
            const delta = event.text
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + delta }
                  : m,
              ),
            )
          } else if (event.type === 'done' && event.analysis) {
            queryClient.setQueryData(['portfolio-analysis'], event.analysis)
            setAnalysis(event.analysis)
            setHoldings(event.analysis.holdings)
            void refreshQuota()
          } else if (event.type === 'error') {
            setChatThinking(false)
            const errText = event.message || '对话失败，请稍后重试'
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: errText } : m,
              ),
            )
          }
        }
      }
    } catch (err) {
      setChatThinking(false)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  err instanceof Error ? err.message : '对话失败，请稍后重试',
              }
            : m,
        ),
      )
    } finally {
      setChatSending(false)
      setChatThinking(false)
    }
  }

  const showResults =
    hasUploaded && holdings.length > 0 && analysis && !aiAnalyzing
  const showAiLoading = hasUploaded && aiAnalyzing

  if (!ready) {
    return (
      <main className="page-wrap px-4 py-16 text-center text-[var(--sea-ink-soft)]">
        加载中…
      </main>
    )
  }

  if (!session) {
    return (
      <main className="page-wrap flex justify-center px-4 py-16">
        <section className="island-shell max-w-md rounded-2xl p-8 text-center">
          <h1 className="mt-0 mb-2 text-2xl font-semibold text-[var(--sea-ink)]">
            内测需登录
          </h1>
          <p className="mt-0 mb-6 text-sm text-[var(--sea-ink-soft)]">
            使用邀请码 + 邮箱 Magic Link 登录后，即可上传持仓并开始分析。
          </p>
          <Button
            asChild
            className="border-transparent bg-[#328f97] text-white hover:bg-[#4fb8b2] hover:text-white"
          >
            <Link to="/login">去登录</Link>
          </Button>
        </section>
      </main>
    )
  }

  if (quota && !quota.inviteCode && !isAdmin) {
    return (
      <main className="page-wrap flex flex-1 justify-center px-4 py-16">
        <section className="island-shell w-full max-w-md rounded-2xl p-8">
          <h1 className="mt-0 mb-2 text-center text-xl font-semibold text-[var(--sea-ink)]">
            绑定邀请码
          </h1>
          <p className="mt-0 mb-6 text-center text-sm text-[var(--sea-ink-soft)]">
            登录成功了，但还没绑定邀请码（邮件常在新标签打开会丢临时码）。请在此补填一次。
          </p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              setBindBusy(true)
              setBindError('')
              void bindInviteCode(bindCode)
                .catch((err) => {
                  setBindError(
                    err instanceof Error ? err.message : '绑定失败',
                  )
                })
                .finally(() => setBindBusy(false))
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="bind-invite">邀请码</Label>
              <Input
                id="bind-invite"
                value={bindCode}
                onChange={(e) => setBindCode(e.target.value)}
                placeholder="例如 JIJIN-BETA"
                required
              />
            </div>
            {bindError ? (
              <p className="m-0 text-sm text-rose-600 dark:text-rose-400">
                {bindError}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={bindBusy}
              className="w-full border-transparent bg-[#328f97] text-white hover:bg-[#4fb8b2] hover:text-white"
            >
              {bindBusy ? '绑定中…' : '绑定并继续'}
            </Button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="page-wrap space-y-4 px-4 pb-12 pt-8 sm:space-y-5">
      <header className="rise-in">
        <h1 className="display-title m-0 text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
          看清配置、重叠与细分赛道
        </h1>
        <p className="mt-2 mb-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
          上传持仓截图后开始分析。
          {quota
            ? ` 内测剩余 ${quota.remaining}/${quota.quotaLimit} 次。`
            : ''}{' '}
          内容仅供参考，不构成投资建议。
        </p>
      </header>

      <UploadPanel
        onRecognize={(images) => recognizeMutation.mutate(images)}
        isImporting={recognizeMutation.isPending}
        isAnalyzing={aiAnalyzing}
        lastImport={lastImport}
        error={actionError}
      />

      <Dialog
        open={Boolean(actionError)}
        onOpenChange={(open) => {
          if (!open) setActionError(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>无法完成操作</DialogTitle>
          </DialogHeader>
          <p className="m-0 text-sm leading-relaxed text-[var(--sea-ink)]">
            {actionError}
          </p>
          {actionError?.includes('额度') && quota ? (
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              当前剩余 {quota.remaining}/{quota.quotaLimit} 次。额度用完后需更换邀请码或联系管理员增加次数。
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setActionError(null)}>
              知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAiLoading ? <ScoreOverviewLoading /> : null}

      {showResults ? (
        <>
          <ScoreOverview
            scores={analysis.scores}
            summary={analysis.summary}
            updatedAt={analysis.updatedAt}
          />

          <HoldingsPanel
            holdings={holdings}
            onChange={setHoldings}
            onRecalculate={() => analyzeMutation.mutate(holdings)}
            isAnalyzing={analyzeMutation.isPending || aiAnalyzing}
          />

          <AllocationOverlap
            overlaps={analysis.overlaps}
            sectorDetails={analysis.sectorDetails}
            selectedSector={selectedSector}
            onSelectSector={setSelectedSector}
            overlapScore={analysis.overlapScore}
            overlapLevel={analysis.overlapLevel}
            overlapInsight={analysis.overlapInsight}
          />

          <SuggestionsChat
            messages={messages}
            isSending={chatSending}
            isThinking={chatThinking}
            onSend={(msg) => void sendChat(msg)}
          />
        </>
      ) : null}
    </main>
  )
}
