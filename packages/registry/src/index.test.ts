import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { applyLibraryEdits, type LibraryEdits } from "@parity-app/core"
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { covers, newestEntries, registryDir, registryEntries, registryEntryFor, withEdits } from "./index.ts"

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
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    expect((await registryEntries(dir)).map((entry) => entry.file)).not.toContain("broken.lib.par")
    expect(warn).toHaveBeenCalledWith(
      "Skipping registry file broken.lib.par: /package: a registry file names the package it describes"
    )
    warn.mockRestore()
  })
})

describe("newestEntries", () => {
  it("keeps each package's newest file by semver, with its hand edits applied", async () => {
    const newest = await mkdtemp(join(tmpdir(), "parity-registry-newest-"))

    const file = (version: string, edits?: unknown) => ({
      version: 3,
      id: "mui",
      name: `Material UI ${version}`,
      package: { name: "@mui/material", version },
      components: { list: { Button: { as: "function" }, Fab: { as: "function" } } },
      ...(edits === undefined ? {} : { edits })
    })

    // As text, 9.5.0 is newer than 10.0.0, and "mui-10" sorts before "mui-9".
    await writeFile(join(newest, "mui-9.lib.par"), JSON.stringify(file("9.5.0")))
    await writeFile(join(newest, "mui-10.lib.par"), JSON.stringify(file("10.0.0", "shared.edits.json")))
    await writeFile(
      join(newest, "shared.edits.json"),
      '{\n  // Fab is gone from 10.\n  "components": { "Fab": false, "Button": { "group": "Actions" } },\n}'
    )

    try {
      const [entry, ...rest] = await newestEntries(newest)
      expect(rest).toEqual([])
      expect(entry?.file).toBe("mui-10.lib.par")
      expect(entry?.manifest.components?.list).toEqual({ Button: { as: "function", group: "Actions" } })
    } finally {
      await rm(newest, { recursive: true, force: true })
    }
  })
})

describe("withEdits", () => {
  it("reports edits for exports the file doesn't have, and fails on edits it can't read", async () => {
    const manifest = {
      version: 3 as const,
      name: "Acme",
      components: { list: { Button: { as: "function" as const } } }
    }

    const edited = await withEdits(join(dir, "acme.lib.par"), { ...manifest, edits: { components: { Gone: false } } })
    expect(edited.orphans).toEqual(["Gone"])
    expect(edited.manifest.components).toEqual(manifest.components)
    await expect(withEdits(join(dir, "acme.lib.par"), { ...manifest, edits: "missing.edits.json" })).rejects.toThrow(
      "missing.edits.json"
    )
  })
})

describe("covers", () => {
  it("reads prereleases and a manifest without a range covers every version", () => {
    expect(covers({ package: { name: "x", range: "^1.0.0" } }, "1.2.0-beta.1")).toBe(true)
    expect(covers({ package: { name: "x", range: "^1.0.0" } }, "2.0.0-rc.1")).toBe(false)
    expect(covers({ package: { name: "x" } }, undefined)).toBe(true)
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
      "@fluentui/react-icons",
      "recharts"
    ]) {
      const manifest = packages[name]
      expect({
        name,
        version: manifest?.package?.version,
        describes: Boolean(manifest?.components ?? manifest?.icons)
      }).toEqual({ name, version: expect.stringMatching(/^\d+\.\d+\.\d+/), describes: true })
    }
  })

  it("keeps sample text that ends at a sentence or a whole word, not cut mid-word at 60 characters", async () => {
    const cut: string[] = []

    const visit = (value: unknown, text: boolean) => {
      if (typeof value === "string") {
        if (text && value.length === 60 && !value.endsWith("…")) {
          cut.push(value)
        }
      } else if (Array.isArray(value)) {
        for (const item of value) {
          visit(item, text)
        }
      } else if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
          visit(item, ["children", "$render", "$element"].includes(key))
        }
      }
    }

    for (const entry of await registryEntries(registryDir())) {
      for (const component of Object.values(entry.manifest.components?.list ?? {})) {
        visit(component.sample, false)
      }
    }

    expect(cut).toEqual([])
    const nova = (await registryEntries(registryDir())).find((each) => each.manifest.id === "nova")!
    expect(JSON.stringify(nova.manifest.components!.list.Accordion!.sample)).toContain(
      '"Manage how you receive notifications."'
    )
  })

  it("samples Recharts' bar, line and area charts with data, sized by what holds them", async () => {
    const entry = (await registryEntries(registryDir())).find((each) => each.manifest.package?.name === "recharts")!
    const edits = entry.manifest.edits

    if (typeof edits !== "object") {
      throw new Error("Recharts' file keeps its edits in itself")
    }

    const { manifest, orphans } = applyLibraryEdits(entry.manifest, edits satisfies LibraryEdits)
    expect(orphans).toEqual([])
    const list = manifest.components!.list

    for (const [chart, series] of [
      ["BarChart", "Bar"],
      ["LineChart", "Line"],
      ["AreaChart", "Area"]
    ] as const) {
      const sample = list[chart]!.sample!
      expect(list[chart]!.group).toBe("Charts")
      expect(sample.props).toMatchObject({ responsive: true, width: "100%" })
      expect(sample.props!.data).toHaveLength(6)
      expect(sample.props!.data).toEqual(expect.arrayContaining([expect.objectContaining({ month: "January" })]))
      expect(
        sample.children!.map((child) => typeof child === "object" && "component" in child && child.component)
      ).toEqual(["CartesianGrid", "XAxis", series])
      expect(list[series]!.parents).toEqual([chart])
      // Frames are still pictures, so a series draws whole rather than mid-animation.
      expect(list[series]!.sample!.props).toMatchObject({ isAnimationActive: false })
    }

    expect([list.XAxis!.group, list.YAxis!.group, list.CartesianGrid!.group, list.Bar!.group]).toEqual([
      "Axes",
      "Axes",
      "Grids",
      "Series"
    ])
  })
})
