import type { LensView } from "./registry.ts"
import { screensLens } from "./screens.tsx"

/** The lenses the app has built, which the lens bar lists; the others arrive with their own issues (lens-layout.md). */
export const appLenses: readonly LensView[] = [screensLens]
