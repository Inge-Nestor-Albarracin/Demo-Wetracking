import { useState, type ComponentType, type SVGProps } from 'react'
import './App.css'
import { BrandLogo } from './components/brand/BrandLogo'
import { IconBulk, IconChart, IconHome, IconLogout, IconRegister, IconScan, IconSettings } from './components/icons'
import { ROLE_LABELS, canOperate, useSession } from './session/session-context'
import { AdminView } from './views/AdminView'
import { AssetDetailView } from './views/AssetDetailView'
import { AssetsView } from './views/AssetsView'
import { BulkReadView, type BulkChips } from './views/BulkReadView'
import { HomeView } from './views/HomeView'
import { LoginView } from './views/LoginView'
import { LookupView } from './views/LookupView'
import type { View } from './views/navigation'
import { RegisterAssetView } from './views/RegisterAssetView'

function App() {
  const { user } = useSession()
  if (!user) return <LoginView />
  // Remount on user change so no state survives a logout/login.
  return <Workspace key={user.id} />
}

interface NavTab {
  name: Exclude<View['name'], 'asset'>
  label: string
  short: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  bottom?: false
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function Workspace() {
  const { user, logout } = useSession()
  const operator = canOperate(user?.role)
  // Bulk reading session: in memory only. Survives navigation (e.g. opening
  // an asset), not a reload or the logout (Workspace remounts per user).
  const [bulkChips, setBulkChips] = useState<BulkChips>(() => new Map())
  const [view, setView] = useState<View>({ name: 'home' })
  // Remount register/assets when they receive initial values (EPC, filters).
  const [remountKey, setRemountKey] = useState(0)

  const navigate = (next: View) => {
    if (next.name === 'register' || next.name === 'assets') setRemountKey((k) => k + 1)
    setView(next)
    window.scrollTo({ top: 0 })
  }

  const tabs: NavTab[] = [
    { name: 'home', label: 'Inicio', short: 'Inicio', icon: IconHome },
    ...(operator ? [{ name: 'register' as const, label: 'Registrar activo', short: 'Registrar', icon: IconRegister }] : []),
    { name: 'bulk', label: 'Lectura masiva', short: 'Lectura', icon: IconBulk },
    { name: 'assets', label: 'Activos y resumen', short: 'Activos', icon: IconChart },
    { name: 'lookup', label: 'Consultar EPC', short: 'Consultar', icon: IconScan },
    // UI hint only: the API enforces ADMIN on every admin endpoint.
    ...(user?.role === 'ADMIN'
      ? [{ name: 'admin' as const, label: 'Usuarios', short: 'Usuarios', icon: IconSettings, bottom: false as const }]
      : []),
  ]
  // The asset detail belongs to the asset list.
  const current = view.name === 'asset' ? 'assets' : view.name

  const navButtons = (variant: 'side' | 'bottom' | 'top') =>
    tabs.filter((tab) => variant !== 'bottom' || tab.bottom !== false).map((tab) => {
      const Icon = tab.icon
      const active = current === tab.name
      return (
        <button
          key={tab.name}
          type="button"
          className={`nav-${variant}-item${active ? ' active' : ''}`}
          aria-current={active ? 'page' : undefined}
          onClick={() => navigate({ name: tab.name })}
        >
          <Icon />
          <span>{variant === 'bottom' ? tab.short : tab.label}</span>
        </button>
      )
    })

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <button type="button" className="sidebar-brand" onClick={() => navigate({ name: 'home' })} aria-label="WeTracking · Ir al inicio">
          <BrandLogo variant="full" tone="negative" title="WeTracking" />
        </button>
        <div className="sidebar-client">
          <small>Demostración</small>
          <strong>RFID Demo</strong>
        </div>
        <nav className="nav-side">{navButtons('side')}</nav>
        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">{initials(user?.name ?? '')}</span>
          <span className="sidebar-user-text">
            <strong>{user?.name}</strong>
            <small>{user ? ROLE_LABELS[user.role] : ''}</small>
          </span>
          <button type="button" className="icon-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => logout()}>
            <IconLogout />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <button type="button" className="topbar-brand" onClick={() => navigate({ name: 'home' })} aria-label="WeTracking · Ir al inicio">
          <BrandLogo className="topbar-logo" variant="minimal" tone="negative" title="WeTracking" />
          <BrandLogo className="topbar-mark" variant="mark" tone="negative" title="WeTracking" />
          <span className="topbar-client">
            <small>Demostración</small>
            <strong>RFID Demo</strong>
          </span>
        </button>
        <div className="topbar-user">
          <span className="topbar-user-text">
            <strong>{user?.name}</strong>
            <small>{user ? ROLE_LABELS[user.role] : ''}</small>
          </span>
          <span className="avatar" aria-hidden="true">{initials(user?.name ?? '')}</span>
          <button type="button" className="icon-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => logout()}>
            <IconLogout />
          </button>
        </div>
        <nav className="nav-top" aria-label="Secciones">{navButtons('top')}</nav>
      </header>

      <main className="content">
        {view.name === 'home' ? (
          <HomeView name={user?.name ?? ''} operator={operator} admin={user?.role === 'ADMIN'} navigate={navigate} />
        ) : null}
        {view.name === 'register' ? <RegisterAssetView key={remountKey} initialEpc={view.epc} navigate={navigate} /> : null}
        {view.name === 'lookup' ? <LookupView navigate={navigate} /> : null}
        {view.name === 'bulk' ? <BulkReadView navigate={navigate} chips={bulkChips} setChips={setBulkChips} /> : null}
        {view.name === 'assets' ? <AssetsView key={remountKey} navigate={navigate} initialFilters={view.filters} /> : null}
        {view.name === 'admin' && user?.role === 'ADMIN' ? <AdminView /> : null}
        {view.name === 'asset' ? <AssetDetailView key={view.id} id={view.id} navigate={navigate} /> : null}
      </main>

      <nav className="nav-bottom" aria-label="Secciones">{navButtons('bottom')}</nav>
    </div>
  )
}

export default App
