import { useLayoutEffect, useRef } from "react"
import { useStore } from "../store.ts"
import { carriedPicture } from "./carried.ts"
import { DragPicture } from "./DragPicture.tsx"
import { LandingSpot } from "./LandingSpot.tsx"

interface CarriedPictureProps {
  area: Element | undefined
}

interface HoldsProps {
  picture: HTMLElement
}

/**
 * The picture of layers carried out of a layout over the canvas `area`, while they're carried and while it flies once
 * they're let go (`carriedPicture`, which `layer-drag.ts` keeps). It's the design's `DragPicture`, holding the picture
 * `layerPicture` took. Dropped, where they landed keeps its outline (`LandingSpot`) under the picture until it gets
 * there, since the layers themselves aren't drawn there until then.
 */
export function CarriedPicture({ area }: CarriedPictureProps) {
  const carried = useStore(carriedPicture.store)

  if (!carried || carried.area !== area) {
    return null
  }

  const { spot } = carried

  return (
    <>
      {spot && (
        <div className="absolute" style={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h }}>
          <LandingSpot radius={spot.radius}>
            <div />
          </LandingSpot>
        </div>
      )}
      <DragPicture at={carried.at} phase={carried.phase} grab={carried.grab}>
        <Holds picture={carried.picture} />
      </DragPicture>
    </>
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
