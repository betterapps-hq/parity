import { Tabs, TabsContent, TabsList, TabsTrigger } from "@buildkitgg/shadcn"
import type { PreviewKind } from "@parity-app/tokens"
import { Palette } from "lucide-react"
import { Keyframes, type PreviewToken, tokenSections } from "../token-previews.tsx"
import type { ShownPreview } from "./offeredLibraries.ts"
import { SectionHeading } from "./SectionHeading.tsx"
import { TokenGrid } from "./TokenGrid.tsx"

/** The token sections the dialog draws, as the Tokens panel names them. Breakpoints have a list of their own. */
const shownSections = new Set([
  "Colors",
  "Text styles",
  "Fonts",
  "Font sizes",
  "Font weights",
  "Spacing",
  "Radius",
  "Shadows",
  "Motion"
])

/**
 * The tokens, a tab for each of the Tokens panel's sections, every one drawn as its tiles are, in the theme chosen. An
 * animation runs the library's own keyframes.
 */
export function TokenSpecimens({
  tokens,
  keyframes = [],
  theme
}: {
  tokens: readonly PreviewToken[]
  keyframes?: ShownPreview["keyframes"]
  theme: string
}) {
  const sections = tokenSections
    .filter((section) => shownSections.has(section.title))
    .map((section) => {
      const kinds = new Set<PreviewKind>(section.kinds.map(({ kind }) => kind))

      return { title: section.title, tokens: tokens.filter((token) => kinds.has(token.kind)) }
    })
    .filter((section) => section.tokens.length > 0)

  const [first] = sections

  if (!first) {
    return null
  }

  return (
    <section aria-labelledby="library-tokens" className="mx-6 mt-8">
      <Keyframes.Provider value={(name) => keyframes.find((each) => each.name === name)?.frames}>
        <SectionHeading id="library-tokens" icon={Palette} title="Tokens" count={tokens.length} />
        <Tabs defaultValue={first.title} className="mt-3 gap-4">
          <TabsList
            variant="line"
            className="max-w-full flex-wrap justify-start gap-y-2 group-data-horizontal/tabs:h-auto"
            aria-label="Kinds of token"
          >
            {sections.map((section) => (
              <TabsTrigger key={section.title} value={section.title} className="h-7 flex-none gap-1.5 text-xs">
                {section.title}
                <span className="text-muted-foreground tabular-nums">{section.tokens.length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((section) => (
            <TabsContent key={section.title} value={section.title}>
              <TokenGrid colors={section.title === "Colors"} tokens={section.tokens} theme={theme} />
            </TabsContent>
          ))}
        </Tabs>
      </Keyframes.Provider>
    </section>
  )
}
