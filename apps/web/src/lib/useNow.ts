import { useEffect, useState } from 'react'

// Current time that re-renders every `intervalMs`, so countdowns and
// deadline checks stay pure during render.
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
