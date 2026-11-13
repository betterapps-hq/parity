import {
  boardComponentLayer,
  boardWithInternals,
  type ElementSnapshot,
  elementLayers,
  readStyles
} from "@parity-app/editor"
import { panelAttributes } from "@parity-app/layer-types"
import { type RefObject, useEffect } from "react"
import type { ContainerEntry } from "../design-store.ts"
import { watchFrame } from "../frame-host.ts"
import { findNodeElements, setInnerNodes } from "../frame.ts"
import { componentBoardsFile } from "./component-boards.ts"
import { useProject } from "./context.ts"

/** Attributes that name an element, say what it shows, or give its type and its panel's fields (`panelData`). */
const keptAttributes = [...new Set(["data-slot", "popover", ...panelAttributes])]

/**
 * Reads what a component's board draws inside into its component's layers each time the board is drawn (read-only
 * viewer, step 8): each element as the layer `elementLayers` makes of it, found on the canvas as the element itself. It
 * isn't a step to undo, and it isn't saved, since the board is drawn from the code.
 */
export function useBoardInternals(board: RefObject<HTMLDivElement | null>, entry: ContainerEntry): void {
  const { store } = useProject()
  const { key } = entry
  const isBoard = entry.path === componentBoardsFile

  useEffect(() => {
    const container = board.current

    if (!isBoard || !container) {
      return undefined
    }

    const read = (host: Element) => {
      const design = store.getEntry(key)?.container
      const layer = design && boardComponentLayer(design)

      if (!design || !layer) {
        return
      }

      const nodes = new Map<string, Element | Text>()

      const snapshots = findNodeElements(host, layer).flatMap((element, index) => {
        const read = snapshotOf(element, `in-${index}`, nodes)

        return read ? [read] : []
      })

      setInnerNodes(host, nodes)
      const internals = elementLayers(snapshots)

      if (boardWithInternals(design, internals) !== design) {
        store.updateContainer(key, "Read inside", (current) => boardWithInternals(current, internals), {
          history: false,
          persist: false
        })
      }
    }

    // A board far from view is a picture, so its frame comes and goes: each time it's drawn live, it's read.
    let attached: Element | undefined
    let stopWatching: (() => void) | undefined

    const attach = () => {
      const host = container.querySelector("[data-frame]") ?? undefined

      if (host === attached) {
        return
      }

      stopWatching?.()
      stopWatching = undefined
      attached = host

      if (host) {
        stopWatching = watchFrame(host, () => read(host))
      }
    }

    const observer = new MutationObserver(attach)
    observer.observe(container, { childList: true, subtree: true })
    attach()

    return () => {
      observer.disconnect()
      stopWatching?.()
    }
  }, [board, isBoard, key, store])
}

/** An element or text as a snapshot, with the ids of what's inside it from its own, or undefined when it shows nothing. */
function snapshotOf(node: Node, id: string, nodes: Map<string, Element | Text>): ElementSnapshot | undefined {
  if (node instanceof Text) {
    if (!node.data.trim()) {
      return undefined
    }

    nodes.set(id, node)

    return { id, tag: "#text", text: node.data, attributes: {}, style: {}, children: [] }
  }

  if (!(node instanceof Element)) {
    return undefined
  }

  const computed = getComputedStyle(node)

  if (computed.display === "none") {
    return undefined
  }

  nodes.set(id, node)
  const tag = node.tagName.toLowerCase()

  const attributes = Object.fromEntries(
    keptAttributes.flatMap((name) => {
      const value = node.getAttribute(name)

      return value === null ? [] : [[name, value]]
    })
  )

  const style = Object.fromEntries(readStyles.map((name) => [name, computed.getPropertyValue(name)]))

  if (tag === "svg") {
    return { id, tag, attributes, style, markup: node.outerHTML, children: [] }
  }

  const children = [...node.childNodes].flatMap((child, index) => {
    const read = snapshotOf(child, `${id}-${index}`, nodes)

    return read ? [read] : []
  })

  return { id, tag, attributes, style, children }
}
