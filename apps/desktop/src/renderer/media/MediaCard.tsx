import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { type ImageMedium, inUse, mediumOf, type PictureSize, type ProjectImage } from "@parity-app/editor"
import { ExternalLink, ImageIcon, type LucideIcon, PenTool, Plus, Trash2 } from "lucide-react"
import { type ReactNode, useState } from "react"
import { kindColors } from "../canvas/kinds.tsx"
import { IconButton } from "../chrome/IconButton.tsx"
import { Name } from "../chrome/Name.tsx"
import { CardUses, EveryUse, type MediaLayers } from "./MediaUses.tsx"
import { PictureMissing, ProjectPicture, transparencyGrid } from "./ProjectPicture.tsx"

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
  onShow: (layers: MediaLayers) => void
}

/**
 * One of the project's media on its card (PAR-871): the picture large, its name, its facts in labelled rows, where
 * it's used, and a bar with what to do with it. Where it's used opens every place in the card's stead when there's
 * more than the card lists.
 */
export function MediaCard({ image, url, size, onInsert, onRemove, onShow }: MediaCardProps) {
  const [everyUse, setEveryUse] = useState(false)

  if (everyUse) {
    return <EveryUse image={image} onBack={() => setEveryUse(false)} onShow={onShow} />
  }

  const Icon = mediumIcons[mediumOf(image)]

  return (
    <div className="flex flex-col">
      <div className="p-2 pb-0">
        <CardStage image={image} url={url} size={size} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 px-3 pt-3 pb-2">
        <Icon aria-hidden className="size-3.5 shrink-0" style={{ color: kindColors.layer }} />
        <Name className="min-w-0 text-sm font-medium">{image.name}</Name>
      </div>
      <Facts image={image} size={size} />
      {inUse(image) ? (
        <CardUses image={image} onShow={onShow} onAll={() => setEveryUse(true)} />
      ) : (
        <p className="border-t px-3 py-2.5 text-xs text-muted-foreground">Not used yet</p>
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

/**
 * What it is, a fact a row, each under the same label on every card: its size, its file and where it is, and who made
 * it. A row with nothing to say is left out.
 */
function Facts({ image, size }: { image: ProjectImage; size: PictureSize | undefined }) {
  return (
    <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 pb-3 text-xs">
      {size && <Fact label="Size">{`${size.width} × ${size.height}`}</Fact>}
      <FileFacts image={image} />
      {image.credit && (
        <Fact label="Credit">
          <Credit credit={image.credit} />
        </Fact>
      )}
    </dl>
  )
}

/** Whether it's saved in the project, and where: its path, a linked picture's site, or the path with no file. */
function FileFacts({ image }: { image: ProjectImage }) {
  if (image.kind === "linked") {
    return (
      <>
        <Fact label="File">Linked, not saved</Fact>
        <Fact label="Link">
          <Where text={hostOf(image.src)} full={image.src} />
        </Fact>
      </>
    )
  }

  if (image.kind === "missing") {
    return (
      <>
        <Fact label="File">
          <span className="text-(--process-starting)">Missing</span>
        </Fact>
        <Fact label="Path">
          <Where text={image.src} full={image.src} />
        </Fact>
      </>
    )
  }

  return (
    <>
      {image.bytes !== undefined && <Fact label="File">{bytesOf(image.bytes)}</Fact>}
      {image.path && (
        <Fact label="Path">
          <Where text={image.path} full={image.path} />
        </Fact>
      )}
    </>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 tabular-nums">{children}</dd>
    </>
  )
}

/** A path or address, cut to fit, whole in its tooltip. */
function Where({ text, full }: { text: string; full: string }) {
  return (
    <span className="block truncate font-mono text-2xs" title={full}>
      {text}
    </span>
  )
}

/** A link's site, as "cdn.pixabay.com", or the link itself when it isn't one a URL can read. */
function hostOf(src: string): string {
  return URL.canParse(src) ? new URL(src).host : src
}

/** Who made it, linked to them, on the library it's from, with a way to its page there. */
function Credit({ credit }: { credit: NonNullable<ProjectImage["credit"]> }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <a href={credit.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
        {credit.name}
      </a>
      {credit.source && (
        <>
          <span className="shrink-0 text-muted-foreground">on {credit.source}</span>
          <a
            href={credit.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open in ${credit.source}`}
            className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ExternalLink className="size-3" />
          </a>
        </>
      )}
    </span>
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

/**
 * The card's picture, as large as its box allows, over the transparency grid. The grid is behind the picture alone,
 * so where it shows the picture is see-through, and the plain gray round one that doesn't fill the box is outside it.
 * Until its size is known it's as wide as the box.
 */
function CardStage({ image, url, size }: { image: ProjectImage; url: string; size: PictureSize | undefined }) {
  if (image.kind === "missing") {
    return (
      <div className="h-24 rounded-md bg-muted">
        <PictureMissing />
      </div>
    )
  }

  const fitted = fittedIn(stage, size)

  return (
    <div className="flex justify-center overflow-hidden rounded-md bg-muted ring-1 ring-border ring-inset">
      {fitted ? (
        <ProjectPicture url={url} style={{ ...transparencyGrid, ...fitted }} />
      ) : (
        <ProjectPicture url={url} className="w-full object-contain" style={{ maxHeight: stage.height }} />
      )}
    </div>
  )
}

/** A picture's size scaled to fit a box, keeping its proportions, or none while its size isn't known. */
function fittedIn(box: PictureSize, size: PictureSize | undefined): PictureSize | undefined {
  if (!size || size.width <= 0 || size.height <= 0) {
    return undefined
  }

  const scale = Math.min(box.width / size.width, box.height / size.height)

  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }
}
