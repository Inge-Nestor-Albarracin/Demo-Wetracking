import { useEffect, useState } from 'react'
import type { AssetPage } from '../api/types'
import { AssetStatus } from '../components/AssetStatus'
import { Empty, Field, FilterPanel, Kpi, Loading, Notice, PageHeader, Pagination } from '../components/ui'
import { EMPTY_FILTERS, STATUS_LABELS, normalizeEpc, type AssetFilters, type AssetStatusFilter } from '../lib/assets'
import { formatDateTime } from '../lib/format'
import { queryString, useLoad } from '../lib/useLoad'
import type { Navigate } from './navigation'

const PAGE_SIZE = 20
const TYPING_DELAY_MS = 300

// Registered assets with filters applied by the API on the whole table.
// "Total registrado" ignores the filters; the filtered counts use exactly the
// same conditions as the table.
export function AssetsView({ navigate, initialFilters }: { navigate: Navigate; initialFilters?: Partial<AssetFilters> }) {
  const [filters, setFilters] = useState<AssetFilters>({ ...EMPTY_FILTERS, ...initialFilters })
  const [applied, setApplied] = useState<AssetFilters>(filters)
  const [page, setPage] = useState(1)

  // Text filters wait until the user stops typing.
  useEffect(() => {
    const timer = window.setTimeout(() => setApplied(filters), TYPING_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [filters])

  const assets = useLoad<AssetPage>(
    `/assets${queryString({
      name: applied.name.trim(),
      epc: normalizeEpc(applied.epc),
      category: applied.category.trim(),
      location: applied.location.trim(),
      status: applied.status === 'all' ? undefined : applied.status,
      page,
      pageSize: PAGE_SIZE,
    })}`,
  )

  const set = (field: keyof AssetFilters) => (value: string) => {
    setFilters((current) => ({ ...current, [field]: value }))
    setPage(1)
  }
  const activeCount = Object.entries(filters).filter(([key, value]) => (key === 'status' ? value !== 'all' : value.trim() !== '')).length
  const clear = () => {
    setFilters(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setPage(1)
  }

  const data = assets.data

  return (
    <>
      <PageHeader
        eyebrow="Activos · Consulta"
        title="Activos y resumen"
        description="Todos los activos registrados en la base de datos, del más reciente al más antiguo. Un activo registrado puede no haber sido leído en la sesión actual."
        actions={
          <button type="button" className="button button-secondary" onClick={() => navigate({ name: 'register' })}>
            Registrar activo
          </button>
        }
      />

      {data ? (
        <div className="kpis">
          <Kpi label="Total registrado" value={data.totals.total} hint="Sin filtros" dark />
          <Kpi label="Activos" value={data.totals.active} hint="Sin filtros" />
          <Kpi label="Inactivos" value={data.totals.inactive} hint="Sin filtros" />
        </div>
      ) : null}

      <FilterPanel activeCount={activeCount} onClear={clear}>
        <Field label="Nombre">
          <input type="search" placeholder="Ej. silla" value={filters.name} onChange={(e) => set('name')(e.target.value)} />
        </Field>
        <Field label="EPC">
          <input
            className="mono"
            type="search"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Parte del código"
            value={filters.epc}
            onChange={(e) => set('epc')(e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Categoría">
          <input type="search" placeholder="Ej. Tecnología" value={filters.category} onChange={(e) => set('category')(e.target.value)} />
        </Field>
        <Field label="Ubicación">
          <input type="search" placeholder="Ej. Taller" value={filters.location} onChange={(e) => set('location')(e.target.value)} />
        </Field>
        <Field label="Estado">
          <select value={filters.status} onChange={(e) => set('status')(e.target.value as AssetStatusFilter)}>
            {(Object.keys(STATUS_LABELS) as AssetStatusFilter[]).map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
        </Field>
      </FilterPanel>

      {assets.error ? <Notice kind="error">{assets.error}</Notice> : null}
      {assets.loading && !data ? <Loading label="Cargando activos…" /> : null}

      {data ? (
        <div className="results-head">
          <span>
            <strong>{data.filtered.total}</strong> {data.filtered.total === 1 ? 'activo' : 'activos'}
            {activeCount > 0 ? ' con los filtros aplicados' : ''} · {data.filtered.active} en estado activo ·{' '}
            {data.filtered.inactive} inactivos
          </span>
          {assets.loading ? <span>Actualizando…</span> : null}
        </div>
      ) : null}

      {data && data.items.length === 0 ? (
        <Empty title="Sin activos">
          {activeCount > 0 ? 'No hay activos con estos filtros.' : 'Todavía no se ha registrado ningún activo.'}
        </Empty>
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <div className="table-wrap stack" aria-busy={assets.loading}>
            <table>
              <thead>
                <tr>
                  <th>EPC</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Ubicación</th>
                  <th>Estado</th>
                  <th>Registrado</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((asset) => (
                  <tr key={asset.id}>
                    <td className="card-title" data-label="EPC">
                      <button type="button" className="epc-link" onClick={() => navigate({ name: 'asset', id: asset.id })}>
                        {asset.epc}
                      </button>
                    </td>
                    <td data-label="Nombre">
                      <span className="cell-main">{asset.name}</span>
                      {asset.description ? <span className="cell-sub">{asset.description}</span> : null}
                    </td>
                    <td data-label="Categoría">{asset.category ?? '—'}</td>
                    <td data-label="Ubicación">{asset.location ?? '—'}</td>
                    <td data-label="Estado">
                      <AssetStatus active={asset.active} />
                    </td>
                    <td data-label="Registrado">
                      <span className="cell-main">{formatDateTime(asset.createdAt)}</span>
                      <span className="cell-sub">{asset.createdBy.name}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.filtered.total}
            onChange={setPage}
            disabled={assets.loading}
          />
        </>
      ) : null}
    </>
  )
}
