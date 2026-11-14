import type { ProjectNodes } from "@parity-app/core"
import { collectNodes, createNodeIndex, type NodeIndex } from "@parity-app/editor"
import type { ProjectSession } from "./workspace.ts"

/** How long edits must pause before the index catches up, so a drag tells watchers once it rests, not every frame. */
const settle = 150

interface Kept {
  index: NodeIndex
  /** Brings the index up to date now, if edits are waiting to settle. */
  flush: () => void
}

const indexes = new WeakMap<ProjectSession, Kept>()

/**
 * The project's nodes, by one address each (docs/proposals/adapter-registrations.md): its designs and their layers, its
 * components, its routes and its stories. Kept for the session, and brought up to date once edits to its designs or a
 * change to its info settle; watchers and subscribers are told what changed then. `fresh` catches it up first, for a
 * reader that's about to show what's there, as Search does when it opens.
 */
export function projectNodes(session: ProjectSession, options?: { fresh?: boolean }): ProjectNodes {
  const kept = indexes.get(session) ?? keep(session)

  if (options?.fresh) {
    kept.flush()
  }

  return kept.index
}

function keep(session: ProjectSession): Kept {
  const index = createNodeIndex(gather(session))
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
      index.set(gather(session))
    }
  }

  const refresh = () => {
    clearTimeout(timer)
    timer = setTimeout(flush, settle)
  }

  const stopDesigns = session.store.subscribe(refresh)
  const stopInfo = session.subscribe(refresh)

  session.untilClosed(() => {
    clearTimeout(timer)
    stopDesigns()
    stopInfo()
  })

  const kept = { index, flush }
  indexes.set(session, kept)

  return kept
}

function gather(session: ProjectSession) {
  const { info } = session

  return collectNodes({
    designs: session.store.getEntries(),
    components: { owner: info.renderer.id, sources: info.sources },
    routes: info.router ? { owner: info.router.id, routes: info.routes } : undefined,
    screens: info.entities.screens
  })
}
