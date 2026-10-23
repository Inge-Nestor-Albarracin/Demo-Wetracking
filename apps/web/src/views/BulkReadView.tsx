import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react'
import { ApiError, describeError } from '../api/client'
import type { Asset, ResolveResult } from '../api/types'
import { AssetStatus } from '../components/AssetStatus'
import { IconScan } from '../components/icons'
import { Empty, Field, Kpi, Notice, PageHeader } from '../components/ui'
import type { TagRead } from '../lib/chafon'
import { formatTime } from '../lib/format'
import { useChafonReader, type ReaderPower } from '../lib/useChafonReader'
import { canOperate, useSession } from '../session/session-context'
import type { Navigate } from './navigation'

const EPC_PATTERN = /^[A-Z0-9]{1,128}$/
// EPCs sent per resolve request (API limit: 200).
const LOOKUP_BATCH = 200
// Unique chips kept per session, to bound memory and requests.
const MAX_CHIPS = 3000
const FLUSH_MS = 250
const RETRY_MS = 3000

type ChipState = 'pending' | 'found' | 'missing' | 'invalid' | 'error'

// Simulation (no reader): the demo seed EPCs plus one unknown EPC, each read
// a few times, fed through the same processing as real reads.
const SIMULATED_EPCS = [
  ...Array.from({ length: 10 }, (_, i) => `D3E0${(i + 1).toString(16).toUpperCase().padStart(20, '0')}`),
  'D3E0000000000000000000FF',
]

// One row per unique EPC. A read event is one valid detection (non-empty
// code) delivered by the reader or typed; `reads` counts them per EPC.
export interface BulkChip {
  epc: string
  reads: number
  rssi: number | null
  firstSeen: number
  lastSeen: number
  state: ChipState
  asset?: Asset
}

// Unique EPCs in read order (Map insertion order). Kept in memory by the
// workspace so opening an asset and coming back does not lose the session;
// cleared on logout and when the page is reloaded or closed.
export type BulkChips = Map<string, BulkChip>
type Chip = BulkChip

// Quick choices as a share of the model's maximum power (H103: 12 / 21 / 33
// dBm). Less power, shorter range: fewer neighbouring objects read by mistake.
function rangePresets(min: number, max: number) {
  return [
    { label: 'Corta', hint: 'Solo lo cercano', value: Math.max(min, Math.round(max * 0.35)) },
    { label: 'Media', hint: 'Uso general', value: Math.max(min, Math.round(max * 0.65)) },
    { label: 'Larga', hint: 'Máximo alcance', value: max },
  ]
}

// Read range of the handheld (its RF power). Changed with the reader idle;
// the value is written to the reader, keeping its other settings.
function ReadRange({
  power,
  locked,
  onChange,
  onRetry,
}: {
  power: ReaderPower
  locked: boolean
  onChange: (value: number) => void
  onRetry: () => void
}) {
  const [draft, setDraft] = useState<number | null>(null)

  if (power.value === null) {
    return (
      <div className="read-range">
        <strong className="read-range-title">Distancia de lectura</strong>
        {power.error ? (
          <small className="read-range-error">
            {power.error}{' '}
            <button type="button" className="link" onClick={onRetry}>Reintentar</button>
          </small>
        ) : (
          <small className="read-range-note">Consultando la pistola…</small>
        )}
      </div>
    )
  }

  const current = power.value
  const value = draft ?? current
  const apply = (next: number) => {
    setDraft(null)
    if (next !== current) onChange(next)
  }

  return (
    <fieldset className="read-range" disabled={locked || power.busy}>
      <legend className="read-range-title">Distancia de lectura</legend>
      <div className="read-range-options">
        {rangePresets(power.min, power.max).map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`range-option${draft === null && current === preset.value ? ' selected' : ''}`}
            aria-pressed={draft === null && current === preset.value}
            onClick={() => apply(preset.value)}
          >
            <strong>{preset.label}</strong>
            <small>{preset.hint}</small>
          </button>
        ))}
      </div>
      <label className="read-range-fine">
        <span>Ajuste fino</span>
        <input
          type="range"
          min={power.min}
          max={power.max}
          step={1}
          value={value}
          aria-valuetext={`${value} dBm`}
          onChange={(e) => setDraft(Number(e.target.value))}
        />
        <output>{value} dBm</output>
      </label>
      {draft !== null && draft !== current ? (
        <div className="read-range-apply">
          <button type="button" className="button button-secondary" onClick={() => apply(draft)}>
            Aplicar {draft} dBm
          </button>
          <button type="button" className="text-button" onClick={() => setDraft(null)}>Cancelar</button>
        </div>
      ) : null}
      {power.error ? <small className="read-range-error">{power.error}</small> : null}
      <small className="read-range-note">
        {locked
          ? 'Detén la lectura para cambiar la distancia.'
          : power.busy
            ? 'Guardando en la pistola…'
            : power.saved
              ? `Distancia guardada en la pistola: ${current} dBm.`
              : `Potencia actual: ${current} de ${power.max} dBm${power.model ? ` (${power.model})` : ''}. Menos distancia evita leer objetos vecinos.`}
      </small>
    </fieldset>
  )
}

