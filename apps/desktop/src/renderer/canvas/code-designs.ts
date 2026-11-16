import type { CanvasDocument, CodeDesignSettings, ContainerSpec } from "@parity-app/core"
import {
  codeDesignSettings,
  sameValue,
  type ViewScope,
  withCodeDesignSettings,
  withPrunedView
} from "@parity-app/editor"
import { changeSnapshot, containerEntries, type ProjectDoc } from "@parity-app/multiplayer"
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
 * What's set on a design drawn from code, unlike `drawn`, as its code draws it: what it shows, and for a story its tried
 * sizes, since a page's and a board's layers are drawn afresh.
 */
function settingsFor(path: string, design: ContainerSpec, drawn: ContainerSpec): CodeDesignSettings | undefined {
  return codeDesignSettings(path === storyScreensFile ? design : { ...design, root: drawn.root }, drawn)
}

/** A design's key among the project's designs: its file and its id. */
function keyOf(path: string, design: ContainerSpec): string {
  return `${path}#${design.id}`
}

/** The designs drawn from code as the project opens, and what the project file keeps for them. */
interface OpenedCodeDesigns {
  designs: Drawn
  saved: CanvasDocument["codeDesigns"]
}

/**
 * The designs drawn from code as the project opens, with what the person had set on them, and the project file's record
 * of that with nothing stale left in it: each view names only what's still there (see `withPrunedView`), and an entry
 * for a design its file no longer draws is dropped, as a story file taken away, unless nothing of that file was drawn
 * this time, as when its tool couldn't be read.
 */
export function openCodeDesigns(
  drawn: Drawn,
  saved: CanvasDocument["codeDesigns"],
  scopeOf: (path: string, design: ContainerSpec) => ViewScope
): OpenedCodeDesigns {
  const designs = withCodeDesigns(drawn, saved).map(({ path, document }) => ({
    path,
    document: {
      ...document,
      containers: document.containers.map((design) => withPrunedView(design, scopeOf(path, design)))
    }
  }))

  const paths = new Set(drawn.map(({ path }) => path))
  const kept: NonNullable<CanvasDocument["codeDesigns"]> = {}

  for (const [key, settings] of Object.entries(saved ?? {})) {
    if (!paths.has(key.slice(0, key.indexOf("#")))) {
      kept[key] = settings
    }
  }

  drawn.forEach(({ path, document }, at) => {
    document.containers.forEach((was, index) => {
      const now = designs[at]?.document.containers[index]
      const settings = now && settingsFor(path, now, was)

      if (settings) {
        kept[keyOf(path, was)] = settings
      }
    })
  })

  return { designs, saved: Object.keys(kept).length > 0 ? kept : undefined }
}

/**
 * Keeps what's set on the designs drawn from code in the project file, as it changes: those designs are drawn again each
 * time the project opens, so it's the only place it lasts. Only a story keeps its tried sizes, since a page's and a
 * board's layers are drawn afresh, and a design missing for now, such as a story whose file fails, keeps what it had.
 * Gives back what takes designs drawn again while the project's open.
 */
export function keepCodeDesigns(doc: ProjectDoc, drawn: Drawn): (redrawn: Drawn) => void {
  const paths = new Set<string>()
  const asDrawn = new Map<string, ContainerSpec>()

  // Designs drawn again while the project's open, as its pages when a route's marked (PAR-1175), are compared with how
  // they're drawn then.
  const learn = (designs: Drawn) => {
    for (const { path, document } of designs) {
      paths.add(path)

      for (const design of document.containers) {
        asDrawn.set(keyOf(path, design), design)
      }
    }
  }

  learn(drawn)

  const read = new WeakMap<ContainerSpec, CodeDesignSettings | undefined>()

  const settingsOf = (key: string, path: string, design: ContainerSpec) => {
    const was = asDrawn.get(key)

    if (!was) {
      return undefined
    }

    if (!read.has(design)) {
      read.set(design, settingsFor(path, design, was))
    }

    return read.get(design)
  }

  const keep = () => {
    const main = doc.file(doc.main)

    if (!main) {
      return
    }

    const kept: NonNullable<CanvasDocument["codeDesigns"]> = { ...main.codeDesigns }

    for (const { key, path, container } of containerEntries(doc)) {
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

    changeSnapshot(
      doc,
      "Keep what's shown",
      (snapshot) => ({ ...snapshot, documents: new Map(snapshot.documents).set(doc.main, next) }),
      { undoable: false }
    )
  }

  doc.subscribe(() => keep())

  return learn
}
