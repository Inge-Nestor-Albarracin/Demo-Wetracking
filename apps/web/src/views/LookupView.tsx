import { useState, type FormEvent } from 'react'
import { ApiError, describeError } from '../api/client'
import type { Asset } from '../api/types'
import { IconArrow, IconScan } from '../components/icons'
import { Field, Notice, PageHeader } from '../components/ui'
import { EPC_PATTERN, normalizeEpc } from '../lib/assets'
import { canOperate, useSession } from '../session/session-context'
import type { Navigate } from './navigation'

// Exact EPC lookup. Reading never creates or changes assets.
export function LookupView({ navigate }: { navigate: Navigate }) {
  const { request, user } = useSession()
  const [epc, setEpc] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = normalizeEpc(epc)
    if (!value || pending) return
    if (!EPC_PATTERN.test(value)) {
      setError('El EPC solo puede contener letras y números, sin espacios.')
      return
    }
    setPending(true)
    setError(null)
    setNotFound(null)
    try {
      const { data } = await request<Asset>(`/assets/by-epc/${encodeURIComponent(value)}`)
      navigate({ name: 'asset', id: data.id })
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(value)
      else setError(describeError(err))
      setPending(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Activos · Consulta"
        title="Consultar por EPC"
        description="Lee la etiqueta del objeto o escribe su código para ver el activo asociado."
        actions={
          <button type="button" className="button button-secondary" onClick={() => navigate({ name: 'bulk' })}>
            Lectura masiva
          </button>
        }
      />

      {error ? <Notice kind="error">{error}</Notice> : null}
      {notFound ? (
        <Notice kind="info">
          <div className="notfound">
            <span>
              No hay un activo registrado con el EPC <strong className="mono">{notFound}</strong>.
            </span>
            {canOperate(user?.role) ? (
              <button type="button" className="button button-secondary" onClick={() => navigate({ name: 'register', epc: notFound })}>
                Registrar activo con este EPC
              </button>
            ) : null}
          </div>
        </Notice>
      ) : null}

      <form className="card lookup-card" onSubmit={submit}>
        <div className="lookup-form">
          <Field label="EPC / RFID" hint="Coincidencia exacta; mayúsculas y minúsculas dan igual.">
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
            <span aria-live="polite">{pending ? 'Buscando…' : 'Buscar activo'}</span>
            <span className="cta-icon" aria-hidden="true">
              {pending ? <span className="cta-progress" /> : <IconArrow />}
            </span>
          </button>
        </div>
      </form>
    </>
  )
}