// Bulk RFID reading: many tags at once, each shown with its asset.
// Read-only: nothing is registered or changed in the database.
export function BulkReadView({
  navigate,
  chips,
  setChips,
}: {
  navigate: Navigate
  chips: BulkChips
  setChips: Dispatch<SetStateAction<BulkChips>>
}) {
  const { request, user } = useSession()
  const operator = canOperate(user?.role)
  const [manual, setManual] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'found' | 'missing'>('all')
  const [search, setSearch] = useState('')
  // Reads typed by the simulation are never attributed to the reader.
  const [simulated, setSimulated] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const buffer = useRef<{ epc: string; rssi: number | null; at: number }[]>([])
  const flushTimer = useRef<number | null>(null)
  const inFlight = useRef(false)
  const blockedUntil = useRef(0)

  // Reads arrive many times per second (the same chip repeats): they are
  // grouped and applied a few times per second.
  const flush = useCallback(() => {
    flushTimer.current = null
    const reads = buffer.current
    buffer.current = []
    if (reads.length === 0) return
    setChips((previous) => {
      const next = new Map(previous)
      for (const { epc, rssi, at } of reads) {
        const chip = next.get(epc)
        if (chip) {
          next.set(epc, { ...chip, reads: chip.reads + 1, rssi: rssi ?? chip.rssi, lastSeen: at })
          continue
        }
        if (next.size >= MAX_CHIPS) continue
        next.set(epc, {
          epc,
          reads: 1,
          rssi,
          firstSeen: at,
          lastSeen: at,
          state: EPC_PATTERN.test(epc) ? 'pending' : 'invalid',
        })
      }
      return next
    })
  }, [setChips])

  const addRead = useCallback(
    (raw: string, rssi: number | null) => {
      const epc = raw.trim().toUpperCase()
      if (!epc) return
      buffer.current.push({ epc, rssi, at: Date.now() })
      if (flushTimer.current === null) flushTimer.current = window.setTimeout(flush, FLUSH_MS)
    },
    [flush],
  )

  const onTag = useCallback((tag: TagRead) => addRead(tag.epc, tag.rssi), [addRead])
  const reader = useChafonReader(onTag)

  useEffect(
    () => () => {
      if (flushTimer.current !== null) window.clearTimeout(flushTimer.current)
    },
    [],
  )

  // Resolves new EPCs in batches, one request at a time; repeated reads of a
  // known EPC never trigger another request.
  const pending = useMemo(() => [...chips.values()].filter((chip) => chip.state === 'pending').map((chip) => chip.epc), [chips])
  useEffect(() => {
    // After a temporary failure, new reads wait for the retry instead of
    // sending a request per flush.
    if (pending.length === 0 || inFlight.current || Date.now() < blockedUntil.current) return
    const batch = pending.slice(0, LOOKUP_BATCH)
    inFlight.current = true
    let retry: number | null = null
    void (async () => {
      try {
        const { data } = await request<ResolveResult>('/assets/resolve', { method: 'POST', body: { epcs: batch } })
        const found = new Map(data.found.map((asset) => [asset.epc, asset]))
        setLookupError(null)
        setChips((previous) => {
          const next = new Map(previous)
          for (const epc of batch) {
            const chip = next.get(epc)
            // Cleared meanwhile, or already resolved: a late answer never
            // brings back a row of a cleared session.
            if (!chip || chip.state !== 'pending') continue
            const asset = found.get(epc)
            next.set(epc, asset ? { ...chip, state: 'found', asset } : { ...chip, state: 'missing', asset: undefined })
          }
          return next
        })
      } catch (err) {
        const temporary =
          err instanceof ApiError &&
          (err.status === 0 || err.status === 429 || (err.data as { retryable?: boolean } | null)?.retryable === true)
        setLookupError(
          temporary
            ? `${describeError(err)} Las lecturas se conservan y se consultarán de nuevo en unos segundos.`
            : describeError(err),
        )
        if (temporary) {
          blockedUntil.current = Date.now() + RETRY_MS
          retry = window.setTimeout(() => setRetryTick((tick) => tick + 1), RETRY_MS)
        } else {
          setChips((previous) => {
            const next = new Map(previous)
            for (const epc of batch) {
              const chip = next.get(epc)
              if (chip?.state === 'pending') next.set(epc, { ...chip, state: 'error' })
            }
            return next
          })
        }
      } finally {
        inFlight.current = false
        // Chips read meanwhile trigger the next batch.
        if (retry === null) setRetryTick((tick) => tick + 1)
      }
    })()
  }, [pending, request, retryTick, setChips])

  const retryErrors = () => {
    setLookupError(null)
    setChips((previous) => {
      const next = new Map(previous)
      for (const chip of next.values()) if (chip.state === 'error') next.set(chip.epc, { ...chip, state: 'pending' })
      return next
    })
  }

  const submitManual = (event: FormEvent) => {
    event.preventDefault()
    // HID readers type each EPC followed by Enter; a pasted list also works.
    for (const code of manual.split(/[\s,;]+/)) addRead(code, null)
    setManual('')
  }

  const simulate = () => {
    setSimulated(true)
    for (const epc of SIMULATED_EPCS) {
      const times = 1 + Math.floor(Math.random() * 4)
      for (let i = 0; i < times; i += 1) addRead(epc, null)
    }
  }

  const clear = () => {
    setSimulated(false)
    buffer.current = []
    if (flushTimer.current !== null) window.clearTimeout(flushTimer.current)
    flushTimer.current = null
    setChips(new Map())
    setLookupError(null)
    setConfirmClear(false)
  }

  // Newest read first.
  const list = useMemo(() => [...chips.values()].reverse(), [chips])
  const full = chips.size >= MAX_CHIPS
  const found = list.filter((chip) => chip.state === 'found')
  const missing = list.filter((chip) => chip.state === 'missing' || chip.state === 'invalid')
  // Counters: unique EPCs = registered detected + unknown + still resolving.
  const events = list.reduce((sum, chip) => sum + chip.reads, 0)
  const repeats = events - list.length
  const byFilter = filter === 'found' ? found : filter === 'missing' ? missing : list
  const query = search.trim().toUpperCase()
  const visible = query
    ? byFilter.filter((chip) =>
        [chip.epc, chip.asset?.name, chip.asset?.category, chip.asset?.location].some((text) => text?.toUpperCase().includes(query)),
      )
    : byFilter

  // Grouped by category: the quick answer to "what did I read?".
  const groups = useMemo(() => {
    const map = new Map<string, { category: string; assets: number; inactive: number }>()
    for (const chip of found) {
      const asset = chip.asset!
      const category = asset.category ?? 'Sin categoría'
      const group = map.get(category) ?? { category, assets: 0, inactive: 0 }
      group.assets += 1
      if (!asset.active) group.inactive += 1
      map.set(category, group)
    }
    return [...map.values()].sort((a, b) => b.assets - a.assets)
  }, [found])

  const connected = reader.status === 'connected'

  return (
    <>
      <PageHeader
        eyebrow="Activos · RFID"
        title="Lectura masiva"
        description="Lee muchas etiquetas a la vez con la pistola Chafon y ve qué activo corresponde a cada EPC. Solo consulta: no registra ni cambia activos."
      />
      <Notice kind="info">
        La sesión de lectura se guarda solo en esta pestaña mientras navegas por la aplicación: se borra al recargar,
        cerrar la página o cerrar sesión. No es un historial.
      </Notice>

      <div className="bulk-layout">
        <section className="card bulk-reader" aria-label="Lector">
          <div className="bulk-reader-head">
            <span className={`reader-dot ${connected ? (reader.reading || reader.trigger ? 'reading' : 'on') : ''}`} aria-hidden="true" />
            <div>
              <strong>
                {reader.status === 'unsupported'
                  ? 'Bluetooth no disponible en este navegador'
                  : connected
                    ? reader.deviceName
                    : reader.status === 'connecting'
                      ? 'Conectando…'
                      : 'Lector desconectado'}
              </strong>
              <small>
                {connected
                  ? reader.reading || reader.trigger
                    ? 'Leyendo etiquetas…'
                    : 'Listo: aprieta el gatillo o pulsa «Iniciar lectura».'
                  : reader.status === 'unsupported'
                    ? 'Usa Chrome en Android o en computador (con HTTPS), o el modo teclado.'
                    : 'Pistola Chafon H100 / H102 / H103 en modo transparente.'}
              </small>
            </div>
          </div>

          {reader.error ? <Notice kind="error">{reader.error}</Notice> : null}

          {reader.status !== 'unsupported' ? (
            <div className="bulk-reader-actions">
              {connected ? (
                <>
                  {reader.reading ? (
                    <button type="button" className="button bulk-main" onClick={() => void reader.stop()}>
                      Detener lectura
                    </button>
                  ) : (
                    <button type="button" className="button bulk-main" onClick={() => void reader.start()}>
                      Iniciar lectura
                    </button>
                  )}
                  <button type="button" className="button button-secondary" onClick={() => void reader.disconnect()}>
                    Desconectar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button bulk-main"
                  disabled={reader.status === 'connecting'}
                  onClick={() => void reader.connect()}
                >
                  {reader.status === 'connecting' ? 'Conectando…' : 'Conectar lector Bluetooth'}
                </button>
              )}
            </div>
          ) : null}

          {connected ? (
            <ReadRange
              power={reader.power}
              locked={reader.reading || reader.trigger}
              onChange={(value) => void reader.setPower(value)}
              onRetry={() => void reader.reloadPower()}
            />
          ) : null}

          {/* Collapsed when Bluetooth is available, to keep the results close
              on phones; always open otherwise (it is the only way to read). */}
          <details className="bulk-manual" open={reader.status === 'unsupported' || undefined}>
            <summary>Modo teclado, código manual o simulación</summary>
          <form onSubmit={submitManual}>
            <Field
              label="EPC"
              wide
              hint="Si la pistola está en modo HID (teclado), deja el cursor aquí: cada etiqueta leída se agrega sola. También puedes pegar varios códigos."
            >
              <span className="input-wrap">
                <IconScan />
                <input
                  className="mono"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="E2003412…"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  onPaste={(e) => {
                    // A one-line field would glue a pasted list together
                    // (line breaks are dropped): split it here instead.
                    const text = e.clipboardData.getData('text')
                    if (!/[\s,;]/.test(text.trim())) return
                    e.preventDefault()
                    for (const code of text.split(/[\s,;]+/)) addRead(code, null)
                  }}
                />
              </span>
            </Field>
          </form>
          <div className="bulk-sim">
            <button type="button" className="button button-secondary" onClick={simulate}>
              Simular lectura
            </button>
            <small>Modo simulación: agrega EPC de ejemplo (registrados, uno inactivo y uno desconocido) con repeticiones, sin usar el lector.</small>
          </div>
          </details>
        </section>

        <div className="kpis bulk-kpis">
          <Kpi label="EPC únicos" value={list.length} hint={pending.length > 0 ? `${pending.length} consultando…` : 'Cada etiqueta una vez'} dark />
          <Kpi label="Activos registrados detectados" value={found.length} hint={`${found.filter((chip) => !chip.asset?.active).length} inactivos`} />
          <Kpi label="EPC desconocidos" value={missing.length} hint="Sin activo en la base" />
          <Kpi label="Eventos de lectura" value={events} hint={`${repeats} repeticiones`} />
        </div>
      </div>

      {simulated && list.length > 0 ? (
        <Notice kind="warning">
          <strong>Modo simulación.</strong> Esta sesión incluye lecturas simuladas: no provienen de la pistola.
        </Notice>
      ) : null}
      {full ? (
        <Notice kind="warning">
          Se alcanzó el máximo de {MAX_CHIPS} EPC en pantalla; las lecturas nuevas no se agregan. Limpia la lista para
          seguir.
        </Notice>
      ) : null}
      {lookupError ? (
        <Notice kind="error">
          {lookupError}{' '}
          {list.some((chip) => chip.state === 'error') ? (
            <button type="button" className="link" onClick={retryErrors}>Reintentar</button>
          ) : null}
        </Notice>
      ) : null}

      {list.length === 0 ? (
        <Empty title="Aún no hay lecturas">
          Conecta la pistola y aprieta el gatillo cerca de los objetos, o usa el modo teclado o la simulación.
        </Empty>
      ) : (
        <>
          {groups.length > 0 ? (
            <section className="bulk-groups" aria-label="Resumen por categoría">
              <h2 className="subtitle">Por categoría</h2>
              <ul>
                {groups.map((group) => (
                  <li key={group.category}>
                    <span>
                      <strong>{group.category}</strong>
                    </span>
                    <span className="bulk-group-count">
                      <strong>{group.assets}</strong> {group.assets === 1 ? 'activo' : 'activos'}
                      {group.inactive > 0 ? <small>{group.inactive} inactivos</small> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="tabs bulk-filter" role="tablist" aria-label="Filtrar lecturas">
            {(
              [
                ['all', 'Todos', list.length],
                ['found', 'Registrados', found.length],
                ['missing', 'Desconocidos', missing.length],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={filter === value ? 'tab active' : 'tab'}
                onClick={() => setFilter(value)}
              >
                {label}
                <span className="tab-count">{count}</span>
              </button>
            ))}
            <span className="bulk-clear">
              {confirmClear ? (
                <span className="row-confirm">
                  ¿Borrar las {list.length} lecturas?
                  <button type="button" className="text-button danger" onClick={clear}>Sí, limpiar</button>
                  <button type="button" className="text-button" onClick={() => setConfirmClear(false)}>Cancelar</button>
                </span>
              ) : (
                <button type="button" className="text-button" onClick={() => setConfirmClear(true)}>
                  Limpiar lista
                </button>
              )}
            </span>
          </div>

          <Field label="Buscar en los resultados" wide>
            <input type="search" placeholder="EPC, nombre, categoría o ubicación" value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>

          {/* One compact line per unique EPC (phones read dozens at a time). */}
          <ul className="bulk-list">
            {visible.map((chip) => (
              <li key={chip.epc} className={chip.asset ? undefined : 'unregistered'}>
                <div className="bulk-item-main">
                  {chip.asset ? (
                    <button type="button" className="epc-link" onClick={() => navigate({ name: 'asset', id: chip.asset!.id })}>
                      {chip.epc}
                    </button>
                  ) : (
                    <span className="mono bulk-epc">{chip.epc}</span>
                  )}
                  {chip.asset ? (
                    <>
                      <span className="bulk-ref">
                        <strong>{chip.asset.name}</strong> <AssetStatus active={chip.asset.active} />
                      </span>
                      <small>
                        {chip.asset.category ?? 'Sin categoría'} · {chip.asset.location ?? 'Sin ubicación'}
                      </small>
                    </>
                  ) : (
                    <ChipStatus chip={chip} operator={operator} onRegister={() => navigate({ name: 'register', epc: chip.epc })} />
                  )}
                </div>
                <div className="bulk-item-side">
                  <small title="Detecciones de este EPC en la sesión">
                    {chip.reads}× {chip.rssi !== null ? `· ${chip.rssi} dBm` : ''}
                  </small>
                  <small title="Primera y última detección">
                    {formatTime(chip.firstSeen)}
                    {formatTime(chip.lastSeen) !== formatTime(chip.firstSeen) ? ` – ${formatTime(chip.lastSeen)}` : ''}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function ChipStatus({ chip, operator, onRegister }: { chip: Chip; operator: boolean; onRegister: () => void }) {
  if (chip.state === 'pending') return <span className="badge badge-muted">Consultando…</span>
  if (chip.state === 'invalid') return <span className="badge badge-warning">Código no válido</span>
  if (chip.state === 'error') return <span className="badge badge-warning">Sin consultar</span>
  return (
    <span className="bulk-missing">
      <span className="badge badge-muted">EPC desconocido</span>
      {operator ? (
        <button type="button" className="text-button" onClick={onRegister}>
          Registrar activo
        </button>
      ) : null}
    </span>
  )
}
