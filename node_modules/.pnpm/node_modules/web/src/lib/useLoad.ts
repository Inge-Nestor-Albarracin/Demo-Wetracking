import { useCallback, useEffect, useState } from 'react'
import { describeError } from '../api/client'
import { useSession } from '../session/session-context'

export interface LoadState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

interface Result<T> {
  key: string
  data: T | null
  error: string | null
}

// Loads a GET path; a null path means "nothing to load yet". While a new
// path loads, the previous data stays visible and `loading` is true.
export function useLoad<T>(path: string | null): LoadState<T> {
  const { request } = useSession()
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<Result<T> | null>(null)
  const key = path === null ? null : `${version}:${path}`

  useEffect(() => {
    if (path === null || key === null) return
    const controller = new AbortController()
    request<T>(path, { signal: controller.signal })
      .then(({ data }) => setResult({ key, data, error: null }))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setResult({ key, data: null, error: describeError(err) })
      })
    return () => controller.abort()
  }, [path, key, request])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const current = result !== null && result.key === key
  return {
    data: key === null ? null : (result?.data ?? null),
    error: current ? result.error : null,
    loading: key !== null && !current,
    reload,
  }
}

export function queryString(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
