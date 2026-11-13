import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import {
  imageItem,
  type InsertItem,
  mediumOf,
  packWall,
  type PictureSize,
  type ProjectImage,
  type Stretch,
  tallnessOf
} from "@parity-app/editor"
import { VideoLength, VideoPreview } from "@parity-app/media-player"
import { Link2, Trash2 } from "lucide-react"
import { type CSSProperties, type KeyboardEvent, useState } from "react"
import { useHoverCard } from "../chrome/hover-card.ts"
import { dragItem } from "../chrome/insert-from-panel.ts"
import { shortcutOf } from "../chrome/keymap.ts"
import { MediaCard, removeLabel } from "./MediaCard.tsx"
import type { MediaLayers } from "./MediaUses.tsx"
import { PictureMissing, ProjectPicture, ProjectVideo, transparencyGrid } from "./ProjectPicture.tsx"

/** How many sit across the wall, the space between them, and a tile's width in a panel at its usual width. */
const wallLayout = { across: 2, gap: 8, usual: 116 }

/** A length down the wall in CSS, from a tile's width, which the wall's own width sets. */
function down({ widths, gaps }: Stretch): string {
  return `calc(${widths} * var(--tile) + ${gaps * wallLayout.gap}px)`
}

interface MediaActions {
  onInsert: (item: InsertItem) => void
  onRemove: (image: ProjectImage) => void
  onShow: (layers: MediaLayers) => void
}

interface WallProps extends MediaActions {
  images: readonly ProjectImage[]
  /** Where each picture is, by its `src`. */
  urlOf: (src: string) => string
  /** The pictures' sizes, by address, as they've loaded. */
  sizes: ReadonlyMap<string, PictureSize>
  /** The ones just added, by `src`. */
  fresh: readonly string[]
}

/**
 * The project's media as a wall of pictures, two across, each as tall as its own proportions make it (`packWall` in
 * `@parity-app/editor`). A picture takes a photo's proportions until it has loaded and its size is known.
 */
