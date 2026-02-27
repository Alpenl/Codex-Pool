import { apiClient } from './client'
import type { AdminSystemStateResponse } from './types'

export interface ApiKey {
    id: string;
    tenant_id?: string;
    name: string;
    key_prefix: string;
    key_hash: string;
    enabled: boolean;
    created_at: string;
}

export interface CreateApiKeyRequest {
    tenant_id: string;
    name: string;
}

export interface CreateApiKeyResponse {
    record: ApiKey;
    plaintext_key: string;
}

export const apiKeysApi = {
    listKeys: () =>
        apiClient.get<ApiKey[]>('/admin/keys'),

    createKey: (name: string, tenant_name?: string, tenant_id?: string) =>
        apiClient.post<CreateApiKeyResponse>('/admin/keys', { name, tenant_name, tenant_id }),

    updateKeyEnabled: (keyId: string, enabled: boolean) =>
        apiClient.patch<ApiKey>(`/admin/keys/${keyId}`, { enabled }),
}

export const adminApi = {
    getSystemState: () =>
        apiClient.get<AdminSystemStateResponse>('/admin/system/state'),
}
