import { createContext, useContext } from 'react'
import type { RequestOptions } from '../api/client'
import type { SessionUser, UserRole } from '../api/types'

export interface SessionValue {
  user: SessionUser | null
  notice: string | null
  login: (email: string, password: string) => Promise<void>
  logout: (notice?: string) => void
  request: <T>(path: string, options?: RequestOptions) => Promise<{ status: number; data: T }>
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession debe usarse dentro de SessionProvider')
  return value
}

// UI hints only: the API remains the authority on permissions.
// Register assets and resolve reads: ADMIN and OPERATOR.
export const canOperate = (role: UserRole | undefined) => role === 'ADMIN' || role === 'OPERATOR'
// Edit and activate/deactivate assets: ADMIN only.
export const canManage = (role: UserRole | undefined) => role === 'ADMIN'

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
}
