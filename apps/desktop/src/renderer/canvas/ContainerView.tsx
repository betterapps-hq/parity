import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  DropdownMenu,
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
  type ComponentLibrary,
  type ContainerKind,
  designStates,
  fitsContent,
  type FrameGeometry,
  type ModeVariable,
  orderedStates,
  type ParamSpec,
  previewGeometry,
  previewKey,
  previewOptionsMode,
  previewScale,
  previewSettingsOf,
  reorderShown,
  resolveDesign,
  type ResolvedMode,
  rowWrapWidth,
  shownStates,
  type StateSpec,
  variantChoices,
  withStateOrder,
  wrapRow
} from "@parity-app/core"
import {
  type BoardBox,
  fittedFrame,
  fitsDrawn,
  hugsContent,
  kindName,
  kindTitle,
  pageFrameName,
  pickPreviews,
  landedElsewhere,
  pageHeightMessage,
  pageLandedMessage,
  stateLabelSpace,
  titleReach
} from "@parity-app/editor"
import { ChevronDown, TriangleAlert } from "lucide-react"
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
import { commandIcons } from "../chrome/command-icons.ts"
import { deleteDesign, duplicateDesign, renameDesign, setDesignKind } from "../chrome/designs.ts"
import { Hint } from "../chrome/Hint.tsx"
import { shortcutOf } from "../chrome/keymap.ts"
import { Name, NameInput } from "../chrome/Name.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { useLibrary, useModeSettings } from "../design-store.ts"
import { watchFrame } from "../frame-host.ts"
import { findNodeElement, frameHeightProperty } from "../frame.ts"
import { ModeView } from "../ModeView.tsx"
import {
  useDesignSelection,
  useInteracting,
  useInteractions,
  usePreviewSelection,
  useRenameRequest
} from "../selection.ts"
import { useStore } from "../store.ts"
import { useCarry } from "./board-carry.tsx"
import { type BoardPart, useGutterStyle } from "./board-gutter.ts"
import { useBoardInternals } from "./board-internals.ts"
import { BoardMenus } from "./BoardMenus.tsx"
import { boardFile, componentBoardsFile } from "./component-boards.ts"
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
import { Used, useMountOnUse, useUsed } from "./mount-on-use.tsx"
import { PreviewHeader, type PreviewTarget } from "./preview-parts.tsx"
import { PreviewResize, useBreakpoints } from "./preview-resize.tsx"
import { pageLandings, routePagePath, routePageUrl, setPageLanding } from "./route-pages.ts"
import { storyScreensFile } from "./story-screens.ts"
import { containerModes, withModes } from "./view.ts"

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
  useBoardInternals(board, entry)

  const titleBar = (
    // Its name runs past a narrow frame, out to the next design beside it, rather than being cut off at the frame's edge.
    <TitleBar active={hovered || isSelected} width={title?.width} board={title} quiet>
      <TitleButton
        entry={entry}
        selected={isSelected}
        color={isSelected ? designColor(container.kind, entry.key) : undefined}
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
        scale={1}
        caption={false}
        variables={settings.variables}
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
  const hugs = fitsDrawn(entry.container)
  const perMode = fitsContent(entry.container)
  const { key } = entry
  useEffect(() => {
    const container = board.current

    if (!hugs || !container) {
      return undefined
    }

    // A board far from view is a picture, so its frames come and go: each time one is drawn live, it's measured. A
    // screen that fits its content, as a story, is measured in each mode's frame, which it fits apart.
    const attached = new Map<HTMLElement, () => void>()

    const attach = () => {
      const hosts = new Set(container.querySelectorAll<HTMLElement>("[data-frame]"))

      for (const [host, detach] of attached) {
        if (!hosts.has(host)) {
          detach()
          attached.delete(host)
        }
      }

      for (const host of hosts) {
        if (!attached.has(host) && (perMode || attached.size === 0)) {
          attached.set(host, fitFrame(host))
        }
      }
    }

    const fitFrame = (host: HTMLElement) => {
      const rootElement = () => {
        const current = store.getEntry(key)?.container

        return current && findNodeElement(host, current.root.id)
      }

      const { viewport } = host.dataset

      const fit = () => {
        const width = contentWidth(rootElement())
        const current = store.getEntry(key)?.container

        if (!width || !current || !fittedFrame(current, width, viewport)) {
          return
        }

        // A component's board and a story are drawn from the project's code each time, so the width they're drawn at
        // isn't to be saved.
        store.updateContainer(key, "Fit frame", (design) => fittedFrame(design, width, viewport) ?? design, {
          history: false,
          persist: !key.startsWith(`${componentBoardsFile}#`) && !key.startsWith(`${storyScreensFile}#`)
        })
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

      // The design is drawn into the frame once it's mounted, and its root element can be drawn again as it changes.
      const stopDrawn = watchFrame(host, () => {
        watch()
        fit()
      })

      watch()

      // A design drawn afresh from code, as a board whose part found the parents it needs, starts without its width, though
      // its root may be drawn as wide as before, so nothing above notices: it's measured once it's drawn.
      let last = store.getEntry(key)?.container

      const stopChanges = store.subscribe(() => {
        const current = store.getEntry(key)?.container

        if (current !== last) {
          last = current
          requestAnimationFrame(() => {
            watch()
            fit()
          })
        }
      })

      return () => {
        stopDrawn()
        stopChanges()
        observer.disconnect()
      }
    }

    const frames = new MutationObserver(attach)
    frames.observe(container, { childList: true, subtree: true })
    attach()

    return () => {
      frames.disconnect()

      for (const detach of attached.values()) {
        detach()
      }
    }
  }, [board, hugs, perMode, key, store])
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
  // A screen that fits its content, as a story, is fitted in each mode's frame.
  useFitToContent(board, entry)
  const { id: project, store, loaded, selection } = useProject()
  // Where a page landed instead of its own path, as its frames say.
  const landed = useStore(pageLandings).get(entry.key)
  // Whether its frames changed since they were first looked at, marked on the board for tools to read (PAR-997).
  const change = useDesignChange(project, entry.key)
  const settings = useModeSettings(store)
  const { selected: isSelected } = useDesignSelection(selection, entry.key)
  const library = useLibrary(store, entry.key)
  const { container, key } = entry

  // Kept while the modes and the design are, so frames that show nothing new aren't drawn again.
  const { primary, companions, all, ordered } = useMemo(
    () => containerModes(settings, container),
    [settings, container]
  )

  const rows = shownStates(container)
  const columns = useMemo(() => [primary, ...companions], [primary, companions])
  const { variables } = settings

  // The selected previews, by `state/mode`, the last picked holding their settings. A mode picked without a state, as
  // the Modes list picks one, is its column in every row shown.
  const picked = usePreviewSelection(selection, entry.key).flatMap((each) =>
    each.startsWith("/") ? rows.map((state) => `${state.id}${each}`) : [each]
  )

  const holder = picked.at(-1)
  // A page tries widths from a phone's up; a story or a component is as narrow as it likes.
  const page = routePagePath(project, container.id) !== undefined
  const narrowest = page ? 320 : 80
  // A page lands on the app's breakpoints as it's resized; a story or a component keeps whatever width it's given.
  const breakpoints = useBreakpoints()
  // The preview being resized, which keeps its handle while it is.
  const [resizing, setResizing] = useState<string>()
  // The previews whose headers don't fit what follows their names beside them, so their rows make room for a line.
  const [stacks, setStacks] = useState<ReadonlySet<string>>(() => new Set())

  const onStack = useCallback(
    (preview: string, stacked: boolean) =>
      setStacks((now) => {
        if (now.has(preview) === stacked) {
          return now
        }

        const next = new Set(now)

        if (stacked) {
          next.add(preview)
        } else {
          next.delete(preview)
        }

        return next
      }),
    []
  )

  // The previews selected, as their settings work from them: the first mode's draw at full size.
  const targets: PreviewTarget[] = picked.flatMap((each) => {
    const mode = columns.find((column) => each.endsWith(`/${column.id}`))

    return mode ? [{ key: each, mode, first: mode.id === primary.id }] : []
  })

  const color = designColor(container.kind, entry.key)
  // How wide the board is on the canvas, which its labels hide by once it's too narrow on screen.
  const width = title?.width

  // A Storybook file's board names each story over its row; another design names its states beside them.
  const story = entry.path === storyScreensFile
  const shownColumns = columns.map((mode) => mode.id)

  // Each row's previews on lines, wrapping past two and a half of the widest preview, or 1600 (see `wrapRow`).
  const drawnWidths = rows.map((state) =>
    columns.map((mode, column) => {
      const own = previewSettingsOf(container, state.id, mode.id)

      return previewGeometry(container, mode, own).width * previewScale(container, mode, column === 0, own)
    })
  )

  const most = rowWrapWidth(drawnWidths.flat())

  // A row's name selects every preview in it, or with Shift adds them or takes them away.
  const selectRow = (state: StateSpec, add: boolean) =>
    selection.set(
      pickPreviews(
        selection.get(),
        key,
        columns.map((mode) => previewKey(state.id, mode.id)),
        add
      )
    )

  const moveRow = (from: number, to: number) =>
    store.updateView(key, `Move ${rows[from]?.name ?? "row"}`, (view) =>
      withStateOrder(
        view,
        container,
        reorderShown(
          orderedStates(container).map((state) => state.id),
          rows.map((state) => state.id),
          from,
          to
        )
      )
    )

  // A header carried along its line moves its mode's column; the first shown is drawn at full size.
  const moveColumn = (from: number, to: number) =>
    store.updateView(key, `Move ${columns[from]?.name ?? "column"}`, (view) =>
      withModes(
        view,
        reorderShown(
          ordered.map((mode) => mode.id),
          shownColumns,
          from,
          to
        ),
        shownColumns,
        all
      )
    )

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
        <BoardMenus entry={entry} triggerClassName={menuTrigger} />
      </TitleControls>
    </TitleBar>
  )

  return (
    <div
      ref={board}
      className="container-view relative w-max font-sans text-card-foreground"
      data-design={key}
      data-changed={change.state === "changed" ? "" : undefined}
    >
      {/* No card of its own: its edge shows while it's hovered or selected, as a frame's does. */}
      {(hovered || isSelected) && <BoardEdge color={isSelected && picked.length === 0 ? color : undefined} />}
      {title
        ? createPortal(
            <div className="absolute" style={{ left: title.x, top: title.y, width: title.width }}>
              {titleBar}
            </div>,
            title.layer
          )
        : titleBar}

      <div className="board-rows flex flex-col">
        {rows.map((state, index) => {
          const lines = wrapRow(drawnWidths[index]!, most)

          const lineTall = lines.map((line) =>
            line.some((column) => stacks.has(previewKey(state.id, columns[column]!.id)))
          )

          const tile = (column: number, place: FrameTileProps["place"]) => {
            const mode = columns[column]!
            const preview = previewKey(state.id, mode.id)
            const own = previewSettingsOf(container, state.id, mode.id)
            const scale = previewScale(container, mode, column === 0, own)
            const self = { key: preview, mode, first: column === 0 }

            return (
              <FrameTile
                key={mode.id}
                entry={entry}
                state={state}
                mode={mode}
                column={column}
                primary={column === 0}
                scale={scale}
                caption={index === 0}
                header={
                  <PreviewHeader
                    design={container}
                    designKey={key}
                    state={state}
                    mode={mode}
                    first={column === 0}
                    targets={holder === preview ? targets : undefined}
                    selected={picked.includes(preview)}
                    named={rows.length > 1}
                    tabbable={isSelected}
                    variables={variables}
                    narrowest={narrowest}
                    stacked={stacks.has(preview)}
                    onStack={onStack}
                    column={column}
                    color={color}
                    onMoveColumn={moveColumn}
                  />
                }
                resize={
                  (hovered || isSelected || resizing === preview) && (
                    <PreviewResize
                      design={container}
                      designKey={key}
                      self={self}
                      changing={picked.includes(preview) ? targets : [self]}
                      width={previewGeometry(container, mode, own).width}
                      scale={scale}
                      narrowest={narrowest}
                      breakpoints={page ? breakpoints : undefined}
                      tabbable={isSelected}
                      resizing={resizing === preview}
                      onResizing={(now) => setResizing(now ? preview : undefined)}
                    />
                  )
                }
                variables={variables}
                selected={picked.includes(preview)}
                place={place}
                loaded={loaded}
                library={library}
                rest={rest}
              />
            )
          }

          const rowControls = {
            index,
            color,
            tabbable: isSelected,
            selected: columns.every((mode) => picked.includes(previewKey(state.id, mode.id))),
            onSelect: (add: boolean) => selectRow(state, add),
            onMove: moveRow
          }

          return (
            <StateRow
              key={state.id}
              state={state.id}
              first={index === 0}
              tall={lineTall[0]!}
              named={story && rows.length > 1}
              label={
                rows.length > 1 &&
                (story ? (
                  <RowName state={state} first={index === 0} boardWidth={width} {...rowControls} />
                ) : (
                  <StateLabel
                    state={state}
                    first={index === 0}
                    base={state.id === designStates(container)[0]?.id}
                    boardWidth={width}
                    {...rowControls}
                  />
                ))
              }
            >
              {lines.map((line, at) => (
                <RowLine key={line[0]} first={at === 0} tall={lineTall[at]!}>
                  {line.map((column, place) => tile(column, linePlace(column, at, place)))}
                </RowLine>
              ))}
            </StateRow>
          )
        })}
      </div>
      {landed !== undefined && <LandedElsewhere path={landed} width={width} />}
    </div>
  )
}

