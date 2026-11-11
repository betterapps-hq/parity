import { countMedia, type MediaCount, mayBeMedia } from "@parity-app/editor"
import { type DragEvent, useRef, useState } from "react"

/** Files dragged over an element: whether they're over it, and how many may be images or videos. */
export interface FileDrag {
  over: boolean
  /** All a drag says until the drop is each file's type, so this is how many look like images and videos. */
  count: MediaCount
  handlers: {
    onDragEnter: (event: DragEvent) => void
    onDragOver: (event: DragEvent) => void
    onDragLeave: (event: DragEvent) => void
    onDrop: (event: DragEvent) => void
  }
}

/**
 * Takes files dropped on an element. Entering and leaving its children fires on the way, so it counts them rather than
 * trusting `dragleave`. Anything else dragged over it, such as a layer, passes by.
 */
export function useFileDrag(onDrop: (files: File[]) => void): FileDrag {
  const [count, setCount] = useState<MediaCount>()
  const depth = useRef(0)
  const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files")

  const end = () => {
    depth.current = 0
    setCount(undefined)
  }

  return {
    over: count !== undefined,
    count: count ?? { images: 0, videos: 0 },
    handlers: {
      onDragEnter: (event) => {
        if (!carriesFiles(event)) {
          return
        }

        event.preventDefault()
        depth.current += 1
        const files = [...event.dataTransfer.items].filter((item) => item.kind === "file")
        setCount(countMedia(files.map((item) => mayBeMedia(item.type))))
      },
      onDragOver: (event) => {
        if (carriesFiles(event)) {
          event.preventDefault()
          event.dataTransfer.dropEffect = "copy"
        }
      },
      onDragLeave: (event) => {
        if (!carriesFiles(event)) {
          return
        }

        depth.current = Math.max(0, depth.current - 1)

        if (depth.current === 0) {
          end()
        }
      },
      onDrop: (event) => {
        if (!carriesFiles(event)) {
          return
        }

        event.preventDefault()
        end()
        onDrop([...event.dataTransfer.files])
      }
    }
  }
}
