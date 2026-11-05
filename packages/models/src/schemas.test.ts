import { describe, expect, it } from "vite-plus/test"
import { type LensModelName, lensModelJsonSchema, lensModels } from "./schemas.ts"

const names = Object.keys(lensModels) as LensModelName[]

describe("lens model JSON Schemas", () => {
  it.each(names)("names %s's version in its id and its version field", (name) => {
    const schema = lensModelJsonSchema(name)
    const { version } = lensModels[name]
    expect(schema.$id).toBe(`urn:parity:model:${name}:${version}`)
    expect(schema).toMatchObject({ properties: { version: { const: version } } })
    expect(schema.required).toContain("version")
  })

  it.each(names)("rejects fields %s doesn't define", (name) => {
    expect(lensModelJsonSchema(name).additionalProperties).toBe(false)
  })

  // A change here changes what adapters and agents target. If it would reject a document the version accepted, it
  // needs a new version instead.
  it.each(names)("keeps %s's schema as published", (name) => {
    expect(lensModelJsonSchema(name)).toMatchSnapshot()
  })
})
