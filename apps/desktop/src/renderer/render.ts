// The offscreen render window's page. The main process asks it to draw one frame, measures it, and captures it, so
// agents can lay out and screenshot any state in any mode without touching the person's canvas.
import type { AccessibilityIssue, ContrastDetail } from "@parity/agent"
import { type RenderNode, screenHeightForWidth } from "@parity/core"
import axe, { type NodeResult, type RunOptions } from "axe-core"
import type { MeasuredNode, RenderedFrame, RenderJob } from "../shared/protocol.ts"
import { prepareFrame } from "./frame.ts"
import { loadGuest, previewToken } from "./guest.ts"

declare global {
  interface Window {
    canvasRender(job: RenderJob): Promise<RenderedFrame>
    canvasSettle(): Promise<void>
    canvasAudit(): Promise<AccessibilityIssue[]>
  }
}

let current: { unmount(): void } | undefined
/** The frame drawn last, for the audit that may follow once the window is as tall as the frame. */
let currentHost: HTMLElement | undefined

window.canvasSettle = async () => {
  await document.fonts.ready
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

window.canvasRender = async (job) => {
  current?.unmount()
  current = undefined
  currentHost = undefined
  document.body.replaceChildren()
  try {
    const loaded = await loadGuest(job.guestUrl, job.theme)
    for (const change of job.previews ?? []) previewToken(loaded.sheet, change.name, change.theme, change.value)
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
    const viewport = { width: job.mode.width, height: job.mode.height ?? screenHeightForWidth(job.mode.width) }
    const target = prepareFrame(host, loaded.sheet, { ...job.mode, viewport })
    const tree = job.tree as RenderNode[]
    if (job.components) loaded.guest.addComponents?.(job.components)
    current = loaded.guest.mount(target, tree, {
      viewport,
      onError: (error) => errors.push(error instanceof Error ? error.message : String(error)),
      ...(job.mode.globals ? { globals: job.mode.globals } : {})
    })
    // Let React commit, components that load on demand arrive, images and fonts load, and layout settle.
    await new Promise((resolve) => setTimeout(resolve, 30))
    await loaded.guest.loaded?.()
    await window.canvasSettle()
    await Promise.race([imagesLoaded(host), new Promise((resolve) => setTimeout(resolve, 1500))])

    const body = host.shadowRoot!.firstElementChild as HTMLElement
    const origin = host.getBoundingClientRect()
    const nodes: MeasuredNode[] = []
    for (const element of host.shadowRoot!.querySelectorAll<HTMLElement>("[data-canvas-node]")) {
      const rect = element.getBoundingClientRect()
      const measured: MeasuredNode = {
        id: element.dataset.canvasNode!,
        x: round((rect.left - origin.left) / job.scale),
        y: round((rect.top - origin.top) / job.scale),
        width: round(rect.width / job.scale),
        height: round(rect.height / job.scale)
      }
      if (clipped(element, rect, body)) measured.clipped = true
      nodes.push(measured)
    }
    const known = new Set(loaded.guest.components)
    return {
      width: job.mode.width,
      height: job.mode.height ?? Math.ceil(origin.height / job.scale),
      nodes,
      overflowsX: body.scrollWidth > body.clientWidth + 1,
      unknownComponents: [
        ...new Set(componentsIn(tree).filter((name) => !known.has(name) && !loaded.guest.hasComponent(name)))
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
  resultTypes: ["violations"],
  elementRef: true
}

/**
 * Checks the frame drawn last with axe-core. Each element it flags is reported on the design node it belongs to, so
 * an element inside a component counts as the component, once per rule.
 */
window.canvasAudit = async () => {
  if (!currentHost) return []
  const results = await axe.run(currentHost, auditOptions)
  return results.violations.map((violation) => {
    const nodes = new Map<string, AccessibilityIssue["nodes"][number]>()
    for (const node of violation.nodes) {
      const id = node.element?.closest<HTMLElement>("[data-canvas-node]")?.dataset.canvasNode ?? ""
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
          ? `\`${name}\` points at an element that isn't in the design.`
          : `\`${name}\` can't be \`${value}\`.`
      })
      .join(" ")
    return { detail }
  }
  const message = checks.map((check) => check.message).find(Boolean) ?? node.failureSummary ?? ""
  return { detail: message.replace(/([\w-]+="[^"]*")/g, "`$1`") }
}

function contrastOf(data: unknown): ContrastDetail | undefined {
  const measured = data as
    | {
        fgColor?: string
        bgColor?: string
        contrastRatio?: number
        expectedContrastRatio?: string
        fontSize?: string
        fontWeight?: string
      }
    | undefined
  if (!measured?.fgColor || !measured.bgColor || typeof measured.contrastRatio !== "number") return undefined
  return {
    foreground: measured.fgColor,
    background: measured.bgColor,
    ratio: measured.contrastRatio,
    required: Number.parseFloat(measured.expectedContrastRatio ?? "4.5"),
    // axe-core gives the size as "10.5pt (14px)".
    fontSize: Number(/\(([\d.]+)px\)/.exec(measured.fontSize ?? "")?.[1] ?? 0),
    bold: measured.fontWeight === "bold"
  }
}

function componentsIn(tree: RenderNode[]): string[] {
  return tree.flatMap((node) =>
    node.kind === "component"
      ? [node.component, ...Object.values(node.slots).flatMap(componentsIn)]
      : node.kind === "element"
        ? componentsIn(node.children)
        : []
  )
}

/** Whether an ancestor that hides overflow cuts part of the element off. */
function clipped(element: HTMLElement, rect: DOMRect, body: HTMLElement): boolean {
  if (rect.width === 0 || rect.height === 0) return false
  for (let parent = element.parentElement; parent && parent !== body; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    if (style.overflowX === "visible" && style.overflowY === "visible") continue
    const outer = parent.getBoundingClientRect()
    if (
      rect.left < outer.left - 0.5 ||
      rect.right > outer.right + 0.5 ||
      rect.top < outer.top - 0.5 ||
      rect.bottom > outer.bottom + 0.5
    ) {
      return true
    }
  }
  return false
}

function imagesLoaded(host: HTMLElement): Promise<unknown> {
  const images = [...(host.shadowRoot?.querySelectorAll("img") ?? [])]
  return Promise.all(images.map((image) => (image.complete ? undefined : image.decode().catch(() => undefined))))
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
