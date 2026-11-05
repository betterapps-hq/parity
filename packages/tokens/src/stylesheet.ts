import type { EnclosingAtRule } from "@parity-app/core"
import { isUnconditional, themeOfSelector } from "./policy.ts"

/** A block in a stylesheet's source, with offsets so it can be edited in place. */
interface SourceBlock {
  /** Offset where the prelude begins. */
  start: number
  prelude: string
  /** Offset just after `{`. */
  bodyStart: number
  /** Offset of the matching `}`. */
  bodyEnd: number
  children: SourceBlock[]
}

/** A block with where it sits: the at-rules around it, and whether it's nested in a style rule. */
interface PlacedBlock extends SourceBlock {
  atRules: EnclosingAtRule[]
  nested: boolean
}

/** The blocks a custom property may live in. */
export interface PropertyBlocks {
  /** Blocks the property may live in, by prelude (`:root`, `.dark`, `@theme`). A prelude matches if any of its comma-separated parts does. */
  blocks: string[]
  /**
   * A theme whose blocks the property may also live in, as `themeOfSelector` reads them: for `dark`, `.dark` and
   * `[data-theme="dark"]` alike. A block under a condition (`@media`…) is no theme's, so it's never edited.
   */
  theme?: string
}

export interface SetPropertyOptions extends PropertyBlocks {
  /**
   * Where to add the property when no matching block declares it: an existing block of this prelude, else the
   * theme's first block (unless this is an at-rule, such as `@theme`), else a new block of this prelude.
   */
  create: string
}

/** A new value for a token in one theme: `default` for the root, otherwise the theme it names (e.g. `dark`). */
export interface TokenChange {
  name: string
  theme: string
  value: string
}

/**
 * A token value Save writes in one theme, as `TokenChange` gives it, or `value` undefined to take the token's
 * declaration out of that theme: a value the theme didn't have, undone after it was saved.
 */
export interface TokenWrite {
  name: string
  theme: string
  value: string | undefined
}

/**
 * Writes token values into a stylesheet's source: semantic tokens into the root or their theme's block (`.dark` or
 * `[data-theme="dark"]`, whichever the stylesheet uses, else a new `.dark`), theme scale tokens (those `themeNames`
 * holds) into an `@theme` block, editing declarations in place where they already exist. A write without a value
 * takes the declaration out of the same blocks, and a block it leaves empty with it.
 */
export function writeTokenChanges(
  source: string,
  changes: readonly TokenWrite[],
  themeNames: ReadonlySet<string>
): string {
  let content = source
  for (const { name, theme, value } of changes) {
    const options = tokenBlocks(theme, themeNames.has(name))
    content =
      value === undefined
        ? removeCustomProperty(content, name, options)
        : setCustomProperty(content, name, value, options)
  }
  return content
}

/** Where a token's value lives in a theme: a theme scale token (`isTheme`) in `@theme`, others in the root or theme. */
function tokenBlocks(theme: string, isTheme: boolean): SetPropertyOptions {
  if (theme !== "default") return { blocks: [], theme, create: `.${theme}` }
  if (isTheme) return { blocks: ["@theme", "@theme inline", "@theme static"], theme: "default", create: "@theme" }
  return { blocks: [], theme: "default", create: ":root" }
}

/**
 * Sets a custom property in a stylesheet's source, keeping everything else (comments, order, formatting) as written.
 * Replaces the declaration in every matching block that has one, else adds it to the block named by `create`.
 */
