import { tenantApiClient } from './tenantClient'

export interface TenantRegisterRequest {
  tenant_name: string
  email: string
  password: string
}

export interface TenantRegisterResponse {
  tenant_id: string
  user_id: string
  requires_email_verification: boolean
  debug_code?: string
}

export interface TenantLoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  tenant_id: string
  user_id: string
  email: string
}

export interface TenantMeResponse {
  tenant_id: string
  user_id: string
  email: string
  impersonated: boolean
  impersonation_reason?: string
}

export const tenantAuthApi = {
  register: (payload: TenantRegisterRequest) =>
    tenantApiClient.post<TenantRegisterResponse>('/auth/register', payload),

  verifyEmail: (email: string, code: string) =>
    tenantApiClient.post<void>('/auth/verify-email', { email, code }),

  login: (email: string, password: string) =>
    tenantApiClient.post<TenantLoginResponse>('/auth/login', { email, password }),

  logout: () => tenantApiClient.post<void>('/auth/logout'),

  me: () => tenantApiClient.get<TenantMeResponse>('/auth/me'),

  forgotPassword: (email: string) =>
    tenantApiClient.post<{ accepted: boolean; debug_code?: string }>('/auth/password/forgot', {
      email,
    }),

  resetPassword: (email: string, code: string, new_password: string) =>
    tenantApiClient.post<void>('/auth/password/reset', { email, code, new_password }),
}
