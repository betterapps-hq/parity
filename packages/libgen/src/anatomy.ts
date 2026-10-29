import { type ExampleFile, familyOf, readExamples } from "./examples.ts"

/** How a library file's parent chains compare with the anatomy its docs show. */
export interface AnatomyCheck {
  /** Parts the docs nest inside another. */
  parts: number
  /** Of those, the ones whose nearest parent the docs show is in the chain and whose needed parents the docs have. */
  placed: number
  /** And the ones that also have every level the docs show. */
  complete: number
  /** Parts placed differently from the docs, with both chains, outermost first. */
  differ: { name: string; docs: string[]; file: string[] }[]
}

/**
 * Where the docs' Anatomy and Usage blocks put each part: every library ancestor of each place it's shown, nearest
 * first. The blocks are read as JSX, with their imports taken out.
 */
export function readAnatomy(docs: ExampleFile[], names: string[]): Map<string, string[][]> {
  const blocks: ExampleFile[] = []
  for (const doc of docs) {
    const sections = doc.text.split(/^(?=#{2,3} )/m).filter((section) => /^#{2,3} (?:Anatomy|Usage)\b/.test(section))
    for (const section of sections) {
      for (const [index, match] of [...section.matchAll(/```(?:jsx|tsx|js|ts)\b[^\n]*\n([\s\S]*?)```/g)].entries()) {
        const code = match[1]!
          .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?$/gm, "")
          .replace(/^import\s+["'][^"']+["'];?$/gm, "")
          .trim()
        if (!code.startsWith("<")) continue
        blocks.push({ path: `${doc.path}#${index}`, text: `const anatomy = (<>\n${code}\n</>)` })
      }
    }
  }
  const anatomy = new Map<string, string[][]>()
  for (const [name, use] of readExamples(blocks, names)) {
    const placed = use.paths.filter((path) => path.length > 0)
    if (placed.length > 0) anatomy.set(name, placed)
  }
  return anatomy
}

/**
 * Compares each part's chain with the docs. A part is placed right when one place the docs show has the nearest
 * parent the chain has, and every parent the chain needs (all but its optional ones); complete when the chain also
 * has every level that place does.
 */
export function checkAnatomy(
  anatomy: Map<string, string[][]>,
  list: Record<string, { parents?: string[]; optionalParents?: string[]; visual?: boolean }>
): AnatomyCheck {
  const check: AnatomyCheck = { parts: 0, placed: 0, complete: 0, differ: [] }
  for (const [name, paths] of anatomy) {
    const entry = list[name]
    if (!entry || entry.visual === false) continue
    // Only a part of a family counts: docs nest any component somewhere (a Button in an AlertAction).
    // Portals are left out of chains on purpose (they move content out of the frame), so they aren't counted missing.
    const known = paths
      .map((path) => path.filter((parent) => parent in list && !parent.endsWith("Portal")))
      .filter((path) => path.length > 0 && familyOf(path[0]!) === familyOf(name))
    if (known.length === 0) continue
    check.parts++
    const chain = entry.parents ?? []
    const needed = chain.filter((parent) => !entry.optionalParents?.includes(parent) && !parent.endsWith("Portal"))
    const right = known.filter(
      (path) => path.length > 0 && chain.includes(path[0]!) && needed.every((parent) => path.includes(parent))
    )
    if (right.length > 0) {
      check.placed++
      if (right.some((path) => path.every((parent) => chain.includes(parent)))) check.complete++
    } else {
      const docs = known.find((path) => path.length > 0)!
      check.differ.push({ name, docs: [...docs].reverse(), file: chain })
    }
  }
  return check
}
