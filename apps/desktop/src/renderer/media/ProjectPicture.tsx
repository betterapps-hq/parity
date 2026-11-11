import { ImageOff } from "lucide-react"
import { type CSSProperties, useState } from "react"
import type { ProjectSession } from "../workspace.ts"
import { notePictureSize } from "./picture-sizes.ts"

/**
 * Where the window finds one of the project's pictures. A layer names a file by its path in `public/`, which the
 * project's builder serves, as the canvas's guest finds it; a linked photo is at its own address.
 */
export function pictureUrl(session: ProjectSession, src: string): string {
  return new URL(src, new URL(session.info.guestUrl).origin).href
}

/**
 * What shows through where one of the project's pictures is transparent: a grid of squares in the theme's own grays,
 * quiet in the dark UI and the light one, behind a picture alone so its see-through parts are told from what's round it.
 */
export const transparencyGrid: CSSProperties = {
  backgroundColor: "var(--muted)",
  backgroundImage:
    "repeating-conic-gradient(color-mix(in oklch, var(--foreground) 18%, transparent) 0 25%, transparent 0 50%)",
  backgroundSize: "12px 12px"
}

interface ProjectPictureProps {
  url: string
  className?: string
  style?: CSSProperties
}

/**
 * One of the project's pictures, which says its size once it has loaded, for the wall to lay out by. One that doesn't
 * load shows that it didn't, in its place.
 */
export function ProjectPicture({ url, className = "", style }: ProjectPictureProps) {
  const [broken, setBroken] = useState<string>()

  if (broken === url) {
    return <PictureMissing />
  }

  return (
    <img
      src={url}
      alt=""
      draggable={false}
      decoding="async"
      className={`block object-cover ${className}`}
      style={style}
      onLoad={(event) =>
        notePictureSize(url, { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
      }
      onError={() => setBroken(url)}
    />
  )
}

/**
 * One of the project's videos, still, at its first picture, which says its size and length once they're known, as a
 * picture says its size (PAR-841). One that doesn't load shows that it didn't, in its place.
 */
export function ProjectVideo({ url, className = "", style }: ProjectPictureProps) {
  const [broken, setBroken] = useState<string>()

  if (broken === url) {
    return <PictureMissing />
  }

  return (
    <video
      src={url}
      muted
      playsInline
      preload="metadata"
      aria-hidden
      className={`block object-cover ${className}`}
      style={style}
      onLoadedMetadata={(event) => {
        const { videoWidth, videoHeight, duration } = event.currentTarget
        notePictureSize(url, { width: videoWidth, height: videoHeight, seconds: duration })
      }}
      onError={() => setBroken(url)}
    />
  )
}

/** In a picture's place when there's none to show: no file at its path, or one that didn't load. */
export function PictureMissing({ label }: { label?: string }) {
  return (
    <span className="flex size-full flex-col items-center justify-center gap-1.5 px-2 text-center">
      <ImageOff aria-hidden className="size-4 text-(--process-starting)" />
      {label && <span className="line-clamp-2 font-mono text-2xs break-all text-muted-foreground">{label}</span>}
    </span>
  )
}
