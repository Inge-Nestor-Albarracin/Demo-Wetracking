import type { Family, Finish, Reference } from '../api/types'
import { finishLabel, referenceLabel } from '../lib/format'
import type { CatalogValue } from '../lib/forms'
import { useLoad } from '../lib/useLoad'
import { Field } from './ui'

// Family only filters the reference list. Changing it clears the reference.
// In "filter" mode every level accepts "Todas"; in "form" mode only active
// records are offered for new registrations.
export function CatalogSelectors({
  value,
  onChange,
  mode,
  showReference = true,
  showFinish = true,
  disabled,
}: {
  value: CatalogValue
  onChange: (value: CatalogValue) => void
  mode: 'form' | 'filter'
  showReference?: boolean
  showFinish?: boolean
  disabled?: boolean
}) {
  const families = useLoad<Family[]>('/catalog/families')
  const references = useLoad<Reference[]>(
    showReference
      ? `/catalog/references${value.familyId ? `?familyId=${encodeURIComponent(value.familyId)}` : ''}`
      : null,
  )
  const finishes = useLoad<Finish[]>(showFinish ? '/catalog/finishes' : null)

  const onlyActive = <T extends { active: boolean }>(list: T[] | null) =>
    (list ?? []).filter((item) => mode === 'filter' || item.active)

  const referenceOptions = onlyActive(references.data)
  const finishOptions = onlyActive(finishes.data)
  const familyOptions = onlyActive(families.data)

  return (
    <>
      <Field
        label="Familia"
        hint={mode === 'form' ? 'Opcional: filtra la lista de referencias.' : undefined}
      >
        <select
          value={value.familyId}
          disabled={disabled || families.loading}
          onChange={(e) => onChange({ ...value, familyId: e.target.value, referenceId: '' })}
        >
          <option value="">{mode === 'form' ? 'Todas las familias' : 'Todas'}</option>
          {familyOptions.map((family) => (
            <option key={family.id} value={family.id}>
              {family.code} — {family.name}
              {family.active ? '' : ' (inactiva)'}
            </option>
          ))}
        </select>
        {families.error ? <span className="field-error">{families.error}</span> : null}
      </Field>

      {showReference ? (
        <Field label="Referencia">
          <select
            value={value.referenceId}
            required={mode === 'form'}
            disabled={disabled || references.loading}
            onChange={(e) => onChange({ ...value, referenceId: e.target.value })}
          >
            <option value="">
              {references.loading
                ? 'Cargando…'
                : mode === 'form'
                  ? referenceOptions.length
                    ? 'Selecciona una referencia'
                    : 'Sin referencias disponibles'
                  : 'Todas'}
            </option>
            {referenceOptions.map((reference) => (
              <option key={reference.id} value={reference.id}>
                {referenceLabel(reference)}
                {reference.active ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
          {references.error ? <span className="field-error">{references.error}</span> : null}
        </Field>
      ) : null}

      {showFinish ? (
        <Field label="Acabado (color)">
          <select
            value={value.finishId}
            required={mode === 'form'}
            disabled={disabled || finishes.loading}
            onChange={(e) => onChange({ ...value, finishId: e.target.value })}
          >
            <option value="">{mode === 'form' ? 'Selecciona un acabado' : 'Todos'}</option>
            {finishOptions.map((finish) => (
              <option key={finish.id} value={finish.id}>
                {finishLabel(finish)}
                {finish.active ? '' : ' (inactivo)'}
              </option>
            ))}
          </select>
          {finishes.error ? <span className="field-error">{finishes.error}</span> : null}
        </Field>
      ) : null}
    </>
  )
}
