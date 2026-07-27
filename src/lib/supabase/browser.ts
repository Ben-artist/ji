import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseBrowserConfig } from './config'

let browserClient: SupabaseClient | null = null

/**
 * 浏览器端 Supabase 客户端（会话存在 localStorage）。
 * @returns SupabaseClient
 */
export function getBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient
  const { url, anonKey } = getSupabaseBrowserConfig()
  browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return browserClient
}
