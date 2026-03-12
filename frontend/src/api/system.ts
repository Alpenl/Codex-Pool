import { apiClient } from './client'
import type { SystemCapabilitiesResponse } from './types'

export const DEFAULT_SYSTEM_CAPABILITIES: SystemCapabilitiesResponse = {
  edition: 'business',
  billing_mode: 'credit_enforced',
  features: {
    multi_tenant: true,
    tenant_portal: true,
    tenant_self_service: true,
    tenant_recharge: true,
    credit_billing: true,
    cost_reports: true,
  },
}

export const systemApi = {
  async getCapabilities(): Promise<SystemCapabilitiesResponse> {
    try {
      return await apiClient.get<SystemCapabilitiesResponse>('/system/capabilities')
    } catch {
      return DEFAULT_SYSTEM_CAPABILITIES
    }
  },
}
