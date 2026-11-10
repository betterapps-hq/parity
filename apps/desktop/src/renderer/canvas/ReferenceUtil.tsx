import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { connectorById } from "@parity-app/connectors"
import type { ReferenceSpec } from "@parity-app/core"
import { referenceExpired } from "@parity-app/editor"
import { ExternalLink } from "lucide-react"
import { useState } from "react"
import { HTMLContainer, Rectangle2d, type RecordProps, stopEventPropagation, T, useEditor, useValue } from "tldraw"
import { z } from "zod"
import { useReference } from "../design-store.ts"
import { useProject } from "./context.ts"
import { type CanvasRecord, CanvasUtil } from "./tldraw-names.ts"

declare module "tldraw" {
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- tldraw names the map this augments.
  export interface TLGlobalShapePropsMap {
    "canvas-reference": { w: number; h: number; key: string }
  }
}

export type ReferenceRecord = CanvasRecord<"canvas-reference">

/** The name of the library a reference came from, as its connector gives it. */
export function referenceSource(reference: Pick<ReferenceSpec, "connector">): string {
  return connectorById(reference.connector)?.info.name ?? reference.connector
}

/** Opens a reference's page at its source, in the person's browser. */
export function openReference(reference: Pick<ReferenceSpec, "link">): void {
  window.open(reference.link, "_blank")
}

/**
 * A screen from a real app, placed beside a design to look at (PAR-840): its picture at its own size, with its app and
 * source under it. It isn't a design, so it has no board, and it's never written to code.
 */
export class ReferenceUtil extends CanvasUtil<ReferenceRecord> {
  static override type = "canvas-reference" as const
  static override props: RecordProps<ReferenceRecord> = { w: T.number, h: T.number, key: T.string }

  override getDefaultProps(): ReferenceRecord["props"] {
    return { w: 1280, h: 800, key: "" }
  }

  override canResize() {
    return false
  }

  override hideResizeHandles() {
    return true
  }

  override hideRotateHandle() {
    return true
  }

  override getGeometry(reference: ReferenceRecord) {
    return new Rectangle2d({ width: reference.props.w, height: reference.props.h, isFilled: true })
  }

  override onDoubleClick(reference: ReferenceRecord) {
    // The canvas keeps the reference's link on its shape, since a util can't reach the store.
    const link = z.url().safeParse(reference.meta.link)

    if (link.success) {
      openReference({ link: link.data })
    }
  }

  override component(reference: ReferenceRecord) {
    return (
      <HTMLContainer style={{ pointerEvents: "none", overflow: "visible" }}>
        <ReferenceContent record={reference} />
      </HTMLContainer>
    )
  }

  override getIndicatorPath(reference: ReferenceRecord) {
    const path = new Path2D()
    path.rect(0, 0, reference.props.w, reference.props.h)

    return path
  }
}

/** Each picture that wouldn't load, by its link, so a reference drawn again doesn't try it again. */
const failed = new Set<string>()

function ReferenceContent({ record }: { record: ReferenceRecord }) {
  const editor = useEditor()
  const { store } = useProject()
  const reference = useReference(store, record.props.key)?.reference
  const zoom = useValue("zoom", () => editor.getZoomLevel(), [editor])
  const selected = useValue("reference selected", () => editor.getSelectedShapeIds().includes(record.id), [editor])
  const [broken, setBroken] = useState(false)
  // When it was drawn, to tell whether its picture's link still works.
  const [drawnAt] = useState(() => Date.now())

  if (!reference) {
    return null
  }

  const source = referenceSource(reference)
  const { url } = reference.image
  const missing = broken || failed.has(url) || referenceExpired(reference, drawnAt)
  // The caption stays the same size on screen at any zoom, as designs' names do.
  const px = (value: number) => value / zoom
  // What stands in for a picture that won't load grows with the reference, as the picture would: a phone's width holds
  // it at its own size.
  const inside = (value: number) => (value * record.props.w) / 390

  return (
    <div className="select-none">
      {missing ? (
        <div
          className="flex flex-col items-center justify-center bg-muted text-muted-foreground"
          style={{ width: record.props.w, height: record.props.h, gap: inside(8), fontSize: inside(13) }}
        >
          <span className="max-w-full truncate px-[1em] font-medium text-foreground">{reference.app}</span>
          <Button
            variant="outline"
            size="sm"
            // Only once it's selected, so a click that selects it doesn't open its source as well.
            className={`origin-center ${selected ? "pointer-events-auto" : ""}`}
            style={{ scale: inside(1) }}
            onPointerDown={stopEventPropagation}
            onClick={() => openReference(reference)}
          >
            <ExternalLink /> Open in {source}
          </Button>
        </div>
      ) : (
        <img
          src={url}
          alt={`Reference: ${reference.app}, from ${source}`}
          draggable={false}
          className="block bg-muted object-cover object-top"
          style={{ width: record.props.w, height: record.props.h, outline: `${px(1)}px solid var(--border)` }}
          onError={() => {
            failed.add(url)
            setBroken(true)
          }}
        />
      )}
      <div
        className="flex flex-col text-muted-foreground"
        style={{ marginTop: px(6), gap: px(2), fontSize: px(11), lineHeight: 1.35, width: record.props.w }}
      >
        <div className="flex items-baseline justify-between" style={{ gap: px(8) }}>
          <span className="truncate font-medium text-foreground">{reference.app}</span>
          <span className="shrink-0">{source}</span>
        </div>
        {reference.note && <span className="line-clamp-2">{reference.note}</span>}
      </div>
    </div>
  )
}
