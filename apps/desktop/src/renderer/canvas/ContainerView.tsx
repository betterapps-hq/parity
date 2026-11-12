import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import {
  boardRoot,
  changeCount,
  companionScale,
  type ComponentLibrary,
  type ContainerKind,
  designStates,
  frameGeometry,
  frameSize,
  type ParamSpec,
  resolveDesign,
  type ResolvedMode,
  type StateSpec,
  variantChoices
} from "@parity-app/core"
import {
  activeState,
  type BoardBox,
  fittedFrame,
  hugsContent,
  kindName,
  kindTitle,
  stateLabelSpace,
  titleReach
} from "@parity-app/editor"
import { ChevronDown, Crown, Rows3 } from "lucide-react"
import {
  type CSSProperties,
  memo,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { createPortal } from "react-dom"
import { stopEventPropagation } from "tldraw"
import { deleteDesign, duplicateDesign, renameDesign, setDesignKind } from "../chrome/designs.ts"
import { Hint } from "../chrome/Hint.tsx"
import { Name, NameInput } from "../chrome/Name.tsx"
import { ModeViewportIcon } from "../chrome/viewports.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { useLibrary, useModeSettings } from "../design-store.ts"
import { findNodeElement, frameHeightProperty } from "../frame.ts"
import { ModeView } from "../ModeView.tsx"
import { useDesignSelection, useInteracting, useInteractions, useRenameRequest } from "../selection.ts"
import { type BoardPart, useGutterStyle } from "./board-gutter.ts"
import { ConsoleBadge } from "./ConsoleBadge.tsx"
import { useProject } from "./context.ts"
import { drawnHeight, useFirstDrawWaits, useFirstRowFrame, useFrameBitmap, useFrameShows } from "./frame-bitmaps.ts"
import { useDesignChange, useFrameChange } from "./frame-changes.ts"
import { useFrameSkeleton } from "./frame-skeletons.ts"
import { type BoardRest, useAwake } from "./frame-sleep.ts"
import { useFrameView } from "./frame-view.ts"
import { useFrameOnScreen } from "./frames-on-screen.ts"
import { FrameSkeleton } from "./FrameSkeleton.tsx"
import { DesignIcon, designColor, kindColors } from "./kinds.tsx"
import { type LabelReach, useCanvasLabel } from "./labels.ts"
import { ModesMenu } from "./ModesMenu.tsx"
import { Used, useMountOnUse, useUsed } from "./mount-on-use.tsx"
import { containerModes, modeNames, withShownModes } from "./view.ts"

interface ContainerViewProps {
  /** The board's element, which the canvas sizes its shape by. */
  ref?: RefObject<HTMLDivElement | null>
  entry: ContainerEntry
  /** The pointer is over the board: its controls show. */
  hovered: boolean
  /** Starts dragging the design by its title. */
  onTitlePointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  /**
   * Where the title draws: the canvas's title layer, the board's place and size on the canvas, and what else is on the
   * page, which a title zoomed out runs up to (see `titleReach`). `others` reads the canvas, so the title follows as
   * things around it move without the board drawing again.
   */
  title?: { layer: HTMLElement; x: number; y: number; width: number; height: number; others: () => readonly BoardBox[] }
  /** When the board's frames sleep and wake (see frame-sleep.ts). Without it, as in stories, they never sleep. */
  rest?: BoardRest
}

/** A design on the canvas: a frame on its own (see `FrameView`), and a screen or a component on its board. */
export function ContainerView(props: ContainerViewProps) {
  return props.entry.container.kind === "frame" ? <FrameView {...props} /> : <BoardView {...props} />
}

/**
 * A frame on the canvas, the light kind: no board, previews or menus. Its name sits above it, smaller and quieter than
 * a board's, and the design is drawn at its own size in the project's primary mode, as its layers are (PAR-545).
 */
function FrameView({ ref, entry, hovered, onTitlePointerDown, title, rest }: ContainerViewProps) {
  const own = useRef<HTMLDivElement>(null)
  const board = ref ?? own
  const { id: project, store, loaded, selection } = useProject()
  const settings = useModeSettings(store)
  const { selected: isSelected } = useDesignSelection(selection, entry.key)
  const change = useDesignChange(project, entry.key)
  const library = useLibrary(store, entry.key)
  const { container, key } = entry
  const { primary } = useMemo(() => containerModes(settings, container), [settings, container])
  const state = designStates(container)[0]!
  useFitToContent(board, entry)

  const titleBar = (
    // Its name runs past a narrow frame rather than being cut off, since there's no board for it to fit.
    <TitleBar active={hovered || isSelected} width={undefined} quiet>
      <TitleButton
        entry={entry}
        selected={isSelected}
        color={isSelected ? designColor(container.kind) : undefined}
        quiet
        onPointerDown={onTitlePointerDown}
      />
    </TitleBar>
  )

  return (
    <div
      ref={board}
      className="container-view frame-view relative w-max font-sans"
      data-design={key}
      data-changed={change.state === "changed" ? "" : undefined}
    >
      {title
        ? createPortal(
            <div className="absolute" style={{ left: title.x, top: title.y, width: title.width }}>
              {titleBar}
            </div>,
            title.layer
          )
        : titleBar}
      <FrameTile
        entry={entry}
        state={state}
        mode={primary}
        primary
        projectPrimary
        scale={1}
        caption={false}
        tabbable={isSelected}
        selected={false}
        place="firstFrame"
        loaded={loaded}
        library={library}
        rest={rest}
      />
    </div>
  )
}

/**
 * Keeps a frame that hugs its content as wide as its root is drawn (see `fittedFrame`), so its own size, which its
 * bitmap, agents and exports go by, is what it shows. The size follows from the layers, so keeping it isn't a step of
 * its own to undo: undo puts back the size the layers had then, and the root is measured again.
 */
function useFitToContent(board: RefObject<HTMLDivElement | null>, entry: ContainerEntry): void {
  const { store } = useProject()
  const hugs = hugsContent(entry.container)
  const { key } = entry
  useEffect(() => {
    const host = board.current?.querySelector<HTMLElement>("[data-frame]")

    if (!hugs || !host) {
      return undefined
    }

    const rootElement = () => {
      const current = store.getEntry(key)?.container

      return current && findNodeElement(host, current.root.id)
    }

    const fit = () => {
      const width = contentWidth(rootElement())
      const current = store.getEntry(key)?.container

      if (!width || !current || !fittedFrame(current, width)) {
        return
      }

      store.updateContainer(key, "Fit frame", (design) => fittedFrame(design, width) ?? design, { history: false })
    }

    const observer = new ResizeObserver(fit)
    let watched: Element | undefined

    const watch = () => {
      const root = rootElement()

      if (root === watched) {
        return
      }

      observer.disconnect()
      watched = root

      if (root) {
        observer.observe(root)
      }
    }

    // The design is drawn into the frame's shadow root, once the frame has made it, and its root element can be drawn
    // again as it changes.
    const drawn = new MutationObserver(() => {
      watch()
      fit()
    })

    let frame = 0

    const start = () => {
      if (!host.shadowRoot) {
        frame = requestAnimationFrame(start)

        return
      }

      drawn.observe(host.shadowRoot, { childList: true, subtree: true, characterData: true })
      watch()
    }

    start()

    return () => {
      cancelAnimationFrame(frame)
      drawn.disconnect()
      observer.disconnect()
    }
  }, [board, hugs, key, store])
}

/**
 * How wide an element is when nothing holds it in: its content's width on one line, as a frame that hugs it is drawn,
 * rounded up to a whole pixel so text that's a fraction wider doesn't wrap. The frame lays its root out at the frame's
 * own width, which is the last width measured, so the root is measured at its content's width for a moment, without
 * being drawn so.
 */
function contentWidth(element: HTMLElement | undefined): number | undefined {
  if (!element) {
    return undefined
  }

  const { width } = element.style
  element.style.width = "max-content"
  const style = getComputedStyle(element)
  const side = (name: string) => parseFloat(style.getPropertyValue(name)) || 0

  const sides =
    style.boxSizing === "border-box"
      ? 0
      : side("padding-left") + side("padding-right") + side("border-left-width") + side("border-right-width")

  const measured = parseFloat(style.width) + sides
  element.style.width = width

  return measured > 0 ? Math.ceil(measured - 0.01) : undefined
}

/**
 * A screen or a component on the canvas. A title bar above it, drawn at screen size whatever the zoom, names the design
 * and switches its state and modes. The board holds a grid of frames: modes across, states down when every state is
 * shown. Its gutter, the band around and between the frames, keeps its screen size up close and shrinks with the canvas
 * past 40%, as its labels do (see `boardLayoutAt`, PAR-602).
 */
function BoardView({ ref, entry, hovered, onTitlePointerDown, title, rest }: ContainerViewProps) {
  const own = useRef<HTMLDivElement>(null)
  const board = ref ?? own
  useGutterStyle(board, "board")
  const { id: project, store, loaded, selection } = useProject()
  // Whether its frames changed since they were first looked at, marked on the board for tools to read (PAR-997).
  const change = useDesignChange(project, entry.key)
  const settings = useModeSettings(store)
  const { selected: isSelected, mode: selectedMode } = useDesignSelection(selection, entry.key)
  const library = useLibrary(store, entry.key)
  const { container, key } = entry
  // Kept while the modes and the design are, so frames that show nothing new aren't drawn again.
  const { primary, companions, all } = useMemo(() => containerModes(settings, container), [settings, container])
  const active = activeState(container)
  const allStates = container.view?.allStates ?? false
  const states = designStates(container)
  const rows = allStates ? states : [active]
  const columns = [primary, ...companions]
  const color = designColor(container.kind)
  // How wide the board is on the canvas, which its labels hide by once it's too narrow on screen.
  const width = title?.width

  const stateName = (id: string) => states.find((state) => state.id === id)?.name ?? id

  const selectState = (state: string) =>
    store.updateView(key, `Show ${stateName(state)}`, (view) => ({ ...view, state, allStates: false }))

  const showModes = (main: string, shown: string[]) =>
    store.updateView(key, `Show ${modeNames(all, shown)}`, (view) => withShownModes(view, main, shown, all))

  const titleBar = (
    <TitleBar active={hovered || isSelected} width={width} board={title}>
      <TitleButton
        entry={entry}
        selected={isSelected}
        color={isSelected ? color : undefined}
        onPointerDown={onTitlePointerDown}
      />
      <ConsoleBadge design={key} name={container.name} />
      <TitleControls>
        {Object.values(container.params ?? {}).some((param) => param.type === "variant") && (
          <VariantMenu
            params={container.params!}
            choices={variantChoices(container.params, container.view?.variants)}
            onSelect={(param, option) =>
              store.updateView(
                key,
                `Show ${container.params?.[param]?.options?.find(({ id }) => id === option)?.name ?? option}`,
                (view) => ({ ...view, variants: { ...view.variants, [param]: option } })
              )
            }
          />
        )}
        {container.kind === "component" && (
          <StateMenu
            states={states}
            active={active.id}
            allStates={allStates}
            onSelect={selectState}
            onShowAll={(on) =>
              store.updateView(key, on ? "Show every state" : `Show ${active.name}`, (view) => ({
                ...view,
                allStates: on
              }))
            }
          />
        )}
        <ModesMenu modes={all} main={primary} beside={companions} triggerClassName={menuTrigger} onChange={showModes} />
      </TitleControls>
    </TitleBar>
  )

  return (
    <div
      ref={board}
      className="container-view relative w-max bg-card font-sans text-card-foreground shadow-2xl"
      data-design={key}
      data-changed={change.state === "changed" ? "" : undefined}
    >
      <BoardEdge />
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
          <StateRow
            key={state.id}
            state={state.id}
            first={index === 0}
            label={
              rows.length > 1 && (
                <StateLabel
                  state={state}
                  base={index === 0}
                  boardWidth={width}
                  tabbable={isSelected}
                  onSelect={() => selectState(state.id)}
                />
              )
            }
          >
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
                tabbable={isSelected}
                selected={selectedMode === mode.id}
                place={framePlace(column)}
                loaded={loaded}
                library={library}
                rest={rest}
              />
            ))}
          </StateRow>
        ))}
      </div>
    </div>
  )
}

