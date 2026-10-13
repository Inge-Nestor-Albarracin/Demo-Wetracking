import { Fragment, useState } from 'react'
import type { SummaryPage } from '../api/types'
import { CatalogSelectors } from '../components/CatalogSelectors'
import { LocationSelectors } from '../components/LocationSelectors'
import { Empty, Loading, Notice, Pagination } from '../components/ui'
import { finishLabel, referenceLabel } from '../lib/format'
import { EMPTY_CATALOG, EMPTY_LOCATION, type CatalogValue, type LocationValue } from '../lib/forms'
import { queryString, useLoad } from '../lib/useLoad'

const PAGE_SIZE = 25

// Available profiles per reference + finish, computed by the API from the
// current bundles. Empty bundles are not counted.
export function SummaryView() {
  const [catalog, setCatalog] = useState<CatalogValue>(EMPTY_CATALOG)
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<Set<string>>(new Set())

  const summary = useLoad<SummaryPage>(
    `/inventory/summary${queryString({
      familyId: catalog.familyId,
      branchId: location.branchId,
      inventoryLocationId: location.inventoryLocationId,
      page,
      pageSize: PAGE_SIZE,
    })}`,
  )

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <section>
      <h2>Resumen de inventario</h2>
      <div className="card filters">
        <CatalogSelectors
          mode="filter"
          showReference={false}
          showFinish={false}
          value={catalog}
          onChange={(value) => {
            setCatalog(value)
            setPage(1)
          }}
        />
        <LocationSelectors
          mode="filter"
          depth="location"
          value={location}
          onChange={(value) => {
            setLocation(value)
            setPage(1)
          }}
        />
      </div>

      {summary.error ? <Notice kind="error">{summary.error}</Notice> : null}
      {summary.loading && !summary.data ? <Loading /> : null}
      {summary.data ? (
        <p className="totals">
          <strong>{summary.data.totals.profiles}</strong> {summary.data.totals.profiles === 1 ? 'perfil disponible' : 'perfiles disponibles'} en{' '}
          <strong>{summary.data.totals.bundles}</strong>{' '}
          {summary.data.totals.bundles === 1 ? 'paquete con existencias' : 'paquetes con existencias'}
        </p>
      ) : null}
      {summary.data && summary.data.items.length === 0 ? (
        <Empty>No hay existencias con estos filtros.</Empty>
      ) : null}
      {summary.data && summary.data.items.length > 0 ? (
        <>
          <div className="table-wrap" aria-busy={summary.loading}>
            <table>
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Familia</th>
                  <th>Acabado</th>
                  <th className="num">Perfiles</th>
                  <th className="num">Paquetes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {summary.data.items.map((group) => {
                  const key = `${group.reference.id}|${group.finish.id}`
                  const expanded = open.has(key)
                  return (
                    <Fragment key={key}>
                      <tr>
                        <td>{referenceLabel(group.reference)}</td>
                        <td>{group.reference.family ? group.reference.family.name : '—'}</td>
                        <td>{finishLabel(group.finish)}</td>
                        <td className="num">{group.profiles}</td>
                        <td className="num">{group.bundles}</td>
                        <td>
                          <button type="button" className="link" aria-expanded={expanded} onClick={() => toggle(key)}>
                            {expanded ? 'Ocultar ubicaciones' : 'Ver ubicaciones'}
                          </button>
                        </td>
                      </tr>
                      {expanded
                        ? group.locations.map((row) => (
                            <tr key={`${key}|${row.inventoryLocation.id}|${row.rack?.id ?? ''}`} className="subrow">
                              <td colSpan={3}>
                                {row.inventoryLocation.branch.name} · {row.inventoryLocation.name}
                                {row.aisle ? ` · Pasillo ${row.aisle.number}` : ''}
                                {row.rack ? ` · Burro ${row.rack.number}` : ' · Sin burro'}
                              </td>
                              <td className="num">{row.profiles}</td>
                              <td className="num">{row.bundles}</td>
                              <td />
                            </tr>
                          ))
                        : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={summary.data.page}
            totalPages={summary.data.totalPages}
            total={summary.data.total}
            onChange={setPage}
            disabled={summary.loading}
          />
        </>
      ) : null}
    </section>
  )
}
