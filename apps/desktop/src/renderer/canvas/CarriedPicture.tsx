import { hairline, Outlined } from "@parity-app/presence-ui"
import type { ReactNode } from "react"
import { useStore } from "../store.ts"
import { type Carried, carriedPictureSet, type CarriedSet, type Dragger } from "./carried.ts"
import { DragPicture } from "./DragPicture.tsx"
import { Holds } from "./Holds.tsx"
import { LandingSpot } from "./LandingSpot.tsx"

interface CarriedPictureProps {
  area: Element | undefined
  /** The window's, unless a story keeps its own. */
  pictures?: CarriedSet<HTMLElement>
}

/**
 * The pictures of layers carried out of a layout over the canvas `area`, while they're carried and while they fly once
 * they're let go (`carriedPictureSet`): the canvas's own layer drag's (`layer-drag.ts`) and other people's previews'
 * (`drag-preview.ts`), all at once. Each is the design's `DragPicture`, holding the picture `layerPicture` took.
 * Dropped, where they landed keeps its outline (`LandingSpot`) under the picture until it gets there, since the layers
 * themselves aren't drawn there until then. Someone else's carries their outline and name, in their color.
 */
export function CarriedPicture({ area, pictures = carriedPictureSet }: CarriedPictureProps) {
  const carried = useStore(pictures.store)

  return [...carried].map(([key, picture]) =>
    picture.area === area ? <OneCarried key={key} carried={picture} /> : null
  )
}

function OneCarried({ carried }: { carried: Carried }) {
  const { spot, by } = carried

  return (
    <>
      {spot && (
        <div className="absolute" style={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h }}>
          <LandingSpot radius={spot.radius} color={by?.palette.color}>
            <div />
          </LandingSpot>
        </div>
      )}
      <DragPicture at={carried.at} phase={carried.phase} grab={carried.grab}>
        <Outline by={by} radius={spot?.radius}>
          <Holds picture={carried.picture} />
        </Outline>
      </DragPicture>
    </>
  )
}

/** Someone else's outline and name round what they carry; the canvas's own drag has none. */
function Outline({ by, radius, children }: { by: Dragger | undefined; radius?: number; children: ReactNode }) {
  if (!by) {
    return children
  }

  if (by.label) {
    return (
      <Outlined by={[{ name: by.label, palette: by.palette }]} radius={radius}>
        {children}
      </Outlined>
    )
  }

  return (
    <div className="relative">
      {children}
      <span
        className="pointer-events-none absolute"
        style={{
          inset: -2,
          borderRadius: (radius ?? 6) + 2,
          border: `2px solid ${by.palette.color}`,
          boxShadow: hairline(by.palette.ink)
        }}
      />
    </div>
  )
}
