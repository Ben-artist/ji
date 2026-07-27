import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  createServiceSupabase,
  createUserSupabase,
  getProfileQuota,
  requireUser,
} from './server'

const tokenSchema = z.object({
  accessToken: z.string().min(20),
})

/**
 * 校验邀请码是否可用（发 Magic Link 前）。
 */
export const validateInvite = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z.object({ inviteCode: z.string().min(4).max(64) }).parse(data),
  )
  .handler(async ({ data }) => {
    const admin = createServiceSupabase()
    const { data: rows, error } = await admin.rpc('validate_invite_code', {
      p_code: data.inviteCode.trim(),
    })
    if (error) throw new Error(error.message)
    const row = Array.isArray(rows) ? rows[0] : rows
    if (!row?.ok) {
      throw new Error(row?.message || '邀请码无效')
    }
    return {
      ok: true as const,
      quotaLimit: Number(row.quota_limit),
    }
  })

/**
 * 登录后兑换邀请码。
 */
export const redeemInvite = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    tokenSchema
      .extend({ inviteCode: z.string().min(4).max(64) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireUser(data.accessToken)
    const userClient = createUserSupabase(data.accessToken)
    const { data: rows, error } = await userClient.rpc('redeem_invite_code', {
      p_code: data.inviteCode.trim(),
    })
    if (error) throw new Error(error.message)
    const row = Array.isArray(rows) ? rows[0] : rows
    if (!row?.ok) {
      throw new Error(row?.message || '邀请码兑换失败')
    }
    return getProfileQuota(data.accessToken)
  })

/**
 * 获取当前用户配额。
 */
export const fetchMyQuota = createServerFn({ method: 'POST' })
  .validator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }) => {
    await requireUser(data.accessToken)
    return getProfileQuota(data.accessToken)
  })
