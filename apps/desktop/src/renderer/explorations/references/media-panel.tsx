import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import type { ConnectorInfo, Found } from "@parity-app/connectors"
import { mayBeImage } from "@parity-app/editor"
import {
  Code,
  ExternalLink,
  Film,
  FolderOpen,
  ImageIcon,
  ImageOff,
  ImagePlay,
  Link2,
  Play,
  Plus,
  PenTool,
  Trash2
} from "lucide-react"
import { type CSSProperties, type DragEvent, type KeyboardEvent, useRef, useState } from "react"
import { chipColors, DesignIcon, kindColors } from "../../canvas/kinds.tsx"
import { SearchField } from "../../chrome/AssetsPanel.tsx"
import { useHoverCard } from "../../chrome/hover-card.ts"
import { IconButton } from "../../chrome/IconButton.tsx"
import { Name } from "../../chrome/Name.tsx"
import { Player, Preview } from "./browser.tsx"
import { clipOf, clockOf, Picture, sizeOf, sourceOf } from "./library.tsx"

/*
 * The Media tab: everything the project has to show or play, however it got there. Photos, illustrations, vectors and
 * videos from a stock library, files dropped or pasted in, pictures layers link to somewhere else, and paths layers
 * name that have no file. It's a wall of the pictures themselves, each in its own proportions, since a picture says what it
 * is faster than its file name does. Resting on one opens its card, as a component's does: the picture larger, a video
 * with its player, what it is, where it's from, where it's used, and what to do with it.
 *
 * Searching here looks through what the project has. Add, beside the search, opens the browser on the stock library or
 * picks files. Image files dragged onto the tab are added to the project (PAR-835), and removing one asks first when
 * something still uses it (PAR-836).
 */

/**
 * One of the project's media, in the form `projectImages` in `@parity-app/editor` gives the window and agents
 * (PAR-834): a file in the project, a picture linked at its library's address, or a path layers name with no file.
 */
export interface ProjectMedia {
  kind: "file" | "linked" | "missing"
  src: string
  path?: string
  name: string
  bytes?: number
  alt?: string
  credit?: { name: string; url: string; source?: string }
  usedBy: { document: string; design: string; designName: string; node: string }[]
  usedInCode: { path: string; line: number }[]
}

/** A layer that uses one of the project's media, as its card and the remove dialog list them. */
export type MediaUse = ProjectMedia["usedBy"][number]

/** What a drag from the tab carries: the `src` of the one dragged, to place where it's dropped. */
const mediaMime = "application/x-parity-media"

/** What something is, which the tab can narrow to: a picture made of pixels, one made of shapes, or a video. */
type Medium = "image" | "vector" | "video"

const mediums: readonly { id: Medium; many: string; Icon: typeof ImageIcon }[] = [
  { id: "image", many: "Images", Icon: ImageIcon },
  { id: "vector", many: "Vectors", Icon: PenTool },
  { id: "video", many: "Videos", Icon: Film }
]

function mediumOf(item: ProjectMedia, picture: Found | undefined): Medium {
  if (picture?.video || /\.(mp4|webm|mov)$/i.test(item.src)) {
    return "video"
  }

  return /\.svg$/i.test(item.src) ? "vector" : "image"
}

