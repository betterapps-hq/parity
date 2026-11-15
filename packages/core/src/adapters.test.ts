import { describe, expect, it } from "vite-plus/test"
import { detectPeers, extensionTool, peerVersions } from "./adapters.ts"

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

describe("extensionTool (PAR-1095)", () => {
  const tool = (providers: { styles?: Record<string, never>; router?: Record<string, never> }) =>
    extensionTool({
      peerDependencies: { tailwindcss: "^4.0.0" },
      parity: { prefix: "tailwind", displayName: "Tailwind CSS", contributes: { providers } }
    })

  // Detection lists the styling framework before Storybook and other tools after, as it did before they were extensions.
  it("says whether the tool styles the project, from the providers its manifest declares", () => {
    expect(tool({ styles: {} })).toMatchObject({ id: "tailwind", name: "Tailwind CSS", styles: true })
    expect(tool({ router: {} })?.styles).toBe(false)
  })

  it("gives nothing for an extension without peer dependencies", () => {
    expect(extensionTool({ parity: { prefix: "none", displayName: "None" } })).toBeUndefined()
  })
})
