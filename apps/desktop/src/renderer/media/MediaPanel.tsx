import { Button, Skeleton, ToggleGroup, ToggleGroupItem } from "@buildkitgg/shadcn-baseui-kit"
import {
  filterImages,
  imageAccept,
  type ImageMedium,
  imageKinds,
  layersSelection,
  mediumOf,
  type ProjectImage,
  removalOf
} from "@parity-app/editor"
import { FolderOpen, ImagePlay, Plus } from "lucide-react"
import { useRef, useState } from "react"
import { useProject } from "../canvas/context.ts"
import { addImageFiles } from "../canvas/drop-files.ts"
import { chipColors } from "../canvas/kinds.tsx"
import { SearchField } from "../chrome/AssetsPanel.tsx"
import { IconButton } from "../chrome/IconButton.tsx"
import { addAtSelection } from "../chrome/insert-from-panel.ts"
import { revealSelection } from "../chrome/reveal.ts"
import { containerKey } from "../design-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { useFileDrag } from "./file-drag.ts"
import type { MediaLayers } from "./MediaUses.tsx"
import { MediaWall } from "./MediaWall.tsx"
import { usePictureSizes } from "./picture-sizes.ts"
import { mediaFilesOf, useProjectMedia } from "./project-media.ts"
import { pictureUrl } from "./ProjectPicture.tsx"
import { removeMedia } from "./remove-media.ts"
import { RemoveMediaDialog } from "./RemoveMediaDialog.tsx"

/*
 * The Media tab (PAR-838): everything the project has to show, however it got there. Files dropped, pasted or chosen,
 * photos layers link to at a library's address, and paths layers name that have no file. It's a wall of the pictures
 * themselves, since a picture says what it is faster than its file name does. Resting on one opens its card: the
 * picture larger, what it is, who took it, where it's used, and what to do with it.
 */

const mediums: readonly { id: ImageMedium; many: string }[] = [
  { id: "image", many: "Images" },
  { id: "vector", many: "Vectors" }
]

export function MediaPanel() {
  const session = useProject()
  const { images, loading, fresh } = useProjectMedia(session)
  const sizes = usePictureSizes()
  const [query, setQuery] = useState("")
  const [chosen, setChosen] = useState<ImageMedium>()
  const [removing, setRemoving] = useState<ProjectImage>()
  const picker = useRef<HTMLInputElement>(null)
  const add = (files: File[]) => void addFiles(session, files)
  const drag = useFileDrag(add)

  const present = mediums.filter(({ id }) => images.some((image) => mediumOf(image) === id))
  // A type whose last one was removed stops narrowing.
  const only = present.length > 1 && present.some(({ id }) => id === chosen) ? chosen : undefined
  const matching = filterImages(images, { search: query }).filter((image) => !only || mediumOf(image) === only)

  /** Removes one nothing uses at once, since Undo brings it back; asks first about one something still uses. */
  const remove = (image: ProjectImage) => {
    if (removalOf(image) === "file") {
      void removeMedia(session, image)
    } else {
      // After the menu that asked has closed, so the click that chose Remove doesn't close the dialog as it opens.
      setTimeout(() => setRemoving(image))
    }
  }

  /** Selects every layer of a design that shows one, and brings them into view. */
  const show = ({ document, design, nodes }: MediaLayers) => {
    session.selection.set(layersSelection(containerKey(document, design), nodes))
    revealSelection(session)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...drag.handlers}>
      <div className="flex items-center gap-1 pr-2">
        <div className="flex-1">
          <SearchField value={query} onChange={setQuery} placeholder="Search media" />
        </div>
        <IconButton label="Add images" className="mt-2" onClick={() => picker.current?.click()}>
          <Plus />
        </IconButton>
        <input
          ref={picker}
          type="file"
          multiple
          accept={imageAccept}
          hidden
          aria-label="Images to add"
          onChange={(event) => {
            add([...(event.currentTarget.files ?? [])])
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
        {loading && <WallLoading />}
        {!loading && matching.length > 0 && (
          <MediaWall
            images={matching}
            urlOf={(src) => pictureUrl(session, src)}
            sizes={sizes}
            fresh={fresh}
            onInsert={(item) => addAtSelection(session, item)}
            onRemove={remove}
            onShow={show}
          />
        )}
        {!loading && matching.length === 0 && <NoMedia query={query.trim()} onChoose={() => picker.current?.click()} />}
      </div>
      {drag.over && <DropTarget images={drag.images} />}
      <RemoveMediaDialog
        image={removing}
        onClose={() => setRemoving(undefined)}
        onShow={(layer) => {
          setRemoving(undefined)
          show(layer)
        }}
        onRemove={(image) => {
          setRemoving(undefined)
          void removeMedia(session, image)
        }}
      />
    </div>
  )
}

/** Adds image files to the project, then lists them, marked for a moment as they arrive on the wall. */
async function addFiles(session: ProjectSession, files: readonly File[]): Promise<void> {
  const saved = await addImageFiles(session, files)

  if (saved.length === 0) {
    return
  }

  const media = mediaFilesOf(session)
  await media.scan()
  media.markFresh(saved.flatMap(({ node }) => (node.type === "image" ? [node.src] : [])))
}

/** What the tab shows while files are over it: its edge in the selection's color, and what a drop adds. */
function DropTarget({ images }: { images: number }) {
  const label =
    images === 0
      ? `Only ${imageKinds} images can be added`
      : `Add ${images === 1 ? "the image" : `${images} images`} to the project`

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

/** Before the project's files are listed: the wall's shape, in two columns of different heights. */
function WallLoading() {
  return (
    <output aria-label="Loading media" className="grid grid-cols-2 gap-2">
      {[0.75, 1, 0.6, 0.75, 1.2, 0.6].map((tallness, index) => (
        <Skeleton key={index} className="w-full rounded-md" style={{ aspectRatio: `1 / ${tallness}` }} />
      ))}
    </output>
  )
}

/** Nothing to show: nothing matches the search, or the project has no media yet. */
function NoMedia({ query, onChoose }: { query: string; onChoose: () => void }) {
  if (query) {
    return <p className="type-empty px-4 py-10 text-center font-medium text-foreground">Nothing matches “{query}”</p>
  }

  return (
    <div className="type-empty flex flex-col items-center gap-3 px-4 py-10 text-center text-muted-foreground">
      <ImagePlay className="size-6" />
      <p className="font-medium text-foreground">No media yet</p>
      <p>Drop images here or on the canvas.</p>
      <Button variant="outline" size="sm" onClick={onChoose}>
        <FolderOpen /> Choose files
      </Button>
    </div>
  )
}
