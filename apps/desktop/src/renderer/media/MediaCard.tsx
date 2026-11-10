import { Button } from "@buildkitgg/shadcn-baseui-kit"
import {
  designsUsing,
  type ImageMedium,
  inUse,
  mediumOf,
  type PictureSize,
  type ProjectImage
} from "@parity-app/editor"
import { Code, ImageIcon, type LucideIcon, PenTool, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { DesignIcon, kindColors } from "../canvas/kinds.tsx"
import { IconButton } from "../chrome/IconButton.tsx"
import { Name } from "../chrome/Name.tsx"
import { PhotoCredit } from "../chrome/PhotoCredit.tsx"
import { PictureMissing, ProjectPicture } from "./ProjectPicture.tsx"

/** A layer that shows one of the project's media, to select on the canvas. */
export interface MediaLayer {
  document: string
  design: string
  node: string
}

/** Each medium's icon, beside a name. */
export const mediumIcons: Record<ImageMedium, LucideIcon> = { image: ImageIcon, vector: PenTool }

/** What removing one says it does: a file goes from the project, and a link or a path from the designs using it. */
export function removeLabel(image: ProjectImage): string {
  return image.kind === "file" ? "Remove from project" : "Remove from designs"
}

interface MediaCardProps {
  image: ProjectImage
  url: string
  /** Its picture's size, once it has loaded. */
  size: PictureSize | undefined
  /** Inserts it at the selection, which needs its picture's size. */
  onInsert?: () => void
  onRemove: () => void
  onShow: (layer: MediaLayer) => void
}

/**
 * One of the project's media on its card, laid out as a component's is: the picture large; its name and where its file
 * is; its size; who took it; the designs and lines of code that use it; and a bar with what to do with it.
 */
export function MediaCard({ image, url, size, onInsert, onRemove, onShow }: MediaCardProps) {
  const Icon = mediumIcons[mediumOf(image)]

  const facts: string[] = []

  if (size) {
    facts.push(`${size.width} × ${size.height}`)
  }

  if (image.bytes !== undefined) {
    facts.push(bytesOf(image.bytes))
  }

  if (!inUse(image)) {
    facts.push("Not used yet")
  }

  return (
    <div className="flex flex-col">
      <div className="p-2 pb-0">
        <CardStage image={image} url={url} size={size} />
      </div>
      <div className="flex flex-col gap-0.5 px-3 pt-2.5 pb-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon aria-hidden className="size-3.5 shrink-0" style={{ color: kindColors.layer }} />
          <Name className="min-w-0 text-sm font-medium">{image.name}</Name>
        </div>
        {image.path && <span className="truncate font-mono text-2xs text-muted-foreground">{image.path}</span>}
        {image.kind === "linked" && (
          <span className="text-xs text-muted-foreground">Linked, not saved in the project</span>
        )}
        {image.kind === "missing" && <span className="text-xs text-(--process-starting)">No file at {image.src}</span>}
        {facts.length > 0 && (
          <span className="flex gap-3 text-xs text-muted-foreground tabular-nums">
            {facts.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </span>
        )}
        {image.credit && <PhotoCredit credit={image.credit} className="mt-1" />}
      </div>
      {inUse(image) && (
        <div className="border-t py-1.5 pr-1.5 pl-3 text-xs">
          <MediaUses image={image} onShow={onShow} shown={usesShown} />
        </div>
      )}
      <div className="flex items-center gap-1 border-t px-2 py-1.5">
        {onInsert && (
          <Button size="sm" className="h-7 text-xs" onClick={onInsert}>
            <Plus /> Insert
          </Button>
        )}
        <span className="flex-1" />
        <IconButton
          label={removeLabel(image)}
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 />
        </IconButton>
      </div>
    </div>
  )
}

/** A file's size as a person reads one: "180 kB", "2.4 MB". */
function bytesOf(bytes: number): string {
  const [unit, amount] = bytes < 1_000_000 ? ["kilobyte", Math.max(1, bytes / 1000)] : ["megabyte", bytes / 1_000_000]

  return new Intl.NumberFormat(undefined, {
    style: "unit",
    unit,
    maximumFractionDigits: unit === "megabyte" ? 1 : 0
  }).format(amount)
}

/** The picture's box on a card: the card's width less its padding, and at most this tall. */
const stage = { width: 304, height: 228 }

/** The card's picture: as wide as the card, or as tall as its box when it's taller than that. */
function CardStage({ image, url, size }: { image: ProjectImage; url: string; size: PictureSize | undefined }) {
  if (image.kind === "missing") {
    return (
      <div className="h-24 rounded-md bg-muted">
        <PictureMissing />
      </div>
    )
  }

  const tall = size !== undefined && size.height / size.width > stage.height / stage.width

  return (
    <div className="flex justify-center overflow-hidden rounded-md bg-muted ring-1 ring-border ring-inset">
      <ProjectPicture
        url={url}
        className={tall ? "object-contain" : "w-full object-contain"}
        style={tall ? { height: stage.height } : { maxHeight: stage.height }}
      />
    </div>
  )
}

/** How many of the places that use one its card lists before the rest wait behind a button. */
const usesShown = 3

interface MediaUsesProps {
  image: ProjectImage
  onShow: (layer: MediaLayer) => void
  /** How many to list before the rest wait behind a button; all of them when not given. */
  shown?: number
  className?: string
}

/**
 * Where one is used: a row for each design, the one with the most layers first, with Show, then each line of code
 * that names it. A logo can be in a hundred layers, and they're in a handful of designs, so the designs are listed.
 */
export function MediaUses({ image, onShow, shown, className = "" }: MediaUsesProps) {
  const [all, setAll] = useState(false)

  const rows = [
    ...designsUsing(image).map((design) => {
      const [first] = design.layers

      return (
        <li key={`${design.document}#${design.design}`} className="flex h-7 shrink-0 items-center gap-2">
          <DesignIcon kind="screen" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {design.name}{" "}
            <span className="text-muted-foreground">
              {design.layers.length === 1 ? "1 layer" : `${design.layers.length} layers`}
            </span>
          </span>
          {first && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Show in ${design.name}`}
              className="h-6 px-1.5 text-xs"
              onClick={() => onShow({ document: design.document, design: design.design, node: first })}
            >
              Show
            </Button>
          )}
        </li>
      )
    }),
    ...image.usedInCode.map((use) => (
      <li key={`${use.path}:${use.line}`} className="flex h-7 shrink-0 items-center gap-2">
        <Code aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-2xs">
          {use.path}, line {use.line}
        </span>
      </li>
    ))
  ]

  const listed = all || shown === undefined ? rows : rows.slice(0, shown)
  const more = rows.length - listed.length

  return (
    <div className={className}>
      <ul aria-label="Where it's used" className={`flex flex-col ${all ? "max-h-42 overflow-y-auto" : ""}`}>
        {listed}
      </ul>
      {more > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-1.5 h-6 px-1.5 text-xs text-muted-foreground"
          onClick={() => setAll(true)}
        >
          Show {more} more
        </Button>
      )}
    </div>
  )
}
