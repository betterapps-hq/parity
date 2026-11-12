import { fileBaseName, mediumOf } from "@parity-app/editor"
import { useMemo } from "react"
import { importMedia } from "../canvas/import-media.ts"
import { useProjectMedia } from "../media/project-media.ts"
import { pictureUrl } from "../media/ProjectPicture.tsx"
import type { ProjectSession } from "../workspace.ts"
import type { ImageSource } from "./controls/image-fill.tsx"

/** The project's pictures for image fills, drawn from its dev server; a file added is saved into `public/images/`. */
export function useProjectImages(session: Pick<ProjectSession, "id" | "info" | "store" | "untilClosed">): ImageSource {
  const { images } = useProjectMedia(session)
  // The pictures are drawn from the guest's address, which changes when its builder restarts on another port.
  const { guestUrl } = session.info

  return useMemo(() => {
    const pictures = images
      .filter((image) => image.kind !== "missing" && mediumOf(image) !== "video")
      .map((image) => ({ src: image.src, name: image.name, preview: pictureUrl(session.info, image.src) }))

    return {
      images: pictures,
      stock: [],
      add: async (file) => {
        const node = await importMedia(session.id, file, fileBaseName(file.name))

        return node.type === "image" ? node.src : ""
      },
      preview: (src) => (src ? pictureUrl(session.info, src) : undefined),
      name: (src) => pictures.find((image) => image.src === src)?.name ?? src.replace("/images/", "")
    }
    // `guestUrl` is read through the session by `pictureUrl`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [images, session, guestUrl])
}
