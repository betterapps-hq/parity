import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import { packageManifest, parseManifest } from "./adapters.ts"
import { CodedError, errorDetails } from "./errors.ts"
import {
  checkData,
  fileObject,
  finiteNumber,
  type InvalidData,
  jsonText,
  nonBlankString,
  onInvalidData,
  parseData,
  parseInput,
  plainObject
} from "./schema.ts"

function thrown(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error("Expected it to throw")
}

const node = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("layout"), id: z.string(), children: z.array(z.unknown()) }),
  z.strictObject({ type: z.literal("text"), id: z.string(), text: z.string() })
])

describe("parseData", () => {
  it("returns what the schema reads", () => {
    expect(parseData(z.object({ name: nonBlankString }), { name: " Card " })).toEqual({ name: "Card" })
  })

  it("throws a TypeError naming the first problem by its JSON pointer, in the words of core's old validate.ts", () => {
    const fails = (schema: z.ZodType, value: unknown) => () => parseData(schema, value)
    expect(fails(plainObject, [])).toThrow(new TypeError("/: expected an object"))
    expect(fails(z.object({ list: z.array(z.object({ on: z.boolean() })) }), { list: [{ on: 1 }] })).toThrow(
      "/list/0/on: expected true or false"
    )
    expect(fails(z.object({ count: finiteNumber }), { count: Number.NaN })).toThrow("/count: expected a number")
    expect(fails(z.object({ align: z.enum(["start", "end"]) }), { align: "middle" })).toThrow(
      '/align: expected one of "start", "end"'
    )
    expect(fails(node, { type: "text", id: "a", text: "Hi", size: 3 })).toThrow("/size: unknown property")
    expect(fails(z.object({ name: nonBlankString }), { name: "  " })).toThrow("/name: can't be blank")
    expect(fails(z.object({ gap: z.number().min(0) }), { gap: -1 })).toThrow("/gap: expected at least 0")
  })

  it("starts its pointers where the value sits, and escapes keys as JSON pointers do", () => {
    expect(() => parseData(node, { type: "text", id: "a", text: 3 }, "/containers/0/root")).toThrow(
      "/containers/0/root/text: expected a string"
    )
    expect(() => parseData(z.record(z.string(), z.number()), { "a/b~c": "1" })).toThrow("/a~1b~0c: expected a number")
  })

  it("says which kinds a union takes, or follows the option that came closest", () => {
    expect(() => parseData(node, { type: "image" })).toThrow('/type: expected one of "layout", "text"')
    expect(() => parseData(z.union([z.string(), z.number()]), true)).toThrow("/: expected a string or a number")
    const either = z.union([
      z.object({ kind: z.literal("size"), width: z.number() }),
      z.object({ kind: z.literal("ratio"), ratio: z.number() })
    ])
    expect(() => parseData(either, { kind: "ratio", ratio: "16/9" })).toThrow("/ratio: expected a number")
  })

  it("passes over an option for another type of value, however few issues it has", () => {
    const length = z.union([z.string(), z.object({ value: z.number(), unit: z.string() })])
    expect(() => parseData(length, { value: "1" })).toThrow("/value: expected a number")
  })

  it("keeps a message the schema gives itself", () => {
    expect(() => parseData(z.object({ id: z.string("expected the design's id") }), {})).toThrow(
      "/id: expected the design's id"
    )
  })
})

describe("parseInput", () => {
  it("throws invalid_input with the pointer as the field at fault", () => {
    const edits = z.object({ edits: z.array(z.object({ find: z.string() })) })
    const error = thrown(() => parseInput(edits, { edits: [{ find: 1 }] }))
    expect(error).toBeInstanceOf(CodedError)
    expect(error).toHaveProperty("message", "/edits/0/find: expected a string")
    expect(errorDetails(error)).toEqual({ code: "invalid_input", retryable: false, field: "edits/0/find" })
    expect(errorDetails(thrown(() => parseInput(edits, null)))).toEqual({ code: "invalid_input", retryable: false })
  })
})

describe("fileObject", () => {
  it("refuses keys it doesn't know, and leaves out keys set to undefined, as JSON does", () => {
    const size = fileObject({ width: finiteNumber.optional(), height: finiteNumber.optional() })
    expect(() => parseData(size, { width: 400, depth: 2 })).toThrow("/depth: unknown property")
    const read = parseData(size, { width: 400, height: undefined })
    expect(read).toEqual({ width: 400 })
    expect(read).not.toHaveProperty("height")
  })
})

