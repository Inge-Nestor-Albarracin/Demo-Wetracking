import { useEffect, useRef } from 'react'

// Shown when the user logs out with bundles in the pending list. Logging out
// never saves them; the user decides whether to keep or discard the list.
export function LogoutDialog({
  pending,
  canKeep,
  onCancel,
  onReview,
  onKeep,
  onDiscard,
}: {
  pending: number
  canKeep: boolean
  onCancel: () => void
  onReview: () => void
  onKeep: () => void
  onDiscard: () => void
}) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    first.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const bundles = pending === 1 ? '1 paquete' : `${pending} paquetes`

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        aria-describedby="logout-text"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Lista sin guardar</p>
        <h2 id="logout-title">Tienes {bundles} sin guardar</h2>
        <p id="logout-text">
          Esos paquetes <strong>no están en el inventario</strong>. Cerrar sesión no los guarda.
          {canKeep
            ? ' Si sales y los conservas, solo volverán a aparecer al ingresar de nuevo con este mismo usuario en esta misma pestaña del navegador; si cierras la pestaña se pierden.'
            : ' Este navegador no permite conservar la lista: si sales, se perderá.'}
        </p>
        <div className="dialog-actions">
          <button ref={first} type="button" className="button" onClick={onReview}>
            Volver y guardar la lista
          </button>
          {canKeep ? (
            <button type="button" className="button button-secondary" onClick={onKeep}>
              Salir y conservar la lista
            </button>
          ) : null}
          <button type="button" className="button button-danger" onClick={onDiscard}>
            Descartar {bundles} y salir
          </button>
          <button type="button" className="text-button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
