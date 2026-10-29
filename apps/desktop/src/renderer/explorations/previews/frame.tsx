import { Component, ImageIcon, Layers, type LucideIcon, Palette, PanelLeftClose, Smile } from "lucide-react"
import type { ReactNode } from "react"

/** The dark canvas the explorations sit on, as the app draws it behind its panels. */
export function Stage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`relative min-h-screen bg-[#0c0c0f] p-10 text-foreground ${className}`}>{children}</div>
}

/** A caption over an example, in the explorations' dimmed type. */
export function Labeled({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="text-xs text-white/60">{label}</span>
        {note && <span className="text-[11px] text-white/35">{note}</span>}
      </div>
      {children}
    </div>
  )
}

const leftTabs: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "layers", label: "Layers", icon: Layers },
  { value: "components", label: "Components", icon: Component },
  { value: "icons", label: "Icons", icon: Smile },
  { value: "images", label: "Images", icon: ImageIcon },
  { value: "tokens", label: "Tokens", icon: Palette }
]

/**
 * The left panel as the app draws it, with one tab open: its tabs along the top, Pen style, the open one named. It
 * isn't wired to the app's layout, so a story can show any tab without changing what the app remembers.
 */
export function LeftPanelFrame({
  tab,
  width = 288,
  height = 760,
  children
}: {
  tab: "components" | "tokens"
  width?: number
  height?: number
  children: ReactNode
}) {
  return (
    <aside
      className="relative flex shrink-0 flex-col overflow-hidden rounded-lg border bg-background"
      style={{ width, height }}
      aria-label="Layers, assets and tokens"
    >
      <div className="flex items-center gap-1 border-b p-2">
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          {leftTabs.map(({ value, label, icon: Icon }) => (
            <span
              key={value}
              className={`flex h-8 items-center gap-1.5 rounded-lg text-sm ${
                value === tab
                  ? "min-w-0 bg-accent px-2.5 font-medium text-foreground"
                  : "w-8 shrink-0 justify-center text-muted-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {value === tab && <span className="truncate">{label}</span>}
            </span>
          ))}
        </div>
        <span className="grid size-7 place-items-center text-muted-foreground">
          <PanelLeftClose className="size-4" />
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  )
}

/** The canvas beside a panel, with a board or two faintly behind, so a panel and its cards sit where they would. */
export function CanvasBeside({ children }: { children?: ReactNode }) {
  return (
    <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-white/5 bg-[#101014]">
      <div className="absolute top-16 left-20 flex flex-col gap-2">
        <span className="text-xs text-white/40">Team members</span>
        <div className="h-[300px] w-[420px] rounded-sm bg-white/[0.06]" />
      </div>
      <div className="absolute top-16 left-[520px] flex flex-col gap-2">
        <span className="text-xs text-white/40">Pricing</span>
        <div className="h-[260px] w-[360px] rounded-sm bg-white/[0.06]" />
      </div>
      {children}
    </div>
  )
}
