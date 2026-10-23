import { useState, type FormEvent } from 'react'
import type { Asset } from '../api/types'
import { AssetStatus } from '../components/AssetStatus'
import { Field, Loading, Notice, PageHeader } from '../components/ui'
import { CATEGORY_SUGGESTIONS, LOCATION_SUGGESTIONS } from '../lib/assets'
import { formatDateTime } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { useMutation } from '../lib/useMutation'
import { canManage, useSession } from '../session/session-context'
import type { Navigate } from './navigation'

export function AssetDetailView({ id, navigate }: { id: string; navigate: Navigate }) {
  const { user } = useSession()
  const asset = useLoad<Asset>(`/assets/${encodeURIComponent(id)}`)
  const [message, setMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  if (asset.error) {
    return (
      <>
        <PageHeader eyebrow="Activos · Detalle" title="Activo no disponible" />
        <Notice kind="error">{asset.error}</Notice>
        <button type="button" className="button button-secondary" onClick={() => navigate({ name: 'assets' })}>
          Volver a Activos
        </button>
      </>
    )
  }
  if (!asset.data) return <Loading />
  const data = asset.data
  const admin = canManage(user?.role)

  const done = (text: string) => {
    setMessage(text)
    setEditing(false)
    asset.reload()
  }

  return (
    <>
      <PageHeader
        eyebrow="Activos · Detalle"
        title={data.name}
        description={<span className="mono">{data.epc}</span>}
        actions={
          <>
            <button type="button" className="button button-secondary" onClick={() => navigate({ name: 'assets' })}>
              Ver todos los activos
            </button>
            {admin && !editing ? (
              <button type="button" className="button" onClick={() => setEditing(true)}>
                Editar
              </button>
            ) : null}
          </>
        }
      />
      {message ? <Notice kind="success">{message}</Notice> : null}

      {editing ? (
        <EditAsset asset={data} onCancel={() => setEditing(false)} onSaved={() => done('Cambios guardados.')} />
      ) : (
        <div className="card detail-grid" aria-busy={asset.loading}>
          <div>
            <span className="field-label">EPC</span>
            <p className="mono">{data.epc}</p>
          </div>
          <div>
            <span className="field-label">Estado</span>
            <p>
              <AssetStatus active={data.active} />
            </p>
          </div>
          <div>
            <span className="field-label">Categoría</span>
            <p>{data.category ?? 'Sin categoría'}</p>
          </div>
          <div>
            <span className="field-label">Ubicación</span>
            <p>{data.location ?? 'Sin ubicación'}</p>
          </div>
          <div>
            <span className="field-label">Registrado por</span>
            <p>{data.createdBy.name}</p>
          </div>
          <div>
            <span className="field-label">Registrado en el sistema</span>
            <p>{formatDateTime(data.createdAt)}</p>
          </div>
          <div>
            <span className="field-label">Última modificación</span>
            <p>{formatDateTime(data.updatedAt)}</p>
          </div>
          {data.description ? (
            <div>
              <span className="field-label">Descripción</span>
              <p>{data.description}</p>
            </div>
          ) : null}
        </div>
      )}

      {admin ? <ActiveToggle asset={data} onDone={done} /> : null}
    </>
  )
}

// ADMIN only (the API enforces it). Deactivating never deletes the asset.
function ActiveToggle({ asset, onDone }: { asset: Asset; onDone: (text: string) => void }) {
  const { request } = useSession()
  const mutation = useMutation()
  const [confirm, setConfirm] = useState(false)

  const toggle = () =>
    mutation
      .run(() => request(`/assets/${encodeURIComponent(asset.id)}/active`, { method: 'PATCH', body: { active: !asset.active } }))
      .then((ok) => {
        setConfirm(false)
        if (ok) onDone(asset.active ? 'Activo desactivado. Sigue registrado y aparecerá como inactivo al leerlo.' : 'Activo reactivado.')
      })

  return (
    <>
      <h2 className="subtitle">Estado administrativo</h2>
      <div className="card">
        {mutation.error ? <Notice kind="error">{mutation.error}</Notice> : null}
        {confirm ? (
          <span className="row-confirm">
            {asset.active ? '¿Desactivar este activo? No se elimina.' : '¿Reactivar este activo?'}
            <button type="button" className={asset.active ? 'text-button danger' : 'text-button'} disabled={mutation.pending} onClick={toggle}>
              {asset.active ? 'Sí, desactivar' : 'Sí, reactivar'}
            </button>
            <button type="button" className="text-button" onClick={() => setConfirm(false)}>Cancelar</button>
          </span>
        ) : (
          <button type="button" className="button button-secondary" onClick={() => setConfirm(true)}>
            {asset.active ? 'Desactivar activo' : 'Reactivar activo'}
          </button>
        )}
      </div>
    </>
  )
}

function EditAsset({ asset, onCancel, onSaved }: { asset: Asset; onCancel: () => void; onSaved: () => void }) {
  const { request } = useSession()
  const mutation = useMutation()
  const [name, setName] = useState(asset.name)
  const [category, setCategory] = useState(asset.category ?? '')
  const [location, setLocation] = useState(asset.location ?? '')
  const [description, setDescription] = useState(asset.description ?? '')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      mutation.setError('El nombre del activo es obligatorio.')
      return
    }
    // Empty optional fields are stored as null by the API.
    const ok = await mutation.run(() =>
      request(`/assets/${encodeURIComponent(asset.id)}`, {
        method: 'PATCH',
        body: { name: name.trim(), category, location, description },
      }),
    )
    if (ok) onSaved()
  }

  return (
    <form className="card form-grid" onSubmit={submit} noValidate>
      {mutation.error ? <div className="field-wide"><Notice kind="error">{mutation.error}</Notice></div> : null}
      <Field label="Nombre del activo" wide>
        <input type="text" required maxLength={120} disabled={mutation.pending} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Categoría">
        <input type="text" list="edit-categories" maxLength={100} disabled={mutation.pending} value={category} onChange={(e) => setCategory(e.target.value)} />
      </Field>
      <Field label="Ubicación">
        <input type="text" list="edit-locations" maxLength={100} disabled={mutation.pending} value={location} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <Field label="Descripción" wide>
        <textarea rows={3} maxLength={1000} disabled={mutation.pending} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <datalist id="edit-categories">
        {CATEGORY_SUGGESTIONS.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="edit-locations">
        {LOCATION_SUGGESTIONS.map((value) => <option key={value} value={value} />)}
      </datalist>
      <div className="field-wide row-actions">
        <button type="submit" className="button" disabled={mutation.pending}>
          {mutation.pending ? 'Guardando…' : 'Guardar cambios'}
        </button>{' '}
        <button type="button" className="button button-secondary" disabled={mutation.pending} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      <p className="field-hint field-wide">El EPC identifica la etiqueta y no se puede cambiar.</p>
    </form>
  )
}
