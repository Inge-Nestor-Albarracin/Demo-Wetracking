import { useCallback, useState } from 'react'
import type { BundleDetail, Movement, Page } from '../api/types'
import { OperationsPanel } from '../components/OperationsPanel'
import { Empty, Loading, Notice, Pagination } from '../components/ui'
import {
  MOVEMENT_LABELS,
  bundlePlace,
  finishLabel,
  formatArrival,
  formatDateTime,
  movementPlaces,
  referenceLabel,
} from '../lib/format'
import { useLoad } from '../lib/useLoad'
import type { Navigate } from './navigation'

const HISTORY_PAGE_SIZE = 10

export function BundleDetailView({ id, navigate }: { id: string; navigate: Navigate }) {
  const enc = encodeURIComponent(id)
  const bundle = useLoad<BundleDetail>(`/inventory/bundles/${enc}`)
  const [page, setPage] = useState(1)
  const history = useLoad<Page<Movement>>(
    `/inventory/bundles/${enc}/movements?page=${page}&pageSize=${HISTORY_PAGE_SIZE}`,
  )
  const [message, setMessage] = useState<string | null>(null)

  const { reload: reloadBundle } = bundle
  const { reload: reloadHistory } = history
  const onDone = useCallback(
    (text: string) => {
      setMessage(text)
      setPage(1)
      reloadBundle()
      reloadHistory()
    },
    [reloadBundle, reloadHistory],
  )

  if (bundle.error) {
    return (
      <section>
        <Notice kind="error">{bundle.error}</Notice>
        <button type="button" className="button button-secondary" onClick={() => navigate({ name: 'lookup' })}>
          Volver a la consulta
        </button>
      </section>
    )
  }
  if (!bundle.data) return <Loading />
  const data = bundle.data

  return (
    <section>
      <h2>
        Paquete <span className="mono">{data.epc}</span>
      </h2>
      {message ? <Notice kind="success">{message}</Notice> : null}

      <div className="card detail-grid" aria-busy={bundle.loading}>
        <div>
          <span className="field-label">Referencia</span>
          <p>{referenceLabel(data.reference)}</p>
        </div>
        <div>
          <span className="field-label">Acabado</span>
          <p>{finishLabel(data.finish)}</p>
        </div>
        <div>
          <span className="field-label">Familia</span>
          <p>{data.reference.family ? `${data.reference.family.code} — ${data.reference.family.name}` : 'Sin familia'}</p>
        </div>
        <div>
          <span className="field-label">Perfiles disponibles</span>
          <p className="big">
            {data.quantity}
            {data.quantity === 0 ? <span className="badge badge-muted">Agotado</span> : null}
          </p>
        </div>
        <div>
          <span className="field-label">Ubicación</span>
          <p>{bundlePlace(data)}</p>
        </div>
        <div>
          <span className="field-label">Llegada física</span>
          <p>{formatArrival(data)}</p>
        </div>
        <div>
          <span className="field-label">Registrado en el sistema</span>
          <p>{formatDateTime(data.createdAt)}</p>
        </div>
        {data.notes ? (
          <div>
            <span className="field-label">Notas</span>
            <p>{data.notes}</p>
          </div>
        ) : null}
      </div>

      <h3>Operaciones</h3>
      <div className="card">
        <OperationsPanel bundle={data} onDone={onDone} />
      </div>

      <h3>Historial de movimientos</h3>
      {history.error ? <Notice kind="error">{history.error}</Notice> : null}
      {history.loading && !history.data ? <Loading /> : null}
      {history.data && history.data.items.length === 0 ? <Empty>Sin movimientos.</Empty> : null}
      {history.data && history.data.items.length > 0 ? (
        <>
          <div className="table-wrap" aria-busy={history.loading}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Saldo</th>
                  <th>Ubicación</th>
                  <th>Responsable</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {history.data.items.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatDateTime(movement.occurredAt)}</td>
                    <td>{MOVEMENT_LABELS[movement.type]}</td>
                    <td className="num">{movement.quantity}</td>
                    <td className="num">
                      {movement.quantityBefore} → {movement.quantityAfter}
                    </td>
                    <td>{movementPlaces(movement)}</td>
                    <td>{movement.performedBy.name}</td>
                    <td>{movement.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={history.data.page}
            totalPages={history.data.totalPages}
            total={history.data.total}
            onChange={setPage}
            disabled={history.loading}
          />
        </>
      ) : null}
    </section>
  )
}
