import { useId, type ReactNode } from 'react'
import { IconChevron } from '../components/icons'
import type { Navigate, View } from './navigation'

type Section = Exclude<View['name'], 'asset' | 'home'>

interface Tile {
  name: Section
  title: string
  subtitle: string
  icon: (stroke: string) => ReactNode
}

// Tile icons in the app-design style: thin line drawings in the brand
// aqua → cyan gradient (white on the highlighted tile).
const TILE_ICONS: Record<Section, (stroke: string) => ReactNode> = {
  register: (s) => (
    <g stroke={s}>
      <rect x="14" y="6" width="22" height="38" rx="4" />
      <path d="M21 39h8" />
      <path d="M19 17h12M19 22h7" />
      <path d="M37 13a7 7 0 0 1 0 9M40.5 10a12 12 0 0 1 0 15" />
    </g>
  ),
  lookup: (s) => (
    <g stroke={s}>
      <circle cx="21" cy="21" r="13" />
      <path d="m30.5 30.5 11 11" strokeWidth="2.6" />
      <path d="M15 21a6 6 0 0 1 12 0M18 21a3 3 0 0 1 6 0M21 21v6M12 21a9 9 0 0 1 18 0" />
    </g>
  ),
  bulk: (s) => (
    <g stroke={s}>
      <rect x="6" y="10" width="12" height="28" rx="3" />
      <path d="M10 33h4" />
      <path d="M22 16a10 10 0 0 1 0 16M27 12a16 16 0 0 1 0 24" />
      <path d="M33 14h9M33 20h9M35 26h7M33 32h9" />
    </g>
  ),
  assets: (s) => (
    <g stroke={s}>
      <path d="M7 41h34" />
      <rect x="10" y="24" width="6" height="13" rx="1.5" />
      <rect x="21" y="12" width="6" height="25" rx="1.5" />
      <rect x="32" y="19" width="6" height="18" rx="1.5" />
      <path d="m9 15 9-6 8 4 12-7" />
    </g>
  ),
  admin: (s) => (
    <g stroke={s}>
      <circle cx="24" cy="24" r="6" />
      <path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M11.3 36.7l3.5-3.5M33.2 14.8l3.5-3.5" />
      <circle cx="24" cy="24" r="13" />
    </g>
  ),
}

export function HomeView({
  name,
  operator,
  admin,
  navigate,
}: {
  name: string
  operator: boolean
  admin: boolean
  navigate: Navigate
}) {
  const gradient = `tile-${useId().replace(/:/g, '')}`
  const tiles: Tile[] = [
    ...(operator
      ? [{ name: 'register' as const, title: 'Registrar activo', subtitle: 'Asociar un EPC a un objeto', icon: TILE_ICONS.register }]
      : []),
    { name: 'bulk', title: 'Lectura masiva', subtitle: 'Muchas etiquetas a la vez', icon: TILE_ICONS.bulk },
    { name: 'assets', title: 'Activos y resumen', subtitle: 'Listado, filtros y totales', icon: TILE_ICONS.assets },
    { name: 'lookup', title: 'Consultar', subtitle: 'Buscar por EPC', icon: TILE_ICONS.lookup },
    ...(admin ? [{ name: 'admin' as const, title: 'Usuarios', subtitle: 'Cuentas y roles', icon: TILE_ICONS.admin }] : []),
  ]
  const firstName = name.trim().split(/\s+/)[0] ?? ''

  return (
    <div className="home">
      <header className="home-greeting">
        <h1>
          <span>¡Hola!</span> {firstName}
        </h1>
        <p>¿Qué quieres hacer hoy?</p>
      </header>

      <section className="home-banner" aria-label="Empresa">
        <span className="home-banner-pill home-banner-pill-1" aria-hidden="true" />
        <span className="home-banner-pill home-banner-pill-2" aria-hidden="true" />
        <small>Identificación de objetos con RFID</small>
        <strong>RFID Demo</strong>
      </section>

      <svg width="0" height="0" className="sr-only" aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#00FFD7" />
            <stop offset="1" stopColor="#00A5D7" />
          </linearGradient>
        </defs>
      </svg>

      <nav className="home-tiles" aria-label="Accesos">
        {tiles.map((tile) => (
          <button key={tile.name} type="button" className="home-tile" onClick={() => navigate({ name: tile.name })}>
            <svg className="home-tile-icon" viewBox="0 0 48 48" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <g className="tile-art-color">{tile.icon(`url(#${gradient})`)}</g>
              <g className="tile-art-white">{tile.icon('#ffffff')}</g>
            </svg>
            <span className="home-tile-text">
              <strong className="home-tile-title">{tile.title}</strong>
              <small>{tile.subtitle}</small>
            </span>
            <IconChevron className="home-tile-chevron" />
          </button>
        ))}
      </nav>
    </div>
  )
}
