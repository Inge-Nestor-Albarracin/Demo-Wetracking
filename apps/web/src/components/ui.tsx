import { useState, type ReactNode } from 'react'
import { IconChevron, IconFilter } from './icons'

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

// Page title in the login style: uppercase eyebrow + serif headline.
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}

// Numbered form block ("01 Producto"), echoing the login feature list.
export function Section({
  number,
  title,
  description,
  children,
}: {
  number: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="section-card">
      <header className="section-head">
        <span className="section-number" aria-hidden="true">{number}</span>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </header>
      <div className="section-body">{children}</div>
    </section>
  )
}

export function Kpi({ label, value, hint, dark }: { label: string; value: ReactNode; hint?: string; dark?: boolean }) {
  return (
    <div className={dark ? 'kpi dark' : 'kpi'}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {hint ? <span className="kpi-hint">{hint}</span> : null}
    </div>
  )
}

// Collapsible filter panel. Open by default on wide screens; on phones the
// user expands it when needed.
export function FilterPanel({
  activeCount,
  onClear,
  children,
}: {
  activeCount: number
  onClear: () => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 761px)').matches)
  return (
    <section className={open ? 'filter-panel open' : 'filter-panel'}>
      <div className="filter-bar">
        <button type="button" className="filter-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <IconFilter />
          <span>Filtros</span>
          {activeCount > 0 ? <span className="count-pill">{activeCount}</span> : null}
          <IconChevron className="chevron" />
        </button>
        {activeCount > 0 ? (
          <button type="button" className="text-button" onClick={onClear}>
            Limpiar filtros
          </button>
        ) : null}
      </div>
      {open ? <div className="filters">{children}</div> : null}
    </section>
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

export function Empty({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="empty">
      {title ? <strong>{title}</strong> : null}
      <p>{children}</p>
    </div>
  )
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
      <span className="pagination-info">
        Página <strong>{page}</strong> de {totalPages} · {total} {total === 1 ? 'registro' : 'registros'}
      </span>
      <div className="pagination-buttons">
        <button
          type="button"
          className="button button-secondary"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={disabled || page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </nav>
  )
}
