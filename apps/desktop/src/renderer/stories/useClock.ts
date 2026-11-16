import { useEffect, useState } from "react"

/**
 * Milliseconds of play, a frame at a time, for the stories that move, starting at `start`. Paused, it holds where it
 * was. It only counts whole steps of `stepMs`, so what moves arrives in steps, as positions from a room do. It also
 * gives a way to set the time, for scrubbing.
 */
export function useClock(running: boolean, stepMs = 16, start = 0) {
  const [time, setTime] = useState(start)

  useEffect(() => {
    if (!running) {
      return undefined
    }

    let frame = 0
    let last = performance.now()
    let carried = 0

    const tick = (now: number) => {
      carried += now - last
      last = now

      if (carried >= stepMs) {
        const steps = Math.floor(carried / stepMs)

        carried -= steps * stepMs
        setTime((before) => before + steps * stepMs)
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [running, stepMs])

  return [time, setTime] as const
}
