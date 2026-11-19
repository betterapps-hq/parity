import {
  type BoardBox,
  labelLook,
  pageGroupBox,
  pageLinkDash,
  pageLinkLine,
  pageLinkPieces,
  pageLinksLit,
  refsSelection
} from "@parity-app/editor"
import { CornerDownRight, LayoutTemplate } from "lucide-react"
import { useContext, useLayoutEffect, useRef, useState } from "react"
import {
  HTMLContainer,
  Rectangle2d,
  react,
  type RecordProps,
  stopEventPropagation,
  T,
  useEditor,
  useValue
} from "tldraw"
import { Hint } from "../chrome/Hint.tsx"
import { type SelectionStore, useHover, useSelection } from "../selection.ts"
import { ProjectContext } from "./context.ts"
import { designColor } from "./kinds.tsx"
import { type PageGroupPlace, routePageGroups, routePageLinks, routeRef, selectedPageGroup } from "./route-pages.ts"
import { type CanvasRecord, CanvasUtil, createCanvasId } from "./tldraw-names.ts"

declare module "tldraw" {
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- tldraw names the map this augments.
  export interface TLGlobalShapePropsMap {
    "canvas-page-links": { key: string }
  }
}

export type PageLinksRecord = CanvasRecord<"canvas-page-links">

/**
 * The lines of the app's page tree (PAR-1076): from each page down to each page under it, curving across above its title
 * and dropping behind the title to its board (see `pageLinkLine`), moving along as the app's navigation goes. They're
 * drawn from where the pages' boards are now and at the zoom now, so they follow a page that's moved and turn down above
 * the titles as they grow on the canvas. They're quiet until a page is selected or hovered, which brings its lines forward
 * (see `pageLinksLit`). A line leads to its page: hovering it brings that page's lines forward, and clicking it selects
 * the page. A layout with no page of its own is a group round its pages, which the line from the page above leads to
 * (see `PageGroupView`). One shape at the canvas's origin draws them all; only the lines and the groups' headers take
 * the pointer, and it's never culled.
 */
export class PageLinksUtil extends CanvasUtil<PageLinksRecord> {
  static override type = "canvas-page-links" as const
  static override props: RecordProps<PageLinksRecord> = { key: T.string }

  override getDefaultProps(): PageLinksRecord["props"] {
    return { key: "" }
  }

  override canCull() {
    return false
  }

  override canSnap() {
    return false
  }

  override hideSelectionBoundsBg() {
    return true
  }

  override getGeometry() {
    return new Rectangle2d({ width: 1, height: 1, isFilled: false })
  }

  override component(links: PageLinksRecord) {
    return (
      <HTMLContainer style={{ pointerEvents: "none", overflow: "visible" }}>
        <PageLines project={links.props.key} />
      </HTMLContainer>
    )
  }

  override getIndicatorPath() {
    return new Path2D()
  }
}