export function setCustomProperty(source: string, name: string, value: string, options: SetPropertyOptions): string {
  const blocks = editableBlocks(source)
  // Every block that declares it gets the value, as `previewToken` does, so `.dark` and a later `[data-theme="dark"]`
  // can't disagree after a save. From the last, so earlier offsets still hold.
  const declarations = blocks
    .filter((candidate) => holds(candidate, options))
    .flatMap((block) => findDeclaration(source, block, name) ?? [])
    .sort((a, b) => b.valueStart - a.valueStart)
  if (declarations.length > 0) {
    let next = source
    for (const { valueStart, valueEnd } of declarations) next = next.slice(0, valueStart) + value + next.slice(valueEnd)
    return next
  }

  const target =
    blocks.find((candidate) => matches(candidate, [options.create])) ??
    (options.create.startsWith("@") ? undefined : blocks.find((candidate) => inTheme(candidate, options.theme)))
  if (target) {
    const body = source.slice(target.bodyStart, target.bodyEnd)
    const indent = /\n([ \t]+)--/.exec(body)?.[1] ?? /\n([ \t]+)\S/.exec(body)?.[1] ?? "  "
    const trimmedEnd = target.bodyStart + body.trimEnd().length
    const needsSemicolon = body.trim().length > 0 && !/[;{}]$/.test(body.trimEnd())
    const insertion = `${needsSemicolon ? ";" : ""}\n${indent}--${name}: ${value};`
    return source.slice(0, trimmedEnd) + insertion + source.slice(trimmedEnd)
  }
  const separator = source.endsWith("\n") || source.length === 0 ? "" : "\n"
  return `${source}${separator}\n${options.create} {\n  --${name}: ${value};\n}\n`
}

/**
 * Takes a custom property out of every matching block that declares it, keeping everything else as written, and a
 * block it leaves with nothing in it goes too, so a value `setCustomProperty` added in a block of its own leaves the
 * stylesheet as it was before. The same source when no block declares it.
 */
export function removeCustomProperty(source: string, name: string, options: PropertyBlocks): string {
  let next = source
  for (;;) {
    // The last declaration first, then the blocks again, since taking one out moves everything after it.
    const found = editableBlocks(next)
      .filter((block) => holds(block, options))
      .flatMap((block) => {
        const declaration = findDeclaration(next, block, name)
        return declaration ? [{ block, declaration }] : []
      })
      .at(-1)
    if (!found) return next
    const { block, declaration } = found
    const left = next.slice(block.bodyStart, declaration.start) + next.slice(declaration.end, block.bodyEnd)
    next =
      left.trim() === ""
        ? cut(next, ruleStart(next, block), block.bodyEnd + 1)
        : cut(next, declaration.start, declaration.end)
  }
}

/** The blocks a custom property can be edited in: not nested in a style rule, and under no condition. */
function editableBlocks(source: string): PlacedBlock[] {
  return place(scanBlocks(source), [], false).filter((block) => !block.nested && isUnconditional(block.atRules))
}

/** Whether a block is one the property may live in. */
function holds(block: PlacedBlock, options: PropertyBlocks): boolean {
  return matches(block, options.blocks) || inTheme(block, options.theme)
}

function matches(block: SourceBlock, preludes: readonly string[]): boolean {
  const parts = block.prelude.split(",").map((part) => normalize(part))
  return preludes.some(
    (prelude) => parts.includes(normalize(prelude)) || normalize(block.prelude) === normalize(prelude)
  )
}

function inTheme(block: PlacedBlock, theme: string | undefined): boolean {
  return (
    theme !== undefined && !block.prelude.startsWith("@") && themeOfSelector(block.prelude, block.atRules) === theme
  )
}

/** Where a block's rule begins: its prelude, after the whitespace and comments before it. */
function ruleStart(source: string, block: SourceBlock): number {
  let index = block.start
  while (index < block.bodyStart) {
    if (/\s/.test(source[index]!)) {
      index++
      continue
    }
    const commentEnd = source.startsWith("/*", index) ? source.indexOf("*/", index + 2) : -1
    if (commentEnd === -1) break
    index = commentEnd + 2
  }
  return index
}

/**
 * Takes `source` from `from` to `to` out with the spaces around it: its whole line when nothing else is on it, and one
 * of the blank lines that leaves on either side of it; otherwise the spaces that would be left over.
 */
function cut(source: string, from: number, to: number): string {
  let start = from
  while (start > 0 && /[ \t]/.test(source[start - 1]!)) start--
  let end = to
  while (end < source.length && /[ \t]/.test(source[end]!)) end++
  const atLineStart = start === 0 || source[start - 1] === "\n"
  const lineBreak = /^\r?\n/.exec(source.slice(end))?.[0]
  const atLineEnd = end === source.length || lineBreak !== undefined
  if (!atLineStart || !atLineEnd) {
    return atLineEnd ? source.slice(0, start) + source.slice(to) : source.slice(0, from) + source.slice(end)
  }
  end += lineBreak?.length ?? 0
  // A line taken out from between two blank lines, or a blank line and an end of the file, leaves one of them.
  const blankBefore = /\r?\n\r?\n$/.exec(source.slice(0, start))?.[0]
  const blankAfter = /^\r?\n/.exec(source.slice(end))?.[0]
  const fileStart = start === 0
  const fileEnd = end === source.length
  if (blankBefore && (blankAfter || fileEnd)) start -= blankBefore.startsWith("\r\n") ? 2 : 1
  else if (blankAfter && fileStart) end += blankAfter.length
  return source.slice(0, start) + source.slice(end)
}

