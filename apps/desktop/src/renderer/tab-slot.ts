import type { ProjectSession } from "./workspace.ts"

/*
 * A project tab before and after its session exists (PAR-1267). Window modules start before the document opens, so the
 * extension that brings the room can say how it opens; what they subscribe to in the meantime starts once the session
 * does, and what reads the session finds nothing until then.
 */

/** A project tab, known by its project's id, whose session comes once its document has opened. */

/** What's started once the session opens, and how to stop it. */
interface Waiting {
  start: (session: ProjectSession) => () => void
  stop?: () => void
}

export class TabSlot {
  readonly id: string
  #session: ProjectSession | undefined
  #closed = false
  readonly #waiting = new Set<{ start: (session: ProjectSession) => () => void; stop?: () => void }>()

  constructor(id: string) {
    this.id = id
  }

  /** The tab's session, once its document has opened. */
  get session(): ProjectSession | undefined {
    return this.#session
  }

  /** Runs `start` with the session, now or once it opens, until the function it gives is called or the slot closes. */
  when(start: (session: ProjectSession) => () => void): () => void {
    if (this.#closed) {
      return () => undefined
    }

    const waiting: Waiting = { start }
    this.#waiting.add(waiting)

    if (this.#session) {
      waiting.stop = start(this.#session)
    }

    return () => {
      this.#waiting.delete(waiting)
      waiting.stop?.()
    }
  }

  /** The session opened: what waited for it starts. */
  open(session: ProjectSession): void {
    if (this.#closed || this.#session) {
      return
    }

    this.#session = session

    for (const waiting of this.#waiting) {
      waiting.stop = waiting.start(session)
    }
  }

  /** The tab closed: what started stops, and nothing starts again. */
  close(): void {
    this.#closed = true

    for (const waiting of this.#waiting) {
      waiting.stop?.()
    }

    this.#waiting.clear()
  }
}
