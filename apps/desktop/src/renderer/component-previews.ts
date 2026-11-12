import {
  frameViewport,
  nextPreview,
  previewMode,
  previewSettleMs,
  type RenderNode,
  resolveModes
} from "@parity-app/core"
import { componentPreviewTree, type PreviewContext, previewFrameWidth } from "@parity-app/editor"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { ComponentPreview, PreviewImage, PreviewJob } from "../shared/protocol.ts"
import { renderJob } from "../shared/render-job.ts"
import { bitmapsWaiting } from "./canvas/frame-bitmaps.ts"
import { projectPart } from "./project-part.ts"
import { request } from "./service.ts"
import { getResolvedTheme, type ResolvedTheme, subscribeResolvedTheme } from "./theme.ts"
import { type ProjectSession, workspace } from "./workspace.ts"

/**
 * Component previews in the window (PAR-207): which components have a picture made for their code, which are waiting,
 * and the pass that asks the service to make the rest. The pictures are files the window shows as plain images; it
 * keeps only their addresses. No panel mounts a component.
 */

/** Drawn at twice their size, so they're sharp on a 2x screen at the sizes they're shown. */
const previewScale = 2

/** How many previews one lookup asks about, so a project with hundreds of components isn't one large message. */
const lookupBatch = 50

/** How long after something changes the previews are looked up again, so a burst of changes is one lookup. */
const refreshMs = 300

/** Where a component's preview is. */
export type PreviewState =
  /** Not made for its code yet; `last` is the one made for older code, shown dimmed until it is. */
  | { state: "waiting"; last?: PreviewImage }
  | { state: "making"; last?: PreviewImage }
  | { state: "made"; image: PreviewImage }
  | { state: "failed"; error: string }
  /** Drawn, open, but with nothing to see: a provider or wrapper, or a part with nothing in it (PAR-517). */
  | { state: "empty" }

/**
 * The job that draws a component's preview: what inserting it would place, drawn open (see `componentPreviewTree`), in
 * the project's mode that matches Parity's light or dark theme (`previewMode`, PAR-521), at its own width up to the
 * preview's, in a window the mode's width, at `previewScale`, with what it portals out of the frame drawn inside it
 * (PAR-517). The mode is in the preview's key, so each theme's picture is kept apart and switching back shows the one
 * kept. Unsaved token previews aren't drawn, so trying a token re-makes nothing.
 */
export function previewJob(
  session: ProjectSession,
  component: string,
  appearance: ResolvedTheme = getResolvedTheme(),
  variant?: Variant
): PreviewJob | undefined {
  return treePreviewJob(
    session,
    variant ? variantId(component, variant) : component,
    (viewport) => {
      const context: PreviewContext = {
        sources: session.info.sources,
        library: session.store.getComponentLibrary(),
        viewport
      }

      const info = session.components.get()[component]

      if (info) {
        context.info = info
      }

      if (variant) {
        context.props = { [variant.prop]: variant.value }
      }

      return componentPreviewTree(component, context)
    },
    appearance
  )
}

/**
 * The job that draws any preview tree, kept under `id`, as a component's is drawn: in the mode matching Parity's theme,
 * in a window the mode's width, at `previewScale`. `tree` is given the mode's viewport option.
 */
export function treePreviewJob(
  session: ProjectSession,
  id: string,
  tree: (viewport: string) => RenderNode[],
  appearance: ResolvedTheme = getResolvedTheme()
): PreviewJob | undefined {
  const mode = previewMode(resolveModes(session.store.getModes()), appearance)

  if (!mode) {
    return undefined
  }

  const viewport = frameViewport({ width: mode.width }, mode)

  return {
    component: id,
    job: renderJob(
      session.added
        ? {
            projectId: session.id,
            guestUrl: session.info.guestUrl,
            components: session.added,
            theme: session.info.theme
          }
        : { projectId: session.id, guestUrl: session.info.guestUrl, theme: session.info.theme },
      {
        tree: tree(mode.viewport),
        mode,
        frame: { width: previewFrameWidth, viewport },
        scale: previewScale,
        inlinePortals: true
      }
    )
  }
}

/** A one-off preview as it shows: its image or why there's none, for the job it was made for. */
interface ShownPreview {
  key: string
  image?: PreviewImage
  error?: string
}

/**
 * A picture drawn on demand while `job` is given, as a slot's is while its card is open: one already made for its key is
 * looked up, else it's made straight away. Undefined until it's there; an error says why it couldn't be.
 */
