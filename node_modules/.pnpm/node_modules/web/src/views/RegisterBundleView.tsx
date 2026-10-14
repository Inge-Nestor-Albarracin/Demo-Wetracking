import { useRef, useState, type FormEvent } from 'react'
import { describeError } from '../api/client'
import type { BundleDetail } from '../api/types'
import { ArrivalFields } from '../components/ArrivalFields'
import { CatalogSelectors, type CatalogLabels } from '../components/CatalogSelectors'
import { IconArrow, IconScan } from '../components/icons'
import { LocationSelectors } from '../components/LocationSelectors'
import { Field, Notice, PageHeader, Section } from '../components/ui'
import { MONTHS, bundlePlace, finishLabel, referenceLabel } from '../lib/format'
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

const TYPES: { value: RegistrationType; label: string; hint: string }[] = [
  { value: 'INITIAL_STOCK', label: 'Inventario existente', hint: 'Ya estaba en bodega antes del software' },
  { value: 'ENTRY', label: 'Entrada nueva', hint: 'Mercancía recién recibida' },
]

function arrivalText(arrival: ArrivalValue): string | null {
  if (arrival.precision === 'UNKNOWN') return 'Desconocida'
  if (arrival.precision === 'EXACT') {
    if (!arrival.date) return null
    const [y, m, d] = arrival.date.split('-')
    return `${d}/${m}/${y}`
  }
  if (!arrival.month || !arrival.year) return null
  return `${MONTHS[Number(arrival.month) - 1]} de ${arrival.year}`
}

