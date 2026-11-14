import type { ProjectNodes } from "@parity-app/core"
import {
  createEditSettler,
  createNodeCollector,
  createNodeIndex,
  type EditSettler,
  type NodeIndex
} from "@parity-app/editor"
import type { ProjectSession } from "./workspace.ts"

interface Kept {
  index: NodeIndex
  settler: EditSettler
}

const indexes = new WeakMap<ProjectSession, Kept>()

/**
 * The project's nodes, by one address each (docs/proposals/adapter-registrations.md): its designs and their layers, its
 * components, its routes and its stories. Kept for the session and updated in place once edits to its designs or a
 * change to its info settle: after a pause, or as soon as a drag or another gesture ends. Only the nodes an edit
 * touched are compared, and watchers and subscribers are told what changed once per settled edit. `fresh` catches it up
 * first, for a reader that's about to show what's there, as Search does when it opens.
 */
export function projectNodes(session: ProjectSession, options?: { fresh?: boolean }): ProjectNodes {
  const kept = indexes.get(session) ?? keep(session)

  if (options?.fresh) {
    kept.settler.flush()
  }

  return kept.index
}

function keep(session: ProjectSession): Kept {
  const collect = createNodeCollector()
  const index = createNodeIndex()
  const catchUp = () => index.update(collect(sources(session)))
  const settler = createEditSettler(catchUp)

  catchUp()
  settler.gesture(session.store.inGesture())

  const edited = () => settler.edited()
  const stopDesigns = session.store.subscribe(edited)
  const stopInfo = session.subscribe(edited)
  const stopGestures = session.store.subscribeGestures(() => settler.gesture(session.store.inGesture()))

  session.untilClosed(() => {
    settler.stop()
    stopDesigns()
    stopInfo()
    stopGestures()
  })

  const kept = { index, settler }
  indexes.set(session, kept)

  return kept
}

function sources(session: ProjectSession) {
  const { info } = session

  return {
    designs: session.store.getEntries(),
    components: { owner: info.renderer.id, sources: info.sources },
    routes: info.router ? { owner: info.router.id, routes: info.routes } : undefined,
    screens: info.entities.screens
  }
}
