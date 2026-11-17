/** A spare frame in a project's pool, as the window last heard from it. */
export interface PoolFrame {
  id: string
  /** Loading until its app has hydrated and its router can move it; ready after. */
  state: "loading" | "ready"
  /** The route it's on, or loading at. */
  route: string
}

/** What the pool's plan is made from. */
export interface PoolView {
  /** How many spares the setting asks for (`routeFrames.spares`); 0 turns them off. */
  spares: number
  /** Whether the window is focused; one that isn't keeps no spares. */
  focused: boolean
  /** The spares there are now, the live frame and the freezer aside. */
  frames: readonly PoolFrame[]
  /** The routes of the boards in view, nearest the middle first. */
  routes: readonly string[]
  /** Whether the app has a page router, so a spare can be moved; without one, spares load at the route they're for. */
  movable: boolean
  /** Where a new spare loads when it can be moved later: the app's root path. */
  root: string
}

/** Which spares to move where, which to open and which to close. */
export interface PoolPlan {
  /** Spares sent to another route by the app's router. */
  move: { frame: string; route: string }[]
  /** New spares, each loaded at its route. */
  open: { route: string }[]
  /** Spares to close. */
  close: string[]
}

/**
 * Which spares to move where, which to open and which to close. A spare already on a route in view stays. The others
 * that are ready move to the routes in view no spare is on, nearest the middle first, and new ones open to make up the
 * count, at the root when they can be moved later. Without a page router a spare can't move, so one on a route no longer
 * wanted is closed and a new one opens at the route it's for. A loading spare is left to finish, since a frame moves
 * only once its app has hydrated.
 */
export function planPool(pool: PoolView): PoolPlan {
  const wanted = pool.focused ? Math.max(0, pool.spares) : 0
  const plan: PoolPlan = { move: [], open: [], close: [] }
  const targets = pool.routes.filter((route, index) => pool.routes.indexOf(route) === index).slice(0, wanted)
  const covered = new Set<string>()
  const staying: PoolFrame[] = []
  const free: PoolFrame[] = []

  for (const frame of pool.frames) {
    if (targets.includes(frame.route) && !covered.has(frame.route)) {
      covered.add(frame.route)
      staying.push(frame)
    } else {
      free.push(frame)
    }
  }

  // Ready frames are the ones that can move now; loading ones are kept over closing them when there's room.
  const order = { ready: 0, loading: 1 }
  free.sort((a, b) => order[a.state] - order[b.state])
  const open = targets.filter((route) => !covered.has(route))
  let room = wanted - staying.length

  for (const frame of free) {
    if (room <= 0) {
      plan.close.push(frame.id)
      continue
    }

    room -= 1

    if (frame.state === "loading") {
      continue
    }

    const route = open.shift()

    if (route === undefined) {
      continue
    }

    if (pool.movable) {
      plan.move.push({ frame: frame.id, route })
    } else {
      plan.close.push(frame.id)
      plan.open.push({ route })
    }
  }

  for (; room > 0; room -= 1) {
    const route = open.shift()
    plan.open.push({ route: pool.movable ? pool.root : (route ?? pool.root) })
  }

  return plan
}
