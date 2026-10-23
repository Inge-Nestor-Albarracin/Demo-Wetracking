import type { AssetFilters } from '../lib/assets'

export type View =
  | { name: 'home' }
  | { name: 'register'; epc?: string }
  | { name: 'lookup' }
  | { name: 'bulk' }
  | { name: 'assets'; filters?: Partial<AssetFilters> }
  | { name: 'admin' }
  | { name: 'asset'; id: string }

export type Navigate = (view: View) => void
