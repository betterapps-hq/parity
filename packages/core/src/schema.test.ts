import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import { packageManifest } from "./adapters.ts"
import { CodedError, errorDetails } from "./errors.ts"
import { finiteNumber, jsonText, nonBlankString, parseData, parseInput, plainObject } from "./schema.ts"

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

  it("throws a TypeError naming the first problem by its JSON pointer, in validate.ts's words", () => {
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
})
