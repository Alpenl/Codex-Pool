import { apiClient } from './client'

export interface AdminLoginResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface AdminMeResponse {
  user_id: string
  username: string
}

export const adminAuthApi = {
  login: (username: string, password: string) =>
    apiClient.post<AdminLoginResponse>('/admin/auth/login', { username, password }),

  logout: () => apiClient.post<void>('/admin/auth/logout'),

  me: () => apiClient.get<AdminMeResponse>('/admin/auth/me'),
}