describe("checkData", () => {
  it("returns the first problem rather than throwing it, for a caller that words it its own way", () => {
    const edits = z.object({ edits: z.array(z.object({ find: z.string("find it") })) })
    expect(checkData(edits, { edits: [{ find: "a" }] })).toEqual({ success: true, data: { edits: [{ find: "a" }] } })
    expect(checkData(edits, { edits: [{}] }, "/request")).toEqual({
      success: false,
      problem: { pointer: "/request/edits/0/find", message: "find it" }
    })
  })
})

describe("jsonText", () => {
  it("parses JSON text, then checks it", () => {
    const entry = jsonText(z.object({ port: z.number() }))
    expect(entry.parse('{"port":5310}')).toEqual({ port: 5310 })
    expect(() => parseData(entry, "{")).toThrow("/: expected JSON")
    expect(() => parseData(entry, '{"port":"5310"}')).toThrow("/port: expected a number")
  })
})

describe("packageManifest", () => {
  it("checks the fields adapters read and passes the rest through", () => {
    const manifest = { name: "app", dependencies: { react: "^19.0.0" }, private: true }
    expect(parseData(packageManifest, manifest)).toEqual(manifest)
    expect(() => parseData(packageManifest, { scripts: { dev: 1 } })).toThrow("/scripts/dev: expected a string")
  })

  it("reads exports as Node writes them: subpaths, nested conditions, fallback lists and private paths", () => {
    const exports = {
      ".": { types: "./dist/index.d.ts", import: { node: "./dist/node.js", default: "./dist/index.js" } },
      "./styles/*": ["./dist/*.css", "./src/*.css"],
      "./internal/*": null
    }
    expect(parseData(packageManifest, { exports }).exports).toEqual(exports)
    expect(parseData(packageManifest, { exports: "./index.js" }).exports).toBe("./index.js")
    expect(() => parseData(packageManifest, { exports: { ".": { import: 1 } } })).toThrow("/exports")
  })

  it("reads bin, repository and packageManager in either form a package writes them", () => {
    const tool = { bin: "./cli.js", repository: "github:acme/ui", packageManager: "pnpm@10.4.0" }
    expect(parseData(packageManifest, tool)).toEqual(tool)
    const multi = { bin: { acme: "./cli.js" }, repository: { type: "git", url: "https://github.com/acme/ui.git" } }
    expect(parseData(packageManifest, multi)).toEqual(multi)
  })

  it("names the file and the field of the wrong type", () => {
    expect(parseManifest('{"name":"app","version":"1.0.0"}', "/app/package.json")).toEqual({
      name: "app",
      version: "1.0.0"
    })
    expect(() => parseManifest('{"bin":["./cli.js"]}', "/app/package.json")).toThrow(
      "/app/package.json: /bin: expected a string or an object"
    )
    expect(() => parseManifest('{"repository":{"url":1}}', "/app/package.json")).toThrow(
      "/app/package.json: /repository/url: expected a string"
    )
    expect(() => parseManifest("{", "/app/package.json")).toThrow("/app/package.json: /: expected JSON")
  })
})

describe("onInvalidData", () => {
  it("is told of each failed check, with the schema's name, its problems and the data", () => {
    const failures: InvalidData[] = []
    const stop = onInvalidData((failure) => failures.push(failure))
    const port = z.number().meta({ id: "port" })
    expect(checkData(port, "80").success).toBe(false)
    expect(() => parseInput(port, "81")).toThrow(CodedError)
    expect(parseData(port, 82)).toBe(82)
    stop()
    expect(() => parseData(port, "83")).toThrow(TypeError)
    expect(failures.map(({ schema, problem, value }) => ({ schema, problem, value }))).toEqual([
      { schema: "port", problem: { pointer: "", message: "expected a number" }, value: "80" },
      { schema: "port", problem: { pointer: "", message: "expected a number" }, value: "81" }
    ])
    expect(failures[0]?.issues).toHaveLength(1)
  })

  it("names a schema by its description when it has no id, and a listener that throws changes nothing", () => {
    const names: string[] = []
    const stop = onInvalidData((failure) => {
      names.push(failure.schema)
      throw new Error("The listener broke")
    })
    expect(() => parseData(z.string().describe("A name"), 1)).toThrow("/: expected a string")
    stop()
    expect(names).toEqual(["A name"])
  })
})