/** Where a frame is in its row, by its column: the main frame, then the first companion, after the dashed line. */
function framePlace(column: number): FrameTileProps["place"] {
  if (column === 0) {
    return "firstFrame"
  }

  return column === 1 ? "dividedFrame" : "nextFrame"
}

/** The board's edge, a screen pixel wide at any zoom. It's drawn over the board rather than as its border, which would take room. */
function BoardEdge() {
  const ref = useRef<HTMLDivElement>(null)
  useGutterStyle(ref, "edge")

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 origin-top-left border border-solid"
    />
  )
}

/** A dashed line on the board, which takes no room: the space around it leaves room for it. */
function DashedLine({ part }: { part: "rowLine" | "frameLine" }) {
  const ref = useRef<HTMLSpanElement>(null)
  useGutterStyle(ref, part)

  return (
    <span
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute top-0 left-0 block origin-top-left border-dashed ${
        part === "rowLine" ? "border-t" : "border-l"
      }`}
    />
  )
}

/**
 * One state's row of the board's frames. The first sits below the band its frames' captions are in; a later one below a
 * dashed line. Either way the row's own height is its frames', which its state's label is measured by (see
 * `useLabelSpace`).
 */
function StateRow({
  state,
  first,
  label,
  children
}: {
  state: string
  first: boolean
  label: ReactNode
  children: ReactNode
}) {
  const row = useRef<HTMLElement>(null)
  const frames = useRef<HTMLDivElement>(null)
  useGutterStyle(row, first ? "firstRow" : "nextRow")
  useGutterStyle(frames, first ? "firstRowFrames" : "nextRowFrames")

  return (
    <section ref={row} className="state-row relative" data-state={state}>
      {!first && <DashedLine part="rowLine" />}
      {label}
      <div ref={frames} className="flex items-start">
        {children}
      </div>
    </section>
  )
}

/**
 * Sits above the board, as wide on screen as the board, and follows the zoom as a name does (see `labelLook`): at
 * screen size up close, then shrinking down to 60%, so names don't swamp the boards they name. The name is clipped to
 * the board's width, or zoomed out to the free canvas beside it (see `useTitleReach`), and shows until the board is too
 * narrow on screen to read it; the controls only while the board
 * is hovered or selected, or one of their menus is open, and there's room for them, so a canvas of designs stays quiet.
 * Its menus and hints mount once it's first used (see `useMountOnUse`), so a canvas of designs opens sooner.
 */
function TitleBar({
  active,
  width,
  quiet = false,
  board,
  children
}: {
  /** The design is hovered or selected: its controls show. */
  active: boolean
  /** How wide the board is on the canvas. */
  width: number | undefined
  /** A frame's: closer to it, as it has no board around it. */
  quiet?: boolean
  /** Where the board is on the canvas, and what else is there, which its name runs up to zoomed out. */
  board?: TitleBoard
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reach = useTitleReach(board)
  useCanvasLabel(ref, "name", { fit: true, width, reach })
  const { used, area } = useMountOnUse(active)

  return (
    <div
      ref={ref}
      className={`design-title group/title pointer-events-auto absolute bottom-full left-0 origin-bottom-left ${
        quiet ? "w-max pb-1" : "pb-2.5"
      }`}
      data-controls={active}
      {...area}
    >
      <div className={`@container flex min-w-0 items-center gap-3 ${quiet ? "h-6" : "h-8"}`}>
        <Used value={used}>{children}</Used>
      </div>
    </div>
  )
}

/** A board's place on the canvas for its title, with what else is on the page. */
type TitleBoard = { x: number; y: number; width: number; height: number; others: () => readonly BoardBox[] }

/** Below this many pixels across at its drawn size, a title has no room for its controls: Tailwind's 22rem. */
const controlsRoom = 352

/**
 * How wide a board's title may be at a zoom (see `titleReach`). While the board is too narrow on screen for the
 * title's controls, it's out to the next board beside it, or as wide as the controls would need with nothing there, so
 * a name zoomed out isn't cut off at a narrow board's edge, and the controls hide (see `TitleControls`). With room for
 * them, it's the board's width, so they sit at its edge.
 */
function useTitleReach(board: TitleBoard | undefined): LabelReach | undefined {
  const { x, y, width, height, others } = board ?? {}

  return useMemo(() => {
    if (x === undefined || y === undefined || width === undefined || height === undefined || !others) {
      return undefined
    }

    const box = { x, y, w: width, h: height }

    return (zoom, scale) => {
      const open = (controlsRoom * scale) / zoom

      return width < open ? (titleReach(box, others(), zoom, scale) ?? open) : width
    }
  }, [x, y, width, height, others])
}

/** A board's menus, mounted once its title is used: until then they'd be hidden anyway. */
function TitleControls({ children }: { children: ReactNode }) {
  const used = useUsed()

  return (
    <div
      // Out of the layout while the name runs past a narrow board, where they'd sit beyond its edge and take the name's
      // room (see useTitleReach).
      className="ml-auto hidden shrink-0 items-center gap-1.5 animate-in duration-150 fade-in-0 group-hover/title:flex group-data-[controls=true]/title:flex has-aria-expanded:flex group-data-past-edge/title:hidden! @max-[22rem]:hidden!"
      // Enter and the arrows on its menus open them, rather than going to the canvas (see shortcuts.ts).
      data-canvas-control
      onPointerDown={stopEventPropagation}
    >
      {used && children}
    </div>
  )
}

/**
 * The design's name: drags the design, double-click renames it in place, and right-click opens what can be done with
 * the design as a whole. Only the selected design's title, menus, mode captions and state labels are in the tab order,
 * so Tab from it leaves the canvas after them rather than going through every other board (PAR-424).
 */
function TitleButton({
  entry,
  selected,
  color,
  quiet = false,
  onPointerDown
}: {
  entry: ContainerEntry
  selected: boolean
  color: string | undefined
  /** A frame's name: regular, with a smaller icon, and neutral until it's selected. */
  quiet?: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
}) {
  const session = useProject()
  const used = useUsed()
  const [renaming, setRenaming] = useState(false)
  const { container } = entry

  // Edit > Rename, or F2, with the design selected.
  const renameRequest = useRenameRequest(session.selection)
  const [renameHandled, setRenameHandled] = useState(() => session.selection.getRename()?.id)

  if (renameRequest && renameRequest.id !== renameHandled) {
    setRenameHandled(renameRequest.id)

    if (renameRequest.design === entry.key && !renameRequest.node) {
      setRenaming(true)
    }
  }

  const icon = (
    <DesignIcon
      kind={container.kind}
      className={`shrink-0 ${quiet ? "size-3.5" : "size-4"}`}
      style={{ color: color ?? (quiet ? undefined : designColor(container.kind)) }}
    />
  )

  const others = convertKinds.filter((kind) => kind !== (container.kind ?? "screen"))

  if (renaming) {
    return (
      <div className="flex min-w-0 items-center gap-1.5 px-1" onPointerDown={stopEventPropagation}>
        {icon}
        <NameInput
          ref={focusAndSelect}
          defaultValue={container.name}
          aria-label={`${kindTitle(container.kind)} name`}
          className="h-7 w-56 min-w-0 rounded-md border bg-background px-2 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-background"
          onBlur={(event) => {
            renameDesign(session, entry, event.currentTarget.value)
            setRenaming(false)
          }}
          onKeyDown={(event) => {
            event.stopPropagation()

            if (event.key === "Enter") {
              event.currentTarget.blur()
            }

            if (event.key === "Escape") {
              setRenaming(false)
            }
          }}
        />
      </div>
    )
  }

  // Until the title is used it's the button alone, without the menu and hint, which would only slow the canvas opening.
  const button = (
    <button
      type="button"
      tabIndex={selected ? 0 : -1}
      onPointerDown={onPointerDown}
      onContextMenu={stopEventPropagation}
      onDoubleClick={(event) => {
        event.stopPropagation()
        setRenaming(true)
      }}
      className={`flex min-w-0 cursor-default items-center gap-1.5 overflow-hidden rounded-md px-1 py-0.5 text-sm hover:text-foreground ${
        quiet ? "text-muted-foreground" : "font-medium text-foreground/90"
      }`}
      style={color ? { color } : undefined}
    >
      {icon}
      <Name>{container.name}</Name>
    </button>
  )

  if (!used) {
    return button
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <Hint label={`${container.name}, in ${entry.path}`} detail="Double-click to rename." wait>
            {button}
          </Hint>
        }
      />
      <ContextMenuContent className="w-52" onPointerDown={stopEventPropagation}>
        <ContextMenuItem onClick={() => setRenaming(true)}>Rename</ContextMenuItem>
        <ContextMenuItem onClick={() => duplicateDesign(session, entry)}>Duplicate</ContextMenuItem>
        <ContextMenuSeparator />
        {others.map((kind) => (
          <ContextMenuItem key={kind} onClick={() => setDesignKind(session, entry, kind)}>
            <DesignIcon kind={kind} />
            Convert to {kindName(kind)}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => deleteDesign(session, entry)}>
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** The kinds a design's title menu converts it to, leaving out its own, in the Frames exploration's order. */
const convertKinds: readonly ContainerKind[] = ["component", "screen", "frame"]

/** Focuses a rename field when it appears and selects its text, ready to type over. */
function focusAndSelect(element: HTMLInputElement | null): void {
  element?.focus()
  element?.select()
}

const menuTrigger =
  "flex h-8 items-center gap-1.5 rounded-md border bg-background/80 px-2.5 text-sm shadow-xs backdrop-blur hover:bg-accent aria-expanded:bg-accent"

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
  onSelect: (param: string, option: string) => void
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
            <DropdownMenuRadioGroup value={choices[name]} onValueChange={(option: string) => onSelect(name, option)}>
              <DropdownMenuLabel>{name}</DropdownMenuLabel>
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
  states: readonly StateSpec[]
  active: string
  allStates: boolean
  onSelect: (state: string) => void
  onShowAll: (on: boolean) => void
}) {
  const current = states.find((state) => state.id === active)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={menuTrigger} aria-label="State">
        {allStates && <Rows3 className="size-3.5 opacity-70" />}
        {current && !allStates ? (
          <Name className="max-w-40">{current.name}</Name>
        ) : (
          <span className="max-w-40 truncate">{allStates ? "Every state" : "State"}</span>
        )}
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup value={allStates ? "" : active} onValueChange={onSelect}>
          <DropdownMenuLabel>State</DropdownMenuLabel>
          {states.map((state, index) => {
            const changes = changeCount(state)

            return (
              <DropdownMenuRadioItem key={state.id} value={state.id}>
                <Name className="flex-1">{state.name}</Name>
                {index > 0 && (
                  <span className="text-xs text-muted-foreground">{`${changes} change${changes === 1 ? "" : "s"}`}</span>
                )}
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

/**
 * Names a row in the every-state grid, to the left of the board. It's a name (see `labelLook`), so zoomed out it
 * shrinks as the board's title does and stays, while there's space on screen below it before the next row's label: a
 * short row's label hides rather than piling onto the next one. It hides with the title once the board is too narrow on
 * screen. A design with one state has no label: its title and state menu already name the only state there is.
 */
function StateLabel({
  state,
  base,
  boardWidth,
  tabbable,
  onSelect
}: {
  state: StateSpec
  /** The first state's, beside the first row. */
  base: boolean
  /** How wide the board is on the canvas. */
  boardWidth: number | undefined
  /** In the tab order, as it is while its design is selected (see TitleButton). */
  tabbable: boolean
  onSelect: () => void
}) {
  const changes = changeCount(state)
  const ref = useRef<HTMLButtonElement>(null)
  const height = useLabelSpace(ref, base)
  useCanvasLabel(ref, "name", { width: boardWidth, height })
  useGutterStyle(ref, base ? "firstStateLabel" : "nextStateLabel")

  return (
    <Hint label={`Show only ${state.name}`} wait>
      <button
        ref={ref}
        type="button"
        tabIndex={tabbable ? 0 : -1}
        data-canvas-control
        onPointerDown={stopEventPropagation}
        onClick={onSelect}
        className="state-label pointer-events-auto absolute right-full flex origin-top-right flex-col items-end pr-4 text-right whitespace-nowrap"
      >
        <Name className="text-sm font-medium text-foreground">{state.name}</Name>
        {!base && (
          <span className="text-xs text-muted-foreground">{`${changes} change${changes === 1 ? "" : "s"}`}</span>
        )}
      </button>
    </Hint>
  )
}

/**
 * How much height a state's label has on the canvas, down to the next row's label (see `stateLabelSpace`), the first
 * row's from the top of its caption band. A frame that grows with its content sets its row's height, so the row is
 * measured: its content, which is its frames alone, whatever the zoom makes its gutter.
 */
function useLabelSpace(label: RefObject<HTMLElement | null>, first: boolean): number | undefined {
  const [height, setHeight] = useState<number>()
  useLayoutEffect(() => {
    const row = label.current?.closest<HTMLElement>(".state-row")

    if (!row) {
      return undefined
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setHeight(stateLabelSpace(entry.contentRect.height, first))
      }
    })

    observer.observe(row)

    return () => observer.disconnect()
  }, [label, first])

  return height
}

/**
 * Names a frame's mode above it, centred in the band of the board's gutter above the first row. It's detail (see
 * `labelLook`): at screen size up close, as wide on screen as the frame, and fading out when zoomed far out, or once the
 * frame is too narrow on screen. The band shrinks with it past 40%.
 */
function FrameCaption({ width, children }: { width: number; children: ReactNode }) {
  const band = useRef<HTMLElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  useGutterStyle(band, "caption")
  useCanvasLabel(ref, "detail", { fit: true, width })

  return (
    <figcaption ref={band} className="relative">
      {/* Out of the flow, so a long caption doesn't widen a narrow frame's board. */}
      <div ref={ref} className="absolute top-1/2 left-0 -mt-3 flex h-6 origin-left items-center gap-2 text-sm">
        {children}
      </div>
    </figcaption>
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
  /** The caption is in the tab order, as it is while its design is selected (see TitleButton). */
  tabbable: boolean
  selected: boolean
  /** Where it is in its row: the main frame, the first companion after the dashed line, or a later one. */
  place: Extract<BoardPart, "firstFrame" | "dividedFrame" | "nextFrame">
  loaded: ReturnType<typeof useProject>["loaded"]
  library: ComponentLibrary
  rest: BoardRest | undefined
}

/**
 * One frame of a board. It draws again only when something it shows changes, and works its design out again only when
 * the design, state, mode or the components it places do, since a board's frames hold whole screens.
 */
const FrameTile = memo(function FrameTile({
  entry,
  state,
  mode,
  primary,
  projectPrimary,
  scale,
  caption,
  tabbable,
  selected,
  place,
  loaded,
  library,
  rest
}: FrameTileProps) {
  const session = useProject()
  const { selection } = session
  // Its size and the window it stands for, which its bitmap and the live frame both draw at.
  const frame = frameGeometry(entry.container, mode)
  const interactions = useInteractions(selection)
  const interactive = useInteracting(selection)
  const { container } = entry

  const tree = useMemo(
    () =>
      resolveDesign(boardRoot(container), state, mode.viewport, library, {
        params: container.params,
        choices: container.view?.variants
      }),
    [container, state, mode.viewport, library]
  )

  const figure = useRef<HTMLElement>(null)
  useGutterStyle(figure, place)
  const tile = useRef<HTMLDivElement>(null)
  // What the frame shows, worked out once, which the live frame, its bitmap, its skeleton and its sleep all go by.
  const shows = useFrameShows(session, tree, mode, frame, scale, { key: entry.key, state: state.id })
  const { key } = shows
  // Whether the frame changed since it was first looked at, which its board adds up (PAR-997).
  useFrameChange({ project: session.id, design: entry.key, state: state.id, mode: mode.id }, shows.job, key)
  // The first row's frames are what the project's picture shows (PAR-607).
  useFirstRowFrame(session.id, entry.key, mode.id, shows, caption)
  // Whether the frame is holding off drawing its design for its bitmap, which then needn't wait to be captured.
  const holding = useRef(false)

  // The live frame's height as it's drawn when its bitmap is taken, which is kept with it.
  // Where the frame is against the view, so what's in view is captured and woken first (PAR-955).
  const view = useFrameView(tile)

  const kept = useFrameBitmap(
    shows,
    () => drawnHeight(tile.current, frame.width),
    () => holding.current,
    view.rank
  )

  const bitmap = kept.src
  // Listed with Parity's errors, and its bitmap sent with a render of it that fails (PAR-624).
  useFrameOnScreen({
    project: session.info.name,
    design: container.name,
    designKey: entry.key,
    state: state.name,
    stateId: state.id,
    mode: mode.name,
    modeId: mode.id,
    width: frame.width,
    height: frame.height,
    key,
    bitmap
  })
  // The bitmap shows once it's decoded, so the frame doesn't go blank in between: until then, the last one decoded, or
  // its skeleton, which then leaves the page.
  const [decoded, setDecoded] = useState<string>()
  useEffect(() => {
    if (!bitmap) {
      return undefined
    }

    let live = true
    const image = new Image()
    image.src = bitmap
    void image
      .decode()
      .catch(() => undefined)
      .then(() => live && setDecoded(bitmap))

    return () => {
      live = false
    }
  }, [bitmap])
  const showing = bitmap ? decoded : undefined
  const shown = !!showing && decoded === bitmap
  // A newly opened project's first frame seen on screen, its bitmap or drawn live, is recorded with how long opening
  // took (PAR-711).
  const { firstFrame } = session
  const shownBitmap = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (!showing || !firstFrame || !shownBitmap.current) {
      return undefined
    }

    return firstFrame.offer(shownBitmap.current, "bitmap")
  }, [showing, firstFrame])
  const drawnLive = useCallback((drawn: HTMLElement) => session.firstFrame?.offer(drawn, "live"), [session])
  // Interacting, frames are the real thing at any zoom. A stale bitmap stands in while the frame draws what it shows now,
  // and its new bitmap is taken, so it doesn't sleep on it.
  const awake = useAwake(shown && !kept.stale && !interactive, rest, key, view)
  // Zoomed far out, a frame not drawn yet waits for its bitmap, kept from an earlier session or captured offscreen, and
  // sleeps on it, at the height kept with it, without drawing its design. Until it comes, a placeholder stands in at the
  // frame's own height or, for one that grows with its content, its window's (PAR-525).
  const waiting = useFirstDrawWaits(rest, { bitmap: kept, awake, interactive })
  const skeleton = useFrameSkeleton(key, tile, frame.width, !bitmap && awake && !waiting)
  useEffect(() => {
    holding.current = waiting
  }, [waiting])
  const placeholder = waiting && !showing && !skeleton
  const height = skeleton?.height ?? kept.height ?? (waiting ? (frame.height ?? frame.viewport.height) : undefined)
  const onSelect = () => selection.set({ design: entry.key, mode: mode.id })
  const tileStyle: CSSProperties = {}

  if (selected) {
    tileStyle.boxShadow = `0 0 0 3px ${kindColors.mode}`
  }

  // How tall the frame was measured, or kept with its bitmap, for when it skips drawing before the browser has noted its
  // size.
  if (height !== undefined) {
    Object.assign(tileStyle, { [frameHeightProperty]: `${height}px` })
  }

  return (
    <figure ref={figure} className="mode-tile relative m-0" data-mode={mode.id} data-primary={primary}>
      {place === "dividedFrame" && <DashedLine part="frameLine" />}
      {caption && (
        <FrameCaption width={frame.width * scale}>
          <button
            type="button"
            tabIndex={tabbable ? 0 : -1}
            data-canvas-control
            onPointerDown={stopEventPropagation}
            onClick={onSelect}
            className="pointer-events-auto flex min-w-0 items-center gap-1.5 font-medium hover:underline"
            style={selected ? { color: kindColors.mode } : undefined}
          >
            {projectPrimary && <Crown className="size-3.5 shrink-0 text-amber-400" aria-label="Primary mode" />}
            <ModeViewportIcon of={mode} className="size-3.5 shrink-0 opacity-70" aria-hidden />
            <Name>{mode.name}</Name>
          </button>
          <span className="shrink-0 rounded bg-muted px-1.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {frame.width}
            {frame.height !== undefined && ` × ${frame.height}`}
          </span>
          {scale < 1 && (
            <span className="shrink-0 rounded bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
              {Math.round(scale * 100)}%
            </span>
          )}
        </FrameCaption>
      )}
      <div
        ref={tile}
        className="relative transition-shadow"
        style={tileStyle}
        data-bitmap={showing ? "" : undefined}
        data-skeleton={skeleton ? "" : undefined}
        data-measured={height === undefined ? undefined : ""}
        data-asleep={awake && !waiting ? undefined : ""}
      >
        <ModeView
          project={session.id}
          loaded={loaded}
          tree={tree}
          mode={mode}
          frame={frame}
          scale={scale}
          design={entry.key}
          state={state.id}
          primary={primary}
          interactions={interactions}
          interactive={interactive}
          asleep={!awake || waiting}
          shows={shows.drawn}
          {...(firstFrame ? { onDrawn: drawnLive } : {})}
        />
        {skeleton && !showing && <FrameSkeleton skeleton={skeleton} />}
        {placeholder && <div className="frame-placeholder" data-placeholder aria-hidden />}
        {showing && <img ref={shownBitmap} className="frame-bitmap" src={showing} alt="" draggable={false} />}
      </div>
    </figure>
  )
})
