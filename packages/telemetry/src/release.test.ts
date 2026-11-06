import { describe, expect, it } from "vite-plus/test"
import { telemetryRelease } from "./release.ts"

const commit = "57f8d30c3d1f0a9b8e7c6d5e4f3a2b1c0d9e8f7a"

describe("telemetryRelease", () => {
  it("names an installed build by its version, whatever commit it came from", () => {
    expect(telemetryRelease({ project: "parity-desktop", version: "0.21.0", environment: "tester", commit })).toBe(
      "parity-desktop@0.21.0"
    )
  })

  it("names development and CI builds by their commit", () => {
    expect(telemetryRelease({ project: "parity-desktop", version: "0.21.0", environment: "ci", commit })).toBe(commit)
    expect(
      telemetryRelease({
        project: "parity-cli",
        version: "1.2.0",
        environment: "development",
        commit: ` ${commit.toUpperCase()}\n`
      })
    ).toBe(commit)
  })

  it("keeps a build without a known commit out of the published version's release", () => {
    expect(telemetryRelease({ project: "parity-desktop", version: "0.21.0", environment: "development" })).toBe(
      "parity-desktop@0.21.0+development"
    )
    expect(
      telemetryRelease({ project: "parity-desktop", version: "0.21.0", environment: "ci", commit: "57f8d30" })
    ).toBe("parity-desktop@0.21.0+ci")
  })
})
