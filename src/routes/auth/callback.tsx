import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { useAuth } from '#/components/auth/AuthProvider'
import { Button } from '#/components/ui/button'
import { getBrowserSupabase } from '#/lib/supabase/browser'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
})

/**
 * 解析 Magic Link 回调里的错误信息。
 * @param href 当前地址
 * @returns 可读错误文案，无错误则 null
 */
function readAuthCallbackError(href: string): string | null {
  const url = new URL(href)
  const fromQuery =
    url.searchParams.get('error_description') ||
    url.searchParams.get('error_code') ||
    url.searchParams.get('error')

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  const hashParams = new URLSearchParams(hash)
  const fromHash =
    hashParams.get('error_description') ||
    hashParams.get('error_code') ||
    hashParams.get('error')

  const raw = fromQuery || fromHash
  if (!raw) return null

  const decoded = decodeURIComponent(raw.replace(/\+/g, ' '))
  if (
    decoded.includes('otp_expired') ||
    decoded.toLowerCase().includes('expired') ||
    decoded.toLowerCase().includes('invalid')
  ) {
    return '登录链接无效或已过期。请回到登录页重新发送一封新邮件，并点击最新那封里的链接（每封只能点一次）。'
  }
  return decoded
}

/**
 * Magic Link 回调：交换会话后回首页。
 */
function AuthCallbackPage() {
  const navigate = useNavigate()
  const { completeInviteIfNeeded } = useAuth()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function finish() {
      try {
        const authError = readAuthCallbackError(window.location.href)
        if (authError) {
          throw new Error(authError)
        }

        const supabase = getBrowserSupabase()
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')

        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        } else {
          // 兼容 hash 形式 token
          const { data, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) throw sessionError
          if (!data.session) {
            throw new Error(
              '未获取到登录会话。请重新发送登录邮件，并尽快点击最新链接。',
            )
          }
        }

        await completeInviteIfNeeded()
        if (!cancelled) {
          void navigate({ to: '/' })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '登录回调失败')
        }
      }
    }

    void finish()
    return () => {
      cancelled = true
    }
  }, [completeInviteIfNeeded, navigate])

  return (
    <main className="page-wrap flex justify-center px-4 py-16">
      <section className="island-shell max-w-md rounded-2xl p-8 text-center">
        {error ? (
          <>
            <p className="m-0 text-sm leading-relaxed text-rose-600 dark:text-rose-400">
              {error}
            </p>
            <Button
              asChild
              className="mt-6 border-transparent bg-[#328f97] text-white hover:bg-[#4fb8b2] hover:text-white"
            >
              <Link to="/login">重新登录</Link>
            </Button>
          </>
        ) : (
          <p className="m-0 text-[var(--sea-ink-soft)]">正在完成登录…</p>
        )}
      </section>
    </main>
  )
}