/** A file's size as a person reads one: "180 KB", "2.4 MB". */
function bytesOf(bytes: number): string {
  return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`
}

interface MediaPanelProps {
  media: readonly ProjectMedia[]
  /** What each looks like, by its `src`: a sample drawn in its place, or the file itself. */
  pictures: Readonly<Record<string, Found>>
  /** The ones just added, by `src`, which arrive with a short entrance and stay marked for a moment. */
  fresh: readonly string[]
  /** The stock library Add opens, for its name and mark. */
  stock: ConnectorInfo
  /** Opens the stock library's browser, on a search when the project's own media had nothing for it. */
  onFind: (query?: string) => void
  onOpenAtSource: (item: ProjectMedia) => void
  /** Files dropped on the tab or chosen from the computer, to add to the project. */
  onAdd: (files: File[]) => void
  /** Places one in the selected design. */
  onPlace: (item: ProjectMedia) => void
  /** Removes one, with the layers that show it when there are any. */
  onRemove: (item: ProjectMedia) => void
  /** Selects a layer that shows one, on the canvas. */
  onShow: (use: MediaUse) => void
}

export function MediaPanel({
  media,
  pictures,
  fresh,
  stock,
  onFind,
  onOpenAtSource,
  onAdd,
  onPlace,
  onRemove,
  onShow
}: MediaPanelProps) {
  const [query, setQuery] = useState("")
  const [chosen, setChosen] = useState<Medium>()
  const [asking, setAsking] = useState<ProjectMedia>()
  const drag = useFileDrag(onAdd)
  const picker = useRef<HTMLInputElement>(null)
  const words = query.trim().toLowerCase()

  const present = mediums.filter(({ id }) => media.some((item) => mediumOf(item, pictures[item.src]) === id))
  // A type whose last one was removed stops narrowing.
  const only = present.some(({ id }) => id === chosen) ? chosen : undefined

  const matching = media.filter((item) => {
    const picture = pictures[item.src]

    return (
      (!only || mediumOf(item, picture) === only) &&
      [item.name, item.alt, item.credit?.name, picture?.title].some((text) => text?.toLowerCase().includes(words))
    )
  })

  /** Removes one nothing uses at once, since Undo brings it back; asks first about one something still uses. */
  const remove = (item: ProjectMedia) => {
    if (item.kind === "file" && item.usedBy.length === 0 && item.usedInCode.length === 0) {
      onRemove(item)
    } else {
      // After the menu that asked has closed, so the click that chose Remove doesn't close the dialog as it opens.
      setTimeout(() => setAsking(item))
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...drag.handlers}>
      <div className="flex items-center gap-1 pr-2">
        <div className="flex-1">
          <SearchField value={query} onChange={setQuery} placeholder="Search media" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="mt-2" aria-label="Add media">
                <Plus />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={() => onFind()}>
              <SourceMark info={stock} /> Find on {stock.name}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => picker.current?.click()}>
              <FolderOpen /> Choose files
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={picker}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          hidden
          aria-label="Files to add"
          onChange={(event) => {
            onAdd([...(event.currentTarget.files ?? [])])
            event.currentTarget.value = ""
          }}
        />
      </div>
      {present.length > 1 && (
        <div className="px-2 pt-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[only ?? "all"]}
            onValueChange={([value]) => value && setChosen(mediums.find(({ id }) => id === value)?.id)}
            aria-label="Type of media"
            className="w-full"
          >
            <ToggleGroupItem value="all" className="h-7 min-w-0 flex-1 px-1.5 text-xs">
              All
            </ToggleGroupItem>
            {present.map(({ id, many }) => (
              <ToggleGroupItem key={id} value={id} className="h-7 min-w-0 flex-1 px-1.5 text-xs">
                {many}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {matching.length > 0 ? (
          <Wall
            items={matching}
            pictures={pictures}
            fresh={fresh}
            onPlace={onPlace}
            onOpenAtSource={onOpenAtSource}
            onRemove={remove}
            onShow={onShow}
          />
        ) : (
          <NoMedia query={query.trim()} stock={stock} onFind={onFind} />
        )}
      </div>
      {drag.over && <DropTarget count={drag.count} />}
      <InUseDialog
        item={asking}
        onClose={() => setAsking(undefined)}
        onShow={(use) => {
          setAsking(undefined)
          onShow(use)
        }}
        onRemove={(item) => {
          setAsking(undefined)
          onRemove(item)
        }}
      />
    </div>
  )
}

/** A library's own mark, as its connector draws it, the size of an icon. */
function SourceMark({ info, className = "size-4" }: { info: ConnectorInfo; className?: string }) {
  return (
    <svg viewBox={info.mark.box} aria-hidden className={`shrink-0 fill-current ${className}`}>
      <path d={info.mark.path} />
    </svg>
  )
}

/**
 * Files dragged over an element, or one of the project's media dragged from the tab when `onDropMedia` takes them:
 * whether they're over it, and how many may be images, which is all a drag says until the drop. Entering and leaving
 * its children fires on the way, so it counts them rather than trusting `dragleave`.
 */
export function useFileDrag(onDrop: (files: File[]) => void, onDropMedia?: (src: string) => void) {
  const [count, setCount] = useState<number>()
  const depth = useRef(0)

  const carriesMedia = (event: DragEvent) => !!onDropMedia && event.dataTransfer.types.includes(mediaMime)
  const carries = (event: DragEvent) => event.dataTransfer.types.includes("Files") || carriesMedia(event)

  const end = () => {
    depth.current = 0
    setCount(undefined)
  }

  const handlers = {
    onDragEnter: (event: DragEvent) => {
      if (!carries(event)) {
        return
      }

      event.preventDefault()
      depth.current += 1
      const items = [...event.dataTransfer.items].filter((item) => item.kind === "file")
      setCount(carriesMedia(event) ? 1 : items.filter((item) => mayBeImage(item.type)).length)
    },
    onDragOver: (event: DragEvent) => {
      if (carries(event)) {
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
      }
    },
    onDragLeave: (event: DragEvent) => {
      if (!carries(event)) {
        return
      }

      depth.current = Math.max(0, depth.current - 1)

      if (depth.current === 0) {
        end()
      }
    },
    onDrop: (event: DragEvent) => {
      if (!carries(event)) {
        return
      }

      event.preventDefault()
      end()

      if (carriesMedia(event)) {
        onDropMedia?.(event.dataTransfer.getData(mediaMime))
      } else {
        onDrop([...event.dataTransfer.files])
      }
    }
  }

  return { over: count !== undefined, count: count ?? 0, handlers }
}

/** What the tab shows while files are over it: its edge in the selection's color, and what a drop adds. */
function DropTarget({ count }: { count: number }) {
  const label =
    count === 0
      ? "Only PNG, JPEG, GIF, WebP or SVG images can be added"
      : `Add ${count === 1 ? "the image" : `${count} images`} to the project`

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-1.5 z-10 flex items-end justify-center rounded-lg border-2 border-dashed border-(--canvas-layer) bg-(--canvas-layer)/8 p-4 motion-safe:animate-in motion-safe:fade-in"
    >
      <span className="rounded-md px-2 py-1 text-xs font-medium shadow-sm" style={chipColors.layer}>
        {label}
      </span>
    </div>
  )
}

/** How many sit across the wall, the space between them, and a tile's width in a panel at its usual width. */
const wall = { across: 2, gap: 8, usual: 116 }

/** A length down the wall: so many tile widths, and so many gaps. */
interface Drop {
  widths: number
  gaps: number
}

/**
 * How tall a tile is for its width: its picture's own proportions, kept between a wide strip and a tall card so one
 * panorama or one long screenshot doesn't take the wall. A path with no file takes a photo's usual ones.
 */
function tallnessOf(item: ProjectMedia, picture: Found | undefined): number {
  if (item.kind === "missing" || !picture) {
    return 0.75
  }

  const { width, height } = sizeOf(picture)

  return Math.min(1.4, Math.max(0.5, height / width))
}

/**
 * Where each tile sits: in whichever column is shortest, so the columns stay level and adding one never moves the
 * ones before it. Heights are in tile widths, since the panel's width is the browser's to know.
 */
function pack(items: readonly ProjectMedia[], pictures: Readonly<Record<string, Found>>) {
  const columns: Drop[] = Array.from({ length: wall.across }, () => ({ widths: 0, gaps: 0 }))
  const lengthOf = ({ widths, gaps }: Drop) => widths * wall.usual + gaps * wall.gap

  const spots = items.map((item) => {
    let column = 0

    for (const [index, each] of columns.entries()) {
      if (lengthOf(each) < lengthOf(columns[column]!)) {
        column = index
      }
    }

    const above = columns[column]!
    const tallness = tallnessOf(item, pictures[item.src])
    columns[column] = { widths: above.widths + tallness, gaps: above.gaps + 1 }

    return { item, column, tallness, above }
  })

  const longest = columns.reduce((longer, each) => (lengthOf(each) > lengthOf(longer) ? each : longer))

  return { spots, height: { widths: longest.widths, gaps: Math.max(0, longest.gaps - 1) } }
}

/** A length down the wall in CSS, from the tile's width, which the wall's own width sets. */
function down({ widths, gaps }: Drop): string {
  return `calc(${widths} * var(--tile) + ${gaps * wall.gap}px)`
}

interface WallProps extends Pick<MediaPanelProps, "pictures" | "fresh" | "onPlace" | "onOpenAtSource" | "onShow"> {
  items: readonly ProjectMedia[]
  onRemove: (item: ProjectMedia) => void
}

/** The project's media as a wall of pictures, two across, each as tall as its own proportions make it. */
function Wall({ items, pictures, fresh, onPlace, onOpenAtSource, onRemove, onShow }: WallProps) {
  const { spots, height } = pack(items, pictures)

  return (
    <div className="@container">
      <ul
        aria-label="Media in this project"
        className="relative"
        // SAFETY: the custom property is a string, which CSS takes; React's type only lists standard ones.
        style={
          {
            "--tile": `calc((100cqw - ${(wall.across - 1) * wall.gap}px) / ${wall.across})`,
            height: down(height)
          } as CSSProperties
        }
      >
        {spots.map(({ item, column, tallness, above }) => (
          <li
            key={item.src}
            className="absolute"
            style={{
              left: `calc(${column} * (var(--tile) + ${wall.gap}px))`,
              top: down(above),
              width: "var(--tile)",
              height: down({ widths: tallness, gaps: 0 })
            }}
          >
            <Tile
              item={item}
              picture={pictures[item.src]}
              fresh={fresh.includes(item.src)}
              // The card opens past the wall's edge, so it never covers the tile beside this one.
              past={wall.across - 1 - column}
              onPlace={onPlace}
              onOpenAtSource={onOpenAtSource}
              onRemove={onRemove}
              onShow={onShow}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

interface TileProps extends Pick<MediaPanelProps, "onPlace" | "onOpenAtSource" | "onShow"> {
  item: ProjectMedia
  picture: Found | undefined
  fresh: boolean
  /** How many tiles lie between this one and the wall's edge. */
  past: number
  onRemove: (item: ProjectMedia) => void
}

/**
 * One of the project's media: its picture, and nothing else until it's pointed at, when its name shows over its foot.
 * A video says how long it runs and plays, without sound, while pointed at. Pressing it places it in the selected
 * design, and it drags onto the canvas, as a component does. Resting on it, or the right arrow, opens its card.
 */
function Tile({ item, picture, fresh, past, onPlace, onOpenAtSource, onRemove, onShow }: TileProps) {
  const card = useHoverCard()
  const [playing, setPlaying] = useState(false)
  const shown = item.kind === "missing" ? undefined : picture
  const clip = shown && clipOf(shown)
  const source = item.credit?.source
  const removeLabel = item.kind === "file" ? "Remove from project" : "Remove from designs"
  // Pressing it, to place or drag it, or right-clicking it puts the card away.
  const putAway = () => card.setOpen(false)

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      putAway()
      onRemove(item)
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      card.openWithKeyboard()
    }
  }

  const button = (
    <button
      type="button"
      aria-label={item.name}
      aria-expanded={card.open}
      aria-controls={card.open ? card.id : undefined}
      draggable={!!shown}
      onDragStart={(event) => {
        event.dataTransfer.setData(mediaMime, item.src)
        event.dataTransfer.effectAllowed = "copy"
        putAway()
      }}
      onClick={() => shown && onPlace(item)}
      onPointerEnter={() => {
        card.enter()
        setPlaying(true)
      }}
      onPointerLeave={() => {
        card.leave()
        setPlaying(false)
      }}
      onPointerDown={putAway}
      onContextMenu={putAway}
      onFocus={() => setPlaying(true)}
      onBlur={() => setPlaying(false)}
      onKeyDown={onKeyDown}
      className={`group relative flex size-full items-center overflow-hidden rounded-md bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-(--canvas-layer) focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-expanded:ring-2 aria-expanded:ring-(--canvas-layer) aria-expanded:ring-offset-2 aria-expanded:ring-offset-background ${
        shown ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        fresh
          ? "ring-2 ring-(--canvas-layer) ring-offset-2 ring-offset-background motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-300"
          : ""
      }`}
    >
      {shown ? <Preview found={shown} playing={playing} className="w-full" /> : <NoFile name={item.name} />}
      <span className="pointer-events-none absolute top-1 left-1 flex gap-1">
        {clip && (
          <span className="flex items-center gap-1 rounded-sm bg-black/70 px-1 py-0.5 text-2xs font-medium text-white tabular-nums">
            <Play aria-hidden className="size-2 fill-current" /> {clockOf(clip.seconds)}
          </span>
        )}
        {item.kind === "linked" && (
          <span className="grid size-4.5 place-items-center rounded-sm bg-black/70 text-white">
            <Link2 aria-hidden className="size-3" />
          </span>
        )}
      </span>
      {shown && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/75 to-transparent px-1.5 pt-5 pb-1 text-2xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-aria-expanded:opacity-100"
        >
          {item.name}
        </span>
      )}
    </button>
  )

  return (
    <ContextMenu>
      <Popover open={card.open} onOpenChange={card.setOpen}>
        {/* The tile opens its card by resting on it or by a key; a click places it instead. */}
        <PopoverTrigger
          render={<ContextMenuTrigger render={button} />}
          onClick={(event) => event.preventBaseUIHandler()}
        />
        <PopoverContent
          className="w-80 p-0"
          align="start"
          side="right"
          sideOffset={({ anchor }) => 20 + past * (anchor.width + wall.gap)}
          id={card.id}
          initialFocus={card.takesFocus}
          finalFocus={card.returnFocus}
          onPointerEnter={card.stay}
          onPointerLeave={card.leave}
        >
          <MediaCard
            item={item}
            picture={picture}
            onPlace={() => {
              putAway()
              onPlace(item)
            }}
            onOpenAtSource={() => onOpenAtSource(item)}
            onRemove={() => {
              putAway()
              onRemove(item)
            }}
            onShow={(use) => {
              putAway()
              onShow(use)
            }}
          />
        </PopoverContent>
      </Popover>
      <ContextMenuContent className="min-w-44">
        {shown && <ContextMenuItem onClick={() => onPlace(item)}>Insert</ContextMenuItem>}
        {source && (
          <ContextMenuItem onClick={() => onOpenAtSource(item)}>
            <ExternalLink /> Open in {source}
          </ContextMenuItem>
        )}
        {(shown ?? source) && <ContextMenuSeparator />}
        <ContextMenuItem variant="destructive" onClick={() => onRemove(item)}>
          <Trash2 /> {removeLabel}
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * A path layers name with no file there: its place on the wall, dashed, with the file's name, since there's no
 * picture. Its card has the whole path.
 */
function NoFile({ name }: { name: string }) {
  return (
    <span className="flex size-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-(--process-starting)/60 px-2 text-center">
      <ImageOff aria-hidden className="size-4 text-(--process-starting)" />
      <span className="line-clamp-2 font-mono text-2xs break-all text-muted-foreground">
        {name.slice(name.lastIndexOf("/") + 1)}
      </span>
    </span>
  )
}

/** The picture's box on a card: the card's width less its padding, and at most this tall. */
const stage = { width: 304, height: 228 }

interface MediaCardProps {
  item: ProjectMedia
  picture: Found | undefined
  onPlace: () => void
  onOpenAtSource: () => void
  onRemove: () => void
  onShow: (use: MediaUse) => void
}

/**
 * One of the project's media on its card, laid out as a component's is: the picture large, or a video in its player;
 * its name and where its file is; its size; who made it and where it's from; each layer and line of code that uses
 * it; and a bar with what to do with it.
 */
function MediaCard({ item, picture, onPlace, onOpenAtSource, onRemove, onShow }: MediaCardProps) {
  const shown = item.kind === "missing" ? undefined : picture
  const { Icon } = mediums.find(({ id }) => id === mediumOf(item, picture)) ?? mediums[0]!
  const source = picture && sourceOf(picture)
  const clip = shown && clipOf(shown)
  const size = shown && sizeOf(shown)
  const places = item.usedBy.length + item.usedInCode.length
  const used = places > 0

  const facts = [
    size && `${size.width} × ${size.height}`,
    item.bytes !== undefined && bytesOf(item.bytes),
    clip && clockOf(clip.seconds),
    !used && "Not used yet",
    // One used in more places than the card lists says how many.
    places > usesShown && `Used ${places} times`
  ].filter(Boolean)

  return (
    <div className="flex flex-col">
      <div className="p-2 pb-0">
        <CardStage item={item} picture={picture} />
      </div>
      <div className="flex flex-col gap-0.5 px-3 pt-2.5 pb-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className="size-3.5 shrink-0" style={{ color: kindColors.layer }} />
          <Name className="min-w-0 text-sm font-medium">{item.name}</Name>
        </div>
        {item.path && <span className="truncate font-mono text-2xs text-muted-foreground">{item.path}</span>}
        {item.kind === "linked" && (
          <span className="text-xs text-muted-foreground">
            Linked from {item.credit?.source ?? "its library"}, not saved in the project
          </span>
        )}
        {item.kind === "missing" && <span className="text-xs text-(--process-starting)">No file at this path</span>}
        {facts.length > 0 && (
          <span className="flex gap-3 text-xs text-muted-foreground tabular-nums">
            {facts.map((fact) => (
              <span key={String(fact)}>{fact}</span>
            ))}
          </span>
        )}
        {item.credit && (
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
            {source && <SourceMark info={source} className="size-3.5" />}
            <span className="truncate">
              {item.credit.name}
              {item.credit.source && <span className="text-muted-foreground"> on {item.credit.source}</span>}
            </span>
          </span>
        )}
      </div>
      {used && <Uses item={item} onShow={onShow} />}
      <div className="flex items-center gap-1 border-t px-2 py-1.5">
        {shown && (
          <Button size="sm" className="h-7 text-xs" onClick={onPlace}>
            <Plus /> Insert
          </Button>
        )}
        {item.credit?.source && (
          <IconButton label={`Open in ${item.credit.source}`} className="size-7" onClick={onOpenAtSource}>
            <ExternalLink />
          </IconButton>
        )}
        <span className="flex-1" />
        <IconButton
          label={item.kind === "file" ? "Remove from project" : "Remove from designs"}
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 />
        </IconButton>
      </div>
    </div>
  )
}

/** How many of the places that use one its card lists before the rest wait behind a button. */
const usesShown = 3

/** A design that uses one of the project's media, with each of its layers that does. */
interface DesignUse {
  design: string
  name: string
  layers: MediaUse[]
}

/**
 * The designs that use one, the one with the most layers first. A logo can be in a hundred layers, and they're in a
 * handful of designs, so the designs are what's listed.
 */
function designsUsing(item: ProjectMedia): DesignUse[] {
  const designs = new Map<string, DesignUse>()

  for (const use of item.usedBy) {
    const known = designs.get(use.design)

    if (known) {
      known.layers.push(use)
    } else {
      designs.set(use.design, { design: use.design, name: use.designName, layers: [use] })
    }
  }

  return [...designs.values()].toSorted((a, b) => b.layers.length - a.layers.length)
}

/** What a design's row says after its name: its one layer by name, or how many layers. */
function layersOf({ layers }: DesignUse): string {
  const [only] = layers

  return layers.length === 1 && only ? only.node : `${layers.length} layers`
}

/**
 * Where one is used, on its card: a row for each design, with how many of its layers use it and Show, then each line
 * of code. The first few show, and the rest wait behind a button that opens them in place, in a list that scrolls.
 */
function Uses({ item, onShow }: { item: ProjectMedia; onShow: (use: MediaUse) => void }) {
  const [all, setAll] = useState(false)

  const rows = [
    ...designsUsing(item).map((design) => (
      <li key={design.design} className="flex h-7 shrink-0 items-center gap-2">
        <DesignIcon kind="screen" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">
          {design.name} <span className="text-muted-foreground">{layersOf(design)}</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Show in ${design.name}`}
          className="h-6 px-1.5 text-xs"
          onClick={() => onShow(design.layers[0]!)}
        >
          Show
        </Button>
      </li>
    )),
    ...item.usedInCode.map((use) => (
      <li key={`${use.path} ${use.line}`} className="flex h-7 shrink-0 items-center gap-2">
        <Code className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-2xs">
          {use.path}, line {use.line}
        </span>
      </li>
    ))
  ]

  const listed = all ? rows : rows.slice(0, usesShown)
  const more = rows.length - listed.length

  return (
    <div className="border-t py-1.5 pr-1.5 pl-3 text-xs">
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

/** The card's picture: as wide as the card, or as tall as its box when it's taller than wide. A video plays. */
function CardStage({ item, picture }: { item: ProjectMedia; picture: Found | undefined }) {
  if (item.kind === "missing" || !picture) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md bg-muted">
        <ImageOff aria-hidden className="size-4 text-(--process-starting)" />
      </div>
    )
  }

  const clip = clipOf(picture)

  if (clip) {
    return <Player found={picture} seconds={clip.seconds} url={clip.url} />
  }

  const { width, height } = sizeOf(picture)
  const tall = height / width > stage.height / stage.width

  return (
    <div className="flex justify-center overflow-hidden rounded-md bg-muted ring-1 ring-border ring-inset">
      <Picture found={picture} className={tall ? "" : "w-full"} style={tall ? { height: stage.height } : undefined} />
    </div>
  )
}

