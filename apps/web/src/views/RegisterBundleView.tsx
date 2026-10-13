import { useRef, useState, type FormEvent } from 'react'
import { describeError } from '../api/client'
import type { BundleDetail } from '../api/types'
import { ArrivalFields } from '../components/ArrivalFields'
import { CatalogSelectors } from '../components/CatalogSelectors'
import { LocationSelectors } from '../components/LocationSelectors'
import { Field, Notice } from '../components/ui'
import { bundlePlace, finishLabel, referenceLabel } from '../lib/format'
import {
  EMPTY_ARRIVAL,
  EMPTY_CATALOG,
  EMPTY_LOCATION,
  arrivalPayload,
  type ArrivalValue,
  type CatalogValue,
  type LocationValue,
} from '../lib/forms'
import { useSession } from '../session/session-context'
import type { Navigate } from './navigation'

type RegistrationType = 'INITIAL_STOCK' | 'ENTRY'

const EPC_PATTERN = /^[A-Z0-9]+$/

export function RegisterBundleView({ initialEpc, navigate }: { initialEpc?: string; navigate: Navigate }) {
  const { request } = useSession()
  const [registrationType, setRegistrationType] = useState<RegistrationType>('INITIAL_STOCK')
  const [catalog, setCatalog] = useState<CatalogValue>(EMPTY_CATALOG)
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION)
  const [arrival, setArrival] = useState<ArrivalValue>(EMPTY_ARRIVAL)
  const [quantity, setQuantity] = useState('')
  const [epc, setEpc] = useState(initialEpc ?? '')
  const [notes, setNotes] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<BundleDetail | null>(null)
  const epcInput = useRef<HTMLInputElement>(null)

  const normalizedEpc = epc.trim().toUpperCase()
  const epcInvalid = normalizedEpc !== '' && !EPC_PATTERN.test(normalizedEpc)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    const amount = Number(quantity)
    if (!Number.isInteger(amount) || amount < 1) {
      setError('La cantidad debe ser un número entero de perfiles mayor que cero.')
      return
    }
    if (!normalizedEpc || epcInvalid) {
      setError('El EPC solo puede contener letras y números, sin espacios.')
      return
    }
    setPending(true)
    setError(null)
    setCreated(null)
    try {
      const { data } = await request<BundleDetail>('/inventory/bundles', {
        method: 'POST',
        body: {
          epc: normalizedEpc,
          referenceId: catalog.referenceId,
          finishId: catalog.finishId,
          quantity: amount,
          inventoryLocationId: location.inventoryLocationId,
          rackId: location.rackId,
          registrationType,
          ...arrivalPayload(arrival),
          notes: notes.trim() || undefined,
        },
      })
      setCreated(data)
      // Keep catalog and location to speed up consecutive bundles.
      setEpc('')
      setQuantity('')
      setNotes('')
      epcInput.current?.focus()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <section>
      <h2>Registrar paquete</h2>
      {created ? (
        <Notice kind="success">
          <strong>Paquete registrado.</strong> EPC {created.epc} · {referenceLabel(created.reference)} ·{' '}
          {finishLabel(created.finish)} · {created.quantity} perfiles · {bundlePlace(created)}.{' '}
          <button type="button" className="link" onClick={() => navigate({ name: 'bundle', id: created.id })}>
            Ver detalle
          </button>
        </Notice>
      ) : null}
      {error ? <Notice kind="error">{error}</Notice> : null}

      <form className="card form-grid" onSubmit={submit}>
        <fieldset className="field field-wide fieldset" disabled={pending}>
          <legend className="field-label">Tipo de registro</legend>
          <div className="segmented" role="radiogroup">
            {(
              [
                ['INITIAL_STOCK', 'Inventario existente', 'Ya estaba en bodega antes del software'],
                ['ENTRY', 'Entrada nueva', 'Mercancía recién recibida'],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className={registrationType === value ? 'segment selected' : 'segment'}>
                <input
                  type="radio"
                  name="registrationType"
                  value={value}
                  checked={registrationType === value}
                  onChange={() => setRegistrationType(value)}
                />
                <span>
                  {label}
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <h3 className="field-wide">Producto</h3>
        <CatalogSelectors mode="form" value={catalog} onChange={setCatalog} disabled={pending} />
        <Field label="Perfiles en el paquete" hint="Cantidad física disponible hoy, en perfiles enteros.">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
            disabled={pending}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>

        <ArrivalFields value={arrival} onChange={setArrival} disabled={pending} />

        <h3 className="field-wide">Ubicación</h3>
        <LocationSelectors mode="form" value={location} onChange={setLocation} disabled={pending} />

        <h3 className="field-wide">Etiqueta RFID</h3>
        <Field
          label="EPC"
          wide
          hint="Lee la etiqueta con el lector o escribe el EPC. Se conserva como texto (incluidos los ceros iniciales). La integración con el lector Bluetooth aún debe comprobarse con el equipo real."
        >
          <input
            ref={epcInput}
            className="mono"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            disabled={pending}
            value={epc}
            aria-invalid={epcInvalid}
            onChange={(e) => setEpc(e.target.value.toUpperCase())}
          />
          {epcInvalid ? <span className="field-error">Solo letras y números, sin espacios.</span> : null}
        </Field>
        <Field label="Notas (opcional)" wide>
          <textarea rows={2} maxLength={500} disabled={pending} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="actions field-wide">
          <button type="submit" className="button" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar paquete'}
          </button>
        </div>
      </form>
    </section>
  )
}
