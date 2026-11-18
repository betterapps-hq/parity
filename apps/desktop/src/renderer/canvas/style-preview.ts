import {
  boardRoot,
  type ContainerSpec,
  designStates,
  findNode,
  previewRules,
  type RenderNode,
  resolveDesign,
  rewriteFrameUnits
} from "@parity-app/core"
import { styleChanges } from "@parity-app/editor"
import { containerEntry } from "@parity-app/multiplayer"
import { useEffect, useMemo } from "react"
import { copyNodeSelector } from "../copy-sheets.ts"
import { findFrames, findNodeElement, previewFrameRules, settleFrameRules } from "../frame.ts"
import { type DocSession, libraryOf } from "../project-doc.ts"
import type { ProjectSession } from "../workspace.ts"
import { localDrag } from "./carried.ts"
import { copiesOf, copyLayers, routePagesFile, shownEntry } from "./route-pages.ts"
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

  /**
   * The design as drawn before this preview, from `show`'s `base`, read once: what's drawn after includes the preview.
   */
  private from?: ContainerSpec

  /**
   * Shows `update` of the design as the document holds it now, in place of what this preview showed before. `base` is
   * the design as it's drawn, when the document doesn't hold that: a page copy's layers styled as the copy draws them.
   */
  show(update: (container: ContainerSpec) => ContainerSpec, base?: (container: ContainerSpec) => ContainerSpec): void {
    const saved = containerEntry(this.session.doc, this.design)
    // A page's layers inside its route are what its copies drew, kept in the window (`shownEntry`).
    const shown = saved?.path === routePagesFile ? shownEntry(this.session.doc, this.design) : saved

    if (!shown) {
      return
    }

    if (base) {
      this.from ??= base(shown.container)
    }

    const entry = { ...shown, container: this.from ?? shown.container }
    const next = update(entry.container)
    const now = new Map<HTMLElement, Map<string, string>>()
    const rules = new Map<HTMLElement, string>()

    if (next !== entry.container) {
      for (const host of this.frames()) {
        // A copy's elements are drawn by its page's own CSS, so its rules hold only what the edit changes, over it.
        if (host.dataset.copy !== undefined) {
          // Important, to win over the page's inline styles and its more specific rules.
          const css = previewRules(this.copyRender(entry.container), this.copyRender(next), {
            changedOnly: true,
            important: true,
            selector: copyNodeSelector
          })

          if (css !== "") {
            rules.set(host, rewriteFrameUnits(css))
          }

          continue
        }

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
    this.from = undefined

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
    this.from = undefined

    for (const [element, names] of this.written) {
      for (const name of names) {
        leaveLayer(element, name, this.key)
      }
    }

    this.written.clear()

    // The local preview's rules go as the frame draws the change; another's are left to go then too.
    if (this.key !== localDrag) {
      for (const host of this.previewed) {
        settleFrameRules(host, this.key)
      }
    }

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

  /**
   * What a page's copies drew, as layers, resolved on their own for a version of the design: they're inside the route's
   * layers, which draw nothing of their own.
   */
  private copyRender(container: ContainerSpec): RenderNode[] {
    const drawn = copiesOf(copyLayers.get(), this.session.doc).get(this.design) ?? []

    return drawn.flatMap((layer) => {
      const node = findNode(container.root, layer.id)

      return node ? resolveDesign(node, undefined, "") : []
    })
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
