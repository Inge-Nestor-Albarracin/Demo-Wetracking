import { useState } from 'react'
import './App.css'
import { ROLE_LABELS, canOperate, useSession } from './session/session-context'
import { BundleDetailView } from './views/BundleDetailView'
import { BundlesView } from './views/BundlesView'
import { LoginView } from './views/LoginView'
import { LookupView } from './views/LookupView'
import type { View } from './views/navigation'
import { RegisterBundleView } from './views/RegisterBundleView'
import { SummaryView } from './views/SummaryView'

function App() {
  const { user } = useSession()
  if (!user) return <LoginView />
  // Remount on user change so no state survives a logout/login.
  return <Workspace key={user.id} />
}

function Workspace() {
  const { user, logout } = useSession()
  const operator = canOperate(user?.role)
  const [view, setView] = useState<View>(operator ? { name: 'register' } : { name: 'lookup' })
  // Remount the register form when it receives an EPC from the lookup.
  const [registerKey, setRegisterKey] = useState(0)

  const navigate = (next: View) => {
    if (next.name === 'register') setRegisterKey((k) => k + 1)
    setView(next)
    window.scrollTo({ top: 0 })
  }

  const tabs: { name: View['name']; label: string }[] = [
    ...(operator ? [{ name: 'register' as const, label: 'Registrar paquete' }] : []),
    { name: 'lookup', label: 'Consultar EPC' },
    { name: 'bundles', label: 'Paquetes' },
    { name: 'summary', label: 'Resumen' },
  ]

  return (
    <div className="app">
      <header className="topbar">
        <strong className="brand">Solaluminios · Inventario</strong>
        <div className="user">
          <span>
            {user?.name} <span className="badge">{user ? ROLE_LABELS[user.role] : ''}</span>
          </span>
          <button type="button" className="button button-secondary" onClick={() => logout()}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <nav className="nav" aria-label="Secciones">
        {tabs.map((tab) => (
          <button
            key={tab.name}
            type="button"
            className={view.name === tab.name ? 'nav-item active' : 'nav-item'}
            aria-current={view.name === tab.name ? 'page' : undefined}
            onClick={() => navigate({ name: tab.name } as View)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="content">
        {view.name === 'register' ? (
          <RegisterBundleView key={registerKey} initialEpc={view.epc} navigate={navigate} />
        ) : null}
        {view.name === 'lookup' ? <LookupView navigate={navigate} /> : null}
        {view.name === 'bundles' ? <BundlesView navigate={navigate} /> : null}
        {view.name === 'summary' ? <SummaryView /> : null}
        {view.name === 'bundle' ? <BundleDetailView key={view.id} id={view.id} navigate={navigate} /> : null}
      </main>
    </div>
  )
}

export default App
