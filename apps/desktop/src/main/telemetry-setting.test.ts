import { type SystemChange, type SystemSettings, withSystemChange } from "@parity-app/settings"
import { describe, expect, it } from "vite-plus/test"
import { TelemetrySetting } from "./telemetry-setting.ts"

const first = "0b8f4c3e-2d1a-4f6b-9c7e-5a4d3b2c1e0f"
const second = "7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d"

/** What the test's `settings.json` holds of main's keys, and each change made to them. */
interface Kept {
  system: SystemSettings
  changes: SystemChange[]
}

/** A setting over an in-memory `settings.json`, which hands out `first` then `second` as new IDs. */
function setup(saved: Partial<SystemSettings> = {}, env = {}, saves = true) {
  const store: Kept = { system: { diagnostics: "all", betaUpdates: false, ...saved }, changes: [] }

  const ids = [first, second]

  const setting = new TelemetrySetting({
    env,
    store: {
      system: () => store.system,
      changeSystem: (change) => {
        store.changes.push(change)
        store.system = withSystemChange(store.system, change)

        return Promise.resolve(saves)
      }
    },
    newId: () => ids.shift() ?? "none-left"
  })

  return { setting, store }
}

describe("TelemetrySetting", () => {
  it("makes an install ID on the first run, written only if the file still has none, sending everything", () => {
    const { setting, store } = setup()
    expect(setting.get()).toEqual({ level: "all", setting: "all", installId: first })
    expect(store.changes).toEqual([{ newInstallId: first }])
  })

  it("keeps the saved level and ID on later runs, and writes nothing", () => {
    const { setting, store } = setup({ diagnostics: "off", installId: second })
    expect(setting.get()).toEqual({ level: "off", setting: "off", installId: second })
    expect(store.changes).toEqual([])
  })

  it("saves the choice under a variable, which still decides this run", () => {
    const { setting } = setup({}, { PARITY_TELEMETRY: "all" })
    expect(setting.setLevel("off")).toEqual({
      level: "all",
      setting: "off",
      overriddenBy: "PARITY_TELEMETRY",
      installId: second
    })
  })

  it("saves turning off at once, with a new install ID kept when turned on again", () => {
    const { setting, store } = setup()
    expect(setting.setLevel("off")).toEqual({ level: "off", setting: "off", installId: second })
    expect(setting.setLevel("all").installId).toBe(second)
    expect(store.system).toEqual({ diagnostics: "all", betaUpdates: false, installId: second })
  })

  it("says when a new install ID couldn't be saved, for main to record (PAR-811)", async () => {
    await expect(setup({}, {}, false).setting.unsaved).resolves.toEqual({
      message: "settings.json couldn't be written"
    })
    await expect(setup().setting.unsaved).resolves.toBeUndefined()
  })
})
