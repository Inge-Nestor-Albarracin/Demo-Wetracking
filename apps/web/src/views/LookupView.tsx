import { useState, type FormEvent } from 'react'
import { ApiError, describeError } from '../api/client'
import type { BundleDetail } from '../api/types'
import { IconArrow, IconScan } from '../components/icons'
import { Field, Notice, PageHeader } from '../components/ui'
import { canOperate, useSession } from '../session/session-context'
import type { Navigate } from './navigation'

// Exact EPC lookup. Reading never creates or changes inventory.
export function LookupView({ navigate }: { navigate: Navigate }) {
  const { request, user } = useSession()
  const [epc, setEpc] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = epc.trim().toUpperCase()
    if (!value || pending) return
    setPending(true)
    setError(null)
    setNotFound(null)
    try {
      const { data } = await request<BundleDetail>(`/inventory/bundles/epc/${encodeURIComponent(value)}`)
      navigate({ name: 'bundle', id: data.id })
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(value)
      else setError(describeError(err))
      setPending(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Inventario · Consulta"
        title="Consultar por EPC"
        description="Lee la etiqueta del paquete o escribe su código para ver referencia, acabado, ubicación, saldo y movimientos."
      />

      {error ? <Notice kind="error">{error}</Notice> : null}
      {notFound ? (
        <Notice kind="info">
          <div className="notfound">
            <span>
              No hay un paquete registrado con el EPC <strong className="mono">{notFound}</strong>.
            </span>
            {canOperate(user?.role) ? (
              <button type="button" className="button button-secondary" onClick={() => navigate({ name: 'register', epc: notFound })}>
                Registrar con este EPC
              </button>
            ) : null}
          </div>
        </Notice>
      ) : null}

      <form className="card lookup-card" onSubmit={submit}>
        <div className="lookup-form">
          <Field label="Código EPC" hint="Coincidencia exacta; mayúsculas y minúsculas dan igual.">
            <span className="input-wrap large">
              <IconScan />
              <input
                className="mono"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
                required
                placeholder="E2003412…"
                value={epc}
                onChange={(e) => {
                  setEpc(e.target.value.toUpperCase())
                  setNotFound(null)
                }}
              />
            </span>
          </Field>
          <button type="submit" className="cta" disabled={pending || !epc.trim()}>
            <span aria-live="polite">{pending ? 'Buscando…' : 'Buscar paquete'}</span>
            <span className="cta-icon" aria-hidden="true">
              {pending ? <span className="cta-progress" /> : <IconArrow />}
            </span>
          </button>
        </div>
      </form>

      <div className="lookup-tips">
        <div>
          <span aria-hidden="true">01</span>
          <p>
            <strong>Lee la etiqueta</strong>
            <small>Con el campo activo, el lector en modo teclado escribe el EPC.</small>
          </p>
        </div>
        <div>
          <span aria-hidden="true">02</span>
          <p>
            <strong>Revisa el paquete</strong>
            <small>Saldo actual, ubicación e historial de movimientos.</small>
          </p>
        </div>
        <div>
          <span aria-hidden="true">03</span>
          <p>
            <strong>Registra operaciones</strong>
            <small>Salidas, traslados o ajustes según tu rol.</small>
          </p>
        </div>
      </div>
    </>
  )
}
