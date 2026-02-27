import { apiClient } from './client'
import type { AdminProxyItem, AdminProxyTestResponse } from './types'

export type ProxyNode = AdminProxyItem

export const proxiesApi = {
  listProxies: () => apiClient.get<AdminProxyItem[]>('/admin/proxies'),
  testAll: () => apiClient.post<AdminProxyTestResponse>('/admin/proxies/test'),
  testProxy: (proxyId: string) =>
    apiClient.post<AdminProxyTestResponse>('/admin/proxies/test', undefined, {
      params: { proxy_id: proxyId },
    }),
}
