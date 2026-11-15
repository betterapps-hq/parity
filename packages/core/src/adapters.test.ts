import { describe, expect, it } from "vite-plus/test"
import { type DetectContext, detectPeers, extensionEntities, extensionTool, peerVersions } from "./adapters.ts"

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

describe("extensionEntities (PAR-1131)", () => {
  const docs = {
    peerDependencies: { "docs-kit": "^2.0.0" },
    parity: {
      prefix: "docs",
      displayName: "Docs",
      versions: { scope: "@docs-kit/" },
      contributes: { providers: { entities: { watches: ["docs/main.ts", "docs/main.js"] } } }
    }
  }

  const project = (dependencies: Record<string, string>, files: Record<string, string> = {}): DetectContext => ({
    root: "/shop",
    pkg: { dependencies },
    read: async (path) => files[path]
  })

  it("finds the tool by a peer dependency or its scope, with the first watched config that's there", async () => {
    const detect = extensionEntities(docs)!.detect

    expect(await detect(project({ "docs-kit": "2.1.0" }, { "docs/main.js": "" }))).toEqual({
      found: true,
      config: "docs/main.js",
      summary: "docs-kit in package.json, config docs/main.js"
    })
    expect(await detect(project({ "@docs-kit/react": "2.1.0" }))).toEqual({
      found: true,
      summary: "@docs-kit/react in package.json"
    })
  })

  it("doesn't find it without one of its packages, and gives nothing without an entities provider", async () => {
    expect(await extensionEntities(docs)!.detect(project({ react: "19.0.0" }, { "docs/main.ts": "" }))).toEqual({
      found: false,
      summary: "No docs-kit or @docs-kit/* package in package.json"
    })
    expect(extensionEntities({ ...docs, parity: { ...docs.parity, contributes: {} } })).toBeUndefined()
  })
})
