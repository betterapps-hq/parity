import { frameViewport, nextPreview, previewMode, previewSettleMs, resolveModes } from "@parity-app/core"
import { componentPreviewTree, previewFrameWidth } from "@parity-app/editor"
import { useEffect, useState, useSyncExternalStore } from "react"
import type { ComponentPreview, PreviewImage, PreviewJob } from "../shared/protocol.ts"
import { renderJobMode } from "../shared/render-job.ts"
import { bitmapsWaiting } from "./canvas/frame-bitmaps.ts"
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
  appearance: ResolvedTheme = getResolvedTheme()
): PreviewJob | undefined {
  const mode = previewMode(resolveModes(session.store.getModes()), appearance)
  if (!mode) return undefined
  const tree = componentPreviewTree(component, {
    ...(session.components.get()[component] ? { info: session.components.get()[component] } : {}),
    sources: session.info.sources,
    library: session.store.getComponentLibrary(),
    viewport: mode.viewport
  })
  const viewport = frameViewport({ width: mode.width }, mode)
  return {
    component,
    job: {
      projectId: session.id,
      guestUrl: session.info.guestUrl,
      ...(session.added ? { components: session.added } : {}),
      theme: session.info.theme,
      tree,
      mode: renderJobMode(mode, { width: previewFrameWidth, viewport }),
      scale: previewScale,
      inlinePortals: true
    }
  }
}

interface Entry {
  key?: string
  preview: PreviewState
}

/** One project's previews, while its tab is open. */
class ProjectPreviews {
  private readonly entries = new Map<string, Entry>()
  private readonly onScreen = new Map<string, number>()
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
  /** What the previews were last looked up for, so a change elsewhere in the workspace doesn't look them up again. */
  private lookedUpFor: readonly unknown[] = []

  constructor(readonly projectId: string) {}

