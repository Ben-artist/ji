import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { getBrowserSupabase } from '#/lib/supabase/browser'
import {
  fetchMyQuota,
  redeemInvite,
} from '#/lib/supabase/auth.functions'

export interface QuotaInfo {
  email: string | null
  inviteCode: string | null
  quotaLimit: number
  quotaUsed: number
  remaining: number
  unlimited: boolean
}

interface AuthContextValue {
  ready: boolean
  session: Session | null
  user: User | null
  accessToken: string | null
  quota: QuotaInfo | null
  refreshQuota: () => Promise<void>
  signOut: () => Promise<void>
  /** 登录后用本地暂存的邀请码完成兑换 */
  completeInviteIfNeeded: () => Promise<void>
  /** 手动绑定邀请码 */
  bindInviteCode: (inviteCode: string) => Promise<QuotaInfo>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const INVITE_STORAGE_KEY = 'jijin_pending_invite'

/**
 * 暂存邀请码（发 Magic Link 前）。
 * 用 localStorage：邮件链接常在新标签打开，sessionStorage 会丢。
 * @param code 邀请码
 */
export function stashInviteCode(code: string) {
  if (typeof window === 'undefined') return
  const value = code.trim()
  window.localStorage.setItem(INVITE_STORAGE_KEY, value)
  window.sessionStorage.setItem(INVITE_STORAGE_KEY, value)
}

/**
 * 读取并可选清除暂存邀请码。
 * @param clear 是否清除
 * @returns 邀请码
 */
export function peekInviteCode(clear = false): string | null {
  if (typeof window === 'undefined') return null
  const code =
    window.localStorage.getItem(INVITE_STORAGE_KEY) ||
    window.sessionStorage.getItem(INVITE_STORAGE_KEY)
  if (clear) {
    window.localStorage.removeItem(INVITE_STORAGE_KEY)
    window.sessionStorage.removeItem(INVITE_STORAGE_KEY)
  }
  return code
}

/**
 * 全局登录态与配额。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [quota, setQuota] = useState<QuotaInfo | null>(null)

  const refreshQuota = useCallback(async () => {
    const token = session?.access_token
    if (!token) {
      setQuota(null)
      return
    }
    try {
      const q = await fetchMyQuota({ data: { accessToken: token } })
      setQuota(q)
    } catch {
      setQuota(null)
    }
  }, [session?.access_token])

  const completeInviteIfNeeded = useCallback(async () => {
    const token = session?.access_token
    if (!token) return
    const code = peekInviteCode(false)
    if (!code) {
      await refreshQuota()
      return
    }
    try {
      const q = await redeemInvite({
        data: { accessToken: token, inviteCode: code },
      })
      peekInviteCode(true)
      setQuota(q)
    } catch {
      await refreshQuota()
    }
  }, [session?.access_token, refreshQuota])

  useEffect(() => {
    const supabase = getBrowserSupabase()
    let mounted = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!ready || !session?.access_token) {
      setQuota(null)
      return
    }
    void completeInviteIfNeeded()
  }, [ready, session?.access_token, completeInviteIfNeeded])

  // 从表里改配额后，切回页面/聚焦窗口时重新拉取，避免一直显示旧次数
  useEffect(() => {
    if (!ready || !session?.access_token) return
    const onFocus = () => {
      void refreshQuota()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ready, session?.access_token, refreshQuota])

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      accessToken: session?.access_token ?? null,
      quota,
      refreshQuota,
      completeInviteIfNeeded,
      bindInviteCode: async (inviteCode: string) => {
        const token = session?.access_token
        if (!token) throw new Error('请先登录')
        const q = await redeemInvite({
          data: { accessToken: token, inviteCode: inviteCode.trim() },
        })
        peekInviteCode(true)
        setQuota(q)
        return q
      },
      signOut: async () => {
        await getBrowserSupabase().auth.signOut()
        setQuota(null)
      },
    }),
    [ready, session, quota, refreshQuota, completeInviteIfNeeded],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * 读取鉴权上下文。
 * @returns AuthContextValue
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
