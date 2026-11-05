import { companionScale, type ResolvedMode } from "@parity-app/core"
import { AppWindow, ChevronDown, Component, Crown, Frame, type LucideProps } from "lucide-react"
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { kindColors } from "../../canvas/kinds.tsx"
import { labelLook } from "../../canvas/labels.ts"
import { ModesMenu } from "../../canvas/ModesMenu.tsx"
import { ModeViewportIcon } from "../../chrome/viewports.tsx"
import { modes, primaryMode } from "./data.ts"

/*
 * The canvas as the explorations draw it: tldraw's background in the app's theme, boards and frames placed on it at a
 * zoom, and their titles drawn at screen size above them, as the canvas draws them.
 */

/** The three kinds of top-level design, lightest first. */
export type Kind = "frame" | "component" | "screen"

/**
 * A frame's color. It's a layout on the canvas, so it's selected in the layer color; its icon and name stay neutral
 * until then, so a canvas of sketches reads quieter than one of screens and components.
 */
export const frameColor = kindColors.layer

export function kindColor(kind: Kind): string {
  if (kind === "component") return kindColors.component
  if (kind === "screen") return kindColors.screen
  return frameColor
}

/**
 * Each kind's icon. A frame takes lucide's Frame, Figma's frame glyph, which screens use today; screens get AppWindow
 * here as a stand-in for the icon PAR-538 picks.
 */
export function KindIcon({ kind, ...props }: LucideProps & { kind: Kind }) {
  if (kind === "component") return <Component {...props} />
  if (kind === "screen") return <AppWindow {...props} />
  return <Frame {...props} />
}

export const kindNames: Record<Kind, string> = { frame: "Frame", component: "Component", screen: "Screen" }

/** The canvas behind the panels, in the app's theme. */
export function CanvasStage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`relative h-screen min-h-[680px] overflow-hidden bg-[#f9fafb] font-sans text-foreground dark:bg-[#101011] ${className}`}
    >
      {children}
    </div>
  )
}

/** Puts something on the canvas at a point on the screen. */
export function At({
  x,
  y,
  children,
  className = ""
}: {
  x: number
  y: number
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`absolute ${className}`} style={{ left: x, top: y }}>
      {children}
    </div>
  )
}

const menuTrigger =
  "flex h-8 items-center gap-1.5 rounded-md border bg-background/80 px-2.5 text-sm shadow-xs backdrop-blur hover:bg-accent data-[state=open]:bg-accent"

/**
 * Steps something down until it fits its box: `steps` versions of it, fullest first, each tried in turn until one no
 * longer overflows. Remounted at each width (see its callers' keys), so it starts again from the fullest.
 */
function useFitStep(steps: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  useLayoutEffect(() => {
    const box = ref.current
    if (box && step < steps - 1 && box.scrollWidth > box.clientWidth + 0.5) setStep(step + 1)
  }, [step, steps])
  return { ref, step }
}

/**
 * The name above a board, drawn at screen size whatever the zoom, with the board's menus at the right. The menus show
 * only while they fit beside the whole name; past that only the name shows, and it can run past the board's edge
 * rather than be cut off.
 */
function TitleBar({
  name,
  controls,
  zoom,
  width
}: {
  name: ReactNode
  controls?: ReactNode
  zoom: number
  /** The board's width on screen. */
  width: number
}) {
  const { ref, step } = useFitStep(controls ? 2 : 1)
  // Zoomed out past 40%, it shrinks with the canvas, as every name does, down to 60%.
  const { scale } = labelLook("name", zoom)
  return (
    <div className="absolute bottom-full left-0 pb-2" style={{ zoom: scale, width: width / scale }}>
      <div ref={ref} className="flex h-8 w-full items-center gap-3 whitespace-nowrap">
        {name}
        {step === 0 && controls}
      </div>
    </div>
  )
}