/**
 * A row's gutter: the first or a later one, a header line taller where its headers need it, and a line taller again
 * for its name where the board names its rows over them.
 */
function rowPart(first: boolean, tall: boolean, named: boolean): BoardPart {
  const parts = {
    first: { plain: "firstRow", tall: "firstTallRow", named: "firstNamedRow", namedTall: "firstNamedTallRow" },
    next: { plain: "nextRow", tall: "nextTallRow", named: "nextNamedRow", namedTall: "nextNamedTallRow" }
  } as const

  const which = parts[first ? "first" : "next"]

  if (named) {
    return tall ? which.namedTall : which.named
  }

  return tall ? which.tall : which.plain
}

/** A row's line's gutter: the first raised into the band above it, a later one a gap below the last. */
function linePart(first: boolean, tall: boolean): BoardPart {
  if (first) {
    return "rowFrames"
  }

  return tall ? "nextTallLine" : "nextLine"
}

/** Where a frame is on its line of a row: on the first, by its column; on a later one, first on it or after another. */
function linePlace(column: number, line: number, place: number): FrameTileProps["place"] {
  if (line === 0) {
    return framePlace(column)
  }

  return place === 0 ? "firstFrame" : "nextFrame"
}

/** Where a frame is in its row, by its column: the main frame, then the first companion, a little further off. */
function framePlace(column: number): FrameTileProps["place"] {
  if (column === 0) {
    return "firstFrame"
  }

  return column === 1 ? "dividedFrame" : "nextFrame"
}

