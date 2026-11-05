import { defaultModeSettings, resolveModes } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import type { TabSnapshot } from "../shared/protocol.ts"
import { call } from "./agent.ts"

/** A tab with no designs, tokens or components: only the project's modes. */
const snapshot = {
  tab: { id: "tab-1", name: "App" },
  revision: "1",
  projectId: "project",
  guestUrl: "http://127.0.0.1/",
  components: [],
  sources: {},
  iconSets: [],
  tokens: [],
  theme: [],
  modes: defaultModeSettings,
  documents: [{ path: "app.par", document: { version: 3, containers: [] } }],
  libraryDesigns: [],
  tokenOverrides: [],
  mainDocument: "app.par",
  props: {},
  selection: {},
  viewport: { x: 0, y: 0, width: 800, height: 600, zoom: 1 },
  bounds: {},
  detection: {}
} as unknown as TabSnapshot

/** A window that answers every snapshot request with the tab above and takes presence events. */
const window = {
  request: async (method: string) => (method === "agent.snapshot" ? snapshot : undefined)
} as Parameters<typeof call>[2]

describe("get_app_state", () => {
  it("marks the first resolved mode primary, and only that one", async () => {
    const state = (await call("state", {}, window, undefined)) as { modes: { id: string; primary: boolean }[] }
    const resolved = resolveModes(defaultModeSettings)
    expect(resolved.length).toBeGreaterThan(1)
    expect(state.modes.map((mode) => [mode.id, mode.primary])).toEqual(
      resolved.map((mode, index) => [mode.id, index === 0])
    )
  })
})