  start(): void {
    this.stop()
    this.stopped = false
    this.lookedUpFor = []
    const active = () => {
      this.lastActivity = performance.now()
    }
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "dragstart"] as const
    for (const event of events) window.addEventListener(event, active, { capture: true, passive: true })
    this.stops.push(() => {
      for (const event of events) window.removeEventListener(event, active, { capture: true })
    })
    // An edit, the person's or an agent's, counts as working.
    const session = this.session()
    if (session) this.stops.push(session.store.subscribe(active))
    if (session) this.stops.push(session.components.subscribe(() => this.refreshSoon()))
    this.stops.push(workspace.subscribe(() => this.refreshSoon()))
    // Previews are drawn in the mode matching Parity's light or dark theme, so a new theme looks them up again.
    this.stops.push(subscribeResolvedTheme(() => this.refreshSoon()))
    this.refreshSoon()
  }

  stop(): void {
    this.stopped = true
    for (const stop of this.stops.splice(0)) stop()
    clearTimeout(this.timer)
    clearTimeout(this.refreshTimer)
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
      if (count > 0) this.onScreen.set(component, count)
      else this.onScreen.delete(component)
    }
  }

  private session(): ProjectSession | undefined {
    return workspace.getTabs().find((tab) => tab.session?.id === this.projectId)?.session
  }

  /** Every component the Components panel lists, in its order. */
  private components(session: ProjectSession): string[] {
    return Object.keys(session.info.sources)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  /**
   * Looks the previews up again once what they're drawn from has changed: the code, the theme, the components, or
   * Parity's own light or dark theme, which picks their mode.
   */
  private refreshSoon(): void {
    const session = this.session()
    if (!session || this.stopped) return
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
    if (drawnFrom.every((value, index) => value === this.lookedUpFor[index])) return
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
    const session = this.session()
    if (!session) return
    this.skipped.clear()
    const run = async () => {
      const jobs = this.components(session).flatMap((component) => previewJob(session, component) ?? [])
      for (let start = 0; start < jobs.length; start += lookupBatch) {
        const { previews } = await window.canvasHost.request("previews.lookup", {
          previews: jobs.slice(start, start + lookupBatch)
        })
        for (const preview of previews) this.apply(preview)
        this.notify()
      }
      const listed = new Set(this.components(session))
      for (const component of this.entries.keys()) if (!listed.has(component)) this.entries.delete(component)
    }
    this.refreshing = run()
      .catch(() => undefined)
      .finally(() => {
        this.refreshing = undefined
        if (this.refreshAgain) {
          this.refreshAgain = false
          void this.refresh()
        } else this.schedule(0)
      })
    await this.refreshing
  }

  /** What the service says of a preview, for the key it has now. */
  private apply(preview: ComponentPreview): void {
    this.entries.set(preview.component, { key: preview.key, preview: this.stateOf(preview) })
  }

  private stateOf(preview: ComponentPreview): PreviewState {
    if (preview.image) return { state: "made", image: preview.image }
    if (preview.error) return { state: "failed", error: preview.error }
    if (preview.empty) return { state: "empty" }
    // The picture shown before, for older code, until this code's is made.
    const before = this.entries.get(preview.component)?.preview
    let shown: PreviewImage | undefined
    if (before?.state === "made") shown = before.image
    else if (before?.state === "waiting" || before?.state === "making") shown = before.last
    const last = preview.last ?? shown
    return { state: "waiting", ...(last ? { last } : {}) }
  }

  private schedule(ms: number): void {
    if (this.stopped || this.making) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.step(), ms)
  }

  /**
   * Makes the next preview `nextPreview` picks, then asks again. The canvas comes first: nothing is made while the tab
   * isn't the one shown, its canvas isn't up or a frame on it waits for its bitmap.
   */
  private async step(): Promise<void> {
    this.timer = undefined
    const session = this.session()
    if (!session || this.stopped || this.making || this.refreshing) return
    const settled = !!session.editor && workspace.getActive()?.session?.id === this.projectId && bitmapsWaiting() === 0
    const needed = this.components(session).flatMap((component) => {
      const entry = this.entries.get(component)
      if (entry?.preview.state !== "waiting" || this.skipped.has(component)) return []
      return [{ component, visible: this.onScreen.has(component) }]
    })
    const next = nextPreview({ canvasSettled: settled, idleFor: performance.now() - this.lastActivity, needed })
    if (!next) return
    if ("wait" in next) {
      this.schedule(settled ? next.wait : previewSettleMs)
      return
    }
    const preview = previewJob(session, next.make)
    const entry = this.entries.get(next.make)
    if (!preview || !entry || entry.preview.state !== "waiting") return
    const waiting = entry.preview
    this.entries.set(next.make, { ...entry, preview: { ...waiting, state: "making" } })
    this.notify()
    this.making = true
    try {
      const made = await window.canvasHost.request("previews.make", { preview, priority: next.priority })
      // Looked up again meanwhile, for newer code: this one's out of date, and stays waiting for its new key.
      if (this.entries.get(next.make)?.key === made.key) this.apply(made)
      else if (this.entries.get(next.make)?.preview.state === "making") this.entries.set(next.make, entry)
    } catch {
      this.skipped.add(next.make)
      if (this.entries.get(next.make)?.preview.state === "making") this.entries.set(next.make, entry)
    } finally {
      this.making = false
      this.notify()
      this.schedule(0)
    }
  }
}

const projects = new Map<string, ProjectPreviews>()

/** A project's previews, made the first time they're asked for, and kept while the window is open: they're small. */
function previewsFor(projectId: string): ProjectPreviews {
  let previews = projects.get(projectId)
  if (!previews) {
    previews = new ProjectPreviews(projectId)
    projects.set(projectId, previews)
  }
  return previews
}

/** Starts making a project's previews while its tab is open; the function it gives stops them. */
export function startPreviews(projectId: string): () => void {
  const previews = previewsFor(projectId)
  previews.start()
  return () => previews.stop()
}

/** A component's preview, as it is now. */
export function useComponentPreview(projectId: string, component: string): PreviewState | undefined {
  const previews = previewsFor(projectId)
  return useSyncExternalStore(previews.subscribe, () => previews.get(component))
}

/**
 * A ref for the element that stands for a component, such as its row: while the element is on screen, the component's
 * preview is made before the ones nobody can see. Nothing for no component.
 */
export function usePreviewOnScreen(
  projectId: string,
  component: string | undefined
): (element: Element | null) => void {
  const [element, setElement] = useState<Element | null>(null)
  useEffect(() => {
    if (!element || component === undefined) return
    const previews = previewsFor(projectId)
    let hide: (() => void) | undefined
    const observer = new IntersectionObserver(([seen]) => {
      if (seen?.isIntersecting) hide ??= previews.show(component)
      else {
        hide?.()
        hide = undefined
      }
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      hide?.()
    }
  }, [element, projectId, component])
  return setElement
}
