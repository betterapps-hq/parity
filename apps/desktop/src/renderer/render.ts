// The offscreen render window's page. The main process asks it to draw one frame, measures it, and captures it, so
// agents can lay out and screenshot any state in any mode without touching the person's canvas.
import type { AccessibilityIssue, ContrastDetail, ContrastReading, FrameContrast } from "@parity-app/agent"
import { finiteNumber, guestChanges, type RenderNode, renderedComponents } from "@parity-app/core"
import { frameAttributes } from "@parity-app/tokens"
import axe, { type NodeResult, type RunOptions } from "axe-core"
import { z } from "zod"
import type { MeasuredNode, RenderedFrame, RenderJob } from "../shared/protocol.ts"
import { frameBox, frameHeight } from "../shared/render-job.ts"
import {
  drawnNodeIds,
  findNodeElement,
  nodeBox,
  nodeOfElement,
  nodeParent,
  prepareFrame,
  setDrawnNodes
} from "./frame.ts"
import { loadGuest, releaseGuest, showTokenOverrides } from "./guest.ts"
import { inlinePortalSheet, inlinePortals } from "./inline-portals.ts"

declare global {
  interface Window {
    canvasRender(job: RenderJob): Promise<RenderedFrame>
    canvasSettle(): Promise<void>
    canvasAudit(colorTokens?: string[]): Promise<{ issues: AccessibilityIssue[]; contrast?: FrameContrast }>
    canvasHeight(): number | undefined
  }
}

// The window is made as tall as the frame for a capture, so what reaches past the frame (a name taller than a 1px part,
// reactions hanging below a bubble) made the page scroll, and the scrollbars that took room for it were captured along
// with the frame, at the bottom of a component's preview (PAR-520). The window shows the frame and never scrolls.
document.documentElement.style.overflow = "hidden"

let current: { unmount(): void } | undefined
/** Puts what the last frame portaled out of it, and a preview drew inside it, back where its library put it. */
let putBack: (() => void) | undefined
/** The frame drawn last, for the audit that may follow once the window is as tall as the frame. */
let currentHost: HTMLElement | undefined
/** The guest each project's frames were drawn with last, to let go of when its project reopens at a new address. */
const projectGuests = new Map<string, string>()
/** The components each guest was given by the last job that carried them, to take back the ones a later job drops. */
const givenComponents = new Map<string, NonNullable<RenderJob["components"]>>()

