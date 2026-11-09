import { describe, expect, it } from "vite-plus/test"
import {
  desktopDataFolder,
  readSavedTelemetry,
  resolveTelemetry,
  telemetryEnvironment,
  telemetryLevel
} from "./settings.ts"

describe("telemetryLevel", () => {
  it("sends everything unless asked otherwise", () => {
    expect(telemetryLevel({})).toBe("all")
    expect(telemetryLevel({ PARITY_TELEMETRY: "" })).toBe("all")
  })

  it("takes PARITY_TELEMETRY in any case", () => {
    expect(telemetryLevel({ PARITY_TELEMETRY: " OFF " })).toBe("off")
    expect(telemetryLevel({ PARITY_TELEMETRY: "all" }, "off")).toBe("all")
  })

  it("turns off for DO_NOT_TRACK, whatever PARITY_TELEMETRY says", () => {
    expect(telemetryLevel({ DO_NOT_TRACK: "1", PARITY_TELEMETRY: "all" })).toBe("off")
    expect(telemetryLevel({ DO_NOT_TRACK: "true" })).toBe("off")
    expect(telemetryLevel({ DO_NOT_TRACK: "0" })).toBe("all")
  })

  it("never sends from unit tests", () => {
    expect(telemetryLevel({ VITEST: "true", PARITY_TELEMETRY: "all" })).toBe("off")
  })

  it("refuses a value that isn't a level, rather than guessing", () => {
    expect(() => telemetryLevel({ PARITY_TELEMETRY: "of" })).toThrow('PARITY_TELEMETRY is "of"; expected all or off')
    expect(() => telemetryLevel({ PARITY_TELEMETRY: "errors" })).toThrow("expected all or off")
  })
})

describe("resolveTelemetry", () => {
  it("sends only errors and reports from CI, at whatever level", () => {
    expect(resolveTelemetry({ CI: "true" })).toEqual({ level: "all", setting: "all", errorsOnly: true })
    expect(resolveTelemetry({ CI: "1", PARITY_TELEMETRY: "all" }, "off")).toMatchObject({
      level: "all",
      errorsOnly: true
    })
    expect(resolveTelemetry({ CI: "false" })).not.toHaveProperty("errorsOnly")
    expect(resolveTelemetry({})).not.toHaveProperty("errorsOnly")
  })

  it("uses the saved setting when no variable asks otherwise", () => {
    expect(resolveTelemetry({}, "off")).toEqual({ level: "off", setting: "off" })
  })

  it("says which variable overrides the setting", () => {
    expect(resolveTelemetry({ PARITY_TELEMETRY: "all" }, "off")).toEqual({
      level: "all",
      setting: "off",
      overriddenBy: "PARITY_TELEMETRY"
    })
    expect(resolveTelemetry({ DO_NOT_TRACK: "1", PARITY_TELEMETRY: "all" }, "all")).toEqual({
      level: "off",
      setting: "all",
      overriddenBy: "DO_NOT_TRACK"
    })
    expect(resolveTelemetry({ VITEST: "true" }, "all").overriddenBy).toBe("VITEST")
  })
})

describe("readSavedTelemetry", () => {
  const id = "0b8f4c3e-2d1a-4f6b-9c7e-5a4d3b2c1e0f"

  it("reads the level and install ID", () => {
    expect(readSavedTelemetry(JSON.stringify({ level: "off", installId: id }))).toEqual({ level: "off", installId: id })
  })

  it("treats a missing, unreadable or unknown value as unset, keeping what does read", () => {
    expect(readSavedTelemetry(undefined)).toEqual({ level: "all" })
    expect(readSavedTelemetry("{not json")).toEqual({ level: "all" })
    expect(readSavedTelemetry("[]")).toEqual({ level: "all" })
    expect(readSavedTelemetry(JSON.stringify({ level: "errors", installId: id }))).toEqual({
      level: "all",
      installId: id
    })
    expect(readSavedTelemetry(JSON.stringify({ level: "off", installId: "mine" }))).toEqual({ level: "off" })
  })
})

describe("desktopDataFolder", () => {
  it("finds the app's folder where Electron's appData folder is on each system", () => {
    const windows = { platform: "win32", env: { APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, home: "C:\\Users\\a" }
    expect(desktopDataFolder(windows)).toBe("C:\\Users\\a\\AppData\\Roaming\\@parity\\desktop")
    expect(desktopDataFolder({ platform: "darwin", env: {}, home: "/Users/a" })).toBe(
      "/Users/a/Library/Application Support/@parity/desktop"
    )
    expect(desktopDataFolder({ platform: "linux", env: {}, home: "/home/a" })).toBe("/home/a/.config/@parity/desktop")
    expect(desktopDataFolder({ platform: "linux", env: { XDG_CONFIG_HOME: "/cfg" }, home: "/home/a" })).toBe(
      "/cfg/@parity/desktop"
    )
  })

  it("follows PARITY_USER_DATA to another copy's folder", () => {
    expect(desktopDataFolder({ platform: "linux", env: { PARITY_USER_DATA: "/tmp/copy" }, home: "/home/a" })).toBe(
      "/tmp/copy"
    )
  })
})

describe("telemetryEnvironment", () => {
  it("names the published app and CLI release, and any other installed build a preview", () => {
    expect(telemetryEnvironment({}, { installed: true, published: true })).toBe("release")
    expect(telemetryEnvironment({}, { installed: true, published: false })).toBe("preview")
  })

  it("names a checkout development, and a run in CI ci, whatever the build", () => {
    expect(telemetryEnvironment({}, { installed: false, published: false })).toBe("development")
    expect(telemetryEnvironment({ CI: "true" }, { installed: true, published: true })).toBe("ci")
    expect(telemetryEnvironment({ CI: "true" }, { installed: true, published: false })).toBe("ci")
  })

  it("doesn't count CI set to false", () => {
    expect(telemetryEnvironment({ CI: "false" }, { installed: false, published: false })).toBe("development")
    expect(telemetryEnvironment({ CI: "" }, { installed: true, published: false })).toBe("preview")
  })
})
