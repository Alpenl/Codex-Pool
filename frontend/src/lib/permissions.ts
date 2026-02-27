export type AppRole = 'admin' | 'tenant'

export function canAccessByRole(requiredRoles: AppRole[] | undefined, role: AppRole): boolean {
  if (!requiredRoles || requiredRoles.length === 0) {
    return true
  }
  return requiredRoles.includes(role)
}

