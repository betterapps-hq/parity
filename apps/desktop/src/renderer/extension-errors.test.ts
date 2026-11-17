import type { ExtensionsSnapshot } from "@parity-app/extension-host/window-snapshot"
import { describe, expect, it } from "vite-plus/test"
import { extensionsAttachment, extensionTitled, setExtensionsSnapshot } from "./extension-errors.ts"

const snapshot: ExtensionsSnapshot = {
  tabs: [
    {
      tab: "project-1",
      extensions: [
        {
          id: "@parity-app/extension-multiplayer",
          version: "0.1.0",
          displayName: "Multiplayer",
          halves: { window: "active", node: "ready" },
          capabilities: ["canvas", "sync"],
          layers: ["multiplayer.pointers"],
          previews: 0,
          holds: 0,
          failures: [{ api: "presence.onPointer", message: "token sk-live-1234", at: 1 }],
          room: { state: "attached", lineage: "l-1", writesFiles: true, pending: false, versionBytes: 12, peers: 1 }
        }
      ]
    }
  ]
}

describe("what an editor window error says about extensions (PAR-1283)", () => {
  it("attaches extensions.json, scrubbed, while a window module runs, and nothing otherwise", () => {
    setExtensionsSnapshot(() => ({ tabs: [] }))

    expect(extensionsAttachment((value) => value)).toBeUndefined()

    setExtensionsSnapshot(() => snapshot)
    const scrub = <T>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll("sk-live-1234", "[Filtered]"))
    const attachment = extensionsAttachment(scrub)

    expect(attachment).toMatchObject({ filename: "extensions.json", contentType: "application/json" })
    expect(JSON.parse(attachment?.data ?? "")).toEqual(scrub(snapshot))
  })

  it("leaves extensions.json off rather than failing the error when it can't be made", () => {
    setExtensionsSnapshot(() => {
      throw new Error("A tab went away")
    })

    expect(extensionsAttachment((value) => value)).toBeUndefined()
  })

  it("starts the issue's title with the extension's name, once", () => {
    const event = { exception: { values: [{ type: "Error" }, { type: "TypeError", value: "x is undefined" }] } }
    const titled = extensionTitled(event, "Multiplayer")

    expect(titled.exception.values).toEqual([
      { type: "Error" },
      { type: "Multiplayer: TypeError", value: "x is undefined" }
    ])
    expect(extensionTitled(titled, "Multiplayer")).toBe(titled)
    const bare = { exception: {} }

    expect(extensionTitled(bare, "Multiplayer")).toBe(bare)
  })
})
