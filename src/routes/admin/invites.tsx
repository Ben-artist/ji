import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '#/components/auth/AuthProvider'
import { Badge } from '#/components/ui/badge'
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
  checkIsAdmin,
  deactivateInviteCode,
  generateInviteCodes,
  listInviteCodes,
  syncInviteUsedCount,
  updateInviteCode,
  type InviteCodeRow,
} from '#/lib/supabase/admin.functions'

export const Route = createFileRoute('/admin/invites')({
  component: AdminInvitesPage,
})

/**
 * 邀请码管理：批量生成一人一码、复制、停用。
 */
function AdminInvitesPage() {
  const { ready, accessToken, user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<InviteCodeRow[]>([])
  const [count, setCount] = useState('5')
  const [quotaLimit, setQuotaLimit] = useState('10')
  const [note, setNote] = useState('单人邀请码')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [lastGenerated, setLastGenerated] = useState<string[]>([])
  const [editRow, setEditRow] = useState<InviteCodeRow | null>(null)
  const [editMaxUses, setEditMaxUses] = useState('')
  const [editQuotaLimit, setEditQuotaLimit] = useState('')
  const [editUsedCount, setEditUsedCount] = useState('')
  const [editSyncProfile, setEditSyncProfile] = useState(true)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const admin = await checkIsAdmin({ data: { accessToken } })
      setIsAdmin(admin.isAdmin)
      if (!admin.isAdmin) {
        setRows([])
        return
      }
      const list = await listInviteCodes({ data: { accessToken } })
      setRows(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (!ready) return
    if (!accessToken) {
      setLoading(false)
      setIsAdmin(false)
      return
    }
    void load()
  }, [ready, accessToken, load])

  /**
   * 批量生成。
   */
  async function handleGenerate() {
    if (!accessToken) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await generateInviteCodes({
        data: {
          accessToken,
          count: Number(count) || 5,
          quotaLimit: Number(quotaLimit) || 10,
          note: note.trim() || undefined,
        },
      })
      setLastGenerated(result.codes)
      setMessage(`已生成 ${result.codes.length} 个邀请码`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setBusy(false)
    }
  }

  /**
   * 打开调整邀请码弹窗。
   * @param row 当前行
   */
  function openEdit(row: InviteCodeRow) {
    setEditRow(row)
    setEditMaxUses(String(row.maxUses))
    setEditQuotaLimit(String(row.quotaLimit))
    setEditUsedCount(String(row.usedCount))
    setEditSyncProfile(true)
    setError('')
    setMessage('')
  }

  /**
   * 保存邀请码调整。
   */
  async function handleSaveEdit() {
    if (!accessToken || !editRow) return
    setBusy(true)
    setError('')
    try {
      await updateInviteCode({
        data: {
          accessToken,
          code: editRow.code,
          maxUses: Number(editMaxUses),
          quotaLimit: Number(editQuotaLimit),
          usedCount: Number(editUsedCount),
          syncProfileQuota: editSyncProfile,
        },
      })
      setMessage(`已更新 ${editRow.code}`)
      setEditRow(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  /**
   * 复制文本到剪贴板。
   * @param text 文本
   */
  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setMessage('已复制')
    } catch {
      setError('复制失败，请手动选择')
    }
  }

  if (!ready || loading) {
    return (
      <main className="page-wrap px-4 py-16 text-center text-[var(--sea-ink-soft)]">
        加载中…
      </main>
    )
  }

  if (!user) {
    return (
      <main className="page-wrap px-4 py-16 text-center">
        <p className="text-[var(--sea-ink)]">请先登录</p>
        <Button asChild className="mt-4">
          <Link to="/login">去登录</Link>
        </Button>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="page-wrap px-4 py-16 text-center">
        <p className="text-[var(--sea-ink)]">无管理员权限</p>
        <p className="text-sm text-[var(--sea-ink-soft)]">
          在 `.env` 配置 `ADMIN_EMAILS=你的邮箱` 后重启开发服务。
        </p>
      </main>
    )
  }

  return (
    <main className="page-wrap space-y-4 px-4 pb-12 pt-8">
      <header>
        <h1 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
          邀请码管理
        </h1>
        <p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
          「可兑换人数」= 最多多少人能用该码注册；「每人额度」= 绑定后每人可用的分析次数。
        </p>
      </header>

      <section className="island-shell rounded-2xl p-5 sm:p-6">
        <h2 className="mt-0 mb-4 text-lg font-semibold text-[var(--sea-ink)]">
          批量生成
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="count">数量</Label>
            <Input
              id="count"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quota">每人额度</Label>
            <Input
              id="quota"
              type="number"
              min={1}
              max={100}
              value={quotaLimit}
              onChange={(e) => setQuotaLimit(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">备注</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="单人邀请码"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void handleGenerate()}>
            {busy ? '生成中…' : '生成邀请码'}
          </Button>
          {lastGenerated.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyText(lastGenerated.join('\n'))}
            >
              复制本次全部
            </Button>
          ) : null}
        </div>
        {message ? (
          <p className="mb-0 mt-3 text-sm text-[var(--lagoon-deep)]">{message}</p>
        ) : null}
        {error ? (
          <p className="mb-0 mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
        ) : null}
        {lastGenerated.length > 0 ? (
          <pre className="mt-3 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-sm text-[var(--sea-ink)]">
            {lastGenerated.join('\n')}
          </pre>
        ) : null}
      </section>

      <section className="island-shell rounded-2xl p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
            全部邀请码
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            刷新
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-[var(--sea-ink-soft)]">
                <th className="px-2 py-2 font-medium">邀请码</th>
                <th className="px-2 py-2 font-medium">可兑换</th>
                <th className="px-2 py-2 font-medium">每人额度</th>
                <th className="px-2 py-2 font-medium">已绑 / 已耗</th>
                <th className="px-2 py-2 font-medium">状态</th>
                <th className="px-2 py-2 font-medium">备注</th>
                <th className="px-2 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-2 py-2 font-mono text-[var(--sea-ink)]">
                    {row.code}
                  </td>
                  <td className="px-2 py-2 text-[var(--sea-ink-soft)]">
                    {row.usedCount}/{row.maxUses}
                    {row.boundUsers !== row.usedCount ? (
                      <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">
                        (实绑 {row.boundUsers})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-[var(--sea-ink-soft)]">
                    {row.quotaLimit}
                  </td>
                  <td className="px-2 py-2 text-[var(--sea-ink-soft)]">
                    {row.boundUsers} 人 · 共耗 {row.totalQuotaUsed} 次
                  </td>
                  <td className="px-2 py-2">
                    {!row.active ? (
                      <Badge variant="secondary">已停用</Badge>
                    ) : row.remainingUses <= 0 ? (
                      <Badge variant="secondary">已用完</Badge>
                    ) : (
                      <Badge>可用</Badge>
                    )}
                  </td>
                  <td className="px-2 py-2 text-[var(--sea-ink-soft)]">
                    {row.note || '—'}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => void copyText(row.code)}
                      >
                        复制
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => openEdit(row)}
                      >
                        调整
                      </Button>
                      {row.boundUsers !== row.usedCount ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            if (!accessToken) return
                            void syncInviteUsedCount({
                              data: { accessToken, code: row.code },
                            }).then(() => load())
                          }}
                        >
                          同步人数
                        </Button>
                      ) : null}
                      {row.active ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            if (!accessToken) return
                            void deactivateInviteCode({
                              data: { accessToken, code: row.code },
                            }).then(() => load())
                          }}
                        >
                          停用
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="m-0 pt-4 text-sm text-[var(--sea-ink-soft)]">暂无邀请码</p>
          ) : null}
        </div>
      </section>

      <Dialog open={editRow !== null} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>调整邀请码 {editRow?.code}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-max">可兑换人数上限</Label>
              <Input
                id="edit-max"
                type="number"
                min={1}
                max={10000}
                value={editMaxUses}
                onChange={(e) => setEditMaxUses(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-quota">每人分析额度</Label>
              <Input
                id="edit-quota"
                type="number"
                min={1}
                max={1000}
                value={editQuotaLimit}
                onChange={(e) => setEditQuotaLimit(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-used">已兑换计数（used_count）</Label>
              <Input
                id="edit-used"
                type="number"
                min={0}
                value={editUsedCount}
                onChange={(e) => setEditUsedCount(e.target.value)}
              />
              <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
                若与「实绑人数」不一致，可点列表里的「同步人数」按 profiles 自动校正。
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--sea-ink)]">
              <input
                type="checkbox"
                checked={editSyncProfile}
                onChange={(e) => setEditSyncProfile(e.target.checked)}
                className="size-4 rounded border-[var(--line)]"
              />
              同时更新已绑定用户的每人额度
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)}>
              取消
            </Button>
            <Button type="button" disabled={busy} onClick={() => void handleSaveEdit()}>
              {busy ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