export function useOneOffPreview(job: PreviewJob | undefined): { image?: PreviewImage; error?: string } | undefined {
  const [shown, setShown] = useState<ShownPreview>()
  const want = job ? JSON.stringify(job) : undefined
  useEffect(() => {
    if (!want) {
      return undefined
    }

    // SAFETY: `want` is this job as JSON, made above.
    const asked: PreviewJob = JSON.parse(want) as PreviewJob
    let live = true
    void (async () => {
      try {
        const { previews } = await request("previews.lookup", { previews: [asked] })
        const found = previews[0]
        const made = found?.image ? found : await request("previews.make", { preview: asked, priority: "visible" })

        if (!live) {
          return
        }

        const next: ShownPreview = { key: want }

        if (made.image) {
          next.image = made.image
        }

        if (made.error) {
          next.error = made.error
        }

        if (made.empty) {
          next.error = "Nothing to see"
        }

        setShown(next)
      } catch (reason) {
        if (live) {
          setShown({ key: want, error: reason instanceof Error ? reason.message : String(reason) })
        }
      }
    })()

    return () => {
      live = false
    }
  }, [want])

  return shown?.key === want ? shown : undefined
}

/** One option of a component's variant, as its card shows it (PAR-208). */
export interface Variant {
  prop: string
  value: string | number | boolean
}

/**
 * The name a variant's preview is kept under, beside its component's in the project's index: the component, then the
 * prop and value, as `Button?variant=outline`. Component names have no `?`.
 */
export function variantId(component: string, { prop, value }: Variant): string {
  return `${component}?${prop}=${String(value)}`
}

interface Entry {
  key?: string
  preview: PreviewState
}

/** One project's previews, while its tab is open. */
class ProjectPreviews {
  /** Once its tab has closed: nothing is made or kept after. */
  private disposed = false
  private readonly entries = new Map<string, Entry>()
  private readonly onScreen = new Map<string, number>()
  /** Variants a card has asked for, by their id, made on demand and kept while the tab is open. */
  private readonly variants = new Map<string, { component: string; variant: Variant }>()
  private readonly listeners = new Set<() => void>()
  /** Ones whose making didn't finish, as when the offscreen window closed under it: tried again after a refresh. */
  private readonly skipped = new Set<string>()
  private readonly stops: (() => void)[] = []
  private lastActivity = performance.now()
  private timer: ReturnType<typeof setTimeout> | undefined
  private refreshTimer: ReturnType<typeof setTimeout> | undefined
  private making = false
  private refreshing: Promise<void> | undefined
  private refreshAgain = false
  private stopped = false
  /** What the previews were last looked up for, so another change to the session, as its canvas mounting, doesn't. */
  private lookedUpFor: readonly unknown[] = []

  constructor(private readonly session: ProjectSession) {}

  start(): void {
    if (this.disposed) {
      return
    }

    this.stop()
    this.stopped = false
    this.lookedUpFor = []

    const active = () => {
      this.lastActivity = performance.now()
    }

    const events = ["pointerdown", "pointermove", "keydown", "wheel", "dragstart"] as const

    for (const event of events) {
      window.addEventListener(event, active, { capture: true, passive: true })
    }

    this.stops.push(() => {
      for (const event of events) {
        window.removeEventListener(event, active, { capture: true })
      }
    })
    // An edit, the person's or an agent's, counts as working.
    this.stops.push(this.session.store.subscribe(active))
    this.stops.push(this.session.components.subscribe(() => this.refreshSoon()))
    // A new guest, new sources or newly added components.
    this.stops.push(this.session.subscribe(() => this.refreshSoon()))
    // Previews are drawn in the mode matching Parity's light or dark theme, so a new theme looks them up again.
    this.stops.push(subscribeResolvedTheme(() => this.refreshSoon()))
    this.refreshSoon()
  }

  stop(): void {
    this.stopped = true

    for (const stop of this.stops.splice(0)) {
      stop()
    }

    clearTimeout(this.timer)
    clearTimeout(this.refreshTimer)
  }

