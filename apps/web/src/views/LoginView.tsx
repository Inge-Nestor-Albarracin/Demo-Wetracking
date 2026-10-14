import { useState, type FormEvent } from 'react'
import { describeError } from '../api/client'
import { Notice } from '../components/ui'
import { useSession } from '../session/session-context'
import './LoginView.css'

function SolutionBrand() {
  return (
    <div className="login-solution-brand">
      <span className="login-solution-mark" aria-hidden="true"><i /><i /><i /></span>
      <span><strong>WeTracking</strong><small>Solución tecnológica</small></span>
    </div>
  )
}

export function LoginView() {
  const { login, notice } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(describeError(err))
      setPending(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-identity" aria-labelledby="login-headline">
        <header><SolutionBrand /></header>
        <div className="login-story">
          <p className="login-eyebrow">Plataforma de gestión</p>
          <h1 id="login-headline">El control de tu inventario,<br /><em>en un solo lugar.</em></h1>
          <p className="login-intro">
            Cada perfil, cada paquete, cada movimiento.
            La información que necesitas para el trabajo de cada día.
          </p>
          <div className="login-features">
            <div><span aria-hidden="true">01</span><p><strong>Existencias claras</strong><small>Consulta por paquete y ubicación</small></p></div>
            <div><span aria-hidden="true">02</span><p><strong>Movimientos al día</strong><small>Entradas, salidas y traslados</small></p></div>
          </div>
        </div>
        <footer className="login-identity-footer"><span>Solaluminios</span><span>Gestión de inventario</span></footer>
      </section>

      <section className="login-access" aria-labelledby="login-welcome">
        <div className="login-mobile-brand"><SolutionBrand /></div>
        <div className="login-form-wrap">
          <div className="login-client-brand">
            <svg className="login-profile-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <path d="M8 36V12h10v24H8Zm14 0V6h10v30H22Zm14 0V18h6v18h-6Z" />
              <path d="M6 42h38" />
            </svg>
            <div><span className="login-client-label">Portal de acceso</span><strong>Solaluminios</strong></div>
          </div>
          <div className="login-welcome">
            <h2 id="login-welcome">Bienvenido.</h2>
            <p>Ingresa a tu espacio de trabajo.</p>
          </div>
          <form onSubmit={submit} aria-labelledby="login-welcome" aria-busy={pending}>
            {notice ? <Notice kind="warning">{notice}</Notice> : null}
            {error ? <Notice kind="error">{error}</Notice> : null}
            <div className="login-field-group">
              <label htmlFor="login-email">Correo electrónico</label>
              <div className="login-input-wrap">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1" /><path d="m3 6 9 7 9-7" /></svg>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="nombre@empresa.com"
                  required
                  disabled={pending}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="login-field-group">
              <label htmlFor="login-password">Contraseña</label>
              <div className="login-input-wrap">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="1" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></svg>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  required
                  disabled={pending}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="login-visibility"
                  type="button"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-controls="login-password"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                    {showPassword ? <path d="m3 3 18 18" /> : null}
                  </svg>
                </button>
              </div>
            </div>
            <button type="submit" className="login-submit" disabled={pending}>
              <span aria-live="polite">{pending ? 'Ingresando…' : 'Entrar al inventario'}</span>
              <span className="login-submit-icon" aria-hidden="true">
                {pending ? <span className="login-progress" /> : <svg viewBox="0 0 24 24" fill="none"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>}
              </span>
            </button>
            <p className="login-session-note">Al recargar o cerrar esta página, tendrás que ingresar de nuevo.</p>
          </form>
          <p className="login-help">¿Necesitas acceso? Consulta con tu administrador.</p>
        </div>
        <footer className="login-access-footer"><span>Solaluminios</span><span>Impulsado por WeTracking</span></footer>
      </section>
    </main>
  )
}
