import { useState } from 'react'
import { FamiliesAdmin } from '../components/admin/FamiliesAdmin'
import { ReferencesAdmin } from '../components/admin/ReferencesAdmin'
import { UsersAdmin } from '../components/admin/UsersAdmin'
import { PageHeader } from '../components/ui'

type Section = 'families' | 'references' | 'users'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'families', label: 'Familias' },
  { id: 'references', label: 'Referencias' },
  { id: 'users', label: 'Usuarios' },
]

// ADMIN only (the menu hides it for other roles and the API enforces it).
export function AdminView() {
  const [section, setSection] = useState<Section>('families')

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Catálogo y usuarios"
        description="Crea y mantén las familias y referencias del catálogo, y gestiona quién accede a la aplicación y con qué rol."
      />
      <div className="tabs admin-tabs" role="tablist">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            className={section === item.id ? 'tab active' : 'tab'}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {section === 'families' ? <FamiliesAdmin /> : null}
      {section === 'references' ? <ReferencesAdmin /> : null}
      {section === 'users' ? <UsersAdmin /> : null}
    </>
  )
}