function StateTrigger({ states }: { states: string[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={menuTrigger} aria-label="State">
        <span className="max-w-40 truncate">{states[0]}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>State</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={states[0]}>
          {states.map((state) => (
            <DropdownMenuRadioItem key={state} value={state}>
              {state}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A board's or frame's name, with its kind's icon, in its color once selected. */
function DesignName({
  kind,
  name,
  selected,
  quiet
}: {
  kind: Kind
  name: string
  selected?: boolean
  quiet?: boolean
}) {
  const color = kindColor(kind)
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 px-1 py-0.5 ${
        quiet ? "text-[13px] text-muted-foreground" : "text-sm font-medium text-foreground/90"
      }`}
      style={selected ? { color } : undefined}
    >
      <KindIcon
        kind={kind}
        className={`shrink-0 ${quiet ? "size-3.5" : "size-4"}`}
        style={{ color: quiet && !selected ? undefined : color }}
      />
      <span>{name}</span>
    </span>
  )
}

/** One mode's preview on a board, and what it shows. */
export interface Preview {
  mode: ResolvedMode
  /** The design, drawn at the mode's width. */
  content: ReactNode
  /** Drawn wider than this, a companion is shrunk to fit, as the canvas does. */
  width: number
}

/**
 * A screen's or a component's board, as `ContainerView` draws it: the title above with its state and modes menus while
 * hovered or selected, then a preview for each mode, the main one first.
 */
export function Board({
  kind,
  name,
  zoom,
  previews,
  states = ["Default"],
  controls = false,
  selected = false
}: {
  kind: "screen" | "component"
  name: string
  zoom: number
  previews: Preview[]
  states?: string[]
  controls?: boolean
  selected?: boolean
}) {
  const [main, ...beside] = previews
  const gutter = gutterAt(zoom)
  // The board's width on screen, which the title bar's menus have to fit in.
  const onScreen = Math.round(
    previews.reduce((sum, preview, index) => sum + preview.width * (index ? companionScale(preview.width) : 1), 0) *
      zoom +
      gutter.side * 2 +
      beside.length * gutter.between
  )
  return (
    <div className="relative w-max">
      <TitleBar
        key={onScreen}
        zoom={zoom}
        width={onScreen}
        name={<DesignName kind={kind} name={name} selected={selected} />}
        controls={
          controls &&
          main && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <StateTrigger states={states} />
              <ModesMenu
                modes={[...modes]}
                main={main.mode}
                beside={beside.map((preview) => preview.mode)}
                triggerClassName={menuTrigger}
                onChange={() => undefined}
              />
            </div>
          )
        }
      />
      <div
        className="relative w-max rounded-lg border bg-card text-card-foreground shadow-2xl"
        style={{
          padding: `0 ${gutter.side}px ${gutter.side}px`,
          ...(selected ? { boxShadow: `0 0 0 2px ${kindColor(kind)}` } : {})
        }}
      >
        <div className="flex items-start">
          {previews.map((preview, index) => (
            <PreviewTile
              key={preview.mode.id}
              preview={preview}
              zoom={zoom}
              gutter={gutter}
              first={index === 0}
              last={index === previews.length - 1}
              divider={index === 1}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * The board's gutter in screen pixels, so the band around the previews is the same at every zoom up close: 12px at the
 * sides and bottom, and a 36px band at the top for the captions. Past 40% it shrinks with the canvas, with the
 * captions in it, so a board never takes more room on the canvas than it does at 40% and boards zoomed far out don't
 * run into each other. The captions don't fade; they hide only once they're too small to read, at 10%.
 */
function gutterAt(zoom: number) {
  const s = labelLook("detail", zoom).scale
  return { side: 12 * s, caption: 36 * s, between: 24 * s }
}

function PreviewTile({
  preview,
  zoom,
  gutter,
  first,
  last,
  divider
}: {
  preview: Preview
  zoom: number
  gutter: ReturnType<typeof gutterAt>
  first: boolean
  last: boolean
  divider: boolean
}) {
  const scale = first ? 1 : companionScale(preview.width)
  const look = labelLook("detail", zoom)
  // The room its caption has on screen: the preview's width, and the last one the gutter past it too.
  const room = Math.round(preview.width * scale * zoom + (last ? gutter.side : 0))
  // The first preview starts at the gutter, the divider sits halfway to the next, and the rest follow at the gap.
  let spacing: CSSProperties | undefined
  if (divider) {
    spacing = {
      marginLeft: gutter.between / 2,
      borderLeftWidth: 1,
      borderLeftStyle: "dashed",
      paddingLeft: gutter.between / 2
    }
  } else if (!first) spacing = { marginLeft: gutter.between }
  return (
    <figure className="m-0" style={spacing}>
      <figcaption className="relative" style={{ height: gutter.caption }}>
        <div
          className="absolute inset-y-0 left-0 flex items-center"
          style={{ zoom: look.scale, width: room / look.scale, visibility: zoom < 0.1 ? "hidden" : undefined }}
        >
          <Caption key={room} preview={preview} scale={scale} />
        </div>
      </figcaption>
      <div style={{ zoom: scale * zoom }}>{preview.content}</div>
    </figure>
  )
}

/**
 * A preview's caption, which never truncates. Short of room it drops the shrink, then the width, then the mode's name,
 * leaving its icon, and hides altogether before anything is cut off.
 */
function Caption({ preview, scale }: { preview: Preview; scale: number }) {
  const { ref, step } = useFitStep(5)
  const chip = "shrink-0 rounded bg-muted px-1 text-[11px] leading-4 text-muted-foreground tabular-nums"
  return (
    <div
      ref={ref}
      className="flex w-full items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap"
      title={preview.mode.name}
    >
      {step < 4 && (
        <span className="flex shrink-0 items-center gap-1 font-medium">
          {preview.mode.id === primaryMode.id && (
            <Crown className="size-3 shrink-0 text-amber-400" aria-label="Primary mode" />
          )}
          <ModeViewportIcon of={preview.mode} className="size-3 shrink-0 opacity-70" aria-hidden />
          {step < 3 && <span>{preview.mode.name}</span>}
        </span>
      )}
      {step < 2 && <span className={chip}>{preview.width}</span>}
      {step < 1 && scale < 1 && <span className={chip}>{Math.round(scale * 100)}%</span>}
    </div>
  )
}

/** What a selected frame shows around it: an outline, a handle at each corner, and its size underneath. */
function Selection({ size, color = frameColor }: { size: string; color?: string }) {
  const handle = "absolute size-2 rounded-[1px] border bg-white"
  return (
    <div className="pointer-events-none absolute inset-0" style={{ outline: `1.5px solid ${color}` }}>
      {(["-top-1 -left-1", "-top-1 -right-1", "-bottom-1 -left-1", "-bottom-1 -right-1"] as const).map((place) => (
        <span key={place} className={`${handle} ${place}`} style={{ borderColor: color }} />
      ))}
      <span
        className="absolute top-full left-1/2 mt-2 -translate-x-1/2 rounded-[4px] px-1.5 py-px text-[11px] font-medium whitespace-nowrap text-white tabular-nums"
        style={{ background: color }}
      >
        {size}
      </span>
    </div>
  )
}

/**
 * A frame on the canvas: no board, no previews, no menus. Just its name above it, quiet, and the design at its own
 * size in the primary mode, filled with the project's background as a page would be.
 */
export function CanvasFrame({
  name,
  zoom,
  selected = false,
  size,
  outline = false,
  children
}: {
  name: string
  zoom: number
  selected?: boolean
  /** The size shown under it once selected; "Hug" for a side that hugs its content. */
  size?: string
  /** A hairline around it, as when the pointer is over it. */
  outline?: boolean
  children: ReactNode
}) {
  return (
    <div className="relative w-max">
      <div className="absolute bottom-full left-0 pb-1" style={{ zoom: labelLook("name", zoom).scale }}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              className="flex cursor-default rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <DesignName kind="frame" name={name} selected={selected} quiet />
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            <ContextMenuItem>Rename</ContextMenuItem>
            <ContextMenuItem>Duplicate</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem>
              <Component />
              Convert to component
            </ContextMenuItem>
            <ContextMenuItem>
              <AppWindow />
              Convert to screen
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
      <div style={{ zoom }} className="relative">
        <div
          className="relative w-max shadow-sm"
          // A hairline, so a white frame still has an edge on the light canvas; hovered, the frame color instead.
          style={{
            outline: outline
              ? `${1 / zoom}px solid ${frameColor}`
              : `${1 / zoom}px solid color-mix(in oklch, var(--foreground) 12%, transparent)`
          }}
        >
          {children}
        </div>
      </div>
      {selected && size && <Selection size={size} />}
    </div>
  )
}

/** A rectangle being dragged out with the frame tool, with its size underneath as it grows. */
export function DraggedFrame({ width, height, size }: { width: number; height: number; size: string }) {
  return (
    <div className="relative" style={{ width, height, background: "rgb(255 255 255 / 0.9)" }}>
      <Selection size={size} />
    </div>
  )
}

/** A snapping guide across the canvas, in the color snapping uses. */
export function Guide({
  x,
  y,
  length,
  vertical = false
}: {
  x: number
  y: number
  length: number
  vertical?: boolean
}) {
  return (
    <div
      className="absolute bg-[oklch(0.68_0.21_15)]"
      style={vertical ? { left: x, top: y, width: 1, height: length } : { left: x, top: y, height: 1, width: length }}
    />
  )
}

/** The pointer, drawn where a story needs it: the arrow, the crosshair the frame tool shows, or the text cursor. */
export function Pointer({ x, y, kind }: { x: number; y: number; kind: "arrow" | "crosshair" | "text" }) {
  if (kind === "arrow") {
    return (
      <svg
        className="pointer-events-none absolute drop-shadow"
        style={{ left: x, top: y }}
        width="18"
        height="22"
        viewBox="0 0 18 22"
        aria-hidden
      >
        <path
          d="M1 1 L1 17 L5.5 13 L8.5 20 L11 19 L8 12 L14 12 Z"
          fill="black"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (kind === "text") {
    return (
      <svg
        className="pointer-events-none absolute"
        style={{ left: x - 5, top: y - 10 }}
        width="10"
        height="20"
        viewBox="0 0 10 20"
        aria-hidden
      >
        <path d="M2 1 H8 M5 1 V19 M2 19 H8" stroke="white" strokeWidth="3" strokeLinecap="round" />
        <path d="M2 1 H8 M5 1 V19 M2 19 H8" stroke="black" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg
      className="pointer-events-none absolute"
      style={{ left: x - 10, top: y - 10 }}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden
    >
      <path d="M10 1 V19 M1 10 H19" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <path d="M10 1 V19 M1 10 H19" stroke="black" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

/** A short line of explanation pinned to the canvas, in the explorations' dimmed type, for a reviewer. */
export function Explainer({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1" style={{ width: 320 }}>
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="text-[13px] leading-snug text-muted-foreground">{children}</span>
    </div>
  )
}
