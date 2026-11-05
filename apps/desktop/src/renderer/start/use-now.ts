import { useEffect, useState } from "react"

/** The time, a minute at most behind, so "12 min ago" moves on while a page stays open. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}
