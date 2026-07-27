import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

import { getSupabaseServerConfig } from './config'

/**
 * 解析管理员邮箱白名单。
 * @returns 邮箱集合
 */
function getAdminEmails(): Set<string> {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env
  const raw =
    process.env.ADMIN_EMAILS ||
    env?.ADMIN_EMAILS ||
    process.env.VITE_ADMIN_EMAILS ||
    env?.VITE_ADMIN_EMAILS ||
    ''
  return new Set(
    raw
      .split(',')
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * 服务端：用用户 JWT 访问（可走 RLS / RPC）。
 * @param accessToken 用户 access_token
 * @returns 绑定用户身份的客户端
 */
export function createUserSupabase(accessToken: string): SupabaseClient {
  const { url, anonKey } = getSupabaseServerConfig()
  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * 服务端：Service Role（绕过 RLS，仅用于缓存写入等）。
 * @returns 管理员客户端
 */
export function createServiceSupabase(): SupabaseClient {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * 校验 access token 并返回用户。
 * @param accessToken JWT
 * @returns User
 * @throws 无效 token
 */
export async function requireUser(accessToken: string): Promise<User> {
  const admin = createServiceSupabase()
  const { data, error } = await admin.auth.getUser(accessToken)
  if (error || !data.user) {
    throw new Error('登录已失效，请重新登录')
  }
  return data.user
}

export interface ProfileQuota {
  email: string | null
  inviteCode: string | null
  quotaLimit: number
  quotaUsed: number
  remaining: number
  /** ADMIN_EMAILS 内账号：不扣额度、不限次数 */
  unlimited: boolean
}

/**
 * 读取用户配额资料。
 * @param accessToken JWT
 * @returns 配额信息
 */
export async function getProfileQuota(
  accessToken: string,
): Promise<ProfileQuota> {
  const user = await requireUser(accessToken)
  const email = (user.email || '').toLowerCase()
  const unlimited = email.length > 0 && getAdminEmails().has(email)
  const admin = createServiceSupabase()
  const { data, error } = await admin
    .from('profiles')
    .select('email, invite_code, quota_limit, quota_used')
    .eq('id', user.id)
    .single()
  if (error || !data) {
    throw new Error(error?.message || '无法读取用户资料')
  }
  return {
    email: data.email,
    inviteCode: data.invite_code,
    quotaLimit: data.quota_limit,
    quotaUsed: data.quota_used,
    remaining: unlimited
      ? data.quota_limit
      : Math.max(0, data.quota_limit - data.quota_used),
    unlimited,
  }
}

/**
 * 扣减配额。管理员免绑码且不扣次；普通用户须已绑定且有剩余额度。
 * @param accessToken JWT
 * @param amount 次数
 * @returns 剩余次数（管理员为 Infinity）
 * @throws 额度不足或未绑定邀请码
 */
export async function consumeQuota(
  accessToken: string,
  amount = 1,
): Promise<number> {
  const user = await requireUser(accessToken)
  const email = (user.email || '').toLowerCase()
  const isAdmin = email.length > 0 && getAdminEmails().has(email)
  const admin = createServiceSupabase()

  const { data: profile, error } = await admin
    .from('profiles')
    .select('invite_code, quota_limit, quota_used')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    throw new Error(error?.message || '用户资料不存在')
  }

  if (!profile.invite_code && !isAdmin) {
    throw new Error('请先完成邀请码绑定')
  }

  // 管理员不限次数、不写入 quota_used
  if (isAdmin) {
    return profile.quota_limit
  }

  if (profile.quota_used + amount > profile.quota_limit) {
    throw new Error('内测额度已用完')
  }

  const nextUsed = profile.quota_used + amount
  const { error: updateError } = await admin
    .from('profiles')
    .update({
      quota_used: nextUsed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (updateError) throw new Error(updateError.message)
  return Math.max(0, profile.quota_limit - nextUsed)
}
