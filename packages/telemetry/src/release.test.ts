import { describe, expect, it } from "vite-plus/test"
import { telemetryRelease } from "./release.ts"

const commit = "57f8d30c3d1f0a9b8e7c6d5e4f3a2b1c0d9e8f7a"

describe("telemetryRelease", () => {
  it("names a published build by its version, whatever commit it came from", () => {
    expect(telemetryRelease({ project: "parity-desktop", version: "0.21.0", published: true, commit })).toBe(
      "parity-desktop@0.21.0"
    )
  })

  it("names every other build by its commit", () => {
    expect(telemetryRelease({ project: "parity-desktop", version: "0.21.0", published: false, commit })).toBe(commit)
    expect(
      telemetryRelease({
        project: "parity-cli",
        version: "1.2.0",
        published: false,
        commit: ` ${commit.toUpperCase()}\n`
      })
    ).toBe(commit)
  })

  it("keeps a build without a known commit out of the published version's release", () => {
    expect(telemetryRelease({ project: "parity-desktop", version: "0.21.0", published: false })).toBe(
      "parity-desktop@0.21.0+unreleased"
    )
    expect(
      telemetryRelease({ project: "parity-desktop", version: "0.21.0", published: false, commit: "57f8d30" })
    ).toBe("parity-desktop@0.21.0+unreleased")
  })
})
