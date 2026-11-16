import type { JsonValue } from "@parity-app/extension"
import { readExtension } from "@parity-app/extension/manifest"
import { describe, expect, it } from "vite-plus/test"
import { detectByManifest } from "./detect.ts"

const icon = { viewBox: "0 0 24 24", path: "M0 0h24v24H0z" }

/** An extension with the `detect` and peer dependencies a test gives. */
function extension(parity: Record<string, JsonValue>, peerDependencies?: Record<string, string>) {
  return readExtension({
    name: "@acme/extension-tool",
    version: "1.0.0",
    main: "src/extension.ts",
    ...(peerDependencies && { peerDependencies }),
    parity: { displayName: "Tool", prefix: "tool", icon, activates: ["onDetect"], contributes: {}, ...parity }
  })
}

const project = { root: "/work/app", pkg: { name: "app", devDependencies: { tool: "^2.0.0" } } }

/** Where paths start, with the folders a test says are there. */
const place = (...there: string[]) => ({
  home: "/home/ada",
  variables: { TOOL_HOME: "/var/tool" },
  platform: "linux",
  exists: (path: string) => there.includes(path)
})

describe("detectByManifest (PAR-1128)", () => {
  it("finds an extension without `detect` by its peer dependencies, and not without them", () => {
    expect(detectByManifest(extension({}, { tool: "^2.0.0" }), project, place())).toEqual({})
    expect(detectByManifest(extension({}, { other: "^1.0.0" }), project, place())).toBeUndefined()
    expect(detectByManifest(extension({}), project, place())).toBeUndefined()
  })

  it("counts a peer the project lists only in its optional dependencies", () => {
    const optional = { ...project, pkg: { name: "app", optionalDependencies: { tool: "^2.0.0" } } }

    expect(detectByManifest(extension({}, { tool: "^2.0.0" }), optional, place())).toEqual({})
  })

  it("finds one by the entities Parity's detection found, and not by its peers unless it says so", () => {
    const entities = extension(
      { detect: { entities: true }, contributes: { providers: { entities: {} } } },
      { tool: "^2.0.0" }
    )

    expect(detectByManifest(entities, { ...project, entities: ["tool"] }, place())).toEqual({})
    expect(detectByManifest(entities, project, place())).toBeUndefined()
  })

  it("finds one by the first path that names something, and gives the path it found", () => {
    const paths = extension({
      detect: { paths: ["$TOOL_HOME", "~/.tool"] },
      permissions: { read: ["$TOOL_HOME/**", "~/.tool/**"] }
    })

    expect(detectByManifest(paths, project, place("/var/tool"))).toEqual({ detected: { path: "/var/tool" } })
    // The variable's folder counts while it's set, even when it isn't there.
    expect(detectByManifest(paths, project, place("/home/ada/.tool"))).toBeUndefined()
    expect(detectByManifest(paths, project, { ...place("/home/ada/.tool"), variables: {} })).toEqual({
      detected: { path: "/home/ada/.tool" }
    })
  })
})
