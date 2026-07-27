import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { createServiceSupabase, requireUser } from './server'

/**
 * 解析管理员邮箱白名单（逗号分隔，大小写不敏感）。
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
 * 校验当前用户是否为管理员。
 * @param accessToken JWT
 * @returns 用户邮箱
 * @throws 非管理员
 */
async function requireAdmin(accessToken: string): Promise<string> {
  const user = await requireUser(accessToken)
  const email = (user.email || '').toLowerCase()
  const admins = getAdminEmails()
  if (!email || admins.size === 0 || !admins.has(email)) {
    throw new Error('无管理员权限')
  }
  return email
}

/**
 * 生成短邀请码片段。
 * @returns 8 位大写字母数字
 */
function randomCodeSuffix(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  let out = ''
  for (const b of bytes) {
    out += alphabet[b % alphabet.length]
  }
  return out
}

export interface InviteCodeRow {
  code: string
  maxUses: number
  usedCount: number
  quotaLimit: number
  active: boolean
  note: string | null
  createdAt: string
  remainingUses: number
  /** 实际已绑定该码的用户数（可与 used_count 对照） */
  boundUsers: number
  /** 这些用户累计已消耗的分析次数 */
  totalQuotaUsed: number
}

/**
 * 当前账号是否管理员（供前端显隐入口）。
 */
export const checkIsAdmin = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z.object({ accessToken: z.string().min(20) }).parse(data),
  )
  .handler(async ({ data }) => {
    try {
      await requireAdmin(data.accessToken)
      return { isAdmin: true as const }
    } catch {
      return { isAdmin: false as const }
    }
  })

/**
 * 列出邀请码（新的在前）。
 */
export const listInviteCodes = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z.object({ accessToken: z.string().min(20) }).parse(data),
  )
  .handler(async ({ data }): Promise<InviteCodeRow[]> => {
    await requireAdmin(data.accessToken)
    const db = createServiceSupabase()
    const { data: rows, error } = await db
      .from('invite_codes')
      .select('code, max_uses, used_count, quota_limit, active, note, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw new Error(error.message)

    const { data: profileRows, error: profileError } = await db
      .from('profiles')
      .select('invite_code, quota_used')
      .not('invite_code', 'is', null)
    if (profileError) throw new Error(profileError.message)

    const stats = new Map<string, { bound: number; quotaUsed: number }>()
    for (const p of profileRows ?? []) {
      const code = p.invite_code as string
      const prev = stats.get(code) ?? { bound: 0, quotaUsed: 0 }
      prev.bound += 1
      prev.quotaUsed += Number(p.quota_used) || 0
      stats.set(code, prev)
    }

    return (rows ?? []).map((r) => {
      const agg = stats.get(r.code) ?? { bound: 0, quotaUsed: 0 }
      return {
        code: r.code,
        maxUses: r.max_uses,
        usedCount: r.used_count,
        quotaLimit: r.quota_limit,
        active: r.active,
        note: r.note,
        createdAt: r.created_at,
        remainingUses: Math.max(0, r.max_uses - r.used_count),
        boundUsers: agg.bound,
        totalQuotaUsed: agg.quotaUsed,
      }
    })
  })

/**
 * 批量生成一人一码邀请码。
 */
export const generateInviteCodes = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z
      .object({
        accessToken: z.string().min(20),
        count: z.number().int().min(1).max(50).default(5),
        quotaLimit: z.number().int().min(1).max(100).default(10),
        note: z.string().max(120).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken)
    const db = createServiceSupabase()
    const note = data.note?.trim() || '单人邀请码'
    const created: string[] = []

    for (let i = 0; i < data.count; i += 1) {
      let inserted = false
      for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
        const code = `JIJIN-${randomCodeSuffix()}`
        const { error } = await db.from('invite_codes').insert({
          code,
          max_uses: 1,
          used_count: 0,
          quota_limit: data.quotaLimit,
          active: true,
          note,
        })
        if (!error) {
          created.push(code)
          inserted = true
        } else if (!error.message.toLowerCase().includes('duplicate')) {
          throw new Error(error.message)
        }
      }
      if (!inserted) {
        throw new Error('生成邀请码冲突过多，请重试')
      }
    }

    return { codes: created }
  })

/**
 * 停用邀请码。
 */
export const deactivateInviteCode = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z
      .object({
        accessToken: z.string().min(20),
        code: z.string().min(4),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken)
    const db = createServiceSupabase()
    const { error } = await db
      .from('invite_codes')
      .update({ active: false })
      .eq('code', data.code)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

/**
 * 调整邀请码：可兑换人数、每人额度、已兑换计数；可选同步已绑定用户的 quota_limit。
 */
export const updateInviteCode = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z
      .object({
        accessToken: z.string().min(20),
        code: z.string().min(4),
        maxUses: z.number().int().min(1).max(10000).optional(),
        quotaLimit: z.number().int().min(1).max(1000).optional(),
        usedCount: z.number().int().min(0).optional(),
        syncProfileQuota: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken)
    const db = createServiceSupabase()

    const { data: existing, error: fetchError } = await db
      .from('invite_codes')
      .select('max_uses, used_count, quota_limit')
      .eq('code', data.code)
      .maybeSingle()
    if (fetchError) throw new Error(fetchError.message)
    if (!existing) throw new Error('邀请码不存在')

    const nextMaxUses = data.maxUses ?? existing.max_uses
    const nextUsedCount = data.usedCount ?? existing.used_count
    const nextQuotaLimit = data.quotaLimit ?? existing.quota_limit

    if (nextUsedCount > nextMaxUses) {
      throw new Error('已兑换人数不能大于可兑换上限')
    }

    const { error: updateError } = await db
      .from('invite_codes')
      .update({
        max_uses: nextMaxUses,
        used_count: nextUsedCount,
        quota_limit: nextQuotaLimit,
      })
      .eq('code', data.code)
    if (updateError) throw new Error(updateError.message)

    if (data.syncProfileQuota && data.quotaLimit !== undefined) {
      const { error: profileError } = await db
        .from('profiles')
        .update({ quota_limit: nextQuotaLimit, updated_at: new Date().toISOString() })
        .eq('invite_code', data.code)
      if (profileError) throw new Error(profileError.message)
    }

    return { ok: true as const }
  })

/**
 * 将 invite_codes.used_count 同步为当前 profiles 绑定人数。
 */
export const syncInviteUsedCount = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z
      .object({
        accessToken: z.string().min(20),
        code: z.string().min(4),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken)
    const db = createServiceSupabase()

    const { count, error: countError } = await db
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('invite_code', data.code)
    if (countError) throw new Error(countError.message)

    const bound = count ?? 0
    const { error: updateError } = await db
      .from('invite_codes')
      .update({ used_count: bound })
      .eq('code', data.code)
    if (updateError) throw new Error(updateError.message)

    return { ok: true as const, usedCount: bound }
  })
