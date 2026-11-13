import { pageLinkLine } from "@parity-app/editor"
import { HTMLContainer, Rectangle2d, type RecordProps, T, useEditor, useValue } from "tldraw"
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
 * the titles as they grow on the canvas. One shape at the canvas's origin draws them all; it takes no pointer and is never culled.
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

  // One and a half screen pixels wide, in dashes of six that flow down from each page to the pages under it, at any zoom.
  const px = (value: number) => value / zoom
  const color = designColor("screen")

  return (
    <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden>
      {lines.map(({ key, path }) => (
        <path
          key={key}
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={px(1.5)}
          strokeDasharray={`${px(6)} ${px(6)}`}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <animate attributeName="stroke-dashoffset" from={0} to={-px(12)} dur="1.5s" repeatCount="indefinite" />
        </path>
      ))}
    </svg>
  )
}
