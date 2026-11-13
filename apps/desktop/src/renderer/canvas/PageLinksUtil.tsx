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
 * The lines of the app's page tree (PAR-1076): from each page down to each page under it, as elbows that turn halfway,
 * moving along as the app's navigation goes. They're drawn from where the pages' boards are now, so they follow a page
 * that's moved. One shape at the canvas's origin draws them all; it takes no pointer and is never culled.
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

  // Each line runs from the middle of the page's bottom edge to the middle of the top edge of the page under it, turning
  // halfway between them. A page's title sits at its left, clear of the line.
  const lines = useValue(
    "page lines",
    () =>
      routePageLinks(project).flatMap(({ from, to }) => {
        const above = editor.getShapePageBounds(createCanvasId(encodeURIComponent(from)))
        const below = editor.getShapePageBounds(createCanvasId(encodeURIComponent(to)))

        if (!above || !below) {
          return []
        }

        const turn = (above.maxY + below.minY) / 2

        return [
          {
            key: to,
            path: `M ${above.midX} ${above.maxY} V ${turn} H ${below.midX} V ${below.minY}`,
            ends: [
              [above.midX, above.maxY],
              [below.midX, below.minY]
            ]
          }
        ]
      }),
    [editor, project]
  )

  // Two screen pixels wide, in dashes of eight that flow down from each page to the pages under it, at any zoom.
  const px = (value: number) => value / zoom
  const color = designColor("screen")

  return (
    <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden>
      {lines.map(({ key, path, ends }) => (
        <g key={key}>
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={px(2)}
            strokeDasharray={`${px(8)} ${px(8)}`}
            strokeLinejoin="round"
          >
            <animate attributeName="stroke-dashoffset" from={0} to={-px(16)} dur="2s" repeatCount="indefinite" />
          </path>
          {ends.map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={px(4)} fill={color} />
          ))}
        </g>
      ))}
    </svg>
  )
}
