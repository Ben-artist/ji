import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** 子路径部署：域名/jiJin/ ；本地与生产保持一致 */
function resolveBase(): string {
  const raw = (process.env.VITE_BASE_PATH || '/jiJin').trim()
  if (!raw || raw === '/') return '/'
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`
}

const base = resolveBase()

const config = defineConfig({
  base,
  resolve: { tsconfigPaths: true },
  envPrefix: [
    'VITE_',
    'DASHSCOPE_',
    'ALIBABA_CLOUD_',
    'ALIYUN_',
    'SUPABASE_',
    'ADMIN_',
  ],
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    nitro({
      // 生产服务也挂在同一前缀下，否则 /jiJin/assets 会 404
      baseURL: base === '/' ? '/' : base.replace(/\/$/, ''),
    }),
    viteReact(),
  ],
})

export default config
