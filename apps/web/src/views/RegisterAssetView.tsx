import { useRef, useState, type FormEvent } from 'react'
import { ApiError, describeError } from '../api/client'
import type { Asset, ExistingAssetConflict } from '../api/types'
import { IconArrow, IconScan } from '../components/icons'
import { Field, Notice, PageHeader, Section } from '../components/ui'
import { CATEGORY_SUGGESTIONS, EPC_PATTERN, LOCATION_SUGGESTIONS, normalizeEpc } from '../lib/assets'
import { useSession } from '../session/session-context'
import type { Navigate } from './navigation'

interface Form {
  epc: string
  name: string
  category: string
  location: string
  description: string
}

const EMPTY: Form = { epc: '', name: '', category: '', location: '', description: '' }

// Registers one asset: one object tagged with one EPC. The creator is taken
// by the API from the session.
export function RegisterAssetView({ initialEpc, navigate }: { initialEpc?: string; navigate: Navigate }) {
  const { request } = useSession()
  const [form, setForm] = useState<Form>({ ...EMPTY, epc: initialEpc ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<ExistingAssetConflict['existingAsset']>(null)
  const [saved, setSaved] = useState<Asset | null>(null)
  const epcInput = useRef<HTMLInputElement>(null)
  // Blocks a double click before React re-renders with `saving`.
  const lock = useRef(false)

  const epc = normalizeEpc(form.epc)
  const epcInvalid = epc !== '' && !EPC_PATTERN.test(epc)
  const nameMissing = form.name.trim() === ''

  const set = (field: keyof Form) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setError(null)
    setExisting(null)
  }

  const clear = () => {
    setForm(EMPTY)
    setError(null)
    setExisting(null)
    setSaved(null)
    requestAnimationFrame(() => epcInput.current?.focus())
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (lock.current) return
    setSaved(null)
    setExisting(null)
    if (!epc || epcInvalid) {
      setError('El EPC solo puede contener letras y números, sin espacios.')
      return
    }
    if (nameMissing) {
      setError('El nombre del activo es obligatorio.')
      return
    }
    lock.current = true
    setSaving(true)
    setError(null)
    try {
      const { data } = await request<Asset>('/assets', {
        method: 'POST',
        body: {
          epc,
          name: form.name.trim(),
          category: form.category.trim() || undefined,
          location: form.location.trim() || undefined,
          description: form.description.trim() || undefined,
        },
      })
      setSaved(data)
      setForm(EMPTY)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setExisting((err.data as ExistingAssetConflict | null)?.existingAsset ?? null)
      }
      setError(describeError(err))
    } finally {
      lock.current = false
      setSaving(false)
    }
  }

  // Shown in the summary panel on desktop and below the form on one-column
  // layouts (see .register-inline-actions in App.css).
  const actions = (
    <div className="asset-actions">
      <button type="submit" className="cta" disabled={saving}>
        <span aria-live="polite">{saving ? 'Guardando…' : 'Guardar'}</span>
        <span className="cta-icon" aria-hidden="true">
          {saving ? <span className="cta-progress" /> : <IconArrow />}
        </span>
      </button>
      <button type="button" className="button button-secondary" disabled={saving} onClick={clear}>
        Limpiar
      </button>
    </div>
  )

  return (
    <>
      <PageHeader
        eyebrow="Activos · Registro"
        title="Registrar activo"
        description="Asocia la etiqueta RFID (EPC) de un objeto con su nombre. Categoría, ubicación y descripción son opcionales."
      />

      {saved ? (
        <Notice kind="success">
          <div className="notfound">
            <span>
              Activo <strong>{saved.name}</strong> registrado con el EPC <strong className="mono">{saved.epc}</strong>.
            </span>
            <span className="row-actions">
              <button type="button" className="button button-secondary" onClick={() => navigate({ name: 'asset', id: saved.id })}>
                Ver detalle
              </button>
              <button type="button" className="button button-secondary" onClick={clear}>
                Registrar otro
              </button>
            </span>
          </div>
        </Notice>
      ) : null}
      {error ? (
        <Notice kind="error">
          {error}
          {existing ? (
            <>
              {' '}
              <button type="button" className="link" onClick={() => navigate({ name: 'asset', id: existing.id })}>
                Ver el activo existente ({existing.name})
              </button>
            </>
          ) : null}
        </Notice>
      ) : null}

      <form className="register-layout" onSubmit={submit} noValidate>
        <div>
          <Section number="01" title="Etiqueta RFID" description="Lee la etiqueta con el lector en modo teclado o escribe su código.">
            <Field label="EPC / RFID" wide hint="Se guarda en mayúsculas y conserva los ceros iniciales.">
              <span className="input-wrap large">
                <IconScan />
                <input
                  ref={epcInput}
                  className="mono"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  autoFocus={!initialEpc}
                  required
                  placeholder="E2003412…"
                  disabled={saving}
                  value={form.epc}
                  aria-invalid={epcInvalid}
                  onChange={(e) => set('epc')(e.target.value.toUpperCase())}
                />
              </span>
              {epcInvalid ? <span className="field-error">Solo letras y números, sin espacios.</span> : null}
            </Field>
          </Section>

          <Section number="02" title="Objeto" description="Ejemplos: computador, monitor, silla, herramienta, equipo o caja.">
            <Field label="Nombre del activo" wide>
              <input
                type="text"
                required
                maxLength={120}
                placeholder="Ej. Computador de demostración"
                autoFocus={!!initialEpc}
                disabled={saving}
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
              />
            </Field>
            <Field label="Categoría (opcional)">
              <input
                type="text"
                list="asset-categories"
                maxLength={100}
                placeholder="Ej. Tecnología"
                disabled={saving}
                value={form.category}
                onChange={(e) => set('category')(e.target.value)}
              />
            </Field>
            <Field label="Ubicación (opcional)">
              <input
                type="text"
                list="asset-locations"
                maxLength={100}
                placeholder="Ej. Sala de demostración"
                disabled={saving}
                value={form.location}
                onChange={(e) => set('location')(e.target.value)}
              />
            </Field>
            <Field label="Descripción (opcional)" wide>
              <textarea
                rows={3}
                maxLength={1000}
                placeholder="Observaciones del objeto"
                disabled={saving}
                value={form.description}
                onChange={(e) => set('description')(e.target.value)}
              />
            </Field>
            <div className="register-inline-actions field-wide">{actions}</div>
            <datalist id="asset-categories">
              {CATEGORY_SUGGESTIONS.map((value) => <option key={value} value={value} />)}
            </datalist>
            <datalist id="asset-locations">
              {LOCATION_SUGGESTIONS.map((value) => <option key={value} value={value} />)}
            </datalist>
          </Section>
        </div>

        <aside className="register-aside">
          <section className="summary-panel" aria-label="Activo actual">
            <header>
              <p className="eyebrow">Activo actual</p>
              <h2>Nuevo activo</h2>
            </header>
            <dl className="summary-list">
              {(
                [
                  ['EPC', epc && !epcInvalid ? epc : null, true],
                  ['Nombre', form.name.trim() || null],
                  ['Categoría', form.category.trim() || null],
                  ['Ubicación', form.location.trim() || null],
                ] as [string, string | null, boolean?][]
              ).map(([label, value, mono]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className={value ? (mono ? 'mono' : undefined) : 'pending'}>{value ?? 'Pendiente'}</dd>
                </div>
              ))}
            </dl>
            <footer>
              <div className="summary-actions">{actions}</div>
              <p className="summary-note">Un EPC corresponde a un solo activo. Si ya está registrado, no se sobrescribe.</p>
            </footer>
          </section>
        </aside>
      </form>
    </>
  )
}
