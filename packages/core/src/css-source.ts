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

export interface SetPropertyOptions {
  /** Blocks the property may live in, by prelude (`:root`, `.dark`, `@theme`). A prelude matches if any of its comma-separated parts does. */
  blocks: string[]
  /** Where to add the property when no matching block declares it: an existing block of this prelude, else a new one. */
  create: string
}

/**
 * Sets a custom property in a stylesheet's source, keeping everything else (comments, order, formatting) as written.
 * Replaces an existing declaration in one of the given blocks, else adds it to the block named by `create`.
 */
export function setCustomProperty(source: string, name: string, value: string, options: SetPropertyOptions): string {
  const blocks = flatten(scanBlocks(source))
  const matches = (block: SourceBlock, preludes: string[]) => {
    const parts = block.prelude.split(",").map((part) => normalize(part))
    return preludes.some(
      (prelude) => parts.includes(normalize(prelude)) || normalize(block.prelude) === normalize(prelude)
    )
  }

  for (const block of blocks.filter((candidate) => matches(candidate, options.blocks))) {
    const declaration = findDeclaration(source, block, name)
    if (declaration) return source.slice(0, declaration.valueStart) + value + source.slice(declaration.valueEnd)
  }

  const target = blocks.find((candidate) => matches(candidate, [options.create]))
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

function normalize(text: string): string {
  return text.trim().replaceAll(/\s+/g, " ")
}

function flatten(blocks: SourceBlock[]): SourceBlock[] {
  return blocks.flatMap((block) => [block, ...flatten(block.children)])
}

/** Finds `--name: value` directly inside a block (not in nested blocks). */
function findDeclaration(
  source: string,
  block: SourceBlock,
  name: string
): { valueStart: number; valueEnd: number } | undefined {
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
      return { valueStart, valueEnd: trimmed }
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
