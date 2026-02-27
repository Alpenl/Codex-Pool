let tenantAccessToken: string | null = null

export function setTenantAccessToken(token: string | null) {
  tenantAccessToken = token && token.trim() ? token.trim() : null
}

export function getTenantAccessToken() {
  return tenantAccessToken
}

export function clearTenantAccessToken() {
  tenantAccessToken = null
}
