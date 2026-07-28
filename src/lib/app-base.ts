/**
 * 应用挂载路径（无尾斜杠），默认 /jiJin。
 * 设 VITE_BASE_PATH=/ 可退回根路径部署。
 * @returns 如 `/jiJin` 或空字符串（根路径）
 */
export function getAppBasePath(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env
  const raw =
    process.env.VITE_BASE_PATH ||
    env?.VITE_BASE_PATH ||
    '/jiJin'
  const trimmed = String(raw).trim()
  if (!trimmed || trimmed === '/') return ''
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withSlash.replace(/\/+$/, '')
}

/**
 * 给站内绝对路径加上挂载前缀。
 * @param path 以 / 开头的路径，如 `/login`
 * @returns 带 base 的路径
 */
export function withAppBase(path: string): string {
  const base = getAppBasePath()
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalized}`
}