export function RegisterBundleView({ initialEpc, navigate }: { initialEpc?: string; navigate: Navigate }) {
  const { request } = useSession()
  const [registrationType, setRegistrationType] = useState<RegistrationType>('INITIAL_STOCK')
  const [catalog, setCatalog] = useState<CatalogValue>(EMPTY_CATALOG)
  const [catalogLabels, setCatalogLabels] = useState<CatalogLabels>({ family: '', reference: '', finish: '' })
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION)
  const [locationLabel, setLocationLabel] = useState('')
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
  const amount = Number(quantity)
  const quantityValid = quantity !== '' && Number.isInteger(amount) && amount >= 1
  const arrivalLabel = arrivalText(arrival)

  const steps = [
    true,
    !!catalog.referenceId && !!catalog.finishId && quantityValid,
    arrivalLabel !== null,
    !!location.rackId,
    normalizedEpc !== '' && !epcInvalid,
  ]
  const completed = steps.filter(Boolean).length

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    if (!quantityValid) {
      setError('La cantidad debe ser un número entero de perfiles mayor que cero.')
      return
    }
    if (!normalizedEpc || epcInvalid) {
      setError('El código del chip solo puede contener letras y números, sin espacios.')
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
      // Keep product, arrival and location to speed up consecutive bundles.
      setEpc('')
      setQuantity('')
      setNotes('')
      epcInput.current?.focus({ preventScroll: true })
    } catch (err) {
      setError(describeError(err))
    } finally {
      setPending(false)
    }
  }

  const summaryRows: [string, string | null, boolean?][] = [
    ['Tipo', TYPES.find((t) => t.value === registrationType)?.label ?? null],
    ['Referencia', catalogLabels.reference || null],
    ['Acabado', catalogLabels.finish || null],
    ['Perfiles', quantityValid ? `${amount} ${amount === 1 ? 'perfil' : 'perfiles'}` : null],
    ['Llegada', arrivalLabel],
    ['Ubicación', location.rackId ? locationLabel : null],
    ['Chip', normalizedEpc && !epcInvalid ? normalizedEpc : null, true],
  ]

  return (
    <>
      <PageHeader
        eyebrow="Inventario · Registro"
        title="Registrar paquete"
        description="Asocia la etiqueta RFID de fábrica al paquete físico. Guardar crea el paquete y su primer movimiento en una sola operación."
      />

      <form className="register-layout" onSubmit={submit}>
        <div>
          <Section number="01" title="Tipo de registro" description="Define qué movimiento inicial se registra.">
            <fieldset className="field field-wide fieldset" disabled={pending} aria-label="Tipo de registro">
              <div className="segmented" role="radiogroup">
                {TYPES.map((type) => (
                  <label key={type.value} className={registrationType === type.value ? 'segment selected' : 'segment'}>
                    <input
                      type="radio"
                      name="registrationType"
                      value={type.value}
                      checked={registrationType === type.value}
                      onChange={() => setRegistrationType(type.value)}
                    />
                    <span>
                      {type.label}
                      <small>{type.hint}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section number="02" title="Producto" description="La familia filtra las referencias. Referencia y acabado se guardan por separado.">
            <CatalogSelectors
              mode="form"
              value={catalog}
              onChange={setCatalog}
              onDescribe={setCatalogLabels}
              disabled={pending}
            />
            <Field label="Perfiles en el paquete" hint="Cantidad física disponible hoy, en perfiles enteros.">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                placeholder="Ej. 10"
                disabled={pending}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
          </Section>

          <Section number="03" title="Llegada física" description="No se inventa un día si solo se conoce el mes o no hay registro.">
            <ArrivalFields value={arrival} onChange={setArrival} disabled={pending} />
          </Section>

          <Section number="04" title="Ubicación" description="Sucursal, bodega, pasillo y burro donde queda el paquete.">
            <LocationSelectors
              mode="form"
              value={location}
              onChange={setLocation}
              onDescribe={setLocationLabel}
              disabled={pending}
            />
          </Section>

          <Section number="05" title="Etiqueta RFID" description="Lee el chip UHF con el lector o escribe su código.">
            <Field
              label="Código del chip"
              wide
              hint="Se guarda como texto en mayúsculas y conserva los ceros iniciales. La lectura con el lector Bluetooth aún debe comprobarse con el equipo real."
            >
              <span className="input-wrap large">
                <IconScan />
                <input
                  ref={epcInput}
                  className="mono"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  placeholder="E2003412…"
                  disabled={pending}
                  value={epc}
                  aria-invalid={epcInvalid}
                  onChange={(e) => setEpc(e.target.value.toUpperCase())}
                />
              </span>
              {epcInvalid ? <span className="field-error">Solo letras y números, sin espacios.</span> : null}
            </Field>
            <Field label="Notas (opcional)" wide>
              <textarea
                rows={2}
                maxLength={500}
                placeholder="Observaciones del paquete"
                disabled={pending}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </Section>
        </div>

        <aside className="register-aside">
          <section className="summary-panel" aria-label="Resumen del registro">
            <header>
              <p className="eyebrow">Resumen</p>
              <h2>Nuevo paquete</h2>
              <div className="progress-steps" aria-label={`${completed} de ${steps.length} secciones completas`}>
                {steps.map((done, index) => (
                  <i key={index} className={done ? 'done' : undefined} />
                ))}
              </div>
            </header>
            <dl className="summary-list">
              {summaryRows.map(([label, value, mono]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className={value ? (mono ? 'mono' : undefined) : 'pending'}>{value ?? 'Pendiente'}</dd>
                </div>
              ))}
            </dl>
            <footer>
              {created ? (
                <Notice kind="success">
                  <strong>Paquete registrado.</strong> {created.epc} · {referenceLabel(created.reference)} ·{' '}
                  {finishLabel(created.finish)} · {created.quantity} perfiles · {bundlePlace(created)}.{' '}
                  <button type="button" className="link" onClick={() => navigate({ name: 'bundle', id: created.id })}>
                    Ver detalle
                  </button>
                </Notice>
              ) : null}
              {error ? <Notice kind="error">{error}</Notice> : null}

              <button type="submit" className="cta" disabled={pending}>
                <span aria-live="polite">{pending ? 'Guardando…' : 'Guardar paquete'}</span>
                <span className="cta-icon" aria-hidden="true">
                  {pending ? <span className="cta-progress" /> : <IconArrow />}
                </span>
              </button>
              <p className="summary-note">
                Tras guardar se limpian chip, cantidad y notas; producto, llegada y ubicación se conservan para el siguiente paquete.
              </p>
            </footer>
          </section>
        </aside>
      </form>
    </>
  )
}
