import { InputGroup, InputGroupAddon, InputGroupInput } from "@buildkitgg/shadcn-baseui-kit"
import { Check, ImagePlus, Search } from "lucide-react"
import {
  createContext,
  type DragEvent,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { AppSelect } from "../../chrome/AppSelect.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { GroupLabel } from "../../chrome/PanelSection.tsx"
import { PercentField } from "./field-parts.tsx"
import { Field, FieldGrid } from "./field-row.tsx"
import {
  addProjectImage,
  type ImageFit,
  type ImagePaint,
  imageName,
  imagePreview,
  projectImages,
  type StockPhoto,
  stockPhotos,
  stockSrc,
  watchProjectImages
} from "./lists-data.ts"
import { PositionInBox } from "./position-box.tsx"

/*
 * An image fill's editor (design-options-values.md, Paint stack), without tabs: one search over the project's images and
 * Unsplash's, each a section of the same grid, with Upload first among the project's; an image dropped or pasted
 * anywhere on it is added to the project and used, and an Unsplash photo is linked from there. Then how it's drawn: its
 * fit, Crop's scale, and where it sits.
 */

const fits: readonly ImageFit[] = ["fill", "fit", "crop", "tile"]
const fitNames: Record<ImageFit, string> = { fill: "Fill", fit: "Fit", crop: "Crop", tile: "Tile" }

/** What each fit does, under its name in the menu. */
const fitDetails: Record<ImageFit, string> = {
  fill: "Covers the box, cropped",
  fit: "The whole image, inside the box",
  crop: "At a scale of its own",
  tile: "Repeats at its own size"
}

/** What each fit writes, in its name's hint. */
const fitHints: Record<ImageFit, string> = {
  fill: "background-size: cover",
  fit: "background-size: contain",
  crop: "background-size as a percentage",
  tile: "background-repeat: repeat"
}

const isImage = (file: File) => file.type.startsWith("image/")

/**
 * Adds an image file to the project, and gives the path a fill uses for it. Its picture is drawn from the file itself,
 * which stands in here for copying it into `public/images/`.
 */
export const addImageFile = (file: File): string => addProjectImage(file.name, URL.createObjectURL(file))

/** One of the project's images, by the `src` a fill names it with, with its name and a picture of it to draw. */
export interface SourceImage {
  src: string
  name: string
  preview: string
}

/**
 * Where a fill's images come from: the project's own, a stock library's, and how one is added. The stories use the
 * stand-ins in lists-data.ts; the Design tab gives the project's (PAR-931).
 */
export interface ImageSource {
  images: readonly SourceImage[]
  /** Stock photos to link, none where no library is offered here. */
  stock: readonly StockPhoto[]
  /** Saves a file into the project, and gives the `src` a fill uses for it. */
  add: (file: File) => Promise<string>
  /** A picture of the image a fill names, to draw it with. */
  preview: (src: string) => string | undefined
  /** How a fill's row names its image. */
  name: (src: string) => string
}

const ImageSourceContext = createContext<ImageSource | undefined>(undefined)

/** Gives the image fills inside their images. */
export const ImageSourceProvider = ImageSourceContext

/** Where the image fills here take their images from: what's given, or the stand-ins. */
export function useImageSource(): ImageSource {
  const given = useContext(ImageSourceContext)
  const images = useSyncExternalStore(watchProjectImages, projectImages)

  const standIns = useMemo<ImageSource>(
    () => ({
      images: images.map((image) => ({ src: `/images/${image.name}`, name: image.name, preview: image.preview })),
      stock: stockPhotos,
      add: (file) => Promise.resolve(addImageFile(file)),
      preview: imagePreview,
      name: imageName
    }),
    [images]
  )

  return given ?? standIns
}

/**
 * Where an image can be dropped: whether one's over it now, and the handlers for its element. A drop it takes goes no
 * further, so an editor drawn over the panel doesn't drop into the section under it as well.
 */
export function useImageDrop(onImage: (file: File) => void) {
  const [over, setOver] = useState(false)
  // Entering a child leaves its parent first, so it's over until it's left as often as it was entered.
  const depth = useRef(0)

  const carriesImage = (event: DragEvent) =>
    [...event.dataTransfer.items].some((item) => item.kind === "file" && item.type.startsWith("image/"))

  return {
    over,
    handlers: {
      onDragEnter: (event: DragEvent) => {
        if (carriesImage(event)) {
          event.preventDefault()
          event.stopPropagation()
          depth.current += 1
          setOver(true)
        }
      },
      onDragOver: (event: DragEvent) => {
        if (carriesImage(event)) {
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = "copy"
        }
      },
      onDragLeave: (event: DragEvent) => {
        if (depth.current > 0) {
          event.stopPropagation()
          depth.current -= 1
          setOver(depth.current > 0)
        }
      },
      onDrop: (event: DragEvent) => {
        const file = [...event.dataTransfer.files].find(isImage)
        depth.current = 0
        setOver(false)

        if (file) {
          event.preventDefault()
          event.stopPropagation()
          onImage(file)
        }
      }
    }
  }
}

/** What a place shows while an image is over it: a dashed edge round it and what dropping does. */
export function DropCover({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute z-10 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed bg-popover/90 text-xs font-medium ${className}`}
      style={{ borderColor: kindColors.layer }}
    >
      <ImagePlus className="size-5" style={{ color: kindColors.layer }} />
      {label}
    </div>
  )
}

/** One image to pick: its picture, named in its hint, ringed and ticked in the layer's color when it's the fill's. */
function ImageTile({
  name,
  preview,
  hint,
  chosen,
  onPick
}: {
  name: string
  preview: string
  hint: string
  chosen: boolean
  onPick: () => void
}) {
  return (
    <Hint label={name} detail={hint}>
      <button
        type="button"
        aria-label={name}
        aria-pressed={chosen}
        onClick={onPick}
        className="relative aspect-[16/10] rounded-md bg-cover bg-center outline-none inset-ring inset-ring-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          backgroundImage: `url("${preview}")`,
          boxShadow: chosen ? `0 0 0 2px ${kindColors.layer}` : undefined
        }}
      >
        {chosen && (
          <span
            className="absolute top-1 right-1 grid size-4 place-items-center rounded-full text-white"
            style={{ background: kindColors.layer }}
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </button>
    </Hint>
  )
}

/** A section of the results: its title, then its images three to a row. */
function Results({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <GroupLabel className="px-0.5">{title}</GroupLabel>
      <div className="grid grid-cols-3 gap-1.5">{children}</div>
    </section>
  )
}

/** How many of Unsplash's are shown before anything's searched for. */
const firstResults = 6

export function ImageEditor({ paint, onChange }: { paint: ImagePaint; onChange: (paint: ImagePaint) => void }) {
  const source = useImageSource()
  const [query, setQuery] = useState("")
  const [said, setSaid] = useState("")
  const browse = useRef<HTMLInputElement>(null)
  const [x, y] = paint.position
  const choose = (src: string) => onChange({ ...paint, src })

  const add = (file: File) => {
    void source.add(file).then((src) => {
      choose(src)
      setSaid(`Added ${src.replace("/images/", "")} to the project`)
    })
  }

  const drop = useImageDrop(add)
  const words = query.trim().toLowerCase()
  const inProject = source.images.filter((image) => image.name.toLowerCase().includes(words))

  const stock =
    words === ""
      ? source.stock.slice(0, firstResults)
      : source.stock.filter((photo) => [photo.title, ...photo.tags].some((word) => word.toLowerCase().includes(words)))

  return (
    <div
      className="relative flex flex-col gap-2"
      {...drop.handlers}
      onPaste={(event) => {
        // Text pasted into the search stays there; only an image is added.
        const file = [...event.clipboardData.files].find(isImage)

        if (file) {
          event.preventDefault()
          add(file)
        }
      }}
    >
      <InputGroup className="h-7">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search images"
          aria-label="Search images"
          className="text-xs"
        />
      </InputGroup>
      <div className="-mx-2 flex max-h-64 flex-col gap-3 overflow-y-auto px-2 pt-0.5 pb-1">
        {(words === "" || inProject.length > 0) && (
          <Results title="In this project">
            {words === "" && (
              <Hint label="Upload an image" detail="Or drop one anywhere here, or paste it">
                <button
                  type="button"
                  aria-label="Upload an image"
                  onClick={() => browse.current?.click()}
                  className="flex aspect-[16/10] flex-col items-center justify-center gap-0.5 rounded-md border border-dashed text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ImagePlus className="size-4" />
                  Upload
                </button>
              </Hint>
            )}
            {inProject.map((image) => (
              <ImageTile
                key={image.src}
                name={image.name}
                preview={image.preview}
                hint="In public/images/"
                chosen={paint.src === image.src}
                onPick={() => choose(image.src)}
              />
            ))}
          </Results>
        )}
        {stock.length > 0 && (
          <Results title="Unsplash">
            {/* Picked, a photo is linked from Unsplash where it is, as its terms ask: ticked here, not copied in. */}
            {stock.map((photo) => (
              <ImageTile
                key={photo.id}
                name={photo.title}
                preview={photo.preview}
                hint="Linked from Unsplash, with its photographer credited"
                chosen={paint.src === stockSrc(photo)}
                onPick={() => choose(stockSrc(photo))}
              />
            ))}
          </Results>
        )}
        {words !== "" && inProject.length === 0 && stock.length === 0 && (
          <p className="px-0.5 py-3 text-center text-xs text-muted-foreground">No images match “{query.trim()}”</p>
        )}
      </div>
      <input
        ref={browse}
        type="file"
        accept="image/*"
        hidden
        aria-label="Choose an image file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""

          if (file) {
            add(file)
          }
        }}
      />
      <div className="-mx-2 border-t" />
      <FieldGrid>
        <Field label="Fit" hint={fitHints[paint.fit]} half>
          <AppSelect
            variant="panel"
            aria-label="Fit"
            className="w-full px-2"
            items={fits.map((fit) => ({ value: fit, label: fitNames[fit], detail: fitDetails[fit] }))}
            value={paint.fit}
            onValueChange={(next) => {
              const picked = fits.find((fit) => fit === next)

              if (picked) {
                onChange({ ...paint, fit: picked })
              }
            }}
            // Wider than its half-row trigger, so what each fit does reads whole, and lined up with its left edge.
            popupClassName="w-56"
            align="start"
            alignItemWithTrigger={false}
          />
        </Field>
        {paint.fit === "crop" && (
          <Field label="Scale" half>
            <PercentField
              label="Scale"
              min={1}
              max={1000}
              placeholder="150"
              value={paint.scale}
              onChange={(scale) => onChange({ ...paint, scale })}
            />
          </Field>
        )}
        <Field label="Position">
          <PositionInBox
            label="Image position"
            value={{ x, y }}
            // Unset is the center, where an image sits unless it's placed.
            onChange={(position) => onChange({ ...paint, position: position ? [position.x, position.y] : [50, 50] })}
          />
        </Field>
      </FieldGrid>
      {drop.over && <DropCover label="Drop to add it to the project" className="-inset-2" />}
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  )
}
