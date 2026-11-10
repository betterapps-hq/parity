import { type Found, sizeOf } from "@parity-app/connectors"
import { VideoPreview } from "@parity-app/media-player"
import type { CSSProperties } from "react"
import { checker } from "../chrome/token-previews.tsx"

interface ResultPictureProps {
  found: Found
  /** Its smaller copy, for a list of results, when the source has one. */
  small?: boolean
  /** A video plays its small copy, without sound, over its poster. */
  playing?: boolean
  /** Called as a playing video goes with where it is, in seconds. */
  onTime?: (seconds: number) => void
  className?: string
  style?: CSSProperties
}

/**
 * A result's picture, in its own proportions, filling its box's width, or its height when `style` gives one, on checks
 * so a vector's see-through parts show. It loads from the source's link, which only shows results; what's added to a
 * project is saved there first.
 */
export function ResultPicture({ found, small, playing, onTime, className = "", style }: ResultPictureProps) {
  const { width, height } = sizeOf(found)
  const video = playing ? found.video : undefined

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ ...checker, aspectRatio: `${width} / ${height}`, ...style }}
    >
      <img
        src={(small && found.preview?.url) || found.image.url}
        alt=""
        draggable={false}
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
      {video && (
        <VideoPreview
          src={video.preview ?? video.url}
          onTime={onTime}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  )
}