function PageLines({ project }: { project: string }) {
  const editor = useEditor()
  const zoom = useValue("zoom", () => editor.getZoomLevel(), [editor])
  const session = useContext(ProjectContext)

  if (!session) {
    throw new Error("Page lines are drawn inside a project tab")
  }

  const groups = routePageGroups(project)
  const pickedGroup = selectedPageGroup(project, useSelection(session.selection))
  const [hoveredGroup, setHoveredGroup] = useState<string>()

  const lit = useLitLinks(project, session.selection, groups, [pickedGroup, hoveredGroup])
  const boxes = useGroupBoxes(groups, zoom)

  const lines = useValue(
    "page lines",
    () =>
      routePageLinks(project).flatMap(({ from, to }) => {
        const above = editor.getShapePageBounds(createCanvasId(encodeURIComponent(from)))
        const group = boxes.get(to)
        const below = group ?? editor.getShapePageBounds(createCanvasId(encodeURIComponent(to)))

        if (!above || !below) {
          return []
        }

        const untitled = group !== undefined

        return [
          {
            key: to,
            path: pageLinkLine(above, below, zoom, untitled),
            pieces: pageLinkPieces(above, below, zoom, untitled)
          }
        ]
      }),
    [editor, project, zoom, boxes]
  )

  const select = (key: string) => {
    const group = groups.find((each) => each.key === key)

    // A group is its layout route's, which the selection holds by ref.
    if (group) {
      session.selection.set(refsSelection([routeRef(session.info, group.route)]))
    } else {
      session.selection.set({ design: key })
    }
  }

  // Every line is a screen pixel and a half wide, in dashes of six that flow down the tree, from each page to the pages
  // under it, at any zoom. At rest it's faint; brought forward, it's in the page color, drawn over the rest. Lines are
  // drawn in pieces that each start on a dash (see `pageLinkPieces`), so the browser skips those off screen, and only
  // those near the view flow (see `FlowingDashes`), PAR-1322.
  const px = (value: number) => value / zoom
  const color = designColor("screen")
  const ordered = [...lines.filter(({ key }) => !lit.has(key)), ...lines.filter(({ key }) => lit.has(key))]

  return (
    <>
      {groups.map((group) => {
        const box = boxes.get(group.key)

        return (
          box && (
            <PageGroupView
              key={group.key}
              group={group}
              box={box}
              zoom={zoom}
              picked={pickedGroup === group.key}
              forward={lit.has(group.key)}
              onPick={() => select(group.key)}
              onHover={(over) => setHoveredGroup(over ? group.key : undefined)}
              onRedirect={(key) => select(key)}
            />
          )
        )
      })}
      <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden>
        <FlowingDashes
          period={px(2 * pageLinkDash)}
          width={px(1.5)}
          pieces={ordered.flatMap(({ key, pieces }) => {
            const stroke = lit.has(key) ? color : `color-mix(in oklch, ${color} 45%, transparent)`

            return pieces.map(({ path, box }, index) => ({ key: `${key} ${index}`, path, box, stroke }))
          })}
        />
        {/* What takes the pointer: each line, a few screen pixels either side, over every line drawn. */}
        {lines.map(({ key, path }) => (
          <path
            key={key}
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={px(10)}
            className="cursor-pointer"
            style={{ pointerEvents: "stroke" }}
            onPointerDown={(event) => {
              stopEventPropagation(event)
              select(key)
            }}
            onPointerEnter={() => (boxes.has(key) ? setHoveredGroup(key) : session.selection.setHover({ design: key }))}
            onPointerLeave={() => (boxes.has(key) ? setHoveredGroup(undefined) : session.selection.setHover(undefined))}
          />
        ))}
      </svg>
    </>
  )
}

/** How long dashes take to flow one dash and gap along a line, in milliseconds. */
const flowMs = 1500

/** A piece of a line in the page tree, as `FlowingDashes` draws it. */
interface DashedPiece {
  key: string
  path: string
  box: BoardBox
  stroke: string
}

/**
 * Draws the page tree's pieces of line, dashed a dash and gap `period` long, and flows the dashes of those near the
 * view: within a screen of it, from the camera (PAR-1322). One flow set on every piece restyled hundreds of them on
 * every frame, most of them off screen. Every flow keeps time with the page, so a piece starting to flow lines up with
 * those beside it, which start on a dash too (see `pageLinkPieces`).
 */