/**
 * The board's edge, a screen pixel wide at any zoom, in its design's color while it's selected on its own. It's drawn
 * over the board rather than as its border, which would take room.
 */
function BoardEdge({ color }: { color?: string | undefined }) {
  const ref = useRef<HTMLDivElement>(null)
  useGutterStyle(ref, "edge")

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 origin-top-left border border-solid"
      style={color ? { borderColor: color } : undefined}
    />
  )
}

/**
 * One state's row of the board's frames, each below the band its header is in, a later row below the gap between rows.
 * A row whose headers don't all fit beside their names is a header line taller, for the line under them (`tall`).
 * Either way the row's own height is its frames', which its state's label is measured by (see `useLabelSpace`).
 */
function StateRow({
  state,
  first,
  tall,
  named,
  label,
  children
}: {
  state: string
  first: boolean
  /** Its first line's headers need a line under their names. */
  tall: boolean
  /** Its name goes over it, in a band of its own. */
  named: boolean
  label: ReactNode
  children: ReactNode
}) {
  const row = useRef<HTMLElement>(null)
  useGutterStyle(row, rowPart(first, tall, named))

  return (
    <section ref={row} className="state-row relative" data-state={state}>
      {label}
      {children}
    </section>
  )
}

/**
 * One line of a row's previews. The first is raised into the band above it, with its headers; a row that wraps puts the
 * rest each a gap below the last, a header line further where their headers need a line under their names.
 */