window.canvasSettle = async () => {
  await document.fonts.ready
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

window.canvasRender = async (job) => {
  putBack?.()
  putBack = undefined
  current?.unmount()
  current = undefined
  currentHost = undefined
  document.body.replaceChildren()
  const last = projectGuests.get(job.projectId)
  if (last !== job.guestUrl) {
    if (last) {
      releaseGuest(last)
      givenComponents.delete(last)
    }
    projectGuests.set(job.projectId, job.guestUrl)
  }
  try {
    const loaded = await loadGuest(job.guestUrl, job.theme)
    showTokenOverrides(loaded.sheet, job.previews ?? [])
    const host = document.createElement("div")
    host.style.width = `${job.mode.width}px`
    if (job.mode.height !== undefined) {
      host.style.height = `${job.mode.height}px`
      host.style.overflow = "hidden"
    }
    host.style.zoom = String(job.scale)
    document.body.append(host)
    currentHost = host
    const errors: string[] = []
    // The window the frame stands for, resolved with the frame, so it's the live frame's even when the frame grows.
    const { viewport } = job.mode
    const attributes = frameAttributes(job.mode, loaded.themeAttributes)
    const target = prepareFrame(host, loaded.sheet, { ...job.mode, attributes, viewport })
    const tree = job.tree as RenderNode[]
    // A job that carries no components says nothing about them.
    if (job.components) {
      // Ones whose source went away are taken back first, so a frame using one draws as the canvas's does.
      const { add, drop } = guestChanges(givenComponents.get(job.guestUrl) ?? {}, job.components)
      if (drop.length > 0) loaded.guest.removeComponents?.(drop)
      loaded.guest.addComponents?.(add)
      givenComponents.set(job.guestUrl, job.components)
    }
    const handle = loaded.guest.mount(target, tree, {
      viewport,
      onError: (error) => errors.push(error instanceof Error ? error.message : String(error)),
      ...(job.mode.globals ? { globals: job.mode.globals } : {})
    })
    setDrawnNodes(host, handle.drawnNodes?.bind(handle))
    current = handle
    // Let React commit, components that load on demand arrive, images and fonts load, and layout settle.
    await new Promise((resolve) => setTimeout(resolve, 30))
    await loaded.guest.loaded?.()
    if (job.inlinePortals) {
      // A component preview draws what its component portals out of the frame inside it, after the rest (PAR-517).
      const shadow = host.shadowRoot!
      shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, inlinePortalSheet()]
      const root = (tree[0] && "nodeId" in tree[0] && findNodeElement(host, tree[0].nodeId)) || target
      putBack = inlinePortals(host, root)
    }
    await window.canvasSettle()
    await Promise.race([imagesLoaded(host), new Promise((resolve) => setTimeout(resolve, 1500))])

    const body = host.shadowRoot!.firstElementChild as HTMLElement
    const origin = host.getBoundingClientRect()
    const nodes: MeasuredNode[] = []
    // Each node as the canvas finds it: from React's tree, so components that ignore their props are measured too.
    for (const id of drawnNodeIds(host)) {
      const element = findNodeElement(host, id)
      const rect = nodeBox(host, id)
      if (!element || !rect) continue
      const inFrame = (box: DOMRect) => frameBox(box, origin, job.scale)
      const measured: MeasuredNode = { id, ...inFrame(rect) }
      const parent = nodeParent(host, id)
      if (parent) measured.parent = parent
      const clip = clipper(element, rect, body)
      if (clip) {
        const by = nodeOfElement(host, clip)
        measured.clipped = true
        measured.clip = { ...inFrame(clip.getBoundingClientRect()), ...(by && by !== id ? { node: by } : {}) }
      }
      nodes.push(measured)
    }
    const known = new Set(loaded.guest.components)
    return {
      width: job.mode.width,
      height: job.mode.height ?? frameHeight(origin.height, job.scale),
      nodes,
      overflowsX: body.scrollWidth > body.clientWidth + 1,
      unknownComponents: [
        ...new Set(renderedComponents(tree).filter((name) => !known.has(name) && !loaded.guest.hasComponent(name)))
      ],
      ...(errors.length > 0 ? { error: errors.join("\n") } : {})
    }
  } catch (error) {
    return {
      width: job.mode.width,
      height: 0,
      nodes: [],
      overflowsX: false,
      unknownComponents: [],
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/** A design is part of a page, so rules about the page as a whole don't apply to it. */
const pageRules = [
  "bypass",
  "document-title",
  "html-has-lang",
  "html-lang-valid",
  "html-xml-lang-mismatch",
  "landmark-one-main",
  "meta-refresh",
  "meta-viewport",
  "meta-viewport-large",
  "page-has-heading-one",
  "region"
]

const auditOptions: RunOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
  rules: Object.fromEntries(pageRules.map((rule) => [rule, { enabled: false }])),
  // Passes too, for the contrast of text that passes now, which a contrast fix mustn't break.
  resultTypes: ["violations", "passes"],
  elementRef: true
}

/**
 * Checks the frame drawn last with axe-core. Each element it flags is reported on the design node it belongs to, so
 * an element inside a component counts as the component, once per rule. Its text's contrast, passing or failing, and
 * the values of `colorTokens` come back too, for contrast fixes.
 */
window.canvasAudit = async (colorTokens = []) => {
  const host = currentHost
  if (!host) return { issues: [] }
  const results = await axe.run(host, auditOptions)
  const issues = results.violations.map((violation) => {
    const nodes = new Map<string, AccessibilityIssue["nodes"][number]>()
    for (const node of violation.nodes) {
      const id = (node.element && nodeOfElement(host, node.element)) ?? ""
      if (!nodes.has(id)) nodes.set(id, { id, ...detailOf(node) })
    }
    return {
      rule: violation.id,
      impact: violation.impact ?? "minor",
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: [...nodes.values()]
    }
  })
  if (colorTokens.length === 0) return { issues }
  const contrastNodes = [...results.violations, ...results.passes]
    .filter((result) => result.id === "color-contrast")
    .flatMap((result) => result.nodes)
  return { issues, contrast: { tokens: tokenColors(host, colorTokens), texts: contrastReadings(host, contrastNodes) } }
}

/** Per node, its text with the lowest contrast, and whether coloring the node's own element reaches that text. */
function contrastReadings(host: HTMLElement, results: NodeResult[]): ContrastReading[] {
  const lowest = new Map<string, ContrastReading>()
  for (const result of results) {
    const element = result.element
    const id = element && nodeOfElement(host, element)
    const contrast = contrastOf([...result.any, ...result.all].find((check) => check.id === "color-contrast")?.data)
    if (!element || !id || !contrast) continue
    const known = lowest.get(id)
    if (known && known.ratio <= contrast.ratio) continue
    const { foreground, background, ratio, required } = contrast
    lowest.set(id, { id, foreground, background, ratio, required, follows: follows(host, id, element) })
  }
  return [...lowest.values()]
}

/**
 * Whether a color set on the node's element reaches the text: the text's own element may set a color of its own, as a
 * component's classes do. It's tried with a color nothing uses, then put back.
 */
function follows(host: HTMLElement, id: string, text: Element): boolean {
  const element = findNodeElement(host, id)
  if (!element) return false
  const { style } = element
  const [value, priority] = [style.getPropertyValue("color"), style.getPropertyPriority("color")]
  style.setProperty("color", "rgb(1, 2, 3)", "important")
  const reached = getComputedStyle(text).color === "rgb(1, 2, 3)"
  style.setProperty("color", value, priority)
  return reached
}

/** Each named token's color in the frame, in its theme, as hex: `#rrggbb`, or `#rrggbbaa` when it's see-through. */
function tokenColors(host: HTMLElement, names: string[]): Record<string, string> {
  const body = host.shadowRoot!.firstElementChild as HTMLElement
  const probe = document.createElement("span")
  body.append(probe)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const context = canvas.getContext("2d", { willReadFrequently: true })!
  const colors: Record<string, string> = {}
  for (const name of names) {
    if (!getComputedStyle(probe).getPropertyValue(`--${name}`).trim()) continue
    probe.style.color = `var(--${name})`
    // The browser keeps colors such as oklch() as written, so a pixel drawn in it gives the sRGB value.
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = getComputedStyle(probe).color
    context.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
    const hex = (channel: number) => channel.toString(16).padStart(2, "0")
    colors[name] = `#${hex(r!)}${hex(g!)}${hex(b!)}${a === 255 ? "" : hex(a!)}`
  }
  probe.remove()
  return colors
}

/** ARIA attributes whose value is the id of another element. */
const idReferences = new Set([
  "aria-activedescendant",
  "aria-controls",
  "aria-describedby",
  "aria-details",
  "aria-errormessage",
  "aria-flowto",
  "aria-labelledby",
  "aria-owns"
])

/**
 * What's wrong with one element, in a sentence. Contrast and ARIA values are put in plain words from what axe-core
 * measured; anything else is axe-core's own message. Code is quoted in backticks.
 */
function detailOf(node: NodeResult): { detail: string; contrast?: ContrastDetail } {
  const checks = [...node.any, ...node.all, ...node.none]
  const contrast = contrastOf(checks.find((check) => check.id === "color-contrast")?.data)
  if (contrast) {
    const text = `${contrast.fontSize}px${contrast.bold ? " bold" : ""} text`
    return {
      detail: `${contrast.foreground} on ${contrast.background} is ${contrast.ratio}:1, and ${text} needs ${contrast.required}:1.`,
      contrast
    }
  }
  const values = checks.find((check) => check.id === "aria-valid-attr-value")?.data as unknown
  if (Array.isArray(values) && values.length > 0) {
    const detail = values
      .map((pair) => {
        const [, name, value] = /^([\w-]+)="(.*)"$/s.exec(String(pair)) ?? []
        if (!name) return `\`${String(pair)}\` isn't valid.`
        return idReferences.has(name)
          ? `\`${name}\` points at an element that isn't on the page.`
          : `\`${name}\` can't be \`${value}\`.`
      })
      .join(" ")
    return { detail }
  }
  const message = checks.map((check) => check.message).find(Boolean) ?? node.failureSummary ?? ""
  return { detail: message.replace(/([\w-]+="[^"]*")/g, "`$1`") }
}

/** What axe-core's color-contrast check measured, as its `data`, read as the colors and sizes a contrast failure names. */
const contrastMeasure = z
  .object({
    fgColor: z.string().min(1),
    bgColor: z.string().min(1),
    contrastRatio: finiteNumber,
    expectedContrastRatio: z.string().optional(),
    fontSize: z.string().optional(),
    fontWeight: z.string().optional()
  })
  .transform((measured): ContrastDetail => ({
    foreground: measured.fgColor,
    background: measured.bgColor,
    ratio: measured.contrastRatio,
    required: Number.parseFloat(measured.expectedContrastRatio ?? "4.5"),
    // axe-core gives the size as "10.5pt (14px)".
    fontSize: Number(/\(([\d.]+)px\)/.exec(measured.fontSize ?? "")?.[1] ?? 0),
    bold: measured.fontWeight === "bold"
  }))

function contrastOf(data: unknown): ContrastDetail | undefined {
  return contrastMeasure.safeParse(data).data
}

/** Half a CSS pixel, for subpixel layout: the agent's `overflowTolerance`, which judges what this reports. */
const overflowTolerance = 0.5

/** The nearest ancestor that hides overflow and cuts part of the element off, past `overflowTolerance`. */
function clipper(element: HTMLElement, rect: DOMRect, body: HTMLElement): HTMLElement | undefined {
  if (rect.width === 0 || rect.height === 0) return undefined
  for (let parent = element.parentElement; parent && parent !== body; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    if (style.overflowX === "visible" && style.overflowY === "visible") continue
    const outer = parent.getBoundingClientRect()
    if (
      rect.left < outer.left - overflowTolerance ||
      rect.right > outer.right + overflowTolerance ||
      rect.top < outer.top - overflowTolerance ||
      rect.bottom > outer.bottom + overflowTolerance
    ) {
      return parent
    }
  }
  return undefined
}

/**
 * The height of the frame drawn last, in its own CSS pixels, as the canvas lays it out at full size; nothing for one
 * drawn at full size already. A bitmap's frame is drawn at a quarter of its size, where text rounds to other heights,
 * which put tall frames up to 66 pixels out, so it's laid out again at full size to measure. That's left until after its
 * capture, since some frames lay themselves out again as they're resized, which `capturePage` then failed on. Frames
 * that haven't drawn on the canvas take this height when their bitmap shows, so their boards keep their size when they
 * draw (PAR-525). Rounded as the canvas's own measure is (`drawnHeight`).
 */
window.canvasHeight = () => {
  const host = currentHost
  if (!host || host.style.zoom === "" || host.style.zoom === "1") return undefined
  host.style.zoom = "1"
  return Math.round(host.getBoundingClientRect().height * 100) / 100
}

function imagesLoaded(host: HTMLElement): Promise<unknown> {
  const images = [...(host.shadowRoot?.querySelectorAll("img") ?? [])]
  return Promise.all(
    images.map((image) => (image.complete ? Promise.resolve() : image.decode().catch(() => undefined)))
  )
}