function FlowingDashes({ period, width, pieces }: { period: number; width: number; pieces: readonly DashedPiece[] }) {
  const editor = useEditor()
  const group = useRef<SVGGElement>(null)
  const flows = useRef(new Map<Element, Animation>())

  useLayoutEffect(() => {
    const paths = group.current?.children
    const running = flows.current

    if (!paths) {
      return undefined
    }

    // Pieces change with the zoom, so flows start over from what's drawn now, each at the same point of its loop.
    for (const flow of running.values()) {
      flow.cancel()
    }

    running.clear()

    const stop = react("flowing dashes", () => {
      const view = editor.getViewportPageBounds()
      const near = { x: view.x - view.w, y: view.y - view.h, w: view.w * 3, h: view.h * 3 }

      for (const [index, { box }] of pieces.entries()) {
        const path = paths.item(index)

        if (!path) {
          continue
        }

        const flow = running.get(path)

        const close =
          box.x <= near.x + near.w && box.x + box.w >= near.x && box.y <= near.y + near.h && box.y + box.h >= near.y

        if (close && !flow) {
          running.set(path, startFlow(path, period))
        } else if (!close && flow) {
          flow.cancel()
          running.delete(path)
        }
      }
    })

    return () => {
      stop()

      for (const flow of running.values()) {
        flow.cancel()
      }

      running.clear()
    }
  }, [editor, pieces, period])

  return (
    <g
      ref={group}
      fill="none"
      strokeWidth={width}
      strokeDasharray={`${period / 2} ${period / 2}`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {pieces.map(({ key, path, stroke }) => (
        <path key={key} d={path} stroke={stroke} style={{ transition: "stroke 150ms" }} />
      ))}
    </g>
  )
}

function startFlow(path: Element, period: number) {
  const flow = path.animate([{ strokeDashoffset: "0px" }, { strokeDashoffset: `${-period}px` }], {
    duration: flowMs,
    iterations: Infinity
  })

  // Started at the page's first moment, every flow is at the same point of its loop as every other.
  flow.startTime = 0

  return flow
}

/** Where each layout group is now, round what's inside it as it's drawn (see `pageGroupBox`), by key. */
function useGroupBoxes(groups: readonly PageGroupPlace[], zoom: number): ReadonlyMap<string, BoardBox> {
  const editor = useEditor()

  return useValue(
    "page group boxes",
    () => {
      const found = new Map<string, BoardBox>()
      const keys = new Set(groups.map((group) => group.key))

      const boxOf = (key: string): BoardBox | undefined => {
        const group = groups.find((each) => each.key === key)

        if (!group) {
          return editor.getShapePageBounds(createCanvasId(encodeURIComponent(key)))
        }

        const known = found.get(key)

        if (known) {
          return known
        }

        const inside = group.members.flatMap((member) => {
          const box = boxOf(member)

          return box ? [{ box, titled: !keys.has(member) }] : []
        })

        const box = pageGroupBox(inside, zoom)

        if (box) {
          found.set(key, box)
        }

        return box
      }

      for (const group of groups) {
        boxOf(group.key)
      }

      return found
    },
    [editor, groups, zoom]
  )
}

/**
 * A layout with no page of its own (PAR-1076): a rounded outline round its pages, dashed until it's selected or brought
 * forward, with its name and path in its header, at the size a board's title draws, and where its index redirects. The
 * header takes the pointer, to select the group; the rest lets it through to the pages inside.
 */
function PageGroupView({
  group,
  box,
  zoom,
  picked,
  forward,
  onPick,
  onHover,
  onRedirect
}: {
  group: PageGroupPlace
  box: BoardBox
  zoom: number
  picked: boolean
  forward: boolean
  onPick: () => void
  onHover: (over: boolean) => void
  onRedirect: (key: string) => void
}) {
  const color = designColor("screen")
  const { scale, opacity } = labelLook("name", zoom, { width: box.w })
  const size = scale / zoom

  return (
    <div
      className="absolute"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        border: `${1 / zoom}px ${picked || forward ? "solid" : "dashed"} ${picked || forward ? color : `color-mix(in oklch, ${color} 45%, transparent)`}`,
        borderRadius: 12 / zoom
      }}
    >
      <div
        className="pointer-events-auto absolute top-0 left-0 flex origin-top-left items-center gap-2 px-3 pt-2.5"
        style={{
          transform: `scale(${size})`,
          width: box.w / size,
          opacity,
          visibility: opacity > 0 ? undefined : "hidden"
        }}
      >
        <button
          type="button"
          className="flex min-w-0 cursor-default items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-sm"
          onPointerDown={(event) => {
            stopEventPropagation(event)
            onPick()
          }}
          onPointerEnter={() => onHover(true)}
          onPointerLeave={() => onHover(false)}
        >
          <LayoutTemplate className="size-4 shrink-0" style={{ color }} />
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="truncate font-medium text-foreground/90" style={picked ? { color } : undefined}>
              {group.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">{group.path}</span>
          </span>
        </button>
        {group.redirect && (
          <Hint label={`Redirects to ${group.redirect.name}`} wait>
            <button
              type="button"
              className="ml-auto flex shrink-0 cursor-default items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              aria-label={`Redirects to ${group.redirect.name}`}
              onPointerDown={(event) => {
                stopEventPropagation(event)

                if (group.redirect) {
                  onRedirect(group.redirect.key)
                }
              }}
            >
              <CornerDownRight className="size-3.5" />
              {group.redirect.name}
            </button>
          </Hint>
        )}
      </div>
    </div>
  )
}

/**
 * The lines brought forward by the selected page and the hovered one, on the canvas, in Layers or by its line, and by
 * the groups selected or hovered. A page inside a group brings forward the group's line on its way up.
 */
function useLitLinks(
  project: string,
  selection: SelectionStore,
  groups: readonly PageGroupPlace[],
  pickedGroups: readonly (string | undefined)[]
): Set<string> {
  const editor = useEditor()
  const selected = useSelection(selection).design
  const hovered = useHover(selection)?.design

  const onCanvas = useValue(
    "hovered page",
    () => {
      const under = editor.getHoveredShapeId()

      return routePageLinks(project)
        .flatMap(({ from, to }) => [from, to])
        .concat(groups.flatMap((group) => group.members))
        .find((page) => createCanvasId(encodeURIComponent(page)) === under)
    },
    [editor, project, groups]
  )

  const held = groups.flatMap((group) => group.members.map((member) => ({ from: group.key, to: member })))

  return pageLinksLit([...routePageLinks(project), ...held], [selected, hovered, onCanvas, ...pickedGroups])
}
