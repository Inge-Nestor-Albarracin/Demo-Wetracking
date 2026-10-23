import { UsersAdmin } from '../components/admin/UsersAdmin'
import { PageHeader } from '../components/ui'

// ADMIN only (the menu hides it for other roles and the API enforces it).
export function AdminView() {
  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Usuarios"
        description="Gestiona quién accede a la demo y con qué rol: Administrador u Operador."
      />
      <UsersAdmin />
    </>
  )
}
