let adminAccessToken: string | null = null

export function setAdminAccessToken(token: string | null) {
  adminAccessToken = token && token.trim() ? token.trim() : null
}

export function getAdminAccessToken() {
  return adminAccessToken
}

export function clearAdminAccessToken() {
  adminAccessToken = null
}
