import { describe, expect, it } from "vite-plus/test"
import { TelemetrySetting } from "./telemetry-setting.ts"

const first = "0b8f4c3e-2d1a-4f6b-9c7e-5a4d3b2c1e0f"
const second = "7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d"

/** A setting over an in-memory file, which hands out `first` then `second` as new IDs. */
function setup(file: string | undefined, env = {}) {
  const disk = { file }
  const ids = [first, second]

  const setting = new TelemetrySetting({
    env,
    read: () => disk.file,
    save: (text) => {
      disk.file = text
    },
    newId: () => ids.shift() ?? "none-left"
  })

  return { setting, disk }
}

describe("TelemetrySetting", () => {
  it("makes and saves an install ID on the first run, sending everything", () => {
    const { setting, disk } = setup(undefined)
    expect(setting.get()).toEqual({ level: "all", setting: "all", installId: first })
    expect(JSON.parse(disk.file ?? "")).toEqual({ level: "all", installId: first })
  })

  it("keeps the saved level and ID on later runs", () => {
    const { setting } = setup(JSON.stringify({ level: "off", installId: second }))
    expect(setting.get()).toEqual({ level: "off", setting: "off", installId: second })
  })

  it("saves the choice under a variable, which still decides this run", () => {
    const { setting } = setup(undefined, { PARITY_TELEMETRY: "all" })
    expect(setting.setLevel("off")).toEqual({
      level: "all",
      setting: "off",
      overriddenBy: "PARITY_TELEMETRY",
      installId: second
    })
  })

  it("saves turning off at once, with a new install ID kept when turned on again", () => {
    const { setting, disk } = setup(undefined)
    expect(setting.setLevel("off")).toEqual({ level: "off", setting: "off", installId: second })
    expect(setting.setLevel("all").installId).toBe(second)
    expect(JSON.parse(disk.file ?? "")).toEqual({ level: "all", installId: second })
  })

  it("keeps the old value when the file can't be written, and says so", () => {
    const setting = new TelemetrySetting({
      env: {},
      read: () => undefined,
      save: () => {
        throw new Error("read-only")
      },
      newId: () => first
    })

    expect(setting.get().installId).toBe(first)
    expect(() => setting.setLevel("off")).toThrow("read-only")
    expect(setting.get().setting).toBe("all")
  })
})
