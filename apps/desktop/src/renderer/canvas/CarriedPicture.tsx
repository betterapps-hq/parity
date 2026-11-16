import { useLayoutEffect, useRef } from "react"
import { useStore } from "../store.ts"
import { carriedPicture } from "./carried.ts"
import { DragPicture } from "./DragPicture.tsx"

interface CarriedPictureProps {
  area: Element | undefined
}

interface HoldsProps {
  picture: HTMLElement
}

/**
 * The picture of layers carried out of a layout over the canvas `area`, while they're carried and while it flies once
 * they're let go (`carriedPicture`, which `layer-drag.ts` keeps). It's the design's `DragPicture`, holding the picture
 * `layerPicture` took.
 */
export function CarriedPicture({ area }: CarriedPictureProps) {
  const carried = useStore(carriedPicture.store)

  if (!carried || carried.area !== area) {
    return null
  }

  return (
    <DragPicture at={carried.at} phase={carried.phase} grab={carried.grab}>
      <Holds picture={carried.picture} />
    </DragPicture>
  )
}

/** Holds an element React didn't draw. */
function Holds({ picture }: HoldsProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    ref.current?.replaceChildren(picture)

    return () => picture.remove()
  }, [picture])

  return <div ref={ref} />
}
