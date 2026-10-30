import { childNodes, type ComponentRenderStatus, type DesignNode } from "@parity-app/core"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { userEvent, waitFor, within } from "storybook/test"
import { Box } from "tldraw"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ProjectInfo, ServiceMethods } from "../../shared/protocol.ts"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import { ProjectContext } from "../canvas/context.ts"
import { setTabOrderShown } from "../canvas/tab-order.ts"
import { setLayout } from "../chrome/layout.ts"
import { getPreferences, type Preferences, setPreferences } from "../chrome/preferences.ts"
import { findFrames, findNodeElement } from "../frame.ts"
import { type ProjectSession, useActiveTabId, useTabs, workspace } from "../workspace.ts"
import { answering, projectInfo, resetHost, roots } from "./host.ts"

/*
 * What stories share: opening projects fresh, finding the example's designs and layers, pointing the canvas at them,
 * the providers a tab gives, and changes that last until the story ends. The stand-in host is installed by the
 * preview, which also runs `restore` when each story ends.
 */

// For looking into a story from the browser's console.
Object.assign(window, { parity: { workspace } })

export type ProjectName = keyof typeof roots

/**
 * Starts a story from the same place every time: every tab closed, then the projects named opened in their own tabs,
 * the first active, once their components' props have been read. A slow project is left opening.
 */
export async function openProjects(...names: ProjectName[]): Promise<void> {
  toast.dismiss()
  // Panels and preferences are remembered between runs, so a story that changed them would change the next one.
  setLayout({ left: true, right: true, leftWidth: 256, rightWidth: 320, leftTab: undefined, rightTab: undefined })
  setPreferences({ snapping: true, exportScale: 2, layoutGrid: false, autosave: false, performanceStats: false })
  setTabOrderShown(false)
  await workspace.flush().catch(() => undefined)
  for (const tab of workspace.getTabs()) await workspace.close(tab.id)
  const opening = names.map((name, index) => workspace.open(roots[name], index === 0))
  const tabs = await Promise.all(opening.filter((_, index) => names[index] !== "slow"))
  if (names[0]) workspace.activate(roots[names[0]])
  // Props are read a moment after a project opens; waiting for them shows each panel as it settles.
  for (const tab of tabs) {
    for (let tries = 0; tab.session && tries < 100; tries++) {
      if (Object.keys(tab.session.components.get()).length > 0) break
      await pause(50)
    }
  }
}

/** The open example project's session. */
export function example(): ProjectSession {
  return sessionAt(roots.example)
}

/** An open tab's project. */
export function sessionAt(root: string): ProjectSession {
  const session = workspace.getTab(root)?.session
  if (!session) throw new Error(`${root} isn't open`)
  return session
}

/** A design's key in the example, by its name, such as `Pricing`. */
export function design(name: string): string {
  const entry = example()
    .store.getEntries()
    .find((candidate) => candidate.container.name === name)
  if (!entry) throw new Error(`The example has no design named ${name}`)
  return entry.key
}

/**
 * The id of a design's first layer with a name, its first instance of a component, or its first text that says it,
 * as the Layers panel names them: inside layouts and inside components' slots alike.
 */
export function node(designName: string, name: string): string {
  const find = (current: DesignNode): string | undefined => {
    if (
      current.name === name ||
      (current.type === "component" && current.component === name) ||
      (current.type === "text" && current.text === name)
    ) {
      return current.id
    }
    return childNodes(current).reduce<string | undefined>((found, child) => found ?? find(child), undefined)
  }
  const entry = example().store.getEntry(design(designName))
  const found = entry && find(entry.container.root)
  if (!found) throw new Error(`${designName} has no layer named ${name}`)
  return found
}

/** A project in another folder, as the service would open it: the example's components and designs under its name. */
export function projectAt(folder: string, change: Partial<ProjectInfo> = {}): ProjectInfo {
  const name = folder.split(/[\\/]/).at(-1) ?? folder
  return { ...projectInfo(roots.example), id: folder, root: folder, name, ...change }
}

/** A project in another folder with no designs yet, which opens quicker than a copy of the example. */
export function blankProjectAt(folder: string): ProjectInfo {
  const info = projectAt(folder)
  return { ...info, documents: [], mainDocument: `${info.name}.par` }
}

/**
 * Opens more projects in their own tabs after the ones open, one after another, without switching to them. They share
 * the example's inferred components, which are slow to copy.
 */
export async function openAlso(...projects: ProjectInfo[]): Promise<void> {
  const ids = new Set(projects.map((project) => project.id))
  let components: Promise<ServiceMethods["project.components"]["result"]> | undefined
  answering({
    "project.open": (params, usual) => projects.find((project) => project.root === params.root) ?? usual(),
    "project.components": (params, usual) => (ids.has(params.projectId) ? (components ??= usual()) : usual())
  })
  for (const project of projects) await workspace.open(project.root, false)
}

/**
 * Points the canvas at designs of the example, once it has mounted and fitted itself to the whole board, as someone
 * would before working on them. The example's boards are spread wide, so fitting them all shows them tiny.
 */
