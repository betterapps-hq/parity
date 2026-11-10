/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- an image's tile takes focus so Delete removes it, as a layer does; its menu has the same actions for the pointer and screen readers */
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
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import type { Found } from "@parity-app/connectors"
import { mayBeImage } from "@parity-app/editor"
import { Code, ExternalLink, ImageIcon, ImageOff, MoreHorizontal, Search, Trash2 } from "lucide-react"
import { type DragEvent, type KeyboardEvent, type ReactNode, useRef, useState } from "react"
import { chipColors, DesignIcon } from "../../canvas/kinds.tsx"
import { SearchField } from "../../chrome/AssetsPanel.tsx"
import { Picture } from "./library.tsx"

/*
 * The Images tab as the project's own images: every file in its images folder, however it got there, and the photos
 * layers link to, to find again, use again and remove. Searching here looks through what the project has; Find photos
 * opens the browser on Unsplash for more. Image files dragged onto the tab are added to the project (PAR-835), and an
 * image's menu removes it, asking first when something still uses it (PAR-836).
 */

/**
 * One of the project's images, in the shape `projectImages` in `@parity-app/editor` gives the window and agents
 * (PAR-834): a file in `public/images/`, a photo linked at its library's address, or a path layers name with no file.
 */
export interface ProjectImage {
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

/** A layer or a line of code that uses an image, as the remove dialog lists them. */
export type ImageUse = ProjectImage["usedBy"][number]

interface ImagesPanelProps {
  images: readonly ProjectImage[]
  /** What each image looks like, by its `src`: a sample drawn in its place, or the file itself. */
  pictures: Readonly<Record<string, Found>>
  /** Images just added, by `src`, which arrive with a short entrance and stay marked for a moment. */
  fresh: readonly string[]
  /** Opens the photo browser, on a search when the project's own images had nothing for it. */
  onFind: (query?: string) => void
  onOpenAtSource: (image: ProjectImage) => void
  /** Files dropped on the tab, to add to the project. */
  onAdd: (files: File[]) => void
  /** Removes an image, with the layers that show it when there are any. */
  onRemove: (image: ProjectImage) => void
  /** Selects a layer that shows an image, on the canvas. */
  onShow: (use: ImageUse) => void
}

export function ProjectImagesPanel({
  images,
  pictures,
  fresh,
  onFind,
  onOpenAtSource,
  onAdd,
  onRemove,
  onShow
}: ImagesPanelProps) {
  const [query, setQuery] = useState("")
  const [asking, setAsking] = useState<ProjectImage>()
  const drag = useFileDrag(onAdd)
  const words = query.trim().toLowerCase()

  const matching = images.filter((image) =>
    [image.name, image.alt, image.credit?.name].some((text) => text?.toLowerCase().includes(words))
  )

  /** Removes an image nothing uses at once, since Undo brings it back; asks first about one something still uses. */
  const remove = (image: ProjectImage) => {
    if (image.kind === "file" && image.usedBy.length === 0 && image.usedInCode.length === 0) {
      onRemove(image)
    } else {
      // After the menu that asked has closed, so the click that chose Remove doesn't close the dialog as it opens.
      setTimeout(() => setAsking(image))
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...drag.handlers}>
      <SearchField value={query} onChange={setQuery} placeholder="Search images" />
      <div className="px-2 pt-2">
        <Button variant="outline" size="sm" className="w-full" onClick={() => onFind()}>
          <Search /> Find photos
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {matching.length > 0 ? (
          <ul aria-label="Images in this project" className="grid grid-cols-2 gap-x-2 gap-y-3">
            {matching.map((image) => (
              <li key={image.src}>
                <ImageTile
                  image={image}
                  picture={pictures[image.src]}
                  fresh={fresh.includes(image.src)}
                  onOpenAtSource={onOpenAtSource}
                  onRemove={remove}
                />
              </li>
            ))}
          </ul>
        ) : (
          <NoImages query={query.trim()} onFind={onFind} />
        )}
      </div>
      {drag.over && <DropTarget count={drag.count} />}
      <InUseDialog
        image={asking}
        onClose={() => setAsking(undefined)}
        onShow={(use) => {
          setAsking(undefined)
          onShow(use)
        }}
        onRemove={(image) => {
          setAsking(undefined)
          onRemove(image)
        }}
      />
    </div>
  )
}

/**
 * Files dragged over an element: whether they're over it, and how many may be images, which is all a drag says until
 * the drop. Entering and leaving its children fires on the way, so it counts them rather than trusting `dragleave`.
 */
export function useFileDrag(onDrop: (files: File[]) => void) {
  const [count, setCount] = useState<number>()
  const depth = useRef(0)

  const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files")

  const end = () => {
    depth.current = 0
    setCount(undefined)
  }

  const handlers = {
    onDragEnter: (event: DragEvent) => {
      if (!carriesFiles(event)) {
        return
      }

      event.preventDefault()
      depth.current += 1
      const items = [...event.dataTransfer.items].filter((item) => item.kind === "file")
      setCount(items.filter((item) => mayBeImage(item.type)).length)
    },
    onDragOver: (event: DragEvent) => {
      if (carriesFiles(event)) {
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
      }
    },
    onDragLeave: (event: DragEvent) => {
      if (!carriesFiles(event)) {
        return
      }

      depth.current = Math.max(0, depth.current - 1)

      if (depth.current === 0) {
        end()
      }
    },
    onDrop: (event: DragEvent) => {
      if (!carriesFiles(event)) {
        return
      }

      event.preventDefault()
      end()
      onDrop([...event.dataTransfer.files])
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

/** Where an image is used, in a few words: its photographer for a photo, else the designs, or that nothing uses it. */
function usedWhere(image: ProjectImage): string {
  if (image.kind === "missing") {
    return "No file"
  }

  // A linked photo is already named by its photographer.
  if (image.kind === "linked") {
    return `Linked from ${image.credit?.source ?? "its library"}`
  }

  if (image.credit) {
    return `Photo by ${image.credit.name}`
  }

  const designs = [...new Set(image.usedBy.map((use) => use.designName))]

  if (designs.length === 1) {
    return `In ${designs[0]}`
  }

  if (designs.length > 1) {
    return `In ${designs.length} designs`
  }

  return image.usedInCode.length > 0 ? "In code" : "Not used"
}

function ImageTile({
  image,
  picture,
  fresh,
  onOpenAtSource,
  onRemove
}: {
  image: ProjectImage
  picture: Found | undefined
  fresh: boolean
  onOpenAtSource: (image: ProjectImage) => void
  onRemove: (image: ProjectImage) => void
}) {
  const removeLabel = image.kind === "file" ? "Remove from project" : "Remove from designs"

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      onRemove(image)
    }
  }

  const menuItems = (Item: typeof DropdownMenuItem | typeof ContextMenuItem, Separator: () => ReactNode) => (
    <>
      {image.credit && (
        <Item onClick={() => onOpenAtSource(image)}>
          <ExternalLink /> Open in {image.credit.source ?? "its library"}
        </Item>
      )}
      {image.credit && <Separator />}
      <Item variant="destructive" onClick={() => onRemove(image)}>
        <Trash2 /> {removeLabel}
        {Item === ContextMenuItem && <ContextMenuShortcut>Del</ContextMenuShortcut>}
      </Item>
    </>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            tabIndex={0}
            role="group"
            aria-label={image.name}
            onKeyDown={onKeyDown}
            className={`group relative flex min-w-0 flex-col gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-(--canvas-layer) focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              fresh
                ? "ring-2 ring-(--canvas-layer) ring-offset-2 ring-offset-background motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-300"
                : ""
            }`}
          />
        }
      >
        <TilePicture image={image} picture={picture} />
        <div className="absolute top-1 right-1 rounded-md bg-background/95 opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-popup-open]]:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`More for ${image.name}`}>
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-44">
              {menuItems(DropdownMenuItem, () => (
                <DropdownMenuSeparator />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <span className="truncate text-xs">{image.name}</span>
        <span className="truncate text-xs text-muted-foreground">{usedWhere(image)}</span>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        {menuItems(ContextMenuItem, () => (
          <ContextMenuSeparator />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function TilePicture({ image, picture }: { image: ProjectImage; picture: Found | undefined }) {
  if (image.kind === "missing" || !picture) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed bg-muted/40 text-muted-foreground"
        style={{ aspectRatio: "4 / 3" }}
      >
        <ImageOff className="size-5" aria-hidden />
      </div>
    )
  }

  return <Picture found={picture} className="rounded-md border" style={{ aspectRatio: "4 / 3" }} />
}

/**
 * Removing an image something still uses: where it's used, each layer with Show, and what removing it would take. An
 * image only designs use goes with its layers, in one step Undo takes back. One the project's code names stays until
 * the code changes, since Parity doesn't edit the person's code for them.
 */
function InUseDialog({
  image,
  onClose,
  onShow,
  onRemove
}: {
  image: ProjectImage | undefined
  onClose: () => void
  onShow: (use: ImageUse) => void
  onRemove: (image: ProjectImage) => void
}) {
  const layers = image?.usedBy.length ?? 0
  const inCode = (image?.usedInCode.length ?? 0) > 0

  const title = (shown: ProjectImage) => {
    if (shown.kind === "linked") {
      return `${shown.name} is linked from ${shown.credit?.source ?? "its library"}`
    }

    return shown.kind === "missing" ? `${shown.name} has no file` : `${shown.name} is still in use`
  }

  const removing = layers === 1 ? "1 layer" : `${layers} layers`
  const action = image?.kind === "file" ? `Remove image and ${removing}` : `Remove ${removing}`

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      {image && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title(image)}</DialogTitle>
          </DialogHeader>
          <ul aria-label="Where it's used" className="flex flex-col divide-y rounded-md border text-sm">
            {image.usedBy.map((use) => (
              <li key={`${use.design} ${use.node}`} className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
                <DesignIcon kind="screen" className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {use.designName} <span className="text-muted-foreground">{use.node}</span>
                </span>
                <Button variant="outline" size="sm" onClick={() => onShow(use)}>
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

function NoImages({ query, onFind }: { query: string; onFind: (query?: string) => void }) {
  if (query) {
    return (
      <div className="type-empty flex flex-col items-center gap-3 px-4 py-10 text-center text-muted-foreground">
        <p className="font-medium text-foreground">No images match “{query}”</p>
        <Button variant="outline" size="sm" onClick={() => onFind(query)}>
          Find “{query}” on Unsplash
        </Button>
      </div>
    )
  }

  return (
    <div className="type-empty flex flex-col items-center gap-3 px-4 py-10 text-center text-muted-foreground">
      <ImageIcon className="size-6" />
      <p className="font-medium text-foreground">No images yet</p>
      <p>Drop images here or on the canvas, or find a photo.</p>
    </div>
  )
}
