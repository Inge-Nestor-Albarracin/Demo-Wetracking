export type UserRole = 'ADMIN' | 'OPERATOR'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
}

export interface LoginResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  user: SessionUser
}

// One object tagged with one EPC.
export interface Asset {
  id: string
  epc: string
  name: string
  description: string | null
  category: string | null
  location: string | null
  // Administrative status: an inactive asset is still registered.
  active: boolean
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string }
}

export interface StatusCounts {
  total: number
  active: number
  inactive: number
}

export interface AssetPage {
  items: Asset[]
  page: number
  pageSize: number
  totalPages: number
  // Same conditions as `items`.
  filtered: StatusCounts
  // Every registered asset, whatever the filters.
  totals: StatusCounts
}

export interface ResolveResult {
  found: Asset[]
  unknown: string[]
}

// 409 body of POST /assets.
export interface ExistingAssetConflict {
  existingAsset: { id: string; name: string; active: boolean } | null
}
