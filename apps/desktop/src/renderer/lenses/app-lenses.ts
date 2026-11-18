import { componentsLens } from "./components.tsx"
import { pagesLens } from "./pages.tsx"
import type { LensView } from "./registry.ts"
import { screensLens } from "./screens.tsx"
import { storiesLens } from "./stories.tsx"

/** The lenses the app has built, which the lens bar lists; the others arrive with their own issues (lens-layout.md). */
export const appLenses: readonly LensView[] = [pagesLens, screensLens, componentsLens, storiesLens]
