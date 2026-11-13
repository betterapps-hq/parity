import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { createContext, type ReactNode, use, useMemo, useState, useSyncExternalStore } from "react"
import { GroupLabel } from "../../chrome/PanelSection.tsx"
import { type Comparison, Comparisons, type Point } from "./comparisons.tsx"
import { type Draft, usedColors } from "./data.ts"
import { ProjectData, type ProjectDataValue } from "./field-parts.tsx"
import { HighlightProvider } from "./highlight.tsx"
import { addImageFile, type ImageSource } from "./image-fill.tsx"
import { imageName, imagePreview, projectImages, stockPhotos, watchProjectImages } from "./lists-data.ts"
import { standInTokenSets } from "./stand-in-tokens.ts"
import type { TokenSetName, TokenSets } from "./tokens.ts"
import type { Writes } from "./writes.ts"

/*
 * Where each control is tried on its own: the control at the inspector's width. A file's Demo story also shows beside
 * it what it stores and what it writes as CSS and as Tailwind, updated as it's used, with a preview of the result where
 * it helps and other tools' screenshots for review. Each story gives
 * its fields the stand-ins through `ProjectData`, as the Design tab gives the project's own, and holds its own tokens,
 * so a token made with Create token is there for the story's fields and preview only.
 */

/** Whether the story shows what the control writes beside it, as a Demo story does (`parameters: { demo: true }`). */
export const ShowWrites = createContext(false)

/** A style that changes as the control is used, for a story's state. */
export function useDraft(start: Draft) {
  const [draft, setDraft] = useState(start)

  return [draft, (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }))] as const
}

export function Playground({
  writes,
  preview,
  tokens,
  comparisons,
  points,
  children
}: {
  writes: Writes
  preview?: ReactNode
  /** Sets the story's project starts with in place of the stand-ins, as `{ duration: [] }` for one with none. */
  tokens?: Partial<TokenSets>
  /** Other tools' screenshots of the same control, under the rest, for review. */
  comparisons?: readonly Comparison[]
  /** How the control stands against Penpot's, shown with the comparisons. */
  points?: readonly Point[]
  children: ReactNode
}) {
  const project = useStandInProject(tokens)
  const demo = use(ShowWrites)

  // The inspector's width, so the control lays out as it will there.
  const control = (
    <section aria-label="Control" className="flex w-80 shrink-0 flex-col gap-1 rounded-lg border p-3">
      {children}
    </section>
  )

  return (
    <TooltipProvider>
      <ProjectData value={project}>
        <HighlightProvider>
          {/* It scrolls itself: the app's stylesheet keeps the page from scrolling, as the app's window mustn't. */}
          <div className="flex h-screen flex-wrap content-start items-start gap-6 overflow-y-auto bg-background p-6 text-foreground">
            {control}
            {demo && <Readout writes={writes} />}
            {demo && preview && (
              <section
                aria-label="Preview"
                className="grid shrink-0 place-items-center rounded-lg border bg-muted/40 p-6"
              >
                {preview}
              </section>
            )}
            {demo && comparisons && <Comparisons items={comparisons} points={points} />}
          </div>
        </HighlightProvider>
      </ProjectData>
    </TooltipProvider>
  )
}

export function Readout({ writes }: { writes: Writes }) {
  const blocks = [
    { title: "Stored", text: writes.stored === undefined ? "Unset" : JSON.stringify(writes.stored, null, 2) },
    { title: "CSS", text: writes.css.length > 0 ? writes.css.map((line) => `${line};`).join("\n") : "Nothing" },
    { title: "Tailwind", text: writes.tailwind.length > 0 ? writes.tailwind.join(" ") : "Nothing" },
    ...(writes.markup === undefined ? [] : [{ title: "Markup", text: writes.markup }])
  ]

  return (
    <section aria-label="What it writes" className="flex w-80 min-w-0 shrink-0 flex-col gap-3">
      {blocks.map((block) => (
        <div key={block.title} className="flex flex-col gap-1">
          <GroupLabel as="h2">{block.title}</GroupLabel>
          <pre
            aria-label={block.title}
            className="overflow-x-auto rounded-md border bg-muted/40 p-2 type-code font-mono whitespace-pre-wrap"
          >
            {block.text}
          </pre>
        </div>
      ))}
    </section>
  )
}

/**
 * A story's project: the stand-in tokens, with `tokens`' sets in their place, and those made with Create token, held
 * in state; the design's stand-in colors; and the stand-in images, with any added.
 */
export function useStandInProject(tokens?: Partial<TokenSets>): ProjectDataValue {
  const [sets, setSets] = useState<TokenSets>(() => ({ ...standInTokenSets, ...tokens }))
  const images = useStandInImages()

  return useMemo(
    () => ({
      tokens: sets,
      usedColors,
      images,
      create: <K extends TokenSetName>(set: K, token: TokenSets[K][number]) =>
        setSets((current) => ({ ...current, [set]: [...current[set], token] }))
    }),
    [sets, images]
  )
}

/** The stand-in images, with any added in the story, and Unsplash's stand-in photos. */
function useStandInImages(): ImageSource {
  const images = useSyncExternalStore(watchProjectImages, projectImages)

  return useMemo(
    () => ({
      images: images.map((image) => ({ src: `/images/${image.name}`, name: image.name, preview: image.preview })),
      stock: stockPhotos,
      add: (file) => Promise.resolve(addImageFile(file)),
      preview: imagePreview,
      name: imageName
    }),
    [images]
  )
}
