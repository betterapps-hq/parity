import type { ReactNode, SyntheticEvent } from "react"
import { storyNameFromExport, toId } from "storybook/internal/csf"
import { fireEvent } from "storybook/test"

/**
 * The kits a comparison shows, each a stories file under Parity/Kit comparison with one story per component, named
 * alike. The titles repeat each file's own, since Storybook reads a file's title without running it.
 */
const sides = {
  ours: {
    title: "Parity/Kit comparison/Ours",
    label: "Ours",
    detail: "radix-nova",
    description: "The app's own radix-nova files in components/ui"
  },
  buildkit: {
    title: "Parity/Kit comparison/Buildkit",
    label: "Buildkit",
    detail: "base-nova",
    description: "@buildkitgg/shadcn-baseui-nova, as published"
  },
  adapted: {
    title: "Parity/Kit comparison/Buildkit with app changes",
    label: "Buildkit + app changes",
    detail: "base-nova",
    description: "Buildkit's kit, with what the app changed by hand done from outside it"
  }
} as const

/**
 * One component in each kit, side by side. Each side is its own story in its own frame, so its popups, dialogs, focus
 * and toasts can't reach the other's, and both follow the theme chosen in the toolbar.
 *
 * Radix closes its menus and selects when their window loses focus, and the app's side loses it to the kit's whenever
 * Base UI's popups take focus as they open. So here the app's side doesn't hear its window lose focus, and its popups
 * stay open beside the kit's. In the app they'd close when the window does; Base UI's stay open.
 */
export function SideBySide({
  story,
  theme,
  adapted = false,
  stacked = false
}: {
  /** The export name the component's stories share, such as `DropdownMenu`. */
  story: string
  theme: unknown
  /** Shows a third side, for the components the app changed by hand: the kit with those changes made from outside. */
  adapted?: boolean
  /**
   * Puts the sides one above another, each the full width, for what lays itself out by the window's width: Sonner's
   * toasts take a phone's layout in a window as narrow as a column.
   */
  stacked?: boolean
}) {
  const shown = adapted ? [sides.ours, sides.buildkit, sides.adapted] : [sides.ours, sides.buildkit]
  const globals = `theme:${theme === "light" ? "light" : "dark"}`
  const tracks = `repeat(${shown.length}, minmax(0, 1fr))`
  return (
    <div
      className={`grid h-screen bg-background text-foreground ${stacked ? "divide-y" : "divide-x"}`}
      style={stacked ? { gridTemplateRows: tracks } : { gridTemplateColumns: tracks }}
    >
      {shown.map((side) => (
        <figure key={side.title} className="flex min-h-0 min-w-0 flex-col">
          {/* One line, the same height on every side, so what's below starts level and reads across. */}
          <figcaption
            title={side.description}
            className="flex h-9 shrink-0 items-center gap-2 overflow-hidden border-b px-4 text-xs whitespace-nowrap"
          >
            <span className="shrink-0 font-medium">{side.label}</span>
            <span className="min-w-0 truncate text-muted-foreground">{side.detail}</span>
          </figcaption>
          <iframe
            title={`${side.label}: ${storyNameFromExport(story)}`}
            src={`iframe.html?id=${toId(side.title, storyNameFromExport(story))}&viewMode=story&globals=${globals}`}
            onLoad={side === sides.ours ? hideWindowBlur : undefined}
            className="min-h-0 w-full flex-1 border-0"
          />
        </figure>
      ))}
    </div>
  )
}

/** Stops a frame's window telling what's in it that it lost focus, before anything listening hears it. */
function hideWindowBlur(event: SyntheticEvent<HTMLIFrameElement>): void {
  event.currentTarget.contentWindow?.addEventListener("blur", (blur) => blur.stopImmediatePropagation(), {
    capture: true
  })
}

/** Where one side draws a component: the app's background, with room around it for its popups. */
export function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-start gap-8 bg-background p-8 text-sm text-foreground">
      {children}
    </div>
  )
}

/**
 * Right-clicks a sample's context menu area near its top left, as a person would to open the menu, so the menu opens
 * at the same place on every side, with room to its right. Neither kit's context menu can be told to start open.
 */
export async function openContextMenu({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> {
  const area = canvasElement.querySelector<HTMLElement>("[data-sample=context-menu-trigger]")
  if (!area) throw new Error("The sample has no context menu area to right-click")
  const box = area.getBoundingClientRect()
  await fireEvent.contextMenu(area, { clientX: box.left + 16, clientY: box.top + 16 })
}

/** A row of one component's variants or states, named above them. */
export function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs text-muted-foreground">{label}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}