export function MediaWall({ images, urlOf, sizes, fresh, ...actions }: WallProps) {
  const sizeOf = (image: ProjectImage) => (image.kind === "missing" ? undefined : sizes.get(urlOf(image.src)))
  const { spots, height } = packWall(images, (image) => tallnessOf(sizeOf(image)), wallLayout)

  return (
    <div className="@container">
      <ul
        aria-label="Media in this project"
        className="relative"
        // SAFETY: the custom property is a string, which CSS takes; React's type only lists standard ones.
        style={
          {
            "--tile": `calc((100cqw - ${(wallLayout.across - 1) * wallLayout.gap}px) / ${wallLayout.across})`,
            height: down(height)
          } as CSSProperties
        }
      >
        {spots.map(({ item: image, column, tallness, above }) => (
          <li
            key={image.src}
            className="absolute"
            style={{
              left: `calc(${column} * (var(--tile) + ${wallLayout.gap}px))`,
              top: down(above),
              width: "var(--tile)",
              height: down({ widths: tallness, gaps: 0 })
            }}
          >
            <Tile
              image={image}
              url={urlOf(image.src)}
              size={sizeOf(image)}
              fresh={fresh.includes(image.src)}
              past={wallLayout.across - 1 - column}
              {...actions}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

interface TileProps extends MediaActions {
  image: ProjectImage
  url: string
  size: PictureSize | undefined
  fresh: boolean
  /** How many tiles lie between this one and the wall's edge, which its card opens past. */
  past: number
}

/**
 * One of the project's media: its picture, with its name over its foot while it's pointed at. A video says how long it
 * runs in its corner, and plays without sound while it's pointed at, counting down what's left. Pressing it inserts it
 * at the selection, and it drags onto the canvas, as a component does. Resting on it, or the right arrow, opens its
 * card. A path with no file has no picture to insert until there's a file there.
 */
function Tile({ image, url, size, fresh, past, onInsert, onRemove, onShow }: TileProps) {
  const card = useHoverCard()
  const video = image.kind !== "missing" && mediumOf(image) === "video"
  const [pointed, setPointed] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const point = (on: boolean) => {
    setPointed(on)
    setElapsed(0)
  }

  // Pressing it, to insert or drag it, or right-clicking it puts the card away.
  const putAway = () => card.setOpen(false)
  const item = size && imageItem(image, size)
  const drag = item && dragItem(item)
  const insert = item && (() => onInsert(item))

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      putAway()
      onRemove(image)
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      card.openWithKeyboard()
    }
  }

  const button = (
    <button
      type="button"
      aria-label={image.name}
      aria-expanded={card.open}
      aria-controls={card.open ? card.id : undefined}
      draggable={!!drag}
      onDragStart={(event) => {
        putAway()
        drag?.onDragStart(event)
      }}
      onDragEnd={drag?.onDragEnd}
      onClick={insert}
      onPointerEnter={() => {
        point(true)
        card.enter()
      }}
      onPointerLeave={() => {
        point(false)
        card.leave()
      }}
      onPointerDown={putAway}
      onContextMenu={putAway}
      onKeyDown={onKeyDown}
      className={`group relative flex size-full items-center overflow-hidden rounded-md bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-(--canvas-layer) focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-expanded:ring-2 aria-expanded:ring-(--canvas-layer) aria-expanded:ring-offset-2 aria-expanded:ring-offset-background ${
        drag ? "cursor-grab active:cursor-grabbing" : ""
      } ${image.kind === "missing" ? "border border-dashed border-(--process-starting)/60" : ""} ${
        fresh
          ? "ring-2 ring-(--canvas-layer) ring-offset-2 ring-offset-background motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-300"
          : ""
      }`}
    >
      {image.kind === "missing" && <PictureMissing label={image.src.slice(image.src.lastIndexOf("/") + 1)} />}
      {image.kind !== "missing" &&
        (video ? (
          <ProjectVideo url={url} className="size-full" />
        ) : (
          // Where a picture is see-through, the grid shows through it, and only there.
          <ProjectPicture url={url} className="size-full" style={transparencyGrid} />
        ))}
      {video && pointed && (
        <VideoPreview src={url} onTime={setElapsed} className="absolute inset-0 size-full object-cover" />
      )}
      {image.kind === "linked" && (
        <span className="pointer-events-none absolute top-1 left-1 grid size-4.5 place-items-center rounded-sm bg-black/70 text-white">
          <Link2 aria-hidden className="size-3" />
        </span>
      )}
      {image.kind !== "missing" && (
        <span
          aria-hidden
          // A video's name stops short of its length, in the corner beside it.
          className={`pointer-events-none absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/75 to-transparent pt-5 pb-1 pl-1.5 text-2xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-aria-expanded:opacity-100 ${
            video ? "pr-16" : "pr-1.5"
          }`}
        >
          {image.name}
        </span>
      )}
      {video && size?.seconds !== undefined && <VideoLength seconds={size.seconds} elapsed={elapsed} />}
    </button>
  )

  return (
    <ContextMenu>
      <Popover open={card.open} onOpenChange={card.setOpen}>
        {/* The tile opens its card by resting on it or by a key; a click inserts it instead. */}
        <PopoverTrigger
          render={<ContextMenuTrigger render={button} />}
          onClick={(event) => event.preventBaseUIHandler()}
        />
        <PopoverContent
          className="w-80 p-0"
          align="start"
          side="right"
          sideOffset={({ anchor }) => 20 + past * (anchor.width + wallLayout.gap)}
          id={card.id}
          initialFocus={card.takesFocus}
          finalFocus={card.returnFocus}
          onPointerEnter={card.stay}
          onPointerLeave={card.leave}
          // Focus inside, as in every place's search, keeps it open with the pointer away.
          onFocusCapture={card.hold}
        >
          <MediaCard
            image={image}
            url={url}
            size={size}
            onInsert={
              insert &&
              (() => {
                putAway()
                insert()
              })
            }
            onRemove={() => {
              putAway()
              onRemove(image)
            }}
            onShow={(layer) => {
              putAway()
              onShow(layer)
            }}
          />
        </PopoverContent>
      </Popover>
      <ContextMenuContent className="min-w-44">
        {insert && (
          <>
            <ContextMenuItem onClick={insert}>Insert</ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem variant="destructive" onClick={() => onRemove(image)}>
          <Trash2 /> {removeLabel(image)}
          <ContextMenuShortcut>{shortcutOf("remove")}</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
