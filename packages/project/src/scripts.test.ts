import { describe, expect, it } from "vite-plus/test"
import { commandOption, scriptRunning } from "./scripts.ts"

describe("scriptRunning", () => {
  it("tries dev, start and serve first", () => {
    const scripts = { preview: "vite --config other.ts", build: "vite build", dev: "vite --config dev.ts" }
    expect(scriptRunning(scripts, /\bvite\b/)).toEqual(["dev", "vite --config dev.ts"])
    expect(scriptRunning(undefined, /\bvite\b/)).toBeUndefined()
  })
})

describe("commandOption", () => {
  it("reads short, long and = forms, without quotes", () => {
    expect(commandOption("storybook dev -p 6006 -c config/sb", ["-c", "--config-dir"])).toBe("config/sb")
    expect(commandOption('vite --config="build/vite.config.ts"', ["-c", "--config"])).toBe("build/vite.config.ts")
    expect(commandOption("vite", ["-c", "--config"])).toBeUndefined()
  })
})
