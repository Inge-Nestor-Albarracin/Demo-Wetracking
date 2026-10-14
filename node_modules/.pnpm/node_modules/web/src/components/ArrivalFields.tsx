import type { ArrivalDatePrecision } from '../api/types'
import { EMPTY_ARRIVAL, type ArrivalValue } from '../lib/forms'
import { MONTHS, todayIso } from '../lib/format'
import { Field } from './ui'

const OPTIONS: { value: ArrivalDatePrecision; label: string; hint: string }[] = [
  { value: 'EXACT', label: 'Fecha exacta', hint: 'Se conoce el día' },
  { value: 'MONTH', label: 'Mes y año', hint: 'Solo el mes de llegada' },
  { value: 'UNKNOWN', label: 'Desconocida', hint: 'No hay registro' },
]

// Physical arrival of the merchandise. It is never invented: when only the
// month is known no day is sent, and "Desconocida" sends nothing.
export function ArrivalFields({
  value,
  onChange,
  disabled,
}: {
  value: ArrivalValue
  onChange: (value: ArrivalValue) => void
  disabled?: boolean
}) {
  const today = todayIso()
  const currentYear = Number(today.slice(0, 4))

  return (
    <fieldset className="field field-wide fieldset" disabled={disabled} aria-label="Llegada física de la mercancía">
      <div className="segmented" role="radiogroup">
        {OPTIONS.map((option) => (
          <label key={option.value} className={value.precision === option.value ? 'segment selected' : 'segment'}>
            <input
              type="radio"
              name="arrivalPrecision"
              value={option.value}
              checked={value.precision === option.value}
              onChange={() => onChange({ ...EMPTY_ARRIVAL, precision: option.value })}
            />
            <span>
              {option.label}
              <small>{option.hint}</small>
            </span>
          </label>
        ))}
      </div>

      {value.precision === 'EXACT' ? (
        <div className="inline-fields">
          <Field label="Fecha de llegada">
            <input
              type="date"
              required
              max={today}
              value={value.date}
              onChange={(e) => onChange({ ...value, date: e.target.value })}
            />
          </Field>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onChange({ ...value, date: today })}
          >
            Hoy
          </button>
        </div>
      ) : null}

      {value.precision === 'MONTH' ? (
        <div className="inline-fields">
          <Field label="Mes">
            <select required value={value.month} onChange={(e) => onChange({ ...value, month: e.target.value })}>
              <option value="">Selecciona el mes</option>
              {MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Año">
            <input
              type="number"
              inputMode="numeric"
              required
              min={1900}
              max={currentYear}
              placeholder={String(currentYear)}
              value={value.year}
              onChange={(e) => onChange({ ...value, year: e.target.value })}
            />
          </Field>
        </div>
      ) : null}

      <span className="field-hint">
        Es la fecha en que el paquete llegó físicamente. La fecha de registro digital se guarda aparte, automáticamente.
      </span>
    </fieldset>
  )
}
