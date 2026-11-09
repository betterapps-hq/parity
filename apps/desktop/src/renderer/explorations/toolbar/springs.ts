/*
 * Springs for the toolbar warp: real spring physics, sampled into CSS easings and keyframes, so things overshoot and
 * settle the way they would in the world instead of along a fixed curve.
 */

interface Spring {
  stiffness: number
  damping: number
}

interface Simulated {
  /** How long it takes to settle, in milliseconds. */
  duration: number
  /** Where it is at evenly spaced moments, from 0 to 1, overshooting past 1 when it bounces. */
  points: number[]
}

/** A spring of unit mass let go at 0 and pulled toward 1, sampled until it settles. */
function simulate({ stiffness, damping }: Spring): Simulated {
  const natural = Math.sqrt(stiffness)
  const decay = damping / 2
  const ringing = Math.sqrt(Math.max(stiffness - decay ** 2, 0))

  const at = (time: number) =>
    ringing > 0
      ? 1 - Math.exp(-decay * time) * (Math.cos(ringing * time) + (decay / ringing) * Math.sin(ringing * time))
      : 1 - Math.exp(-natural * time) * (1 + natural * time)

  let settled = 0

  for (let time = 0; time <= 2; time += 1 / 240) {
    if (Math.abs(1 - at(time)) > 0.002) {
      settled = time
    }
  }

  const duration = settled + 1 / 60
  const steps = 64
  const points = Array.from({ length: steps + 1 }, (_, step) => (step === steps ? 1 : at((step / steps) * duration)))

  return { duration: duration * 1000, points }
}

/** A spring as a CSS easing, for transitions. */
export const asEasing = ({ points }: Simulated) => `linear(${points.map((point) => point.toFixed(4)).join(", ")})`

/** Keyframes along a spring, each made from how far along it is, for animating more than one value on it. */
export const along = ({ points }: Simulated, frame: (progress: number) => Keyframe): Keyframe[] =>
  points.map((progress, step) => ({ ...frame(progress), offset: step / (points.length - 1) }))

export const springs = {
  /** The bar's width: quick, with a small overshoot. */
  width: simulate({ stiffness: 300, damping: 22 }),
  /** Each button bursting in: bouncier, so it lands with a bounce. */
  pop: simulate({ stiffness: 420, damping: 17 }),
  /** The bar landing: loose, so it wobbles like jelly. */
  jelly: simulate({ stiffness: 520, damping: 13 })
}

/** Whether someone asked for less motion, which swaps the warp for a plain cross-fade. */
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Plays a spring on an element as it's added, if motion's welcome. */
export const springIn = (frame: (progress: number) => Keyframe) => (node: HTMLElement | null) => {
  if (node && !reducedMotion()) {
    node.animate(along(springs.pop, frame), { duration: springs.pop.duration })
  }
}
