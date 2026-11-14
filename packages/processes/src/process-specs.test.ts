import type { ProcessInfo, ProcessSpec } from "@parity-app/extension-api"
import { describe, expect, it } from "vite-plus/test"
import {
  checkSpec,
  fillPort,
  isLocalHost,
  isProcessPermission,
  permissionFor,
  permits,
  ProcessError,
  runEnvironment,
  sameSpec,
  startsAs,
  visibleTo,
  withUsualFolders
} from "./process-specs.ts"

const storybook: ProcessSpec = {
  id: "storybook",
  name: "Storybook",
  lifetime: "server",
  run: { bin: "storybook" },
  args: ["dev", "--port", "{port}"],
  port: { prefer: 6006 },
  ready: { http: "/index.json" }
}

/** The code `checkSpec` refuses with, or undefined when it doesn't. */
function refusal(spec: ProcessSpec): string | undefined {
  try {
    checkSpec(spec)

    return undefined
  } catch (error) {
    return error instanceof ProcessError ? error.code : "not a ProcessError"
  }
}

describe("checking a spec", () => {
  it("takes a server with a port and an http ready check", () => {
    expect(refusal(storybook)).toBeUndefined()
  })

  it("refuses {port} or an http or tcp ready check without a port", () => {
    expect(refusal({ ...storybook, port: undefined, ready: undefined })).toBe("process_spec_invalid")
    expect(refusal({ ...storybook, port: undefined, args: [] })).toBe("process_spec_invalid")
    expect(refusal({ ...storybook, port: undefined, args: [], ready: { tcp: true } })).toBe("process_spec_invalid")
  })

  it("refuses an argument holding a newline, a bad id, and a folder outside the project", () => {
    expect(refusal({ ...storybook, args: ["a\nb"] })).toBe("process_spec_invalid")
    expect(refusal({ ...storybook, id: "has space" })).toBe("process_spec_invalid")
    expect(refusal({ ...storybook, cwd: "../elsewhere" })).toBe("process_spec_invalid")
    expect(refusal({ ...storybook, cwd: "docs/../.." })).toBe("process_spec_invalid")
    expect(refusal({ ...storybook, cwd: "C:/elsewhere" })).toBe("process_spec_invalid")
    expect(refusal({ ...storybook, cwd: "/elsewhere" })).toBe("process_spec_invalid")
    expect(refusal({ ...storybook, cwd: "packages/docs" })).toBeUndefined()
  })

  it("refuses an output pattern that's too long or isn't one", () => {
    expect(refusal({ ...storybook, ready: { output: "a".repeat(201) } })).toBe("process_spec_invalid")
    expect(refusal({ ...storybook, ready: { output: "(" } })).toBe("process_spec_invalid")
    expect(refusal({ ...storybook, ready: { output: "https://\\S+" } })).toBeUndefined()
  })

  it("refuses a task with a ready check or restarts", () => {
    const task: ProcessSpec = { id: "vitest", name: "Tests", lifetime: "task", run: { bin: "vitest" } }
    expect(refusal(task)).toBeUndefined()
    expect(refusal({ ...task, restart: "onCrash" })).toBe("process_spec_invalid")
  })
})

describe("permissions", () => {
  it("names the entry each run needs", () => {
    expect(permissionFor({ bin: "storybook" })).toBe("bin:storybook")
    expect(permissionFor({ bin: "sb", package: "@storybook/cli" })).toBe("bin:@storybook/cli")
    expect(permissionFor({ script: "dev" })).toBe("script:dev")
    expect(permissionFor({ exec: "docker" })).toBe("exec:docker")
    expect(permissionFor({ node: "dist/worker.js" })).toBe("node:dist/worker.js")
  })

  it("allows only the runs the manifest lists", () => {
    expect(permits({ bin: "storybook" }, ["bin:storybook"])).toBe(true)
    expect(permits({ exec: "storybook" }, ["bin:storybook"])).toBe(false)
  })

  it("tells a well-formed entry from a malformed one", () => {
    expect(isProcessPermission("exec:cloudflared")).toBe(true)
    expect(isProcessPermission("cloudflared")).toBe(false)
    expect(isProcessPermission("exec:")).toBe(false)
  })
})

