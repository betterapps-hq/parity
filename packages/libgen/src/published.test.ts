import { describe, expect, it } from "vite-plus/test"
import { installedVersion, publishedVersion, repositoryUrl, tarEntry } from "./published.ts"

/** A tar entry as npm writes one: a ustar header, then the body padded to 512 bytes. */
function entry(name: string, body: string, type = "0"): Buffer {
  const header = Buffer.alloc(512)
  header.write(name.slice(0, 100), 0)
  header.write(`${Buffer.byteLength(body).toString(8).padStart(11, "0")}\0`, 124)
  header.write(type, 156)
  header.write("ustar\0", 257)
  const padded = Buffer.alloc(Math.ceil(Buffer.byteLength(body) / 512) * 512)
  padded.write(body)
  return Buffer.concat([header, padded])
}

/** A pax header giving the next entry's long path. */
function pax(path: string): Buffer {
  const record = (length: number) => `${length} path=${path}\n`
  let length = record(0).length
  while (record(length).length !== length) length = record(length).length
  return entry("PaxHeader", record(length), "x")
}

describe("tarEntry", () => {
  it("finds a file by its path, past the ones before it", () => {
    const archive = Buffer.concat([
      entry("package/package.json", "{}"),
      entry("package/tags.json", '{"x":["close"]}'),
      Buffer.alloc(1024)
    ])
    expect(tarEntry(archive, "package/tags.json")?.toString()).toBe('{"x":["close"]}')
    expect(tarEntry(archive, "package/missing.json")).toBeUndefined()
  })

  it("reads the long paths pax headers give", () => {
    const long = `package/${"deep/".repeat(30)}meta.json`
    const archive = Buffer.concat([pax(long), entry("package/deep/deep/meta.json", "[1]"), Buffer.alloc(1024)])
    expect(tarEntry(archive, long)?.toString()).toBe("[1]")
  })
})

describe("repositoryUrl", () => {
  it("reads a repository however npm records it, as the URL git fetches", () => {
    const fluent = "https://github.com/microsoft/fluentui-system-icons"
    expect(repositoryUrl("git+https://github.com/microsoft/fluentui-system-icons.git")).toBe(fluent)
    expect(repositoryUrl("git://github.com/microsoft/fluentui-system-icons.git")).toBe(fluent)
    expect(repositoryUrl("git@github.com:microsoft/fluentui-system-icons.git")).toBe(fluent)
    expect(repositoryUrl("github:microsoft/fluentui-system-icons")).toBe(fluent)
    expect(repositoryUrl("microsoft/fluentui-system-icons")).toBe(fluent)
  })
})

describe("publishedVersion", () => {
  it("takes a version npm has, or the one a tag points to", async () => {
    const usual = globalThis.fetch
    globalThis.fetch = (async () =>
      Response.json({ versions: { "1.62.0": {}, "1.63.0": {} }, "dist-tags": { latest: "1.63.0" } })) as typeof fetch
    try {
      expect(await publishedVersion("lucide-react", "1.62.0")).toBe("1.62.0")
      expect(await publishedVersion("lucide-react", "latest")).toBe("1.63.0")
      await expect(publishedVersion("lucide-react", "9.9.9")).rejects.toThrow(/npm has no lucide-react@9.9.9/)
    } finally {
      globalThis.fetch = usual
    }
  })
})

describe("installedVersion", () => {
  it("keeps each version once installed, and takes only names npm could publish", async () => {
    const { mkdtemp, mkdir, rm, writeFile } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const path = await import("node:path")
    const cache = await mkdtemp(path.join(tmpdir(), "parity-packages-"))
    try {
      const dir = path.join(cache, "@tabler+icons-react@3.50.0")
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, ".parity-installed"), "@tabler/icons-react@3.50.0\n")
      expect(await installedVersion("@tabler/icons-react", "3.50.0", cache)).toBe(dir)
      await expect(installedVersion("x && calc", "1.0.0", cache)).rejects.toThrow(/isn't a package name/)
      await expect(installedVersion("x", "1.0.0 | calc", cache)).rejects.toThrow(/isn't a package name/)
    } finally {
      await rm(cache, { recursive: true, force: true })
    }
  })
})