function normalize(text: string): string {
  return text.trim().replaceAll(/\s+/g, " ")
}

/** Every block, each with the at-rules around it and whether a style rule holds it. */
function place(blocks: SourceBlock[], atRules: EnclosingAtRule[], nested: boolean): PlacedBlock[] {
  return blocks.flatMap((block) => {
    const atRule = /^@([\w-]+)\s*([\s\S]*)$/.exec(block.prelude)
    const inner = atRule ? [...atRules, { name: atRule[1]!.toLowerCase(), prelude: atRule[2]!.trim() }] : atRules
    return [{ ...block, atRules, nested }, ...place(block.children, inner, nested || !atRule)]
  })
}

/**
 * Finds `--name: value` directly inside a block (not in nested blocks): where its value begins and ends, and where the
 * whole declaration does, its `;` included.
 */
function findDeclaration(
  source: string,
  block: SourceBlock,
  name: string
): { start: number; end: number; valueStart: number; valueEnd: number } | undefined {
  let index = block.bodyStart
  const nested = [...block.children].sort((a, b) => a.bodyStart - b.bodyStart)
  const pattern = new RegExp(`--${name.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`, "y")
  while (index < block.bodyEnd) {
    const inside = nested.find((child) => index >= child.start && index <= child.bodyEnd)
    if (inside) {
      index = inside.bodyEnd + 1
      continue
    }
    const char = source[index]
    if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2)
      index = end === -1 ? block.bodyEnd : end + 2
      continue
    }
    pattern.lastIndex = index
    if (pattern.test(source) && (index === block.bodyStart || /[\s;{]/.test(source[index - 1]!))) {
      let valueStart = pattern.lastIndex
      while (/\s/.test(source[valueStart]!)) valueStart++
      const valueEnd = endOfValue(source, valueStart, block.bodyEnd)
      let trimmed = valueEnd
      while (trimmed > valueStart && /\s/.test(source[trimmed - 1]!)) trimmed--
      const end = source[valueEnd] === ";" ? valueEnd + 1 : trimmed
      return { start: index, end, valueStart, valueEnd: trimmed }
    }
    index++
  }
  return undefined
}

/** The end of a declaration's value: the `;` or `}` that isn't inside parentheses or a string. */
function endOfValue(source: string, start: number, limit: number): number {
  let depth = 0
  for (let index = start; index < limit; index++) {
    const char = source[index]
    if (char === '"' || char === "'") index = stringEnd(source, index)
    else if (char === "(") depth++
    else if (char === ")") depth--
    else if ((char === ";" || char === "}") && depth === 0) return index
  }
  return limit
}

function stringEnd(source: string, start: number): number {
  const quote = source[start]
  for (let index = start + 1; index < source.length; index++) {
    if (source[index] === "\\") index++
    else if (source[index] === quote) return index
  }
  return source.length
}

function scanBlocks(source: string): SourceBlock[] {
  const root: SourceBlock[] = []
  const stack: SourceBlock[] = []
  let preludeStart = 0
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2)
      index = end === -1 ? source.length : end + 1
      continue
    }
    if (char === '"' || char === "'") {
      index = stringEnd(source, index)
      continue
    }
    if (char === "{") {
      const prelude = source
        .slice(preludeStart, index)
        .replaceAll(/\/\*[\s\S]*?\*\//g, "")
        .trim()
      const block: SourceBlock = {
        start: preludeStart,
        prelude,
        bodyStart: index + 1,
        bodyEnd: source.length,
        children: []
      }
      ;(stack.at(-1)?.children ?? root).push(block)
      stack.push(block)
      preludeStart = index + 1
    } else if (char === "}") {
      const block = stack.pop()
      if (block) block.bodyEnd = index
      preludeStart = index + 1
    } else if (char === ";") {
      preludeStart = index + 1
    }
  }
  return root
}
