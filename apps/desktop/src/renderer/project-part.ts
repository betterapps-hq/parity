import type { ProjectSession } from "./workspace.ts"

/** Something kept for one open project: a panel's state, say. `dispose` stops what it runs and lets go of what it holds. */
export interface ProjectPart {
  dispose?(): void
}

/**
 * Keeps a part of each open project's state with its session (PAR-1005): `make` makes it the first time it's asked for,
 * and it's disposed of when the session closes, as its tab closes or reopens. Asked for on a session that has closed
 * already, as a component drawing a closed tab can, it's made and disposed of straight away, then kept, so it's the
 * same part each time and runs nothing.
 */
export function projectPart<Session extends Pick<ProjectSession, "untilClosed">, Part extends ProjectPart>(
  make: (session: Session) => Part
): (session: Session) => Part {
  const parts = new WeakMap<Session, Part>()

  return (session) => {
    let part = parts.get(session)

    if (!part) {
      const made = make(session)
      part = made
      parts.set(session, made)
      session.untilClosed(() => made.dispose?.())
    }

    return part
  }
}
