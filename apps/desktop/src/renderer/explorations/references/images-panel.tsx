import { Button } from "@buildkitgg/shadcn-baseui-kit"
import type { Found } from "@parity-app/connectors"
import { ExternalLink, ImageIcon, Search } from "lucide-react"
import { useState } from "react"
import { SearchField } from "../../chrome/AssetsPanel.tsx"
import { IconButton } from "../../chrome/IconButton.tsx"
import { creditOf, Picture } from "./library.tsx"

/*
 * The Images tab as the project's own images: every file in its images folder, however it got there, to find again and
 * use again. Searching here looks through what the project has; Find photos opens the browser on Unsplash for more.
 * A photo from Unsplash keeps its photographer's name with it.
 */

/** An image in the project's images folder. */
export interface ProjectImage {
  /** Its file's name. */
  name: string
  /** How it got into the project. */
  from: "unsplash" | "pasted" | "dropped"
  /** Its picture, and for a photo from Unsplash, who took it and where it lives there. */
  picture: Found
}

const origins: Record<Exclude<ProjectImage["from"], "unsplash">, string> = { pasted: "Pasted", dropped: "Dropped in" }

interface ImagesPanelProps {
  images: readonly ProjectImage[]
  /** Opens the photo browser, on a search when the project's own images had nothing for it. */
  onFind: (query?: string) => void
  onOpenAtSource: (found: Found) => void
}

export function ProjectImagesPanel({ images, onFind, onOpenAtSource }: ImagesPanelProps) {
  const [query, setQuery] = useState("")
  const words = query.trim().toLowerCase()

  const matching = images.filter(
    ({ name, picture }) => name.toLowerCase().includes(words) || picture.title.toLowerCase().includes(words)
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
              <li key={image.name}>
                <ImageTile image={image} onOpenAtSource={onOpenAtSource} />
              </li>
            ))}
          </ul>
        ) : (
          <NoImages query={query.trim()} onFind={onFind} />
        )}
      </div>
    </div>
  )
}

function ImageTile({ image, onOpenAtSource }: { image: ProjectImage; onOpenAtSource: (found: Found) => void }) {
  const stock = image.from === "unsplash"

  return (
    <div className="group relative flex min-w-0 flex-col gap-1">
      <Picture found={image.picture} className="rounded-md border" style={{ aspectRatio: "4 / 3" }} />
      {stock && (
        <div className="absolute top-1 right-1 rounded-md bg-background/95 opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <IconButton label="Open in Unsplash" onClick={() => onOpenAtSource(image.picture)}>
            <ExternalLink />
          </IconButton>
        </div>
      )}
      <span className="truncate text-xs">{image.name}</span>
      <span className="truncate text-xs text-muted-foreground">
        {image.from === "unsplash" ? `Photo by ${creditOf(image.picture)}` : origins[image.from]}
      </span>
    </div>
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
      <p>Paste or drop an image onto the canvas, or find a photo.</p>
    </div>
  )
}
