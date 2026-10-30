import { describedCategories, describedTokenCss, extractTokens, readDesignTokens } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { within } from "storybook/test"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ProjectContext } from "../canvas/context.ts"
import { example, openProjects } from "../stories/fixtures.tsx"
import { TokenStore } from "../tokens-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { setLayout } from "./layout.ts"
import { LeftPanel } from "./LeftPanel.tsx"
import { TokensPanel } from "./TokensPanel.tsx"

/**
 * The Tokens tab for a project on each library in Parity's registry that describes tokens, to check how each one's
 * tokens are grouped and ordered. Each shows only that library's tokens, read from its `.lib.par` as the app reads
 * them: the variables its tokens describe, categorized as it says, with its descriptions beside them. Shown in the left
 * panel, as the app shows it.
 */
const meta = {
  title: "Parity/Left panel/Tokens/Libraries",
  component: TokensPanel,
  render: (_, { loaded }) => (
    <TooltipProvider>
      <ProjectContext value={(loaded as Loaded).session}>
        <div className="flex h-screen bg-background text-foreground">
          <LeftPanel />
        </div>
      </ProjectContext>
    </TooltipProvider>
  )
} satisfies Meta<typeof TokensPanel>

export default meta
type Story = StoryObj<typeof meta>

interface Loaded {
  session: ProjectSession
}

/** The registry's `.lib.par` files, by file name, read when a story asks for one. */
const libraries = import.meta.glob<string>("../../../../../packages/registry/libraries/*.lib.par", {
  query: "?raw",
  import: "default"
})

/**
 * Opens the example on the Tokens tab with only a library's tokens in place of its own: the tokens, the descriptions
 * and the categories its `.lib.par` gives, read as the app reads a library that creates its variables at run time.
 */
function openLibrary(file: string) {
  return async (): Promise<Loaded> => {
    const path = Object.keys(libraries).find((candidate) => candidate.endsWith(`/${file}`))
    if (!path) throw new Error(`The registry has no ${file}`)
    const manifest = JSON.parse(await libraries[path]!()) as { name: string; tokens: unknown }
    const described = await readDesignTokens(manifest.tokens, () =>
      Promise.reject(new Error("The registry's tokens are inline"))
    )
    const css = describedTokenCss(described)
    const tokens = extractTokens(css, [], describedCategories(described))
    await openProjects("example")
    setLayout({ leftTab: "tokens" })
    const project = example()
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(css)
    const session: ProjectSession = {
      ...project,
      info: {
        ...project.info,
        styles: undefined,
        describedTokens: [{ name: manifest.name, manifest: `node_modules/${file}`, tokens: described }]
      },
      // Edits go nowhere: the story is for looking.
      tokens: new TokenStore(tokens, sheet, () => Promise.resolve(), project.store, file)
    }
    return { session }
  }
}

/** A story of a library's tokens, waiting for the list to show. */
function library(file: string): Story {
  return {
    loaders: [openLibrary(file)],
    play: async ({ canvasElement }) => {
      await within(canvasElement).findByPlaceholderText(/^Search \d+ tokens$/)
    }
  }
}

/**
 * Chakra UI: about 460 `--chakra-*` tokens, its palettes (`colors-blue-50` to `950`) beside its semantic colors
 * (`colors-bg`, `colors-blue-solid`), then type, spacing, radii, borders, shadows, blurs, motion, z-indexes,
 * breakpoints, sizes, aspect ratios and cursors. Look at whether the palettes and the semantic colors are told apart,
 * where Parity's own `spacing` steps land among Chakra's, where `blurs-none` sorts, and the half steps (`spacing.0\.5`)
 * that end up described only.
 */
export const ChakraUI: Story = { ...library("chakra.lib.par"), name: "Chakra UI" }

/**
 * Fluent UI: Fluent 2's camel-cased tokens (`colorBrandBackground`, `spacingHorizontalM`, `shadow4Brand`,
 * `curveEasyEase`), about 460 of them. Look at its 366 colors in one alphabetical list, horizontal and vertical spacing
 * taken as one scale, and each shadow followed by its brand twin.
 */
export const FluentUI: Story = { ...library("fluent.lib.par"), name: "Fluent UI" }

/**
 * Mantine: `--mantine-*` tokens, its palettes (`color-blue-0` to `9`) among its semantic colors and its components' own
 * colors (`burger-color`, `switch-bg`), and headings' sizes, weights and line heights (`h1-font-size`) among the type
 * scale. Look at how the component colors mix in, and the font smoothing settings listed as fonts.
 */
export const Mantine: Story = { ...library("mantine.lib.par"), name: "Mantine" }

/**
 * Material UI: `--mui-*` tokens, its palette roles (`palette-primary-main`) beside components' colors
 * (`palette-Alert-errorColor`), typography variants by name (`font-h1`, `font-size-body2`), 25 elevations of shadows and
 * overlays, opacities, z-indexes and breakpoints. Look at where `shadows-0` sorts, the overlays under Other, and
 * Parity's own `spacing` steps beside MUI's one `spacing`.
 */
export const MaterialUI: Story = { ...library("mui.lib.par"), name: "Material UI" }

/**
 * The Shadcn styles' tokens: their semantic colors (`primary`), each also as Tailwind's `color-primary`, the radius
 * scale, and tw-animate-css's animation settings and percentages. Every style describes the same tokens, so the Shadcn
 * stories match. Look at the doubled colors, the animation settings listed as animations, and the percentages under
 * Other.
 */
export const ShadcnLuma: Story = { ...library("luma.lib.par"), name: "Shadcn Luma" }

/** Shadcn Lyra, whose tokens are the same as Shadcn Luma's. */
export const ShadcnLyra: Story = { ...library("lyra.lib.par"), name: "Shadcn Lyra" }

/** Shadcn Maia, whose tokens are the same as Shadcn Luma's. */
export const ShadcnMaia: Story = { ...library("maia.lib.par"), name: "Shadcn Maia" }

/** Shadcn Mira, whose tokens are the same as Shadcn Luma's. */
export const ShadcnMira: Story = { ...library("mira.lib.par"), name: "Shadcn Mira" }

/** Shadcn Nova, whose tokens are the same as Shadcn Luma's. */
export const ShadcnNova: Story = { ...library("nova.lib.par"), name: "Shadcn Nova" }

/** Shadcn Rhea, whose tokens are the same as Shadcn Luma's. */
export const ShadcnRhea: Story = { ...library("rhea.lib.par"), name: "Shadcn Rhea" }

/** Shadcn Sera, whose tokens are the same as Shadcn Luma's. */
export const ShadcnSera: Story = { ...library("sera.lib.par"), name: "Shadcn Sera" }

/** Shadcn Vega, whose tokens are the same as Shadcn Luma's. */
export const ShadcnVega: Story = { ...library("vega.lib.par"), name: "Shadcn Vega" }