  /** Stops for good as the tab closes, forgetting every preview it kept. */
  dispose(): void {
    this.stop()
    this.disposed = true
    this.entries.clear()
    this.onScreen.clear()
    this.variants.clear()
    this.skipped.clear()
    this.listeners.clear()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  get(component: string): PreviewState | undefined {
    return this.entries.get(component)?.preview
  }

  /** Marks a component's preview as on screen, until the function it gives is called. */
  show(component: string): () => void {
    this.onScreen.set(component, (this.onScreen.get(component) ?? 0) + 1)
    this.schedule(0)

    return () => {
      const count = (this.onScreen.get(component) ?? 1) - 1

      if (count > 0) {
        this.onScreen.set(component, count)
      } else {
        this.onScreen.delete(component)
      }
    }
  }

  /**
   * Shows a component's variants on its card: each is looked up, then made before anything off screen, until the
   * function it gives is called. The ones asked for are kept, and looked up again with the rest.
   */
  showVariants(component: string, variants: readonly Variant[]): () => void {
    const added = variants.flatMap((variant) => {
      const id = variantId(component, variant)

      if (this.variants.has(id)) {
        return []
      }

      this.variants.set(id, { component, variant })

      return [id]
    })

    const hides = variants.map((variant) => this.show(variantId(component, variant)))

    if (added.length > 0 && !this.disposed) {
      void this.lookUp(added)
    }

    return () => {
      for (const hide of hides) {
        hide()
      }
    }
  }

  /** Every preview the window keeps: each component the Components panel lists, in its order, then variants asked for. */
  private components(): string[] {
    return [...Object.keys(this.session.info.sources), ...this.variants.keys()]
  }

  /** The job that draws a preview by its id, a component's or a variant's. */
  private jobFor(id: string): PreviewJob | undefined {
    const asked = this.variants.get(id)

    return asked ? previewJob(this.session, asked.component, undefined, asked.variant) : previewJob(this.session, id)
  }

  /** Looks some previews up straight away, outside a refresh, as a card's variants are when it opens. */
  private async lookUp(ids: string[]): Promise<void> {
    const jobs = ids.flatMap((id) => this.jobFor(id) ?? [])

    try {
      const { previews } = await request("previews.lookup", { previews: jobs })

      if (this.disposed) {
        return
      }

      for (const preview of previews) {
        if (!this.entries.has(preview.component)) {
          this.apply(preview)
        }
      }

      this.notify()
      this.schedule(0)
    } catch {
      // Looked up again with the rest at the next refresh.
    }
  }

  /** Counts changes, so a view showing several previews can tell when any of them changed. */
  version = 0

  private notify(): void {
    this.version += 1

    for (const listener of this.listeners) {
      listener()
    }
  }

  /**
   * Looks the previews up again once what they're drawn from has changed: the code, the theme, the components, or
   * Parity's own light or dark theme, which picks their mode.
   */
  private refreshSoon(): void {
    const { session } = this

    if (this.stopped) {
      return
    }

    const drawnFrom = [
      session.info.guestUrl,
      getResolvedTheme(),
      session.info.theme,
      session.info.sources,
      session.added,
      session.components.get(),
      session.store.getModes(),
      session.store.getComponentLibrary()
    ]

    if (drawnFrom.every((value, index) => value === this.lookedUpFor[index])) {
      return
    }

    clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => {
      this.lookedUpFor = drawnFrom
      void this.refresh()
    }, refreshMs)
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) {
      this.refreshAgain = true

      return
    }

    this.skipped.clear()

    const run = async () => {
      const jobs = this.components().flatMap((id) => this.jobFor(id) ?? [])

      for (let start = 0; start < jobs.length; start += lookupBatch) {
        const { previews } = await request("previews.lookup", {
          previews: jobs.slice(start, start + lookupBatch)
        })

        if (this.disposed) {
          return
        }

        for (const preview of previews) {
          this.apply(preview)
        }

        this.notify()
      }

      const listed = new Set(this.components())

      for (const component of this.entries.keys()) {
        if (!listed.has(component)) {
          this.entries.delete(component)
        }
      }
    }

