/*
 * Springs for the interface's motion (PAR-795): real spring physics, sampled into CSS easings and keyframes, so things
 * overshoot and settle the way they would in the world instead of along a fixed curve.
 */

export interface Spring {
  stiffness: number
  damping: number
}

export interface Simulated {
  /** How long it takes to settle, in milliseconds. */
  duration: number
  /** Where it is at evenly spaced moments, from 0 to 1, overshooting past 1 when it bounces. */
  points: number[]
}

/** How close to 1 counts as settled. */
const rest = 0.002

/** The longest a spring is followed, in seconds. */
const longest = 2

/** A spring of unit mass let go at 0 and pulled toward 1, sampled until it settles. */
export function simulate({ stiffness, damping }: Spring): Simulated {
  const natural = Math.sqrt(stiffness)
  const decay = damping / 2
  const ringing = Math.sqrt(Math.max(stiffness - decay ** 2, 0))

  const at = (time: number) =>
    ringing > 0
      ? 1 - Math.exp(-decay * time) * (Math.cos(ringing * time) + (decay / ringing) * Math.sin(ringing * time))
      : 1 - Math.exp(-natural * time) * (1 + natural * time)

  let settled = 0

  for (let time = 0; time <= longest; time += 1 / 240) {
    if (Math.abs(1 - at(time)) > rest) {
      settled = time
    }
  }

  const duration = settled + 1 / 60
  const steps = 64
  const points = Array.from({ length: steps + 1 }, (_, step) => (step === steps ? 1 : at((step / steps) * duration)))

  return { duration: duration * 1000, points }
}

/** A spring as a CSS easing, for transitions. */
export function asEasing({ points }: Simulated): string {
  return `linear(${points.map((point) => point.toFixed(4)).join(", ")})`
}

/** Keyframes along a spring, each made from how far along it is, for animating more than one value on it. */
export function along({ points }: Simulated, frame: (progress: number) => Keyframe): Keyframe[] {
  return points.map((progress, step) => ({ ...frame(progress), offset: step / (points.length - 1) }))
}

export const springs = {
  /** A bar's width: quick, with a small overshoot. */
  width: simulate({ stiffness: 300, damping: 22 }),
  /** A button bursting in: bouncier, so it lands with a bounce. */
  pop: simulate({ stiffness: 420, damping: 17 }),
  /** A bar landing: loose, so it wobbles like jelly. */
  jelly: simulate({ stiffness: 520, damping: 13 })
}

/** Whether someone asked for less motion, which swaps springs for a plain cross-fade. */
export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** A ref that plays `frame` along the pop spring on an element as it's added, if motion's welcome. */
export function springIn(frame: (progress: number) => Keyframe) {
  return (element: HTMLElement | null) => {
    if (element && !reducedMotion()) {
      element.animate(along(springs.pop, frame), { duration: springs.pop.duration })
    }
  }
}
