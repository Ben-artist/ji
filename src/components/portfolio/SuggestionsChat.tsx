import { Bot, Loader2, Send, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import type { ChatMessage } from '#/lib/portfolio/types'

interface SuggestionsChatProps {
  messages: ChatMessage[]
  isSending: boolean
  isThinking: boolean
  onSend: (message: string) => void
}

const hints = [
  '主要板块的子赛道怎么拆？',
  '我的整体风险偏高吗？',
  '怎么降低集中度？',
]

/**
 * 自由对话：固定高度、流式展示、用户/AI 头像。
 */
export function SuggestionsChat({
  messages,
  isSending,
  isThinking,
  onSend,
}: SuggestionsChatProps) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const canSend = Boolean(draft.trim()) && !isSending

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, isThinking])

  /**
   * 提交对话。
   */
  function submit() {
    const text = draft.trim()
    if (!text || isSending) return
    onSend(text)
    setDraft('')
  }

  return (
    <section className="island-shell flex h-[min(560px,70vh)] flex-col rounded-2xl p-5 sm:p-6">
      <h2 className="mb-3 mt-0 shrink-0 text-lg font-semibold text-[var(--sea-ink)]">
        自由提问
      </h2>
      <div className="mb-3 flex shrink-0 flex-wrap gap-2">
        {hints.map((h) => (
          <Button
            key={h}
            type="button"
            variant="outline"
            size="sm"
            disabled={isSending}
            onClick={() => onSend(h)}
          >
            {h}
          </Button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[color-mix(in_oklab,var(--surface)_90%,white_10%)]">
        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {messages.length === 0 && !isThinking ? (
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              还没有对话，可以直接提问或点上方快捷问题。
            </p>
          ) : (
            messages.map((m) => {
              const isUser = m.role === 'user'
              const showThinking =
                !isUser && isThinking && !m.content.trim()
              return (
                <div
                  key={m.id}
                  className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full border ${
                      isUser
                        ? 'border-[rgba(79,184,178,0.45)] bg-[rgba(79,184,178,0.25)] text-[var(--lagoon-deep)]'
                        : 'border-[var(--line)] bg-[color-mix(in_oklab,var(--sea-ink)_10%,transparent)] text-[var(--sea-ink)]'
                    }`}
                    aria-hidden
                  >
                    {isUser ? (
                      <User className="size-4" />
                    ) : (
                      <Bot className="size-4" />
                    )}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-[rgba(79,184,178,0.16)] text-[var(--sea-ink)]'
                        : 'bg-[color-mix(in_oklab,var(--sea-ink)_9%,transparent)] text-[var(--sea-ink)]'
                    }`}
                  >
                    {showThinking ? (
                      <span className="inline-flex items-center gap-2 text-[var(--sea-ink-soft)]">
                        <Loader2 className="size-3.5 animate-spin" />
                        思考中…
                      </span>
                    ) : isUser ? (
                      m.content
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-[var(--sea-ink)]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.content || '…'}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 border-t border-[var(--line)] p-2 pl-3">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={isSending}
            placeholder="问板块细分、风险、调仓思路，Enter 发送"
            className="h-10 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            disabled={!canSend}
            onClick={submit}
            aria-label="发送"
            className="size-9 shrink-0 bg-[#328f97] text-white hover:bg-[#2a7a81] disabled:opacity-40"
          >
            {isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </section>
  )
}
