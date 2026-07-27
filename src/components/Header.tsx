import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { useAuth } from './auth/AuthProvider'
import ThemeToggle from './ThemeToggle'
import { Button } from './ui/button'
import { checkIsAdmin } from '#/lib/supabase/admin.functions'

export default function Header() {
  const { ready, user, quota, accessToken, signOut } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!ready || !accessToken) {
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
  }, [ready, accessToken])

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
          >
            <span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
            基今
          </Link>
        </h2>

        <div className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:order-none sm:w-auto sm:flex-nowrap sm:pb-0">
          <Link
            to="/"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            持仓分析
          </Link>
          {isAdmin ? (
            <Link
              to="/admin/invites"
              className="nav-link"
              activeProps={{ className: 'nav-link is-active' }}
            >
              邀请码
            </Link>
          ) : null}
        </div>

        <div className="ml-auto flex max-w-full items-center gap-1.5 sm:gap-2">
          {ready && user ? (
            <>
              {quota ? (
                <span
                  className={`hidden text-xs sm:inline ${
                    !quota.unlimited && quota.remaining <= 3
                      ? 'font-semibold text-rose-600 dark:text-rose-400'
                      : 'text-[var(--sea-ink-soft)]'
                  }`}
                >
                  {quota.unlimited
                    ? '管理员 · 不限次数'
                    : `剩余 ${quota.remaining}/${quota.quotaLimit} 次`}
                </span>
              ) : null}
              <span
                className="hidden max-w-[10rem] truncate text-xs text-[var(--sea-ink-soft)] md:inline"
                title={user.email ?? undefined}
              >
                {user.email}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-[var(--sea-ink-soft)]"
                onClick={() => void signOut()}
              >
                退出
              </Button>
            </>
          ) : ready ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/login">登录</Link>
            </Button>
          ) : null}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
