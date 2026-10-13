import { useState, type FormEvent } from 'react'
import { ApiError, describeError } from '../api/client'
import type { BundleDetail } from '../api/types'
import { Field, Notice } from '../components/ui'
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
    <section>
      <h2>Consultar por EPC</h2>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {notFound ? (
        <Notice kind="info">
          No hay un paquete registrado con el EPC <span className="mono">{notFound}</span>.{' '}
          {canOperate(user?.role) ? (
            <button type="button" className="link" onClick={() => navigate({ name: 'register', epc: notFound })}>
              Registrar un paquete con este EPC
            </button>
          ) : null}
        </Notice>
      ) : null}
      <form className="card search-form" onSubmit={submit}>
        <Field label="EPC" wide hint="Coincidencia exacta. Puedes leer la etiqueta o escribir el código.">
          <input
            className="mono"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus
            required
            value={epc}
            onChange={(e) => setEpc(e.target.value.toUpperCase())}
          />
        </Field>
        <button type="submit" className="button" disabled={pending}>
          {pending ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
    </section>
  )
}
