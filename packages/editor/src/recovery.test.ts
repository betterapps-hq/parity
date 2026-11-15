import { describe, expect, it } from "vite-plus/test"
import { readRecoveryCopy, type RecoveryCopy } from "./recovery.ts"

/** A copy written to its file and read back, as the next run reads it: as JSON, not a clone, since that's how it's kept. */
const throughFile = (copy: RecoveryCopy | undefined) => readRecoveryCopy(JSON.parse(JSON.stringify(copy) ?? "null"))

describe("readRecoveryCopy", () => {
  it("reads a copy back, and nothing from a file that isn't one", () => {
    const copy: RecoveryCopy = {
      version: 1,
      keptAt: 1,
      documents: [
        {
          path: "app.par",
          document: {
            version: 4,
            containers: [
              {
                id: "home",
                name: "Home page",
                position: { x: 0, y: 0 },
                root: { type: "layout", id: "root", children: [] }
              }
            ]
          }
        },
        { path: "old.par", document: null }
      ],
      tokens: [{ name: "--primary", theme: "light", value: "#f00", original: "#000" }]
    }

    expect(throughFile(copy)).toEqual(copy)
    expect(readRecoveryCopy({ version: 2 })).toBeUndefined()
    expect(readRecoveryCopy("not json")).toBeUndefined()
  })
})