function RowLine({ first, tall, children }: { first: boolean; tall: boolean; children: ReactNode }) {
  const line = useRef<HTMLDivElement>(null)
  useGutterStyle(line, linePart(first, tall))

  return (
    <div ref={line} className="row-line flex items-start">
      {children}
    </div>
  )
}

/** What a row's name or label needs to select its row, carry it to another place, and move it with Up and Down. */
interface RowControls {
  /** Its place among the rows shown. */
  index: number
  /** Its design's color, for the marker where it would land. */
  color: string
  tabbable: boolean
  /** Every preview in it is selected. */
  selected: boolean
  onSelect: (add: boolean) => void
  onMove: (from: number, to: number) => void
}

/** A row's name or label as a control: clicking selects its row, Shift adds it, and carrying it moves it. */
function useRowControls(ref: RefObject<HTMLElement | null>, { index, color, onSelect, onMove }: RowControls) {
  const carry = useCarry({
    axis: "y",
    items: () => [
      ...(ref.current?.closest(".container-view")?.querySelectorAll<HTMLElement>(".board-rows > .state-row") ?? [])
    ],
    from: () => index,
    color,
    onDrop: (to) => onMove(index, to)
  })

  return {
    marker: carry.marker,
    props: {
      "aria-keyshortcuts": "ArrowUp ArrowDown",
      onPointerDown: carry.onPointerDown,
      onPointerUp: stopEventPropagation,
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault()
          event.stopPropagation()
          onMove(index, index + (event.key === "ArrowUp" ? -1 : 1))
        }
      },
      onClick: (event: React.MouseEvent) => {
        if (!carry.carried()) {
          onSelect(event.shiftKey)
        }
      }
    }
  }
}

