import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { covers, registryDir, registryEntries, registryEntryFor } from "./index.ts"

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "parity-registry-"))
  const file = (version: string, range: string) => ({
    version: 3,
    id: "mui",
    name: "Material UI",
    package: { name: "@mui/material", version, range }
  })
  await writeFile(join(dir, "mui.lib.par"), JSON.stringify(file("9.5.0", "^9.0.0")))
  await writeFile(join(dir, "mui-7.lib.par"), JSON.stringify(file("7.3.4", "^7.0.0")))
  await writeFile(join(dir, "broken.lib.par"), JSON.stringify({ version: 3, name: "No package" }))
})

afterAll(() => rm(dir, { recursive: true, force: true }))

describe("registryEntryFor", () => {
  it("picks the file whose range covers the installed version", async () => {
    expect((await registryEntryFor("@mui/material", "9.1.2", dir))?.file).toBe("mui.lib.par")
    expect((await registryEntryFor("@mui/material", "7.0.0", dir))?.file).toBe("mui-7.lib.par")
  })

  it("uses the newest older file for a version newer than every file, marked as older", async () => {
    const entry = await registryEntryFor("@mui/material", "10.1.0", dir)
    expect(entry?.file).toBe("mui.lib.par")
    expect(entry?.older).toBe(true)
    expect((await registryEntryFor("@mui/material", "8.0.0", dir))?.file).toBe("mui-7.lib.par")
    expect((await registryEntryFor("@mui/material", "9.1.0", dir))?.older).toBeUndefined()
  })

  it("matches nothing for a version older than every file, or an unknown version", async () => {
    expect(await registryEntryFor("@mui/material", "6.4.0", dir)).toBeUndefined()
    expect(await registryEntryFor("@mui/material", undefined, dir)).toBeUndefined()
    expect(await registryEntryFor("@chakra-ui/react", "3.0.0", dir)).toBeUndefined()
  })

  it("skips a file that doesn't name its package", async () => {
    expect((await registryEntries(dir)).map((entry) => entry.file)).not.toContain("broken.lib.par")
  })
})

describe("covers", () => {
  it("reads prereleases and a manifest without a range covers every version", () => {
    expect(covers({ version: 3, name: "x", package: { name: "x", range: "^1.0.0" } }, "1.2.0-beta.1")).toBe(true)
    expect(covers({ version: 3, name: "x", package: { name: "x", range: "^1.0.0" } }, "2.0.0-rc.1")).toBe(false)
    expect(covers({ version: 3, name: "x", package: { name: "x" } }, undefined)).toBe(true)
  })
})

describe("the registry", () => {
  it("has a valid file for each library Parity describes, each naming the version it was generated from", async () => {
    const entries = await registryEntries(registryDir())
    const packages = Object.fromEntries(entries.map((entry) => [entry.manifest.package!.name, entry.manifest]))
    for (const name of [
      "@buildkitgg/shadcn-baseui-luma",
      "@buildkitgg/shadcn-baseui-lyra",
      "@buildkitgg/shadcn-baseui-maia",
      "@buildkitgg/shadcn-baseui-mira",
      "@buildkitgg/shadcn-baseui-nova",
      "@buildkitgg/shadcn-baseui-rhea",
      "@buildkitgg/shadcn-baseui-sera",
      "@buildkitgg/shadcn-baseui-vega",
      "radix-ui",
      "@base-ui/react",
      "react-aria-components",
      "@mui/material",
      "@chakra-ui/react",
      "@mantine/core",
      "@fluentui/react-components",
      "lucide-react",
      "@hugeicons/core-free-icons",
      "@heroicons/react",
      "@phosphor-icons/react",
      "@tabler/icons-react",
      "@fluentui/react-icons"
    ]) {
      const manifest = packages[name]
      expect({
        name,
        version: manifest?.package?.version,
        describes: Boolean(manifest?.components ?? manifest?.icons)
      }).toEqual({ name, version: expect.stringMatching(/^\d+\.\d+\.\d+/), describes: true })
    }
  })
})
