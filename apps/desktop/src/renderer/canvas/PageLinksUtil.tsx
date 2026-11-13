import { pageLinkLine, pageLinksLit } from "@parity-app/editor"
import { useContext } from "react"
import { HTMLContainer, Rectangle2d, type RecordProps, T, useEditor, useValue } from "tldraw"
import { useHover, useSelection } from "../selection.ts"
import { ProjectContext } from "./context.ts"
import { designColor } from "./kinds.tsx"
import { routePageLinks } from "./route-pages.ts"
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
 * (see `pageLinksLit`). One shape at the canvas's origin draws them all; it takes no pointer and is never culled.
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
  const lit = useLitLinks(project)

  const lines = useValue(
    "page lines",
    () =>
      routePageLinks(project).flatMap(({ from, to }) => {
        const above = editor.getShapePageBounds(createCanvasId(encodeURIComponent(from)))
        const below = editor.getShapePageBounds(createCanvasId(encodeURIComponent(to)))

        return above && below ? [{ key: to, path: pageLinkLine(above, below, zoom) }] : []
      }),
    [editor, project, zoom]
  )

  // Every line is a screen pixel and a half wide, in dashes of six that flow down the tree, from each page to the pages
  // under it, at any zoom. At rest it's faint; brought forward, it's in the page color, drawn over the rest.
  const px = (value: number) => value / zoom
  const color = designColor("screen")
  const ordered = [...lines.filter(({ key }) => !lit.has(key)), ...lines.filter(({ key }) => lit.has(key))]

  return (
    <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden>
      {ordered.map(({ key, path }) => {
        const forward = lit.has(key)

        return (
          <path
            key={key}
            d={path}
            fill="none"
            stroke={forward ? color : `color-mix(in oklch, ${color} 45%, transparent)`}
            strokeWidth={px(1.5)}
            strokeDasharray={`${px(6)} ${px(6)}`}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: "stroke 150ms" }}
          >
            <animate attributeName="stroke-dashoffset" from={0} to={-px(12)} dur="1.5s" repeatCount="indefinite" />
          </path>
        )
      })}
    </svg>
  )
}

/** The lines brought forward by the selected page and the hovered one, on the canvas or in Layers. */
function useLitLinks(project: string): Set<string> {
  const editor = useEditor()
  const session = useContext(ProjectContext)

  if (!session) {
    throw new Error("Page lines are drawn inside a project tab")
  }

  const selected = useSelection(session.selection).design
  const hovered = useHover(session.selection)?.design

  const onCanvas = useValue(
    "hovered page",
    () => {
      const under = editor.getHoveredShapeId()

      return routePageLinks(project)
        .flatMap(({ from, to }) => [from, to])
        .find((page) => createCanvasId(encodeURIComponent(page)) === under)
    },
    [editor, project]
  )

  return pageLinksLit(routePageLinks(project), [selected, hovered, onCanvas])
}
