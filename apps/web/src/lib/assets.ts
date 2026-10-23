// Same EPC rule as the API: trimmed, uppercase, letters and digits only, no
// fixed length (leading zeros are kept because it is text).
export const EPC_PATTERN = /^[A-Z0-9]{1,128}$/

export const normalizeEpc = (value: string) => value.trim().toUpperCase()

// Suggestions only: category and location are free text in the demo.
export const CATEGORY_SUGGESTIONS = ['Tecnología', 'Mobiliario', 'Herramientas', 'Equipos', 'Almacenamiento']
export const LOCATION_SUGGESTIONS = ['Sala de demostración', 'Oficina 1', 'Oficina 2', 'Taller', 'Bodega de demostración']

export type AssetStatusFilter = 'all' | 'active' | 'inactive'

export interface AssetFilters {
  name: string
  epc: string
  category: string
  location: string
  status: AssetStatusFilter
}

export const EMPTY_FILTERS: AssetFilters = { name: '', epc: '', category: '', location: '', status: 'all' }

export const STATUS_LABELS: Record<AssetStatusFilter, string> = {
  all: 'Todos',
  active: 'Activos',
  inactive: 'Inactivos',
}
