// Administrative status of a registered asset.
export function AssetStatus({ active }: { active: boolean }) {
  return active ? <span className="badge badge-success">Activo</span> : <span className="badge badge-muted">Inactivo</span>
}
