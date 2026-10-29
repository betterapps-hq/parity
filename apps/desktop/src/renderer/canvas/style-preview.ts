import { boardRoot, type ContainerSpec, type RenderNode, resolveDesign, styleChanges } from "@parity/core"
import { useEffect, useMemo } from "react"
import { findFrames, findNodeElement } from "../frame.ts"
import type { ProjectSession } from "../workspace.ts"

interface Written {
  /** Each property's inline value before the preview wrote it, empty when it had none. */
  was: Map<string, string>
}

/**
 * A style edit shown on a design's frames before it's made, as the inspector's fields preview what's typed or scrubbed.
 * The edit's inline styles are written straight onto the elements already drawn, so it shows in the next frame, without
 * the store, the panels or the frames' own React drawing again; making the change draws them as usual. It writes only
 * what changes between the design as the store holds it and the design with the edit, worked out for each frame's
 * state and viewport as the frame works out its own.
 *
 * A component shows a preview only when it renders the design's props on its root, as it then does the style the edit
 * sets; one that doesn't (CAN-45) shows the change once it's made, as before.
 */
export class StylePreview {
  private readonly written = new Map<HTMLElement, Written>()

  constructor(
    private readonly session: ProjectSession,
    private readonly design: string
  ) {}

  /** Shows `update` of the design as the store holds it now, in place of what this preview showed before. */
  show(update: (container: ContainerSpec) => ContainerSpec): void {
    const entry = this.session.store.getEntry(this.design)
    if (!entry) return
    const next = update(entry.container)
    const now = new Map<HTMLElement, Map<string, string>>()
    if (next !== entry.container) {
      for (const host of this.frames()) {
        for (const change of styleChanges(this.render(entry.container, host), this.render(next, host))) {
          const element = findNodeElement(host, change.nodeId)
          // Only an element the node's own props reach takes the style it sets.
          if (!element || element.dataset.canvasNode !== change.nodeId) continue
          const values = now.get(element) ?? new Map<string, string>()
          for (const [name, value] of Object.entries(change.set)) values.set(cssName(name), value)
          for (const name of change.unset) values.set(cssName(name), "")
          now.set(element, values)
        }
      }
    }
    // What this preview wrote before and doesn't now goes back first, so a smaller edit doesn't leave a bigger one's.
    for (const [element, { was }] of this.written) {
      const values = now.get(element)
      for (const [name, value] of was) if (!values?.has(name)) write(element, name, value)
    }
    for (const [element, values] of now) {
      const record = this.written.get(element) ?? { was: new Map<string, string>() }
      for (const [name, value] of values) {
        if (!record.was.has(name)) record.was.set(name, element.style.getPropertyValue(name))
        write(element, name, value)
      }
      this.written.set(element, record)
    }
    for (const [element, record] of this.written) {
      const values = now.get(element)
      for (const name of record.was.keys()) if (!values?.has(name)) record.was.delete(name)
      if (record.was.size === 0) this.written.delete(element)
    }
  }

  /** Puts every element back as it was before the preview. */
  cancel(): void {
    for (const [element, { was }] of this.written) for (const [name, value] of was) write(element, name, value)
    this.written.clear()
  }

  /**
   * Leaves what's shown for the change that makes it to draw over: the frames then go from the design as it was to
   * the design as changed, and those differ in exactly what the preview wrote. Show the change itself first.
   */
  release(): void {
    this.written.clear()
  }

  /**
   * Before `update` is made: shows it, if anything is previewed, and leaves it for the change to draw over, so the
   * canvas doesn't go back to the old value while the change draws.
   */
  settle(update: (container: ContainerSpec) => ContainerSpec): void {
    if (!this.active) return
    this.show(update)
    this.release()
  }

  /** Whether anything is previewed. */
  get active(): boolean {
    return this.written.size > 0
  }

  private frames(): HTMLElement[] {
    const area = this.session.editor?.getContainer().closest(".canvas-area") ?? document
    return findFrames(area, this.design)
  }

  /** A frame's tree for a version of the design, worked out as the frame works out its own. */
  private render(container: ContainerSpec, host: HTMLElement): RenderNode[] {
    const state = container.states.find((candidate) => candidate.id === host.dataset.state) ?? container.states[0]
    return resolveDesign(
      boardRoot(container),
      state,
      host.dataset.viewport ?? "",
      this.session.store.getLibrary(this.design),
      { params: container.params, choices: container.view?.variants }
    )
  }
}

/** A preview of a design's style edits for a panel, taken back if the panel goes while it shows, as when the selection changes. */
export function useStylePreview(session: ProjectSession, design: string): StylePreview {
  const preview = useMemo(() => new StylePreview(session, design), [session, design])
  useEffect(() => () => preview.cancel(), [preview])
  return preview
}

/** React's style names as CSS's: `minWidth` is `min-width`, `WebkitLineClamp` is `-webkit-line-clamp`. */
export function cssName(name: string): string {
  if (name.startsWith("--")) return name
  return name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function write(element: HTMLElement, name: string, value: string): void {
  if (value === "") element.style.removeProperty(name)
  else element.style.setProperty(name, value)
}
