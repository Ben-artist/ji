import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { getAppBasePath } from './lib/app-base'
import { getContext } from './integrations/tanstack-query/root-provider'
import { routeTree } from './routeTree.gen'

/**
 * 创建应用 Router，并接入 TanStack Query SSR 集成。
 * @returns 配置好的 Router 实例
 */
export function getRouter() {
  const context = getContext()
  const basepath = getAppBasePath() || undefined

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    ...(basepath ? { basepath } : {}),
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
