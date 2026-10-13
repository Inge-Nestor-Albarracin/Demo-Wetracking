import { useState } from 'react'
import type { Bundle, Page } from '../api/types'
import { CatalogSelectors } from '../components/CatalogSelectors'
import { LocationSelectors } from '../components/LocationSelectors'
import { Empty, Field, Loading, Notice, Pagination } from '../components/ui'
import { bundlePlace, formatDateTime, referenceLabel } from '../lib/format'
import { EMPTY_CATALOG, EMPTY_LOCATION, type CatalogValue, type LocationValue } from '../lib/forms'
import { queryString, useLoad } from '../lib/useLoad'
import type { Navigate } from './navigation'

const PAGE_SIZE = 25

export function BundlesView({ navigate }: { navigate: Navigate }) {
  const [catalog, setCatalog] = useState<CatalogValue>(EMPTY_CATALOG)
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

  // Any filter change returns to the first page.
  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(1)
  }

  return (
    <section>
      <h2>Paquetes</h2>
      <div className="card filters">
        <CatalogSelectors mode="filter" value={catalog} onChange={filter(setCatalog)} />
        <LocationSelectors mode="filter" value={location} onChange={filter(setLocation)} />
        <Field label="Estado">
          <select value={available} onChange={(e) => filter(setAvailable)(e.target.value)}>
            <option value="">Todos</option>
            <option value="true">Con perfiles</option>
            <option value="false">Agotados</option>
          </select>
        </Field>
      </div>

      {bundles.error ? <Notice kind="error">{bundles.error}</Notice> : null}
      {bundles.loading && !bundles.data ? <Loading /> : null}
      {bundles.data && bundles.data.items.length === 0 ? <Empty>No hay paquetes con estos filtros.</Empty> : null}
      {bundles.data && bundles.data.items.length > 0 ? (
        <>
          <div className="table-wrap" aria-busy={bundles.loading}>
            <table>
              <thead>
                <tr>
                  <th>EPC</th>
                  <th>Referencia</th>
                  <th>Acabado</th>
                  <th className="num">Perfiles</th>
                  <th>Ubicación</th>
                  <th>Registro</th>
                </tr>
              </thead>
              <tbody>
                {bundles.data.items.map((bundle) => (
                  <tr key={bundle.id}>
                    <td className="mono">
                      <button type="button" className="link" onClick={() => navigate({ name: 'bundle', id: bundle.id })}>
                        {bundle.epc}
                      </button>
                    </td>
                    <td>{referenceLabel(bundle.reference)}</td>
                    <td>{bundle.finish.code}</td>
                    <td className="num">
                      {bundle.quantity === 0 ? <span className="badge badge-muted">Agotado</span> : bundle.quantity}
                    </td>
                    <td>{bundlePlace(bundle)}</td>
                    <td>{formatDateTime(bundle.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={bundles.data.page}
            totalPages={bundles.data.totalPages}
            total={bundles.data.total}
            onChange={setPage}
            disabled={bundles.loading}
          />
        </>
      ) : null}
    </section>
  )
}
