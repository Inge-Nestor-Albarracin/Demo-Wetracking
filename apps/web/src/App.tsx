import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import './App.css'
import { BrandLogo } from './components/brand/BrandLogo'
import { IconChart, IconHome, IconList, IconLogout, IconRegister, IconScan, IconSettings, IconTasks } from './components/icons'
import { LogoutDialog } from './components/LogoutDialog'
import { useRegistrationQueue } from './lib/registrationQueue'
import type { TaskSummary } from './lib/tasks'
import { useLoad } from './lib/useLoad'
import { ROLE_LABELS, canOperate, useSession } from './session/session-context'
import { AdminView } from './views/AdminView'
import { BundleDetailView } from './views/BundleDetailView'
import { BundlesView } from './views/BundlesView'
import { HomeView } from './views/HomeView'
import { LoginView } from './views/LoginView'
import { LookupView } from './views/LookupView'
import type { View } from './views/navigation'
import { RegisterBundleView } from './views/RegisterBundleView'
import { SummaryView } from './views/SummaryView'
import { TasksView } from './views/TasksView'

function App() {
  const { user } = useSession()
  if (!user) return <LoginView />
  // Remount on user change so no state survives a logout/login.
  return <Workspace key={user.id} />
}

interface NavTab {
  name: Exclude<View['name'], 'bundle'>
  label: string
  short: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
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
  // Pending registration list (not saved yet), shared by the register view,
  // the menu badge and the logout prompt.
  const queue = useRegistrationQueue(user?.id ?? 'anonymous')
  const pending = queue.items.length
  const [logoutPrompt, setLogoutPrompt] = useState(false)

  // Closing or reloading the tab with unsaved bundles asks for confirmation.
  useEffect(() => {
    if (pending === 0) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending])

  // Pending tasks for the menu badge, refreshed every minute.
  const taskSummary = useLoad<TaskSummary>('/tasks/summary')
  const { reload: reloadTaskSummary } = taskSummary
  useEffect(() => {
    const id = window.setInterval(reloadTaskSummary, 60_000)
    return () => window.clearInterval(id)
  }, [reloadTaskSummary])
  const openTasks = taskSummary.data?.pending ?? 0

  const requestLogout = () => (pending > 0 ? setLogoutPrompt(true) : logout())
  const [view, setView] = useState<View>({ name: 'home' })
  // Remount register/bundles when they receive initial values (EPC, filters).
  const [remountKey, setRemountKey] = useState(0)

  const navigate = (next: View) => {
    if (next.name === 'register' || next.name === 'bundles') setRemountKey((k) => k + 1)
    setView(next)
    window.scrollTo({ top: 0 })
  }

  const tabs: NavTab[] = [
    { name: 'home', label: 'Inicio', short: 'Inicio', icon: IconHome },
    ...(operator ? [{ name: 'register' as const, label: 'Registrar paquete', short: 'Registrar', icon: IconRegister }] : []),
    { name: 'lookup', label: 'Consultar chip', short: 'Chip', icon: IconScan },
    { name: 'bundles', label: 'Paquetes', short: 'Paquetes', icon: IconList },
    { name: 'summary', label: 'Resumen', short: 'Resumen', icon: IconChart },
    { name: 'tasks', label: 'Tareas', short: 'Tareas', icon: IconTasks },
    // UI hint only: the API enforces ADMIN on every admin endpoint.
    ...(user?.role === 'ADMIN' ? [{ name: 'admin' as const, label: 'Administración', short: 'Admin', icon: IconSettings }] : []),
  ]
  // The bundle detail belongs to the section the user came from; highlight lookup.
  const current = view.name === 'bundle' ? 'lookup' : view.name

  const navButtons = (variant: 'side' | 'bottom' | 'top') =>
    tabs.map((tab) => {
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
          {tab.name === 'register' && pending > 0 ? (
            <span className="nav-badge" title={`${pending} paquetes sin guardar`}>
              {pending}
              <span className="sr-only"> sin guardar</span>
            </span>
          ) : null}
          {tab.name === 'tasks' && openTasks > 0 ? (
            <span className="nav-badge nav-badge-info" title={`${openTasks} tareas pendientes`}>
              {openTasks}
              <span className="sr-only"> pendientes</span>
            </span>
          ) : null}
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
          <small>Inventario</small>
          <strong>Solaluminios</strong>
        </div>
        <nav className="nav-side">{navButtons('side')}</nav>
        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">{initials(user?.name ?? '')}</span>
          <span className="sidebar-user-text">
            <strong>{user?.name}</strong>
            <small>{user ? ROLE_LABELS[user.role] : ''}</small>
          </span>
          <button type="button" className="icon-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={requestLogout}>
            <IconLogout />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <button type="button" className="topbar-brand" onClick={() => navigate({ name: 'home' })} aria-label="WeTracking · Ir al inicio">
          <BrandLogo className="topbar-logo" variant="minimal" tone="negative" title="WeTracking" />
          <BrandLogo className="topbar-mark" variant="mark" tone="negative" title="WeTracking" />
          <span className="topbar-client">
            <small>Inventario</small>
            <strong>Solaluminios</strong>
          </span>
        </button>
        <div className="topbar-user">
          <span className="topbar-user-text">
            <strong>{user?.name}</strong>
            <small>{user ? ROLE_LABELS[user.role] : ''}</small>
          </span>
          <span className="avatar" aria-hidden="true">{initials(user?.name ?? '')}</span>
          <button type="button" className="icon-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={requestLogout}>
            <IconLogout />
          </button>
        </div>
        <nav className="nav-top" aria-label="Secciones">{navButtons('top')}</nav>
      </header>

      <main className="content">
        {view.name === 'home' ? (
          <HomeView
            name={user?.name ?? ''}
            operator={operator}
            admin={user?.role === 'ADMIN'}
            pendingQueue={pending}
            openTasks={openTasks}
            navigate={navigate}
          />
        ) : null}
        {view.name === 'register' ? (
          <RegisterBundleView key={remountKey} initialEpc={view.epc} navigate={navigate} queue={queue} />
        ) : null}
        {view.name === 'lookup' ? <LookupView navigate={navigate} /> : null}
        {view.name === 'bundles' ? (
          <BundlesView key={remountKey} navigate={navigate} initialCatalog={view.catalog} />
        ) : null}
        {view.name === 'summary' ? <SummaryView navigate={navigate} /> : null}
        {view.name === 'tasks' ? <TasksView onChanged={reloadTaskSummary} /> : null}
        {view.name === 'admin' && user?.role === 'ADMIN' ? <AdminView /> : null}
        {view.name === 'bundle' ? <BundleDetailView key={view.id} id={view.id} navigate={navigate} /> : null}
      </main>

      <nav className="nav-bottom" aria-label="Secciones">{navButtons('bottom')}</nav>

      {logoutPrompt ? (
        <LogoutDialog
          pending={pending}
          canKeep={queue.status !== 'unavailable'}
          onCancel={() => setLogoutPrompt(false)}
          onReview={() => {
            setLogoutPrompt(false)
            navigate({ name: 'register' })
          }}
          onKeep={() => logout()}
          onDiscard={() => {
            queue.clear()
            logout()
          }}
        />
      ) : null}
    </div>
  )
}

export default App
