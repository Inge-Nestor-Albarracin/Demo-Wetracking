import { useCallback, useRef, useState } from 'react'
import { describeError } from '../api/client'

// Runs one write at a time: the ref blocks a second click before React
// re-renders with `pending`. Returns true when the action succeeded.
export function useMutation() {
  const lock = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (lock.current) return false
    lock.current = true
    setPending(true)
    setError(null)
    try {
      await action()
      return true
    } catch (err) {
      setError(describeError(err))
      return false
    } finally {
      lock.current = false
      setPending(false)
    }
  }, [])

  return { pending, error, setError, run }
}
