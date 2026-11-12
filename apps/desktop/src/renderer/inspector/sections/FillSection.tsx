import { fillEdit, mediumOf } from "@parity-app/editor"
import { fileBaseName } from "@parity-app/editor"
import { defaultValues, previewKind, type Token } from "@parity-app/tokens"
import { useMemo, useState } from "react"
import { useProject } from "../../canvas/context.ts"
import { importMedia } from "../../canvas/import-media.ts"
import type { StyleEditor } from "../../chrome/style-editor.ts"
import { useProjectMedia } from "../../media/project-media.ts"
import { pictureUrl } from "../../media/ProjectPicture.tsx"
import { comesTo } from "../../token-values.ts"
import type { ProjectSession } from "../../workspace.ts"
import { ProjectTokens } from "../controls/field-parts.tsx"
import { type ImageSource, ImageSourceProvider } from "../controls/image-fill.tsx"
import type { PaintEntry } from "../controls/lists-data.ts"
import { PaintStack } from "../controls/paint-stack.tsx"
import { colorToken, type ColorToken, type GradientToken, type TokenSets } from "../controls/tokens.ts"
import { entriesFromFill, gradientTokenOf, paintsFromEntries } from "../paint-values.ts"

/** The project's color and gradient tokens as the Paint stack offers them, each by its real name. */
function fillTokens(tokens: readonly Token[]): Pick<TokenSets, "color" | "gradient"> {
  const byName = new Map(tokens.map((token) => [token.name, token]))
  const lookup = defaultValues(tokens)
  const color: ColorToken[] = []
  const gradient: GradientToken[] = []

  for (const token of tokens) {
    const value = comesTo(byName, token.name) ?? ""

    if (token.category === "color") {
      color.push(colorToken(token.name, value))
    } else if (previewKind(token, undefined, lookup) === "gradient") {
      const read = gradientTokenOf(token.name, value)

      if (read) {
        gradient.push(read)
      }
    }
  }

  return { color, gradient }
}

/** The project's pictures for image fills, drawn from its dev server; a file added is saved into `public/images/`. */
function useImageSourceOf(session: ProjectSession): ImageSource {
  const { images } = useProjectMedia(session)
  // The pictures are drawn from the guest's address, which changes when its builder restarts on another port.
  const { guestUrl } = session.info

  return useMemo(() => {
    const pictures = images
      .filter((image) => image.kind !== "missing" && mediumOf(image) !== "video")
      .map((image) => ({ src: image.src, name: image.name, preview: pictureUrl(session, image.src) }))

    return {
      images: pictures,
      stock: [],
      add: async (file) => {
        const node = await importMedia(session, file, fileBaseName(file.name))

        return node.type === "image" ? node.src : ""
      },
      preview: (src) => (src ? pictureUrl(session, src) : undefined),
      name: (src) => pictures.find((image) => image.src === src)?.name ?? src.replace("/images/", "")
    }
    // `guestUrl` is read through the session by `pictureUrl`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [images, session, guestUrl])
}

/**
 * Fill: the selected layers' paint stack, colors, gradients and images, top first, on the approved Paint stack control
 * (PAR-931). One plain color is written as its token's name, as `background` always held it.
 */
export function FillSection({ editor }: { editor: StyleEditor }) {
  const session = useProject()
  const { style, mixed } = editor.selection
  const sets = useMemo(() => fillTokens(editor.tokens), [editor.tokens])
  const images = useImageSourceOf(session)
  // The control's own ids for the entries, kept while the document holds what they say, so an open editor stays open.
  const [held, setHeld] = useState<PaintEntry[]>([])
  const entries = entriesFromFill(style.background, sets.gradient, held)
  const edit = (next: PaintEntry[]) => fillEdit(paintsFromEntries(next))

  return (
    // The control reads tokens from here; a new list of them starts it again with the project's.
    <ProjectTokens key={JSON.stringify([sets.color.map(({ name }) => name), sets.gradient])} tokens={sets}>
      <ImageSourceProvider value={images}>
        <PaintStack
          entries={entries}
          mixed={mixed.includes("background")}
          tokensOnly
          onPreview={(carried) => (carried ? editor.preview?.("fill", edit(carried)) : editor.endPreview?.())}
          onChange={(next) => {
            setHeld(next)
            editor.set("fill", edit(next), "Change fill")
          }}
        />
      </ImageSourceProvider>
    </ProjectTokens>
  )
}
