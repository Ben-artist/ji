import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { stashInviteCode, useAuth } from '#/components/auth/AuthProvider'
import { getBrowserSupabase } from '#/lib/supabase/browser'
import { validateInvite } from '#/lib/supabase/auth.functions'
import { withAppBase } from '#/lib/app-base'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

/**
 * 内测登录：邀请码 + 邮箱 Magic Link。
 */
function LoginPage() {
  const navigate = useNavigate()
  const { session, ready } = useAuth()
  const [email, setEmail] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (ready && session) {
      void navigate({ to: '/' })
    }
  }, [ready, session, navigate])

  /**
   * 校验邀请码并发送 Magic Link。
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      await validateInvite({ data: { inviteCode: inviteCode.trim() } })
      stashInviteCode(inviteCode.trim())

      const redirectTo = `${window.location.origin}${withAppBase('/auth/callback')}`
      const { error: otpError } = await getBrowserSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      })
      if (otpError) throw otpError
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请稍后重试')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="page-wrap flex justify-center px-4 py-12">
      <section className="island-shell w-full max-w-md rounded-2xl p-6 sm:p-8">
        <h1 className="mt-0 mb-1 text-2xl font-semibold text-[var(--sea-ink)]">
          内测登录
        </h1>
        <p className="mt-0 mb-6 text-sm text-[var(--sea-ink-soft)]">
          填写邀请码与邮箱，我们会发送免密登录链接。
        </p>

        {sent ? (
          <div className="space-y-3 text-sm leading-relaxed text-[var(--sea-ink)]">
            <p className="m-0">
              登录邮件已发送至 <strong>{email.trim()}</strong>，请查收并点击链接完成登录。
            </p>
            <p className="m-0 text-[var(--sea-ink-soft)]">
              若未收到，请检查垃圾箱；链接通常几分钟内有效。
            </p>
            <Button type="button" variant="outline" onClick={() => setSent(false)}>
              重新填写
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            <div className="space-y-2">
              <Label htmlFor="invite">邀请码</Label>
              <Input
                id="invite"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="例如 JIJIN-BETA"
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            {error ? (
              <p className="m-0 text-sm text-rose-600 dark:text-rose-400">{error}</p>
            ) : null}
            <Button
              type="submit"
              className="w-full border-transparent bg-[#328f97] text-white hover:bg-[#4fb8b2] hover:text-white"
              disabled={pending}
            >
              {pending ? '发送中…' : '发送登录链接'}
            </Button>
          </form>
        )}

        <p className="mb-0 mt-6 text-center text-xs text-[var(--sea-ink-soft)]">
          <Link to="/" className="text-[var(--lagoon-deep)]">
            返回首页
          </Link>
        </p>
      </section>
    </main>
  )
}
