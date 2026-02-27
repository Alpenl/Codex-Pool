import { apiClient } from './client'

export interface AdminTenantItem {
  id: string
  name: string
  status: string
  plan: string
  expires_at?: string | null
  created_at: string
  updated_at: string
}

export interface AdminTenantCreateRequest {
  name: string
  status?: string
  plan?: string
  expires_at?: string | null
}

export interface AdminTenantPatchRequest {
  status?: string
  plan?: string
  expires_at?: string | null
}

export interface AdminRechargeRequest {
  amount_microcredits: number
  reason?: string
}

export interface AdminRechargeResponse {
  tenant_id: string
  amount_microcredits: number
  balance_microcredits: number
}

export interface AdminTenantCreditBalanceResponse {
  tenant_id: string
  balance_microcredits: number
  updated_at: string
}

export interface AdminTenantCreditSummaryResponse {
  tenant_id: string
  balance_microcredits: number
  today_consumed_microcredits: number
  month_consumed_microcredits: number
  updated_at: string
}

export interface AdminTenantCreditLedgerItem {
  id: string
  event_type: string
  api_key_id?: string
  request_id?: string
  delta_microcredits: number
  balance_after_microcredits: number
  model?: string
  unit_price_microcredits?: number
  input_tokens?: number
  output_tokens?: number
  meta_json?: Record<string, unknown>
  created_at: string
}

export interface AdminTenantCreditLedgerResponse {
  items: AdminTenantCreditLedgerItem[]
}

export interface ModelPricingItem {
  id: string
  model: string
  input_price_microcredits: number
  cached_input_price_microcredits: number
  output_price_microcredits: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface ModelPricingUpsertRequest {
  model: string
  input_price_microcredits: number
  cached_input_price_microcredits: number
  output_price_microcredits: number
  enabled: boolean
}

export interface AdminImpersonateRequest {
  tenant_id: string
  reason: string
}

export interface AdminImpersonateResponse {
  session_id: string
  access_token: string
  expires_in: number
  tenant_id: string
}

export const adminTenantsApi = {
  listTenants: () => apiClient.get<AdminTenantItem[]>('/admin/tenants'),
  ensureDefaultTenant: () => apiClient.post<AdminTenantItem>('/admin/tenants/ensure-default'),
  createTenant: (payload: AdminTenantCreateRequest) =>
    apiClient.post<AdminTenantItem>('/admin/tenants', payload),
  patchTenant: (tenantId: string, payload: AdminTenantPatchRequest) =>
    apiClient.patch<AdminTenantItem>(`/admin/tenants/${tenantId}`, payload),
  rechargeTenant: (tenantId: string, payload: AdminRechargeRequest) =>
    apiClient.post<AdminRechargeResponse>(`/admin/tenants/${tenantId}/credits/recharge`, payload),
  getTenantCreditBalance: (tenantId: string) =>
    apiClient.get<AdminTenantCreditBalanceResponse>(`/admin/tenants/${tenantId}/credits/balance`),
  getTenantCreditSummary: (tenantId: string) =>
    apiClient.get<AdminTenantCreditSummaryResponse>(`/admin/tenants/${tenantId}/credits/summary`),
  getTenantCreditLedger: (tenantId: string, limit = 200) =>
    apiClient.get<AdminTenantCreditLedgerResponse>(`/admin/tenants/${tenantId}/credits/ledger`, {
      params: { limit },
    }),
  listModelPricing: () => apiClient.get<ModelPricingItem[]>('/admin/model-pricing'),
  upsertModelPricing: (payload: ModelPricingUpsertRequest) =>
    apiClient.post<ModelPricingItem>('/admin/model-pricing', payload),
  createImpersonation: (payload: AdminImpersonateRequest) =>
    apiClient.post<AdminImpersonateResponse>('/admin/impersonations', payload),
  deleteImpersonation: (sessionId: string) =>
    apiClient.delete<void>(`/admin/impersonations/${sessionId}`),
}
