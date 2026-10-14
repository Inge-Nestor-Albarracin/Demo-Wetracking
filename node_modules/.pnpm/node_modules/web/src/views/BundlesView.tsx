import { useState } from 'react'
import type { Bundle, Page } from '../api/types'
import { CatalogSelectors } from '../components/CatalogSelectors'
import { LocationSelectors } from '../components/LocationSelectors'
import { Empty, Field, FilterPanel, Loading, Notice, PageHeader, Pagination } from '../components/ui'
import { formatDateTime } from '../lib/format'
import { EMPTY_CATALOG, EMPTY_LOCATION, type CatalogValue, type LocationValue } from '../lib/forms'
import { queryString, useLoad } from '../lib/useLoad'
import type { Navigate } from './navigation'

const PAGE_SIZE = 25

export function BundlesView({
  navigate,
  initialCatalog,
}: {
  navigate: Navigate
  initialCatalog?: Partial<CatalogValue>
}) {
  const [catalog, setCatalog] = useState<CatalogValue>({ ...EMPTY_CATALOG, ...initialCatalog })
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION)
  const [available, setAvailable] = useState('')
  const [page, setPage] = useState(1)

  const path = `/inventory/bundles${queryString({
    familyId: catalog.familyId,
    referenceId: catalog.referenceId,
    finishId: catalog.finishId,
    branchId: location.branchId,
    inventoryLocationId: location.inventoryLocationId,
    aisleId: location.aisleId,
    rackId: location.rackId,
    available,
    page,
    pageSize: PAGE_SIZE,
  })}`
  const bundles = useLoad<Page<Bundle>>(path)

  const activeCount =
    Object.values(catalog).filter(Boolean).length +
    Object.values(location).filter(Boolean).length +
    (available ? 1 : 0)

  // Any filter change returns to the first page.
  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(1)
  }

  const clear = () => {
    setCatalog(EMPTY_CATALOG)
    setLocation(EMPTY_LOCATION)
    setAvailable('')
    setPage(1)
  }

  const data = bundles.data

  return (
    <>
      <PageHeader
        eyebrow="Inventario · Paquetes"
        title="Paquetes"
        description="Todos los paquetes registrados, del más reciente al más antiguo. Filtra por producto, ubicación o estado."
      />

      <FilterPanel activeCount={activeCount} onClear={clear}>
        <CatalogSelectors mode="filter" value={catalog} onChange={filter(setCatalog)} />
        <LocationSelectors mode="filter" value={location} onChange={filter(setLocation)} />
        <Field label="Estado">
          <select value={available} onChange={(e) => filter(setAvailable)(e.target.value)}>
            <option value="">Todos</option>
            <option value="true">Con perfiles</option>
            <option value="false">Agotados</option>
          </select>
        </Field>
      </FilterPanel>

      {bundles.error ? <Notice kind="error">{bundles.error}</Notice> : null}
      {bundles.loading && !data ? <Loading label="Cargando paquetes…" /> : null}

      {data ? (
        <div className="results-head">
          <span>
            <strong>{data.total}</strong> {data.total === 1 ? 'paquete' : 'paquetes'}
            {activeCount > 0 ? ' con los filtros aplicados' : ''}
          </span>
          {bundles.loading ? <span>Actualizando…</span> : null}
        </div>
      ) : null}

      {data && data.items.length === 0 ? (
        <Empty title="Sin paquetes">
          {activeCount > 0 ? 'No hay paquetes con estos filtros.' : 'Todavía no se ha registrado ningún paquete.'}
        </Empty>
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <div className="table-wrap stack" aria-busy={bundles.loading}>
            <table>
              <thead>
                <tr>
                  <th>EPC</th>
                  <th>Referencia</th>
                  <th>Acabado</th>
                  <th className="num">Perfiles</th>
                  <th>Ubicación</th>
                  <th>Registrado</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((bundle) => (
                  <tr key={bundle.id}>
                    <td className="card-title" data-label="EPC">
                      <button type="button" className="epc-link" onClick={() => navigate({ name: 'bundle', id: bundle.id })}>
                        {bundle.epc}
                      </button>
                    </td>
                    <td data-label="Referencia">
                      <span className="cell-main">{bundle.reference.code}</span>
                      <span className="cell-sub">
                        {bundle.reference.description ?? 'Sin descripción'}
                        {bundle.reference.family ? ` · ${bundle.reference.family.name}` : ''}
                      </span>
                    </td>
                    <td data-label="Acabado">
                      <span className="cell-main">{bundle.finish.code}</span>
                      {bundle.finish.description ? <span className="cell-sub">{bundle.finish.description}</span> : null}
                    </td>
                    <td className="num" data-label="Perfiles">
                      {bundle.quantity === 0 ? <span className="badge badge-muted">Agotado</span> : bundle.quantity}
                    </td>
                    <td data-label="Ubicación">
                      <span className="cell-main">{bundle.inventoryLocation.name}</span>
                      <span className="cell-sub">
                        {bundle.inventoryLocation.branch.name}
                        {bundle.rack ? ` · Pasillo ${bundle.rack.aisle.number} · Burro ${bundle.rack.number}` : ''}
                      </span>
                    </td>
                    <td data-label="Registrado">{formatDateTime(bundle.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onChange={setPage}
            disabled={bundles.loading}
          />
        </>
      ) : null}
    </>
  )
}
