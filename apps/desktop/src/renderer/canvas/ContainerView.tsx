import {
  boardRoot,
  changeCount,
  type ComponentLibrary,
  componentLibrary,
  frameSize,
  type ParamSpec,
  type ResolvedMode,
  resolveDesign,
  type StateSpec,
  variantChoices
} from "@parity/core"
import { ChevronDown, Crown, Rows3 } from "lucide-react"
import { type PointerEvent as ReactPointerEvent, type ReactNode, type Ref, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { stopEventPropagation } from "tldraw"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { deleteDesign, duplicateDesign, renameDesign, setDesignKind } from "../chrome/designs.ts"
import { ModeViewportIcon } from "../chrome/viewports.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { useContainerEntries, useModeSettings } from "../design-store.ts"
import { ModeView } from "../ModeView.tsx"
import { useInteractions, useRenameRequest, useSelection } from "../selection.ts"
import { useProject } from "./context.ts"
import { DesignIcon, designColor, kindColors } from "./kinds.tsx"
import { ModesMenu } from "./ModesMenu.tsx"
import { activeState, companionScale, containerModes, withShownModes } from "./view.ts"
import { useZoomStyle } from "./zoom-style.ts"

interface ContainerViewProps {
  ref?: Ref<HTMLDivElement>
  entry: ContainerEntry
  /** The pointer is over the board: its controls show. */
  hovered: boolean
  /** Starts dragging the design by its title. */
  onTitlePointerDown(event: ReactPointerEvent): void
  /** Where the title draws: the canvas's title layer, and the board's place and width on the canvas. */
  title?: { layer: HTMLElement; x: number; y: number; width: number }
}

/**
 * A design on the canvas. A title bar above it, drawn at screen size whatever the zoom, names the design and switches
 * its state and modes. The board holds a grid of frames: modes across, states down when every state is shown.
 */
export function ContainerView({ ref, entry, hovered, onTitlePointerDown, title }: ContainerViewProps) {
  const { store, loaded, selection } = useProject()
  const settings = useModeSettings(store)
  const selected = useSelection(selection)
  const entries = useContainerEntries(store)
  const library = useMemo(() => componentLibrary(entries.map((candidate) => candidate.container)), [entries])
  const { container, key } = entry
  const { primary, companions, all } = containerModes(settings, container)
  const active = activeState(container)
  const allStates = container.view?.allStates ?? false
  const rows = allStates ? container.states : [active]
  const columns = [primary, ...companions]
  const isSelected = selected.design === key
  const color = designColor(container.kind)
  const selectedMode = isSelected && !selected.node ? selected.mode : undefined

  const selectState = (state: string) => store.updateView(key, (view) => ({ ...view, state, allStates: false }))
  const showModes = (main: string, shown: string[]) =>
    store.updateView(key, (view) => withShownModes(view, main, shown, all))

  const titleBar = (
    <TitleBar showControls={hovered || isSelected}>
      <TitleButton entry={entry} color={isSelected ? color : undefined} onPointerDown={onTitlePointerDown} />
      <TitleControls>
        {Object.values(container.params ?? {}).some((param) => param.type === "variant") && (
          <VariantMenu
            params={container.params!}
            choices={variantChoices(container.params, container.view?.variants)}
            onSelect={(param, option) =>
              store.updateView(key, (view) => ({ ...view, variants: { ...view.variants, [param]: option } }))
            }
          />
        )}
        <StateMenu
          states={container.states}
          active={active.id}
          allStates={allStates}
          onSelect={selectState}
          onShowAll={(on) => store.updateView(key, (view) => ({ ...view, allStates: on }))}
        />
        <ModesMenu modes={all} main={primary} beside={companions} triggerClassName={menuTrigger} onChange={showModes} />
      </TitleControls>
    </TitleBar>
  )

  return (
    <div
      ref={ref}
      className="container-view relative w-max rounded-[20px] border bg-card p-8 font-sans text-card-foreground shadow-2xl"
      data-design={key}
    >
      {title
        ? createPortal(
            <div className="absolute" style={{ left: title.x, top: title.y, width: title.width }}>
              {titleBar}
            </div>,
            title.layer
          )
        : titleBar}

      <div className="flex flex-col">
        {rows.map((state, index) => (
          <section
            key={state.id}
            className={`state-row relative ${index > 0 ? "mt-12 border-t border-dashed pt-12" : ""}`}
            data-state={state.id}
          >
            {allStates && (
              <StateLabel
                state={state}
                base={index === 0}
                offset={index > 0 ? 48 : 0}
                onSelect={() => selectState(state.id)}
              />
            )}
            <div className="flex items-start gap-8">
              {columns.map((mode, column) => (
                <FrameTile
                  key={mode.id}
                  entry={entry}
                  state={state}
                  mode={mode}
                  primary={column === 0}
                  projectPrimary={mode.id === all[0]?.id}
                  scale={column === 0 ? 1 : companionScale(frameSize(container, mode).width)}
                  caption={index === 0}
                  selected={selectedMode === mode.id}
                  onSelect={() => selection.set({ design: key, mode: mode.id })}
                  divider={column === 1}
                  loaded={loaded}
                  library={library}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

/**
 * Sits above the board at screen size, the canvas zoom scaled back to 1, until the canvas is zoomed far out: then it
 * shrinks too, down to 60%, so names don't swamp the boards they name. The name always shows; the controls only while
 * the board is hovered or selected, or one of their menus is open, and there's room for them, so a canvas of designs
 * stays quiet.
 */
function TitleBar({ showControls, children }: { showControls: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useZoomStyle(ref, titleZoom)
  return (
    <div
      ref={ref}
      className="design-title group/title pointer-events-auto absolute bottom-full left-0 origin-bottom-left pb-2.5"
      data-controls={showControls}
    >
      <div className="@container flex h-8 min-w-0 items-center gap-3">{children}</div>
    </div>
  )
}

/** As wide on screen as the board, drawn at screen size down to 60%. */
function titleZoom(style: CSSStyleDeclaration, zoom: number): void {
  const scale = Math.min(1, Math.max(0.6, zoom * 2.5))
  style.width = `${(100 * zoom) / scale}%`
  style.transform = `scale(${scale / zoom})`
}

function labelZoom(style: CSSStyleDeclaration, zoom: number): void {
  style.transform = `scale(${1 / zoom})`
}

function TitleControls({ children }: { children: ReactNode }) {
  return (
    <div
      className="ml-auto hidden shrink-0 items-center gap-1.5 animate-in duration-150 fade-in-0 group-hover/title:flex group-data-[controls=true]/title:flex has-data-[state=open]:flex @max-[22rem]:hidden!"
      onPointerDown={stopEventPropagation}
    >
      {children}
    </div>
  )
}

/**
 * The design's name: drags the design, double-click renames it in place, and right-click opens what can be done with
 * the design as a whole.
 */
function TitleButton({
  entry,
  color,
  onPointerDown
}: {
  entry: ContainerEntry
  color: string | undefined
  onPointerDown(event: ReactPointerEvent): void
}) {
  const session = useProject()
  const [renaming, setRenaming] = useState(false)
  const { container } = entry

  // Edit > Rename, or F2, with the design selected.
  const renameRequest = useRenameRequest(session.selection)
  const [renameHandled, setRenameHandled] = useState(() => session.selection.getRename()?.id)
  if (renameRequest && renameRequest.id !== renameHandled) {
    setRenameHandled(renameRequest.id)
    if (renameRequest.design === entry.key && !renameRequest.node) setRenaming(true)
  }
  const icon = (
    <DesignIcon
      kind={container.kind}
      className="size-4 shrink-0"
      style={{ color: color ?? designColor(container.kind) }}
    />
  )
  if (renaming) {
    return (
      <div className="flex min-w-0 items-center gap-1.5 px-1" onPointerDown={stopEventPropagation}>
        {icon}
        <input
          ref={focusAndSelect}
          defaultValue={container.name}
          aria-label="Design name"
          className="h-7 w-56 min-w-0 rounded-md border bg-background px-2 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onBlur={(event) => {
            renameDesign(session, entry, event.currentTarget.value)
            setRenaming(false)
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === "Enter") event.currentTarget.blur()
            if (event.key === "Escape") setRenaming(false)
          }}
        />
      </div>
    )
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onPointerDown={onPointerDown}
          onContextMenu={stopEventPropagation}
          onDoubleClick={(event) => {
            event.stopPropagation()
            setRenaming(true)
          }}
          className="flex min-w-0 cursor-default items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-medium text-foreground/90 hover:text-foreground"
          style={color ? { color } : undefined}
          title={`${container.name}, in ${entry.path}. Double-click to rename.`}
        >
          {icon}
          <span className="truncate">{container.name}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" onPointerDown={stopEventPropagation}>
        <ContextMenuItem onSelect={() => setRenaming(true)}>Rename</ContextMenuItem>
        <ContextMenuItem onSelect={() => duplicateDesign(session, entry)}>Duplicate</ContextMenuItem>
        <ContextMenuItem
          onSelect={() => setDesignKind(session, entry, container.kind === "component" ? "screen" : "component")}
        >
          {container.kind === "component" ? "Make it a screen" : "Make it a component"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => deleteDesign(session, entry)}>
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Focuses a rename field when it appears and selects its text, ready to type over. */
function focusAndSelect(element: HTMLInputElement | null): void {
  element?.focus()
  element?.select()
}

const menuTrigger =
  "flex h-8 items-center gap-1.5 rounded-md border bg-background/80 px-2.5 text-sm shadow-xs backdrop-blur hover:bg-accent data-[state=open]:bg-accent"

/**
 * Which option of each variant the board shows. Edits on the board in its base state go to the options picked here,
 * other than the defaults.
 */
function VariantMenu({
  params,
  choices,
  onSelect
}: {
  params: Record<string, ParamSpec>
  choices: Record<string, string>
  onSelect(param: string, option: string): void
}) {
  const variants = Object.entries(params).filter(([name]) => choices[name] !== undefined)
  const label = variants
    .map(([name, param]) => param.options?.find((option) => option.id === choices[name])?.name ?? choices[name])
    .join(", ")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={menuTrigger} aria-label="Variant">
        <span className="max-w-48 truncate">{label}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {variants.map(([name, param], index) => (
          <div key={name}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{name}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={choices[name]} onValueChange={(option) => onSelect(name, option)}>
              {(param.options ?? []).map((option) => (
                <DropdownMenuRadioItem key={option.id} value={option.id}>
                  <span className="flex-1 truncate">{option.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.id === (param.default ?? param.options?.[0]?.id) ? "Default" : ""}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Which state the board shows: one of them, or every state in rows. */
function StateMenu({
  states,
  active,
  allStates,
  onSelect,
  onShowAll
}: {
  states: StateSpec[]
  active: string
  allStates: boolean
  onSelect(state: string): void
  onShowAll(on: boolean): void
}) {
  const current = states.find((state) => state.id === active)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={menuTrigger} aria-label="State">
        {allStates && <Rows3 className="size-3.5 opacity-70" />}
        <span className="max-w-40 truncate">{allStates ? "Every state" : (current?.name ?? "State")}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>State</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={allStates ? "" : active} onValueChange={onSelect}>
          {states.map((state, index) => {
            const changes = changeCount(state)
            return (
              <DropdownMenuRadioItem key={state.id} value={state.id}>
                <span className="flex-1 truncate">{state.name}</span>
                <span className="text-xs text-muted-foreground">
                  {index === 0 ? "Base" : `${changes} change${changes === 1 ? "" : "s"}`}
                </span>
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={allStates} onCheckedChange={(on) => onShowAll(on)}>
          Show every state
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Names a row in the every-state grid, to the left of the board at screen size. */
function StateLabel({
  state,
  base,
  offset,
  onSelect
}: {
  state: StateSpec
  base: boolean
  offset: number
  onSelect(): void
}) {
  const changes = changeCount(state)
  const ref = useRef<HTMLButtonElement>(null)
  useZoomStyle(ref, labelZoom)
  return (
    <button
      ref={ref}
      type="button"
      onPointerDown={stopEventPropagation}
      onClick={onSelect}
      className="state-label pointer-events-auto absolute right-full mr-8 flex origin-top-right flex-col items-end pr-4 text-right whitespace-nowrap"
      style={{ top: offset }}
      title={`Show only ${state.name}`}
    >
      <span className="text-sm font-medium text-foreground">{state.name}</span>
      <span className="text-xs text-muted-foreground">
        {base ? "Base state" : `${changes} change${changes === 1 ? "" : "s"}`}
      </span>
    </button>
  )
}

interface FrameTileProps {
  entry: ContainerEntry
  state: StateSpec
  mode: ResolvedMode
  /** The board's main frame. */
  primary: boolean
  /** The project's primary mode, marked with a crown. */
  projectPrimary: boolean
  scale: number
  /** Column headers show on the first row only; the columns line up below it. */
  caption: boolean
  selected: boolean
  divider: boolean
  loaded: ReturnType<typeof useProject>["loaded"]
  library: ComponentLibrary
  onSelect(): void
}

function FrameTile({
  entry,
  state,
  mode,
  primary,
  projectPrimary,
  scale,
  caption,
  selected,
  divider,
  loaded,
  library,
  onSelect
}: FrameTileProps) {
  const size = frameSize(entry.container, mode)
  const interactions = useInteractions(useProject().selection)
  return (
    <figure
      className={`mode-tile m-0 ${divider ? "ml-4 border-l border-dashed pl-12" : ""}`}
      data-mode={mode.id}
      data-primary={primary}
    >
      {caption && (
        <figcaption className="mb-3 flex h-6 items-center gap-2 text-sm">
          <button
            type="button"
            onPointerDown={stopEventPropagation}
            onClick={onSelect}
            className="pointer-events-auto flex min-w-0 items-center gap-1.5 font-medium hover:underline"
            style={selected ? { color: kindColors.mode } : undefined}
          >
            {projectPrimary && <Crown className="size-3.5 shrink-0 text-amber-400" aria-label="Primary mode" />}
            <ModeViewportIcon of={mode} className="size-3.5 shrink-0 opacity-70" aria-hidden />
            <span className="truncate">{mode.name}</span>
          </button>
          <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
            {size.width}
            {size.height !== undefined && ` × ${size.height}`}
          </span>
          {scale < 1 && (
            <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
              {Math.round(scale * 100)}%
            </span>
          )}
        </figcaption>
      )}
      <div className="transition-shadow" style={selected ? { boxShadow: `0 0 0 3px ${kindColors.mode}` } : undefined}>
        <ModeView
          loaded={loaded}
          tree={resolveDesign(boardRoot(entry.container), state, mode.viewport, library, {
            params: entry.container.params,
            choices: entry.container.view?.variants
          })}
          mode={mode}
          width={size.width}
          height={size.height}
          scale={scale}
          design={entry.key}
          state={state.id}
          primary={primary}
          interactions={interactions}
        />
      </div>
    </figure>
  )
}
