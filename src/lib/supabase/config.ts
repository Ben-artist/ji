/**
 * 读取浏览器端 / 服务端共用的 Publishable 配置。
 * @returns url 与 anonKey
 * @throws 未配置时抛错
 */
export function getSupabaseBrowserConfig() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env
  const url = (
    process.env.VITE_SUPABASE_URL ||
    env?.VITE_SUPABASE_URL ||
    ''
  ).trim()
  const anonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    env?.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim()
  if (!url || !anonKey) {
    throw new Error('缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  }
  if (anonKey.startsWith('sb_secret_') || anonKey.includes('service_role')) {
    throw new Error('前端误用了 Secret Key，请改用 Publishable / anon key')
  }
  return { url, anonKey }
}

/**
 * 读取服务端 Supabase 配置（含 Secret）。
 * @returns url / anonKey / serviceRoleKey
 * @throws 未配置时抛错
 */
export function getSupabaseServerConfig() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env
  const { url, anonKey } = getSupabaseBrowserConfig()
  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env?.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim()
  if (!serviceRoleKey) {
    throw new Error('缺少 SUPABASE_SERVICE_ROLE_KEY（仅服务端）')
  }
  return { url, anonKey, serviceRoleKey }
}
