import { describe, expect, it } from "vite-plus/test"
import {
  connectorById,
  connectorNamed,
  connectors,
  keysFromEnvironment,
  keyVariable,
  offered,
  withoutKeys
} from "./index.ts"

describe("connectors", () => {
  it("each has its own id and key variable", () => {
    const ids = connectors.map(({ info }) => info.id)
    const variables = connectors.flatMap(({ info }) => (info.auth.type === "key" ? [info.auth.variable] : []))

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(variables).size).toBe(variables.length)
    expect(variables.every((name) => keyVariable.test(name))).toBe(true)
  })

  it("offers Pixabay for photos and keeps Unsplash to name what came from it", () => {
    expect(offered.map(({ info }) => info.id)).toEqual(["mobbin", "pixabay"])
    expect(offered.every((connector) => connectors.includes(connector))).toBe(true)
    expect(connectorById("unsplash")?.info.name).toBe("Unsplash")
    expect(connectorById("nothing")).toBeUndefined()
    expect(connectorNamed("Pixabay")?.info.id).toBe("pixabay")
  })

  it("reads each connector's key from the variable it names, leaving blank ones unset", () => {
    expect(
      keysFromEnvironment({ PARITY_MOBBIN_API_KEY: " m ", PARITY_UNSPLASH_ACCESS_KEY: "", OTHER_KEY: "x" })
    ).toEqual({ mobbin: "m" })
  })

  it("takes every connector's key out of an environment, and leaves the rest", () => {
    expect(
      withoutKeys({ PARITY_MOBBIN_API_KEY: "m", parity_unsplash_access_key: "u", PARITY_NEXT_KEY: "n", PATH: "/bin" })
    ).toEqual({
      PATH: "/bin"
    })
  })
})