describe("running", () => {
  it("fills in the port", () => {
    expect(fillPort(["--port", "{port}", "--url=http://localhost:{port}"], 6007)).toEqual([
      "--port",
      "6007",
      "--url=http://localhost:6007"
    ])
  })

  it("keeps Electron's variable for Parity's Node, and drops it for a script or a program", () => {
    const base = { PATH: "/bin", electron_run_as_node: "1" }
    expect(runEnvironment({ bin: "storybook" }, base, { BROWSER: "none" })).toMatchObject({
      ELECTRON_RUN_AS_NODE: "1",
      BROWSER: "none"
    })
    expect(runEnvironment({ exec: "docker" }, base)).toEqual({ PATH: "/bin" })
    expect(runEnvironment({ script: "dev" }, { ...base, ELECTRON_RUN_AS_NODE: "1" })).toEqual({ PATH: "/bin" })
  })

  it("starts an executable directly on macOS and Linux, and by its type on Windows", () => {
    expect(startsAs("/usr/local/bin/docker", "darwin")).toBe("direct")
    expect(startsAs("C:\\bin\\docker.EXE", "win32")).toBe("direct")
    expect(startsAs("C:\\bin\\pnpm.cmd", "win32")).toBe("batch")
    expect(startsAs("C:\\bin\\tool.ps1", "win32")).toBe("unsupported")
    expect(startsAs("C:\\bin\\tool.js", "win32")).toBe("unsupported")
  })

  it("compares specs by what they say, whatever their keys' order", () => {
    expect(sameSpec(storybook, { ...storybook, ready: { http: "/index.json" } })).toBe(true)
    expect(sameSpec(storybook, { ...storybook, args: ["dev"] })).toBe(false)
    // Allowed by one permission, but not the same command line.
    expect(
      sameSpec(
        { ...storybook, run: { bin: "sb", package: "@storybook/cli" } },
        { ...storybook, run: { bin: "storybook", package: "@storybook/cli" } }
      )
    ).toBe(false)
  })
})

describe("what others see", () => {
  const failed: ProcessInfo = {
    id: "@parity-app/extension-storybook:storybook",
    name: "Storybook",
    lifetime: "server",
    state: "failed",
    owner: { kind: "extension", extension: "@parity-app/extension-storybook" },
    run: 1,
    addresses: [
      { url: "https://shop.localhost", label: "shop", kind: "name", public: false, provider: "portless" },
      { url: "https://shop.example.dev", label: "shop", kind: "tunnel", public: true, provider: "tunnels" }
    ],
    startedAt: 0,
    error: "Stopped by itself, with exit code 1: SECRET=abc",
    readyMatch: "Local: http://localhost:6006"
  }

  it("shows its owner and an extension that observes everything", () => {
    expect(visibleTo(failed, { owns: true, observe: false })).toEqual(failed)
    expect(visibleTo(failed, { owns: false, observe: true })).toEqual(failed)
  })

  it("shows others its error as a fixed phrase, without its match or public addresses", () => {
    const seen = visibleTo(failed, { owns: false, observe: false })

    expect(seen.error).toBe("Stopped by itself")
    expect(seen.readyMatch).toBeUndefined()
    expect(seen.addresses.map((address) => address.url)).toEqual(["https://shop.localhost"])
    expect(visibleTo({ ...failed, error: "Exited" }, { owns: false, observe: false }).error).toBe("Couldn't start")
    expect(visibleTo({ ...failed, lifetime: "task", error: "x" }, { owns: false, observe: false }).error).toBe("Failed")
  })
})

describe("finding programs", () => {
  it("adds the usual folders after PATH on macOS and Linux, and nothing on Windows", () => {
    expect(withUsualFolders({ PATH: "/bin" }, "darwin")).toEqual({ PATH: "/bin:/usr/local/bin:/opt/homebrew/bin" })
    expect(withUsualFolders({ Path: "C:\bin", PATHEXT: ".EXE" }, "win32")).toEqual({
      PATH: "C:\bin",
      PATHEXT: ".EXE"
    })
  })

  it("tells this machine's hosts from others", () => {
    expect(["localhost", "127.0.0.1", "[::1]", "shop.localhost"].map(isLocalHost)).toEqual([true, true, true, true])
    expect(["example.com", "192.168.1.4", "localhost.example.com"].map(isLocalHost)).toEqual([false, false, false])
  })
})
