import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { findPackage, packageEntry } from "@parity-app/project"

// The parts of Tailwind v4's design system that Parity uses. Tailwind marks the loader unstable
// (`__unstable__loadDesignSystem`), so design-system.test.ts pins each of these against the installed Tailwind.

/** A node of the CSS a class compiles to. */
export type CssNode =
  | { kind: "declaration"; property: string; value?: string; important: boolean }
  | { kind: "rule"; selector: string; nodes: CssNode[] }
  | { kind: "at-rule"; name: string; params: string; nodes: CssNode[] }
  | { kind: "comment" | "context" | "at-root" }

/** A class as Tailwind parses it: a utility, with the variants in front of it. */
export interface Candidate {
  kind: "static" | "functional" | "arbitrary"
  /** A utility's name before its value: `bg` in `bg-primary`. An arbitrary property has none. */
  root?: string
  variants: object[]
}

/** A project's Tailwind, loaded with its stylesheet: its theme, and what each class means in this project. */
export interface DesignSystem {
  theme: { entries(): Iterable<[string, { value: string }]> }
  /** A class as its parts, one for each way Tailwind can read it; none when it isn't a class Tailwind knows. */
  parseCandidate(candidate: string): Candidate[]
  /** A variant as its parts, or null when the project has no such variant. */
  parseVariant(variant: string): object | null
  /** The CSS each class compiles to in this project, in the order given; no nodes for a class that compiles to none. */
  candidatesToAst(classes: string[]): CssNode[][]
  /** Each class with the order Prettier's Tailwind plugin sorts it by, or null for a class Tailwind doesn't know. */
  getClassOrder(classes: string[]): [string, bigint | null][]
  /** The classes as Tailwind's own tools spell them (`p-[16px]` as `p-4`), without the ones that repeat another. */
  canonicalizeCandidates(classes: string[]): string[]
}

interface TailwindNode {
  __unstable__loadDesignSystem(css: string, options: { base: string }): Promise<DesignSystem>
}

/**
 * A project's design system, from its own Tailwind (through `@tailwindcss/node`, which its Vite or PostCSS plugin
 * installs), so plugins, `@theme` blocks and imported presets all count.
 */
export async function loadDesignSystem(root: string, stylesheet: string): Promise<DesignSystem> {
  const path = join(root, stylesheet)
  const tailwind = await loadTailwindNode(root)

  return await tailwind.__unstable__loadDesignSystem(await readFile(path, "utf8"), { base: dirname(path) })
}

/**
 * The project's own `@tailwindcss/node`, found as Node would find it from the project, never through NODE_PATH, which
 * pnpm's bin shims point at Parity's own copy.
 */
async function loadTailwindNode(root: string): Promise<TailwindNode> {
  // `@tailwindcss/node` is usually a dependency of the project's Tailwind plugin rather than of the project itself.
  for (const via of [undefined, "@tailwindcss/vite", "@tailwindcss/postcss", "@tailwindcss/cli"]) {
    const from = via ? (await findPackage(root, via))?.dir : root
    const tailwind = from && (await findPackage(from, "@tailwindcss/node"))
    const entry = tailwind && packageEntry(tailwind, "runtime")

    if (entry) {
      // A dynamic import is untyped; this is the project's own copy of the package `TailwindNode` describes.
      return await import(pathToFileURL(entry).href)
    }
  }

  throw new Error(`Tailwind's @tailwindcss/node is not installed in ${root}`)
}
