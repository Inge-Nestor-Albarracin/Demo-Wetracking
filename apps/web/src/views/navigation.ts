export type View =
  | { name: 'register'; epc?: string }
  | { name: 'lookup' }
  | { name: 'bundles' }
  | { name: 'summary' }
  | { name: 'bundle'; id: string }

export type Navigate = (view: View) => void