/**
 * Removing one something still uses: where it's used, each design with Show, and what removing it would take. One
 * only designs use goes with its layers, in one step Undo takes back. One the project's code names stays until
 * the code changes, since Parity doesn't edit the person's code for them.
 */
function InUseDialog({
  item: image,
  onClose,
  onShow,
  onRemove
}: {
  item: ProjectMedia | undefined
  onClose: () => void
  onShow: (use: MediaUse) => void
  onRemove: (item: ProjectMedia) => void
}) {
  const layers = image?.usedBy.length ?? 0
  const inCode = (image?.usedInCode.length ?? 0) > 0

  const title = (shown: ProjectMedia) => {
    if (shown.kind === "linked") {
      return `${shown.name} is linked from ${shown.credit?.source ?? "its library"}`
    }

    return shown.kind === "missing" ? `${shown.name} has no file` : `${shown.name} is still in use`
  }

  const removing = layers === 1 ? "1 layer" : `${layers} layers`
  const action = image?.kind === "file" ? `Remove file and ${removing}` : `Remove ${removing}`

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      {image && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title(image)}</DialogTitle>
          </DialogHeader>
          <ul
            aria-label="Where it's used"
            className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-md border text-sm"
          >
            {designsUsing(image).map((design) => (
              <li key={design.design} className="flex shrink-0 items-center gap-2 py-1.5 pr-1.5 pl-3">
                <DesignIcon kind="screen" className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {design.name} <span className="text-muted-foreground">{layersOf(design)}</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Show in ${design.name}`}
                  onClick={() => onShow(design.layers[0]!)}
                >
                  Show
                </Button>
              </li>
            ))}
            {image.usedInCode.map((use) => (
              <li key={`${use.path} ${use.line}`} className="flex items-center gap-2 py-2 pr-3 pl-3">
                <Code className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {use.path}, line {use.line}
                </span>
              </li>
            ))}
          </ul>
          {inCode && <p className="text-sm text-muted-foreground">Remove or replace it in the code first.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {inCode ? "Close" : "Cancel"}
            </Button>
            {!inCode && layers > 0 && (
              <Button variant="destructive" onClick={() => onRemove(image)}>
                {action}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}

/** Nothing to show: nothing matches the search, which the stock library may have, or the project has none yet. */
function NoMedia({ query, stock, onFind }: { query: string; stock: ConnectorInfo; onFind: (query?: string) => void }) {
  if (query) {
    return (
      <div className="type-empty flex flex-col items-center gap-3 px-4 py-10 text-center text-muted-foreground">
        <p className="font-medium text-foreground">Nothing matches “{query}”</p>
        <Button variant="outline" size="sm" onClick={() => onFind(query)}>
          <SourceMark info={stock} /> Find it on {stock.name}
        </Button>
      </div>
    )
  }

  return (
    <div className="type-empty flex flex-col items-center gap-3 px-4 py-10 text-center text-muted-foreground">
      <ImagePlay className="size-6" />
      <p className="font-medium text-foreground">No media yet</p>
      <p>Drop images here or on the canvas.</p>
      <Button variant="outline" size="sm" onClick={() => onFind()}>
        <SourceMark info={stock} /> Find on {stock.name}
      </Button>
    </div>
  )
}
