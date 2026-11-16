import { boardRoot, type ContainerSpec, designStates, type RenderNode, resolveDesign } from "@parity-app/core"
import { styleChanges } from "@parity-app/editor"
import { containerEntry } from "@parity-app/multiplayer"
import { useEffect, useMemo } from "react"
import { findFrames, findNodeElement, previewFrameRules } from "../frame.ts"
import { type DocSession, libraryOf } from "../project-doc.ts"
import type { ProjectSession } from "../workspace.ts"
import { localDrag } from "./carried.ts"
import { leaveLayer, takeLayer, writeLayer } from "./style-layers.ts"

/** A root-relative `url()`. */
const rootUrl = /url\(\s*(["']?)(\/(?!\/)[^"')]*)\1\s*\)/g

/**
 * A style edit shown on a design's frames before it's made, as the inspector's fields preview what's typed or scrubbed.
 * It shows in the next frame, without the document, the panels or the frames' own React drawing again; making the change
 * draws them as usual. It shows only what changes between the design as the document holds it and the design with the
 * edit, worked out for each frame's state and viewport as the frame works out its own.
 *
 * An element is drawn from its frame's rules, so its edit is a rule laid over them (core's `previewRules`), which the
 * frame takes away when it draws the change. A component takes its design's style as its `style` prop, so its edit is
 * written straight onto its element, and it shows a preview only when it renders the design's props on its root, as
 * it then does the style the edit sets; one that doesn't (CAN-45) shows the change once it's made, as before.
 *
 * Several can show at once, each under its own `key`: the local edit's, and each drag preview's. Each has its own rules
 * over a frame's (`previewFrameRules`) and writes its own values onto components' elements (`writeLayer`), and taking
 * one back leaves the others shown.
 */
export class StylePreview {
  /** The properties written onto components' elements. */
  private written = new Map<HTMLElement, Set<string>>()

  /** The frames a rule is laid over. */
  private previewed = new Set<HTMLElement>()

  constructor(
    private readonly session: DocSession & Pick<ProjectSession, "editor" | "info" | "loaded">,
    private readonly design: string,
    private readonly key = localDrag
  ) {}

  /** Shows `update` of the design as the document holds it now, in place of what this preview showed before. */
  show(update: (container: ContainerSpec) => ContainerSpec): void {
    const entry = containerEntry(this.session.doc, this.design)

    if (!entry) {
      return
    }

    const next = update(entry.container)
    const now = new Map<HTMLElement, Map<string, string>>()
    const rules = new Map<HTMLElement, string>()

    if (next !== entry.container) {
      for (const host of this.frames()) {
        const drawn = this.render(entry.container, host)
        const edited = this.render(next, host)
        const css = this.session.loaded.previewRules(drawn, edited)

        if (css !== "") {
          rules.set(host, css)
        }

        for (const change of styleChanges(drawn, edited)) {
          const element = findNodeElement(host, change.nodeId)

          // Only an element the node's own props reach takes the style it sets.
          if (!element || element.dataset.canvasNode !== change.nodeId) {
            continue
          }

          const values = now.get(element) ?? new Map<string, string>()

          // What's taken away goes first, so taking away a shorthand doesn't clear the longhands set after it.
          for (const name of change.unset) {
            values.set(cssName(name), "")
          }

          for (const [name, value] of Object.entries(change.set)) {
            values.set(cssName(name), name === "backgroundImage" ? this.projectUrls(value) : value)
          }

          now.set(element, values)
        }
      }
    }

    // What this preview showed before and doesn't now goes back first, so a smaller edit doesn't leave a bigger one's.
    for (const host of this.previewed) {
      if (!rules.has(host)) {
        previewFrameRules(host, "", this.key)
      }
    }

    for (const [host, css] of rules) {
      previewFrameRules(host, css, this.key)
    }

    this.previewed = new Set(rules.keys())

    for (const [element, names] of this.written) {
      const values = now.get(element)

      for (const name of names) {
        if (!values?.has(name)) {
          takeLayer(element, name, this.key)
        }
      }
    }

    for (const [element, values] of now) {
      for (const [name, value] of values) {
        writeLayer(element, name, this.key, value)
      }
    }

    this.written = new Map([...now].map(([element, values]) => [element, new Set(values.keys())]))
  }

  /**
   * A fill's images against the project's dev server, as a frame draws them: frames are in the canvas's page, where
   * `url("/images/a.png")` would be the canvas's own (PAR-931).
   */
  private projectUrls(value: string): string {
    const origin = new URL(this.session.info.guestUrl).origin

    return value.replace(
      rootUrl,
      (_match, quote: string, path: string) => `url(${quote}${new URL(path, origin).href}${quote})`
    )
  }

  /** Puts every frame back as it was before the preview. */
  cancel(): void {
    for (const host of this.previewed) {
      previewFrameRules(host, "", this.key)
    }

    this.previewed.clear()

    for (const [element, names] of this.written) {
      for (const name of names) {
        takeLayer(element, name, this.key)
      }
    }

    this.written.clear()
  }

  /**
   * Leaves what's shown for the change that makes it to draw over: the frames then go from the design as it was to
   * the design as changed, and those differ in exactly what the preview showed. A frame takes its preview's rules
   * away as it draws the change. Show the change itself first.
   */
  release(): void {
    for (const [element, names] of this.written) {
      for (const name of names) {
        leaveLayer(element, name, this.key)
      }
    }

    this.written.clear()
    this.previewed.clear()
  }

  /**
   * Before `update` is made: shows it, if anything is previewed, and leaves it for the change to draw over, so the
   * canvas doesn't go back to the old value while the change draws.
   */
  settle(update: (container: ContainerSpec) => ContainerSpec): void {
    if (!this.active) {
      return
    }

    this.show(update)
    this.release()
  }

  /** Whether anything is previewed. */
  get active(): boolean {
    return this.written.size > 0 || this.previewed.size > 0
  }

  private frames(): HTMLElement[] {
    const area = this.session.editor?.getContainer().closest(".canvas-area") ?? document

    return findFrames(area, this.design)
  }

  /** A frame's tree for a version of the design, worked out as the frame works out its own. */
  private render(container: ContainerSpec, host: HTMLElement): RenderNode[] {
    const states = designStates(container)
    const state = states.find((candidate) => candidate.id === host.dataset.state) ?? states[0]

    return resolveDesign(
      boardRoot(container),
      state,
      host.dataset.viewport ?? "",
      libraryOf(this.session, this.design),
      { params: container.params, choices: container.view?.variants }
    )
  }
}

/** A preview of a design's style edits for a panel, taken back if the panel goes while it shows, as when the selection changes. */
export function useStylePreview(
  session: DocSession & Pick<ProjectSession, "editor" | "info" | "loaded">,
  design: string
): StylePreview {
  const preview = useMemo(() => new StylePreview(session, design), [session, design])
  useEffect(() => () => preview.cancel(), [preview])

  return preview
}

/** React's style names as CSS's: `minWidth` is `min-width`, `WebkitLineClamp` is `-webkit-line-clamp`. */
export function cssName(name: string): string {
  if (name.startsWith("--")) {
    return name
  }

  return name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}
