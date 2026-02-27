import { apiClient } from './client'
import type { RuntimeConfigSnapshot, RuntimeConfigUpdateRequest } from './types'

export const configApi = {
  getConfig: () => apiClient.get<RuntimeConfigSnapshot>('/admin/config'),
  updateConfig: (payload: RuntimeConfigUpdateRequest) =>
    apiClient.put<RuntimeConfigSnapshot>('/admin/config', payload),
}
