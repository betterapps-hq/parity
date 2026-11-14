import type { CanvasDocument, CodeDesignSettings, ContainerSpec } from "@parity-app/core"
import { codeDesignSettings, sameValue, withCodeDesignSettings } from "@parity-app/editor"
import type { DesignStore } from "../design-store.ts"
import { storyScreensFile } from "./story-screens.ts"

type Drawn = readonly { path: string; document: CanvasDocument }[]

/**
 * The designs drawn from the project's code (its pages, component boards and stories) with what the person had set on
 * them, as the project file keeps it (`codeDesigns`): what each shows, and a story's tried sizes.
 */
export function withCodeDesigns(drawn: Drawn, saved: CanvasDocument["codeDesigns"]): Drawn {
  if (!saved) {
    return drawn
  }

  return drawn.map(({ path, document }) => ({
    path,
    document: {
      ...document,
      containers: document.containers.map((design) => withCodeDesignSettings(design, saved[`${path}#${design.id}`]))
    }
  }))
}

/**
 * Keeps what's set on the designs drawn from code in the project file, as it changes: those designs are drawn again each
 * time the project opens, so it's the only place it lasts. Only a story keeps its tried sizes, since a page's and a
 * board's layers are drawn afresh, and a design missing for now, such as a story whose file fails, keeps what it had.
 */
export function keepCodeDesigns(store: DesignStore, drawn: Drawn): void {
  const paths = new Set(drawn.map(({ path }) => path))

  const asDrawn = new Map<string, ContainerSpec>(
    drawn.flatMap(({ path, document }) =>
      document.containers.map((design) => [`${path}#${design.id}`, design] as const)
    )
  )

  const read = new WeakMap<ContainerSpec, CodeDesignSettings | undefined>()

  const settingsOf = (key: string, path: string, design: ContainerSpec) => {
    const was = asDrawn.get(key)

    if (!was) {
      return undefined
    }

    if (!read.has(design)) {
      read.set(design, codeDesignSettings(path === storyScreensFile ? design : { ...design, root: was.root }, was))
    }

    return read.get(design)
  }

  const keep = () => {
    const main = store.getDocuments().find(({ path }) => path === store.mainPath)?.document

    if (!main) {
      return
    }

    const kept: NonNullable<CanvasDocument["codeDesigns"]> = { ...main.codeDesigns }

    for (const { key, path, container } of store.getEntries()) {
      if (!paths.has(path)) {
        continue
      }

      const settings = settingsOf(key, path, container)

      if (settings) {
        kept[key] = settings
      } else {
        delete kept[key]
      }
    }

    if (sameValue(kept, main.codeDesigns ?? {})) {
      return
    }

    const next: CanvasDocument = { ...main, codeDesigns: kept }

    if (Object.keys(kept).length === 0) {
      delete next.codeDesigns
    }

    store.change(
      "Keep what's shown",
      (snapshot) => ({ ...snapshot, documents: new Map(snapshot.documents).set(store.mainPath, next) }),
      { history: false }
    )
  }

  store.subscribe(keep)
}