export async function frameDesigns(...names: string[]): Promise<void> {
  const editor = await until(() => example().editor)
  const measure = () => {
    const bounds = names.flatMap((name) => editor.getShapePageBounds(shapeIdFor(design(name))) ?? [])
    return bounds.length > 0 ? Box.Common(bounds) : undefined
  }
  // Boards size themselves once their frames render, which they do only in view. The canvas first fits itself to every
  // board, which draws them all: wait for that, then for their sizes to settle, and frame them again if they change.
  const settled = async () => {
    let last = ""
    for (let tries = 0; tries < 40; tries++) {
      await pause(150)
      const now = JSON.stringify(measure())
      if (tries > 3 && now === last) return now
      last = now
    }
    return last
  }
  await pause(1200)
  let framed = ""
  for (let pass = 0; pass < 4; pass++) {
    const now = await settled()
    const box = measure()
    if (!box || now === framed) return
    // Small components show at their real size rather than blown up to fill the canvas.
    editor.zoomToBounds(box, { inset: 48, targetZoom: 1 })
    framed = now
  }
}

/**
 * A story of the whole window pointed at designs of the example: `setup` runs once the example is open, before the
 * canvas mounts, and `then` once the designs are framed.
 */
export function onCanvas(designs: string[], setup?: () => unknown, then?: () => unknown) {
  return {
    loaders: [
      async () => {
        await openProjects("example")
        await setup?.()
      }
    ],
    play: async () => {
      await frameDesigns(...designs)
      await then?.()
    }
  }
}

/** A layer of the example as its first frame on the canvas draws it, to point or drag at. */
export function layerElement(designName: string, layerName: string): HTMLElement {
  const host = findFrames(document, design(designName))[0]
  const element = host && findNodeElement(host, node(designName, layerName))
  if (!element) throw new Error(`${layerName} in ${designName} isn't on the canvas`)
  return element
}

/**
 * The app's providers and a project around what a story shows, as a tab gives them: the active tab's project unless
 * one is named. `className` lays out the stage, full height by default.
 */
export function ProjectStage({
  children,
  project,
  className = "flex h-screen bg-background text-foreground"
}: {
  children: ReactNode
  project?: ProjectName
  className?: string
}) {
  const active = useActiveTabId()
  const id = project ? roots[project] : active
  const session = useTabs().find((tab) => tab.id === id)?.session
  if (!session) return null
  return (
    <TooltipProvider>
      <ProjectContext value={session}>
        <div className={className}>{children}</div>
      </ProjectContext>
      <Toaster position="bottom-right" offset={{ bottom: 40, right: 16 }} />
    </TooltipProvider>
  )
}

/** What to undo when the story ends, newest last. */
const undo: (() => void)[] = []

/** Changes preferences until the story ends. */
export function preferring(change: Partial<Preferences>): void {
  const before = getPreferences()
  setPreferences(change)
  undo.push(() => setPreferences(before))
}

/**
 * Makes the example's components read as failing to draw, with these errors by id, until the story ends. The example
 * draws everywhere, and its guest is shared by every story, so this wraps the guest's own status rather than breaking
 * a component.
 */
export function failingToDraw(errors: Record<string, string>): void {
  const guest = example().loaded.guest
  const real = guest.renderStatus
  if (!real) return
  const failing = Object.fromEntries(Object.entries(errors).map(([id, error]) => [id, { error }]))
  let seen: Record<string, ComponentRenderStatus> | undefined
  let merged: Record<string, ComponentRenderStatus> = failing
  guest.renderStatus = {
    get: () => {
      const now = real.get()
      if (now !== seen) {
        seen = now
        merged = { ...now, ...failing }
      }
      return merged
    },
    subscribe: real.subscribe
  }
  undo.push(() => {
    guest.renderStatus = real
  })
}

/** Keeps links the app opens in the browser from opening, until the story ends. */
export function keepingLinks(): void {
  const usual = window.open
  window.open = () => null
  undo.push(() => {
    window.open = usual
  })
}

/** An answer that never comes, to show what waiting looks like. Nothing waits on it once the story ends. */
export function never<T>(): Promise<T> {
  return new Promise(() => undefined)
}

/**
 * Puts back what a story changed when it ends: the service's answers, preferences, links, notifications nobody
 * dismissed, and the dialogs it left open, since whether they're open outlives the story.
 */
export function restore(): void {
  for (const step of undo.splice(0).reverse()) step()
  resetHost()
  clearNotifications()
  // From inside the dialog, as a person would press it, so the canvas's own Escape handling leaves it alone.
  const dialog = document.querySelector("[role=dialog], [role=alertdialog]")
  dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
}

/** Dismisses every notification; ones nobody dismissed would show again in the next story. */
export function clearNotifications(): void {
  toast.dismiss()
}

/**
 * Types into a text field a character at a time, as the keyboard does. `userEvent.type` changes the field without
 * React seeing it here, so a controlled field like a search shows the text but doesn't search.
 */
export async function typeInto(field: HTMLInputElement, text: string): Promise<void> {
  field.focus()
  const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
  for (const character of text) {
    value.set!.call(field, field.value + character)
    field.dispatchEvent(new InputEvent("input", { bubbles: true, data: character, inputType: "insertText" }))
    await pause(30)
  }
}

/** Waits for a notification and points at it, which holds it open as it does for a person, so it can be read. */
export async function holdToast(text: string | RegExp): Promise<void> {
  const shown = await waitFor(
    () => {
      const toasts = [...document.querySelectorAll<HTMLElement>("[data-sonner-toast]")]
      const found = toasts.find((candidate) => within(candidate).queryByText(text))
      if (!found) throw new Error(`No notification says ${String(text)}`)
      return found
    },
    { timeout: 8000 }
  )
  await userEvent.hover(shown)
}

async function until<T>(get: () => T | undefined): Promise<T> {
  for (;;) {
    const value = get()
    if (value) return value
    await pause(50)
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
