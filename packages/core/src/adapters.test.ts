import { describe, expect, it } from "vite-plus/test"
import { detectPeers, peerVersions } from "./adapters.ts"

describe("peerVersions", () => {
  it("names the packages that carry the version, the main one first, with its range and what the manifest adds", () => {
    expect(
      peerVersions(
        { storybook: "^9.0.0 || ^10.0.0", "@storybook/react": "^9.0.0 || ^10.0.0" },
        { scope: "@storybook/" }
      )
    ).toEqual({ packages: ["storybook", "@storybook/react"], range: "^9.0.0 || ^10.0.0", scope: "@storybook/" })
  })

  it("gives nothing without peer dependencies", () => {
    expect(peerVersions(undefined)).toBeUndefined()
    expect(peerVersions({})).toBeUndefined()
  })
})

describe("detectPeers", () => {
  const router = { packages: ["@tanstack/react-router"] }

  it("finds a tool when the project declares one of its peer dependencies, or a package in its scope", () => {
    expect(detectPeers({ dependencies: { "@tanstack/react-router": "^1.170.0" } }, router)).toEqual({
      found: true,
      summary: "@tanstack/react-router in package.json"
    })
    expect(
      detectPeers(
        { devDependencies: { "@storybook/addon-docs": "^10.0.0" } },
        { packages: ["storybook"], scope: "@storybook/" }
      )
    ).toMatchObject({ found: true })
  })

  it("says what it looked for when the project declares none", () => {
    expect(detectPeers({ dependencies: { react: "^19.0.0" } }, router)).toEqual({
      found: false,
      summary: "None of @tanstack/react-router in package.json"
    })
  })
})