/**
 * A story's name over its row, on a Storybook file's board (PAR-1071), in the band at the top of the row. It's a name
 * (see `labelLook`): at screen size up close, then shrinking down to 60%. Clicking it selects the row's previews,
 * Shift+click adds them, and carrying it up or down moves the row, as Up and Down on it do.
 */
function RowName({
  state,
  first,
  boardWidth,
  ...controls
}: RowControls & { state: StateSpec; first: boolean; boardWidth: number | undefined }) {
  const band = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLButtonElement>(null)
  useGutterStyle(band, first ? "firstRowName" : "nextRowName")
  useCanvasLabel(ref, "name", { fit: true, width: boardWidth })
  const { marker, props } = useRowControls(ref, controls)

  return (
    <div ref={band} className="absolute inset-x-0">
      <Hint label={`Select ${state.name}`} detail="Shift+click to add it, drag to move it" wait>
        <button
          ref={ref}
          type="button"
          tabIndex={controls.tabbable ? 0 : -1}
          data-canvas-control
          aria-pressed={controls.selected}
          {...props}
          className="pointer-events-auto absolute bottom-1 left-0 flex origin-bottom-left items-center text-sm font-medium whitespace-nowrap outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          style={controls.selected ? { color: kindColors.mode } : undefined}
        >
          <Name>{state.name}</Name>
        </button>
      </Hint>
      {marker}
    </div>
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
  // A page of the app shows its route under its name (PAR-1076).
  const path = routePagePath(session.id, container.id)
  // A component's board shows the component's icon. Its file isn't shown: the name is how it's found.
  const file = boardFile(session.id, container.id)
  const kind = file === undefined ? container.kind : "component"
  const under = path

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
      kind={kind}
      route={path !== undefined}
      story={entry.path === storyScreensFile}
      className={`shrink-0 ${quiet ? "size-3.5" : "size-4"}`}
      style={{ color: color ?? (quiet && file === undefined ? undefined : designColor(kind)) }}
    />
  )

  const { rename: RenameIcon, duplicate: DuplicateIcon, delete: DeleteIcon } = commandIcons
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
            renameDesign(session.store, entry, event.currentTarget.value)
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
      } ${
        // A page's title is on the canvas's own color, so the line from the page above passes behind it (see
        // `pageLinkLine`).
        path === undefined ? "" : "bg-(--tl-color-background)"
      }`}
      style={color ? { color } : undefined}
    >
      {icon}
      {under === undefined ? (
        <Name>{container.name}</Name>
      ) : (
        <span className="flex min-w-0 flex-col items-start leading-tight">
          <Name>{container.name}</Name>
          <span className="max-w-full truncate text-xs font-normal text-muted-foreground">{under}</span>
        </span>
      )}
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
        <ContextMenuItem onClick={() => setRenaming(true)}>
          <RenameIcon /> Rename <ContextMenuShortcut>{shortcutOf("rename")}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => duplicateDesign(session, entry)}>
          <DuplicateIcon /> Duplicate <ContextMenuShortcut>{shortcutOf("duplicate")}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        {others.map((kind) => (
          <ContextMenuItem key={kind} onClick={() => setDesignKind(session, entry, kind)}>
            <DesignIcon kind={kind} />
            Convert to {kindName(kind)}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => deleteDesign(session, entry)}>
          <DeleteIcon /> Delete <ContextMenuShortcut>{shortcutOf("delete")}</ContextMenuShortcut>
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

/**
 * Names a row in the every-state grid, to the left of the board. It's a name (see `labelLook`), so zoomed out it
 * shrinks as the board's title does and stays, while there's space on screen below it before the next row's label: a
 * short row's label hides rather than piling onto the next one. It hides with the title once the board is too narrow on
 * screen. A design with one state has no label: its title and state menu already name the only state there is.
 */
function StateLabel({
  state,
  first,
  base,
  boardWidth,
  ...controls
}: RowControls & {
  state: StateSpec
  /** Beside the first row. */
  first: boolean
  /** The design's first state, which the others change, so it has no count of changes. */
  base: boolean
  /** How wide the board is on the canvas. */
  boardWidth: number | undefined
}) {
  const changes = changeCount(state)
  const ref = useRef<HTMLButtonElement>(null)
  const height = useLabelSpace(ref, first)
  useCanvasLabel(ref, "name", { width: boardWidth, height })
  useGutterStyle(ref, first ? "firstStateLabel" : "nextStateLabel")
  const { marker, props } = useRowControls(ref, controls)

  return (
    <Hint label={`Select ${state.name}`} detail="Shift+click to add it, drag to move it" wait>
      <button
        ref={ref}
        type="button"
        tabIndex={controls.tabbable ? 0 : -1}
        data-canvas-control
        aria-pressed={controls.selected}
        {...props}
        className="state-label pointer-events-auto absolute right-full flex origin-top-right flex-col items-end pr-4 text-right whitespace-nowrap"
        style={controls.selected ? { color: kindColors.mode } : undefined}
      >
        <Name className="text-sm font-medium text-foreground">{state.name}</Name>
        {!base && (
          <span className="text-xs text-muted-foreground">{`${changes} change${changes === 1 ? "" : "s"}`}</span>
        )}
        {marker}
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
 * The band above a preview that its header sits in (see `PreviewHeader`). The header is detail (see `labelLook`): at
 * screen size up close, as wide on screen as the preview, and fading out when zoomed far out, or once the preview is
 * too narrow on screen. It sits at the band's foot, so a header with a line under its name grows up into the room its
 * row makes for it. The band shrinks with it past 40%.
 */
function FrameCaption({ width, children }: { width: number; children: ReactNode }) {
  const band = useRef<HTMLElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  useGutterStyle(band, "caption")
  useCanvasLabel(ref, "detail", { fit: true, width })

  return (
    <figcaption ref={band} className="relative">
      {/* Out of the flow, so a long caption doesn't widen a narrow frame's board. */}
      <div ref={ref} className="absolute bottom-1 left-0 flex origin-bottom-left items-end text-sm">
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
  scale: number
  /** In the first row, whose frames are what the project's picture shows. */
  caption: boolean
  /** Its mode's place among the columns shown, which carrying a header reads. */
  column?: number
  /** Its header, in the band above it (see `PreviewHeader`). A frame on its own has none. */
  header?: ReactNode
  /** The handle in the gutter after it, which resizes it (see `PreviewResize`). */
  resize?: ReactNode
  /** The project's mode variables, which a preview's own options are of. */
  variables: readonly ModeVariable[]
  selected: boolean
  /** Where it is in its row: the main frame, the first companion, or a later one. */
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
  scale,
  caption,
  column,
  header,
  resize,
  variables,
  selected,
  place,
  loaded,
  library,
  rest
}: FrameTileProps) {
  const session = useProject()
  const { selection } = session
  const { container } = entry
  // What the preview sets over its mode: its own width and options, which it's drawn with (PAR-1071).
  const own = previewSettingsOf(container, state.id, mode.id)
  const drawn = useMemo(() => previewOptionsMode(mode, variables, own), [mode, variables, own])
  // Its size and the window it stands for, which its bitmap and the live frame both draw at.
  const frame = previewGeometry(container, drawn, own)
  const interactions = useInteractions(selection)
  const interactive = useInteracting(selection)

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
  const shows = useFrameShows(session, tree, drawn, frame, scale, { key: entry.key, state: state.id })
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

  // A frame that hugs its content and hasn't been measured yet, as a component's board or a story drawn from the code
  // each time, is drawn once whatever the zoom, so it's fitted to what it draws (`useFitToContent`) rather than shown,
  // and captured, as wide as its window until someone comes close.
  const unmeasured = fitsContent(container)
    ? container.frames?.[mode.viewport]?.width === undefined
    : hugsContent(container) && container.size?.width === undefined

  // Interacting, frames are the real thing at any zoom. A stale bitmap stands in while the frame draws what it shows now,
  // and its new bitmap is taken, so it doesn't sleep on it.
  const awake = useAwake(shown && !kept.stale && !interactive && !unmeasured, rest, key, view)
  // Zoomed far out, a frame not drawn yet waits for its bitmap, kept from an earlier session or captured offscreen, and
  // sleeps on it, at the height kept with it, without drawing its design. Until it comes, a placeholder stands in at the
  // frame's own height or, for one that grows with its content, its window's (PAR-525).
  const waiting = useFirstDrawWaits(rest, { bitmap: kept, awake, interactive: interactive || unmeasured })
  const skeleton = useFrameSkeleton(key, tile, frame.width, !bitmap && awake && !waiting)
  useEffect(() => {
    holding.current = waiting
  }, [waiting])
  const placeholder = waiting && !showing && !skeleton
  const height = skeleton?.height ?? kept.height ?? (waiting ? (frame.height ?? frame.viewport.height) : undefined)
  // A page of the app draws the app itself at its URL, rather than a design (PAR-1076).
  const page = routePageUrl(session.id, entry.container.id, entry.container.view?.params)
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
    <figure
      ref={figure}
      className="mode-tile relative m-0"
      data-mode={mode.id}
      data-primary={primary}
      data-column={column}
    >
      {header && <FrameCaption width={frame.width * scale}>{header}</FrameCaption>}
      <div
        ref={tile}
        className="relative transition-shadow"
        style={tileStyle}
        data-bitmap={showing ? "" : undefined}
        data-skeleton={skeleton ? "" : undefined}
        data-measured={height === undefined ? undefined : ""}
        data-asleep={awake && !waiting ? undefined : ""}
      >
        {page ? (
          <PageFrame url={page} design={entry.key} frame={frame} mode={drawn} scale={scale} interactive={interactive} />
        ) : (
          <ModeView
            project={session.id}
            loaded={loaded}
            tree={tree}
            mode={drawn}
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
        )}
        {!page && skeleton && !showing && <FrameSkeleton skeleton={skeleton} />}
        {!page && placeholder && <div className="frame-placeholder" data-placeholder aria-hidden />}
        {!page && showing && <img ref={shownBitmap} className="frame-bitmap" src={showing} alt="" draggable={false} />}
        {resize}
      </div>
    </figure>
  )
})

/**
 * A page of the app in a screen's frame (PAR-1076): the app's own entry at the page's URL, in a document of its own, so
 * its router, layouts, loaders and redirects run as they do in a browser. It takes no pointer, so the canvas pans and
 * selects over it. It's as tall as the page says it is (see `pageHeightMessage`), and never shorter than the frame's
 * window, unless the frame has been given a height, which it then clips to. When the page lands somewhere other than its
 * own path, as a route that redirects sends it (see `pageLandedMessage`), it notes where for its board and Layers.
 */
function PageFrame({
  url,
  design,
  frame,
  mode,
  scale,
  interactive
}: {
  url: string
  /** The page's design, by key, which Layers notes where it landed under. */
  design: string
  frame: FrameGeometry
  mode: ResolvedMode
  scale: number
  /** With the Interact tool, the page takes the pointer and keys, as a design does; otherwise the canvas has them. */
  interactive: boolean
}) {
  // The app's own page reads its mode from the frame's name, so a frame in another mode is another page.
  const name = pageFrameName(mode)
  const page = useRef<HTMLIFrameElement>(null)
  // How tall the page says it is, for the page it was said for, so another page starts from the window again.
  const [told, setTold] = useState<{ page: string; height: number }>()
  // Where the page last said it is, for the page it was said for.
  const [landed, setLanded] = useState<{ page: string; path: string }>()
  useEffect(() => {
    const heard = (event: MessageEvent) => {
      if (event.source === null || event.source !== page.current?.contentWindow) {
        return
      }

      const said = pageHeightMessage.safeParse(event.data)

      if (said.success) {
        setTold({ page: `${name} ${url}`, height: said.data })
      }

      const went = pageLandedMessage.safeParse(event.data)

      if (went.success) {
        setLanded({ page: `${name} ${url}`, path: went.data })
      }
    }

    window.addEventListener("message", heard)

    return () => window.removeEventListener("message", heard)
  }, [name, url])
  const content = told?.page === `${name} ${url}` ? told.height : 0
  const height = frame.height ?? Math.max(frame.viewport.height, content)
  const elsewhere = landed?.page === `${name} ${url}` ? landedElsewhere(url, landed.path) : undefined
  const heardLanding = landed?.page === `${name} ${url}`

  // Layers says where the page landed too, once a frame has said.
  useEffect(() => {
    if (heardLanding) {
      setPageLanding(design, elsewhere)
    }
  }, [design, elsewhere, heardLanding])

  return (
    <>
      <div className="overflow-hidden" style={{ width: frame.width * scale, height: height * scale }}>
        <iframe
          ref={page}
          key={name}
          name={name}
          title={url}
          src={url}
          className={`${interactive ? "pointer-events-auto" : "pointer-events-none"} block origin-top-left border-0 bg-white`}
          style={{ width: frame.width, height, transform: `scale(${scale})` }}
        />
      </div>
    </>
  )
}

/**
 * Where a page landed instead of its own path, under its board, lined up with its left edge, sized for the zoom as a
 * frame's caption is, and the same few screen pixels below at any zoom: a warning, since the page drawn isn't the
 * route's own.
 */
function LandedElsewhere({ path, width }: { path: string; width: number | undefined }) {
  const ref = useRef<HTMLDivElement>(null)
  useCanvasLabel(ref, "detail", width === undefined ? {} : { width })

  return (
    // The gap is padding inside the scaled element, so it scales with the warning rather than the canvas.
    <div ref={ref} className="pointer-events-none absolute top-full left-0 origin-top-left pt-2">
      <div className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-sm whitespace-nowrap text-amber-700 dark:text-amber-400">
        <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
        Lands on {path}
      </div>
    </div>
  )
}
