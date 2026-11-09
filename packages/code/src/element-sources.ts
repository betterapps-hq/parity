import { elementSourceAttribute, formatElementSource } from "@parity-app/core"
import ts from "typescript"

/** A source map, version 3, for one file. */
export interface SourceMap {
  version: 3
  sources: string[]
  sourcesContent: string[]
  names: string[]
  mappings: string
}

/** Whether a file holds JSX whose elements get their source: `.tsx` and `.jsx`. */
export function hasElementSources(file: string): boolean {
  return /\.[jt]sx$/.test(file.split("?")[0] ?? "")
}

/**
 * Gives each element a component's JSX writes for the page, such as `<button>` or `<div>`, its place in the file (see
 * core's `elementSourceAttribute`), with a source map, for the development guest (PAR-167). `path` is the file from the
 * project root. A component's own element, such as `<Button>` or `<motion.div>`, gets none: it passes props on, so the
 * element it draws would take its caller's line over its own. Gives nothing when there's nothing to tag.
 */
export function tagElementSources(text: string, path: string): { code: string; map: SourceMap } | undefined {
  if (!text.includes("<")) {
    return undefined
  }

  const kind = path.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, kind)
  const inserts: { at: number; text: string }[] = []

  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && writesForThePage(node)) {
      const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file))
      const value = formatElementSource({ path, line: line + 1, column: character + 1 })
      inserts.push({ at: node.tagName.end, text: ` ${elementSourceAttribute}={${JSON.stringify(value)}}` })
    }

    ts.forEachChild(node, visit)
  }

  visit(file)

  if (inserts.length === 0) {
    return undefined
  }

  inserts.sort((a, b) => a.at - b.at)
  let code = ""
  let from = 0

  for (const insert of inserts) {
    code += text.slice(from, insert.at) + insert.text
    from = insert.at
  }

  code += text.slice(from)

  return {
    code,
    map: { version: 3, sources: [path], sourcesContent: [text], names: [], mappings: mappings(file, inserts) }
  }
}

/** A lowercase tag, as `div` or `my-element`, that hasn't been given the attribute already. */
function writesForThePage(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): boolean {
  if (!ts.isIdentifier(node.tagName) || !/^[a-z]/.test(node.tagName.text)) {
    return false
  }

  return !node.attributes.properties.some(
    (property) =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === elementSourceAttribute
  )
}

/**
 * The map from the tagged code back to the file. Lines don't move, so each line maps its start, and after each insert,
 * the column it moved to back to where it was.
 */
function mappings(file: ts.SourceFile, inserts: { at: number; text: string }[]): string {
  const starts = file.getLineStarts()
  let previousLine = 0
  let previousColumn = 0
  let next = 0
  const lines: string[] = []

  for (let line = 0; line < starts.length; line++) {
    const start = starts[line] ?? 0
    const end = starts[line + 1] ?? Infinity
    const segments: [generated: number, original: number][] = [[0, 0]]
    let shift = 0

    for (; next < inserts.length && (inserts[next]?.at ?? Infinity) < end; next++) {
      const insert = inserts[next]

      if (!insert) {
        break
      }

      shift += insert.text.length
      segments.push([insert.at - start + shift, insert.at - start])
    }

    let previousGenerated = 0
    lines.push(
      segments
        .map(([generated, original]) => {
          const segment =
            vlq(generated - previousGenerated) + vlq(0) + vlq(line - previousLine) + vlq(original - previousColumn)

          previousGenerated = generated
          previousLine = line
          previousColumn = original

          return segment
        })
        .join(",")
    )
  }

  return lines.join(";")
}

const base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/** A number in a source map's base64 VLQ. */
function vlq(value: number): string {
  let rest = value < 0 ? (-value << 1) | 1 : value << 1
  let out = ""

  do {
    let digit = rest & 31
    rest >>>= 5

    if (rest > 0) {
      digit |= 32
    }

    out += base64.charAt(digit)
  } while (rest > 0)

  return out
}
