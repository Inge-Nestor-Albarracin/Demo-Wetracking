import type { ReactNode } from 'react'

export function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  return (
    <label className={wide ? 'field field-wide' : 'field'}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Notice({
  kind,
  children,
}: {
  kind: 'info' | 'success' | 'error' | 'warning'
  children: ReactNode
}) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </p>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
  disabled,
}: {
  page: number
  totalPages: number
  total: number
  onChange: (page: number) => void
  disabled?: boolean
}) {
  return (
    <nav className="pagination" aria-label="Paginación">
      <button
        type="button"
        className="button button-secondary"
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {page} de {totalPages} · {total} registros
      </span>
      <button
        type="button"
        className="button button-secondary"
        disabled={disabled || page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Siguiente
      </button>
    </nav>
  )
}
