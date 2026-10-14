import type { CatalogValue } from '../lib/forms'

export type View =
  | { name: 'register'; epc?: string }
  | { name: 'lookup' }
  | { name: 'bundles'; catalog?: Partial<CatalogValue> }
  | { name: 'summary' }
  | { name: 'bundle'; id: string }

export type Navigate = (view: View) => void
