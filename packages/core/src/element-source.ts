/**
 * The attribute the development guest gives each element a project's JSX draws, naming where it's written (PAR-167):
 * the file from the project root, then the line and column of its `<`, from 1. Production builds carry none.
 */
export const elementSourceAttribute = "data-parity-source"

/** Where an element is written in the project's code. */
export interface ElementSource {
  /** Relative to the project root, with forward slashes. */
  path: string
  line: number
  column: number
}

/** The attribute's value: `src/components/ui/button.tsx:12:5`. */
export function formatElementSource({ path, line, column }: ElementSource): string {
  return `${path}:${line}:${column}`
}

/** Reads the attribute's value, which comes from the page, so anything else reads as none. */
export function parseElementSource(value: string | null | undefined): ElementSource | undefined {
  const match = value ? /^(.+):([1-9]\d*):([1-9]\d*)$/.exec(value) : null

  if (!match?.[1] || !match[2] || !match[3]) {
    return undefined
  }

  return { path: match[1], line: Number(match[2]), column: Number(match[3]) }
}