    this.refreshing = run()
      .catch(() => undefined)
      .finally(() => {
        this.refreshing = undefined

        if (this.refreshAgain) {
          this.refreshAgain = false
          void this.refresh()
        } else {
          this.schedule(0)
        }
      })
    await this.refreshing
  }

  /** What the service says of a preview, for the key it has now. */
  private apply(preview: ComponentPreview): void {
    this.entries.set(preview.component, { key: preview.key, preview: this.stateOf(preview) })
  }

  private stateOf(preview: ComponentPreview): PreviewState {
    if (preview.image) {
      return { state: "made", image: preview.image }
    }

    if (preview.error) {
      return { state: "failed", error: preview.error }
    }

    if (preview.empty) {
      return { state: "empty" }
    }

    // The picture shown before, for older code, until this code's is made.
    const before = this.entries.get(preview.component)?.preview
    let shown: PreviewImage | undefined

    if (before?.state === "made") {
      shown = before.image
    } else if (before?.state === "waiting" || before?.state === "making") {
      shown = before.last
    }

    const last = preview.last ?? shown

    return last ? { state: "waiting", last } : { state: "waiting" }
  }

  private schedule(ms: number): void {
    if (this.stopped || this.making) {
      return
    }

    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.step(), ms)
  }

  /**
   * Makes the next preview `nextPreview` picks, then asks again. The canvas comes first: nothing is made while the tab
   * isn't the one shown, its canvas isn't up or a frame on it waits for its bitmap.
   */
  private async step(): Promise<void> {
    this.timer = undefined

    if (this.stopped || this.making || this.refreshing) {
      return
    }

    const settled = !!this.session.editor && workspace.getActive()?.session === this.session && bitmapsWaiting() === 0

    const needed = this.components().flatMap((component) => {
      const entry = this.entries.get(component)

      if (entry?.preview.state !== "waiting" || this.skipped.has(component)) {
        return []
      }

      return [{ component, visible: this.onScreen.has(component) }]
    })

    const next = nextPreview({ canvasSettled: settled, idleFor: performance.now() - this.lastActivity, needed })

    if (!next) {
      return
    }

    if ("wait" in next) {
      this.schedule(settled ? next.wait : previewSettleMs)

      return
    }

    const preview = this.jobFor(next.make)
    const entry = this.entries.get(next.make)

    if (!preview || !entry || entry.preview.state !== "waiting") {
      return
    }

    const waiting = entry.preview
    this.entries.set(next.make, { ...entry, preview: { ...waiting, state: "making" } })
    this.notify()
    this.making = true

    try {
      const made = await request("previews.make", { preview, priority: next.priority })

      if (this.disposed) {
        return
      }

      // Looked up again meanwhile, for newer code: this one's out of date, and stays waiting for its new key.
      if (this.entries.get(next.make)?.key === made.key) {
        this.apply(made)
      } else if (this.entries.get(next.make)?.preview.state === "making") {
        this.entries.set(next.make, entry)
      }
    } catch {
      this.skipped.add(next.make)

      if (this.entries.get(next.make)?.preview.state === "making") {
        this.entries.set(next.make, entry)
      }
    } finally {
      this.making = false
      this.notify()
      this.schedule(0)
    }
  }
}

/** A project's previews, made the first time they're asked for and dropped when its tab closes. */
export const previewsOf = projectPart((session: ProjectSession) => new ProjectPreviews(session))

/** Starts making a project's previews while its tab is open; the function it gives stops them. */
export function startPreviews(session: ProjectSession): () => void {
  const previews = previewsOf(session)
  previews.start()

  return () => previews.stop()
}

/** A component's preview, as it is now. */
export function useComponentPreview(session: ProjectSession, component: string): PreviewState | undefined {
  const previews = previewsOf(session)

  return useSyncExternalStore(previews.subscribe, () => previews.get(component))
}

/**
 * The previews of a component's variants while `shown`, as its card shows them, made on demand: a card that never opens
 * makes none (PAR-208).
 */
export function useVariantPreviews(
  session: ProjectSession,
  component: string,
  variants: readonly Variant[],
  shown: boolean
): (PreviewState | undefined)[] {
  const previews = previewsOf(session)
  const ids = variants.map((variant) => variantId(component, variant))
  // The variants are asked for again only when they change, not when a new array of the same ones comes.
  const key = ids.join(" ")
  const asked = useRef(variants)
  useEffect(() => {
    asked.current = variants
  })
  useEffect(() => {
    if (!shown || key === "") {
      return undefined
    }

    return previews.showVariants(component, asked.current)
  }, [previews, component, key, shown])
  useSyncExternalStore(previews.subscribe, () => previews.version)

  return ids.map((id) => previews.get(id))
}

/**
 * A ref for the element that stands for a component, such as its row: while the element is on screen, the component's
 * preview is made before the ones nobody can see. Nothing for no component.
 */
export function usePreviewOnScreen(
  session: ProjectSession,
  component: string | undefined
): (element: Element | null) => void {
  const [element, setElement] = useState<Element | null>(null)
  useEffect(() => {
    if (!element || component === undefined) {
      return
    }

    const previews = previewsOf(session)
    let hide: (() => void) | undefined

    const observer = new IntersectionObserver(([seen]) => {
      if (seen?.isIntersecting) {
        hide ??= previews.show(component)
      } else {
        hide?.()
        hide = undefined
      }
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
      hide?.()
    }
  }, [element, session, component])

  return setElement
}
