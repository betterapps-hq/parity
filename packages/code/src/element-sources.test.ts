import ts from "typescript"
import { describe, expect, it } from "vite-plus/test"
import { hasElementSources, tagElementSources } from "./index.ts"

const card = [
  'import { Button } from "./button"',
  "",
  "export function Card<T,>({ title }: { title: T }) {",
  "  return (",
  '    <div className="card">',
  "      <h2>{String(title)}</h2>",
  "      <Button>Open</Button>",
  "      <motion.div />",
  "      <>",
  '        <img alt="" />',
  "      </>",
  "    </div>",
  "  )",
  "}",
  ""
].join("\n")

/** The props each element is created with, from TypeScript's own JSX transform. */
function compiled(code: string): string {
  return ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ESNext } })
    .outputText
}

describe("tagElementSources", () => {
  it("gives each element written for the page its file, line and column", () => {
    const output = compiled(tagElementSources(card, "src/card.tsx")?.code ?? "")
    expect(output).toContain('_jsxs("div", { "data-parity-source": "src/card.tsx:5:5", className: "card"')
    expect(output).toContain('_jsx("h2", { "data-parity-source": "src/card.tsx:6:7"')
    expect(output).toContain('_jsx("img", { "data-parity-source": "src/card.tsx:10:9", alt: ""')
  })

  it("leaves a component's own elements, fragments and closing tags alone", () => {
    const tagged = tagElementSources(card, "src/card.tsx")?.code ?? ""
    expect(tagged.match(/data-parity-source/g)).toHaveLength(3)
    expect(tagged).toContain("<Button>Open</Button>")
    expect(tagged).toContain("<motion.div />")
    expect(tagged).toContain("</h2>")
  })

  it("gives nothing for a file with nothing to tag, or one tagged already", () => {
    expect(tagElementSources("export const one = 1 < 2", "src/one.tsx")).toBeUndefined()
    expect(tagElementSources("export const a = <Button />", "src/a.tsx")).toBeUndefined()
    const once = tagElementSources(card, "src/card.tsx")?.code ?? ""
    expect(tagElementSources(once, "src/card.tsx")).toBeUndefined()
  })

  it("reads plain JSX in a .jsx file", () => {
    const tagged = tagElementSources("export const A = () => <p>hi</p>\n", "src/a.jsx")
    expect(tagged?.code).toBe('export const A = () => <p data-parity-source={"src/a.jsx:1:24"}>hi</p>\n')
  })

  it("maps each line of the tagged code back to the file", () => {
    const tagged = tagElementSources(card, "src/card.tsx")
    expect(tagged?.map).toMatchObject({ version: 3, sources: ["src/card.tsx"], sourcesContent: [card] })
    const generated = (tagged?.code ?? "").split("\n")
    const original = card.split("\n")
    const lines = decode(tagged?.map.mappings ?? "")
    expect(lines).toHaveLength(original.length)
    // From each segment to the next, the generated text is the original text it maps to, and then any attribute added.
    for (const [index, segments] of lines.entries()) {
      for (const [at, segment] of segments.entries()) {
        const until = segments[at + 1]?.generated ?? generated[index]?.length ?? 0
        const piece = (generated[index]?.slice(segment.generated, until) ?? "").replace(
          / data-parity-source=\{"[^"]*"\}$/,
          ""
        )
        expect(segment.line).toBe(index)
        expect(original[index]?.slice(segment.column, segment.column + piece.length)).toBe(piece)
      }
      const last = segments.at(-1)
      expect((original[index]?.length ?? 0) - (last?.column ?? 0)).toBe(
        (generated[index]?.length ?? 0) - (last?.generated ?? 0)
      )
    }
  })
})

describe("hasElementSources", () => {
  it("is for .tsx and .jsx files, whatever the query", () => {
    expect(["a.tsx", "a.jsx", "a.tsx?v=1", "a.ts", "a.js", "a.css"].map(hasElementSources)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false
    ])
  })
})

const digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/** A source map's mappings, read back: each line's segments, with their generated column and original line and column. */
function decode(mappings: string): { generated: number; line: number; column: number }[][] {
  let line = 0
  let column = 0
  return mappings.split(";").map((text) => {
    let generated = 0
    return text.split(",").map((segment) => {
      const values: number[] = []
      let value = 0
      let shift = 0
      for (const char of segment) {
        const digit = digits.indexOf(char)
        value += (digit & 31) << shift
        shift += 5
        if (digit & 32) continue
        values.push(value & 1 ? -(value >> 1) : value >> 1)
        value = 0
        shift = 0
      }
      generated += values[0] ?? 0
      line += values[2] ?? 0
      column += values[3] ?? 0
      return { generated, line, column }
    })
  })
}
