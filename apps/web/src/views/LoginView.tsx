import { useState, type FormEvent } from 'react'
import { describeError } from '../api/client'
import { Field, Notice } from '../components/ui'
import { useSession } from '../session/session-context'

export function LoginView() {
  const { login, notice } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

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
    <main className="login">
      <form className="card login-card" onSubmit={submit}>
        <h1>Solaluminios</h1>
        <p className="muted">Inventario por paquete</p>
        {notice ? <Notice kind="warning">{notice}</Notice> : null}
        {error ? <Notice kind="error">{error}</Notice> : null}
        <Field label="Correo">
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Contraseña">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button type="submit" className="button" disabled={pending}>
          {pending ? 'Ingresando…' : 'Ingresar'}
        </button>
        <p className="field-hint">
          La sesión se guarda solo en esta pestaña: al recargar la página debes ingresar de nuevo.
        </p>
      </form>
    </main>
  )
}
