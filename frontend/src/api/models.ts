import { apiClient } from './client'

export type ModelAvailabilityStatus = 'unknown' | 'available' | 'unavailable'

export interface ModelSchema {
  id: string
  object: string
  created: number
  owned_by: string
  entity_id?: string | null
  visibility?: string | null
  in_catalog: boolean
  availability_status: ModelAvailabilityStatus
  availability_checked_at?: string | null
  availability_http_status?: number | null
  availability_error?: string | null
}

export interface ModelsMeta {
  probe_cache_ttl_sec: number
  probe_cache_stale: boolean
  probe_cache_updated_at?: string | null
  source_account_label?: string | null
  catalog_last_error?: string | null
}

export interface ListModelsResponse {
  object: string
  data: ModelSchema[]
  meta: ModelsMeta
}

export interface ProbeModelsRequest {
  force?: boolean
  models?: string[]
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

export interface ModelEntityItem {
  id: string
  model: string
  provider: string
  visibility?: string | null
  created_at: string
  updated_at: string
}

export interface ModelEntityUpsertRequest {
  model: string
  provider?: string
  visibility?: string | null
}

export const modelsApi = {
  listModels: () =>
    apiClient.get<ListModelsResponse>('/admin/models', {
      timeout: 30000,
    }),
  probeModels: (payload: ProbeModelsRequest = {}) =>
    apiClient.post<ListModelsResponse>('/admin/models/probe', payload),
  listModelPricing: () => apiClient.get<ModelPricingItem[]>('/admin/model-pricing'),
  upsertModelPricing: (payload: ModelPricingUpsertRequest) =>
    apiClient.post<ModelPricingItem>('/admin/model-pricing', payload),
  deleteModelPricing: (pricingId: string) =>
    apiClient.delete<void>(`/admin/model-pricing/${pricingId}`),
  listModelEntities: () => apiClient.get<ModelEntityItem[]>('/admin/model-entities'),
  upsertModelEntity: (payload: ModelEntityUpsertRequest) =>
    apiClient.post<ModelEntityItem>('/admin/model-entities', payload),
  deleteModelEntity: (entityId: string) =>
    apiClient.delete<void>(`/admin/model-entities/${entityId}`),
}
