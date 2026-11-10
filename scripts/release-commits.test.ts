import { describe, expect, it } from "vite-plus/test"
import { commitRange, previousVersionCommit } from "./release-commits.ts"

const tags = [
  "aaa1\trefs/tags/@parity-app/desktop_v0.46.0",
  "bbb1\trefs/tags/@parity-app/desktop_v0.47.0",
  "bbb2\trefs/tags/@parity-app/desktop_v0.47.0^{}",
  "ccc1\trefs/tags/@parity-app/desktop_v0.47.1",
  "ddd1\trefs/tags/@parity-app/cli_v0.33.0",
  "eee1\trefs/tags/v0.47.0",
  "fff1\trefs/tags/@parity-app/desktop_v0.100.0"
].join("\n")

describe("previousVersionCommit", () => {
  it("finds the commit of the package's version before this one", () => {
    expect(previousVersionCommit(tags, "@parity-app/desktop", "0.47.1")).toBe("bbb2")
    expect(previousVersionCommit(tags, "@parity-app/desktop", "0.47.0")).toBe("aaa1")
  })

  it("compares versions by number, not as text", () => {
    expect(previousVersionCommit(tags, "@parity-app/desktop", "0.101.0")).toBe("fff1")
  })

  it("reads only the package's own tags", () => {
    expect(previousVersionCommit(tags, "@parity-app/cli", "0.33.1")).toBe("ddd1")
  })

  it("has nothing for a package's first version", () => {
    expect(previousVersionCommit(tags, "@parity-app/desktop", "0.46.0")).toBeUndefined()
    expect(previousVersionCommit("", "@parity-app/desktop", "0.47.1")).toBeUndefined()
  })
})

describe("commitRange", () => {
  it("names the commits since the previous version", () => {
    expect(commitRange("ccc1", "bbb2")).toBe("betterapps-hq/parity@bbb2..ccc1")
  })

  it("names the release's commit alone when there's no earlier version, or it's the same commit", () => {
    expect(commitRange("ccc1", undefined)).toBe("betterapps-hq/parity@ccc1")
    expect(commitRange("ccc1", "ccc1")).toBe("betterapps-hq/parity@ccc1")
  })
})
