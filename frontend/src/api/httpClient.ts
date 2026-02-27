import axios from 'axios'
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'

export interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

interface AuthClientOptions {
  baseURL: string
  timeout: number
  getAccessToken: () => string | null
  isAuthEndpoint: (url?: string) => boolean
  isLoginEndpoint: (url?: string) => boolean
  authRequiredEvent: string
  loginFailedEvent: string
  authRequiredDetail?: unknown
  logDevErrors?: boolean
}

function hasAuthorizationHeader(config: InternalAxiosRequestConfig): boolean {
  const headers = config.headers as Record<string, string | undefined> | undefined
  if (!headers) {
    return false
  }
  return Boolean(headers.Authorization || headers.authorization)
}

export function createAuthApiClient(options: AuthClientOptions): AxiosInstance {
  const client = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeout,
    withCredentials: true,
  })

  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = options.getAccessToken()
    if (!token || options.isAuthEndpoint(config.url) || hasAuthorizationHeader(config)) {
      return config
    }
    ;(config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
    return config
  })

  client.interceptors.response.use(
    (response) => response.data,
    (error: AxiosError<ApiErrorBody>) => {
      const status = error?.response?.status
      const url = error?.config?.url as string | undefined

      if (status === 401 && options.isLoginEndpoint(url)) {
        window.dispatchEvent(new CustomEvent(options.loginFailedEvent))
      }
      if (status === 401 && !options.isAuthEndpoint(url)) {
        window.dispatchEvent(
          new CustomEvent(options.authRequiredEvent, {
            detail: options.authRequiredDetail,
          }),
        )
      }

      if (options.logDevErrors && import.meta.env.DEV) {
        console.error('API Error:', error)
      }

      return Promise.reject(error)
    },
  )

  return client
}

export function extractApiErrorMessageFrom(error: unknown): string | null {
  const axiosError = error as AxiosError<ApiErrorBody>
  return axiosError.response?.data?.error?.message ?? axiosError.message ?? null
}

export function extractApiErrorCodeFrom(error: unknown): string | null {
  const axiosError = error as AxiosError<ApiErrorBody>
  return axiosError.response?.data?.error?.code ?? null
}

export function extractApiErrorStatusFrom(error: unknown): number | null {
  const axiosError = error as AxiosError<ApiErrorBody>
  return axiosError.response?.status ?? null
}

