import type { UserRole } from '../api/types'

export const ROLES: UserRole[] = ['ADMIN', 'OPERATOR']

// What each role can do in the RFID Demo (enforced by the API).
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: 'Registrar, consultar, editar y activar/desactivar activos; gestionar usuarios.',
  OPERATOR: 'Registrar y consultar activos y realizar lecturas.',
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
  createdAt: string
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_'

// Random initial password (16 chars, ~93 bits) from the browser CSPRNG.
// Rejection sampling keeps every character equally likely.
export function generatePassword(length = 16): string {
  const size = PASSWORD_ALPHABET.length
  const limit = 256 - (256 % size)
  let out = ''
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += PASSWORD_ALPHABET[byte % size]
    }
  }
  return out
}

// Case- and accent-insensitive text match for client-side search.
export function matches(text: string, query: string): boolean {
  const normalize = (value: string) =>
    value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return normalize(text).includes(normalize(query.trim()))
}
