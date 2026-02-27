import { apiClient } from './client'

export interface AdminApiKeyItem {
  id: string
  tenant_id: string
  name: string
  key_prefix: string
  enabled: boolean
  created_at: string
}

export const adminKeysApi = {
  list: () => apiClient.get<AdminApiKeyItem[]>('/admin/keys'),
}

