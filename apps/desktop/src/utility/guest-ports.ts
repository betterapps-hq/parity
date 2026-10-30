import type { WindowMethods } from "../shared/protocol.ts"

export type GuestMoved = WindowMethods["project.guestMoved"]["params"]

/** How to find ports: one the system hands out now, and whether a given one is free. */
export interface PortFinder {
  free: () => Promise<number>
  isFree: (port: number) => Promise<boolean>
}

/**
 * A free port no guest has been served on. The windows keep the modules they loaded from each address, so a project
 * opened again never gets one of them, even one the system would hand out again.
 */
export async function newGuestPort(used: ReadonlySet<number>, ports: PortFinder): Promise<number> {
  for (;;) {
    const port = await ports.free()
    if (!used.has(port)) return port
  }
}

/**
 * The port a builder started again serves on: its last one when that's free, since the canvas it serves is still open
 * with those modules. Otherwise a new one, which like any reopen's is one no guest has used.
 */
export async function restartPort(
  last: number | undefined,
  used: ReadonlySet<number>,
  ports: PortFinder
): Promise<number> {
  if (last !== undefined && (await ports.isFree(last))) return last
  return newGuestPort(used, ports)
}

/**
 * Tells the windows where a project's guest is once its builder started again, when that isn't where they draw it, and
 * resolves where they draw it now: the new address once they say they loaded it, else still `drawn`, so the next
 * restart tells them again, even on the same port.
 */
export async function followGuest(
  projectId: string,
  drawn: string,
  now: string,
  tell: (moved: GuestMoved) => Promise<boolean>
): Promise<string> {
  const moved = guestMove(projectId, drawn, now)
  return moved && (await tell(moved)) ? now : drawn
}

/** What to tell the windows once a builder started again: where its guest is now, unless it's where it was. */
export function guestMove(projectId: string, before: string, after: string): GuestMoved | undefined {
  return before === after ? undefined : { projectId, guestUrl: after }
}
