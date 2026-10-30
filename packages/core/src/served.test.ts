import { describe, expect, it } from "vite-plus/test"
import { type FileStamp, mergeServed, ServedLog, type ServedRecord, sameStamp, servedChange } from "./served.ts"

/** Not a real hash, but tells codes apart, which is all the log needs. */
const hash = (code: string) => `#${code}`

/** Files on a pretend disk, which tests change, and the modules a pretend builder makes from them. */
function disk(files: Record<string, string | undefined>) {
  let clock = 1
  const stamps = new Map<string, FileStamp>()
  const write = (path: string, text: string | undefined) => {
    files[path] = text
    stamps.set(path, text === undefined ? null : { mtime: clock++, size: text.length })
  }
  for (const [path, text] of Object.entries(files)) write(path, text)
  return {
    files,
    write,
    stamp: (path: string) => Promise.resolve(stamps.get(path) ?? null),
    stamps: (...paths: string[]) => Object.fromEntries(paths.map((path) => [path, stamps.get(path) ?? null]))
  }
}

describe("sameStamp", () => {
  it("compares a file's time and size, and a missing file with a missing one", () => {
    expect(sameStamp({ mtime: 1, size: 2 }, { mtime: 1, size: 2 })).toBe(true)
    expect(sameStamp({ mtime: 1, size: 2 }, { mtime: 3, size: 2 })).toBe(false)
    expect(sameStamp({ mtime: 1, size: 2 }, { mtime: 1, size: 4 })).toBe(false)
    expect(sameStamp(null, null)).toBe(true)
    expect(sameStamp(null, { mtime: 1, size: 2 })).toBe(false)
  })
})

describe("servedChange", () => {
  const record: ServedRecord = {
    files: { "/app/src/button.tsx": { mtime: 1, size: 10 }, "/app/.env": null },
    modules: {},
    made: { guest: "#a" },
    build: ["/app/.env"]
  }

  it("finds nothing when every file and made module is as it was", () => {
    expect(
      servedChange(record, { "/app/src/button.tsx": { mtime: 1, size: 10 }, "/app/.env": null }, { guest: "#a" })
    ).toBeUndefined()
  })

  it("names a file that changed, appeared or went", () => {
    expect(
      servedChange(record, { "/app/src/button.tsx": { mtime: 2, size: 10 }, "/app/.env": null }, { guest: "#a" })
    ).toBe("/app/src/button.tsx")
    expect(servedChange(record, { "/app/src/button.tsx": null, "/app/.env": null }, { guest: "#a" })).toBe(
      "/app/src/button.tsx"
    )
    expect(
      servedChange(
        record,
        { "/app/src/button.tsx": { mtime: 1, size: 10 }, "/app/.env": { mtime: 5, size: 3 } },
        { guest: "#a" }
      )
    ).toBe("/app/.env")
  })

  it("names a module the builder would make differently now, or no longer makes", () => {
    const files = { "/app/src/button.tsx": { mtime: 1, size: 10 }, "/app/.env": null }
    expect(servedChange(record, files, { guest: "#b" })).toBe("guest")
    expect(servedChange(record, files, {})).toBe("guest")
  })
})

describe("ServedLog", () => {
  it("keeps each module and file as first served, so a page's copy is what's compared", async () => {
    const { stamp, stamps, write } = disk({ "/app/src/button.tsx": "v1" })
    const log = new ServedLog(hash)
    log.serve("/src/button.tsx", "button v1", stamps("/app/src/button.tsx"))
    write("/app/src/button.tsx", "v2")
    // The offscreen renderer opened again and loaded the edited file; the window still has the first.
    log.serve("/src/button.tsx", "button v2", stamps("/app/src/button.tsx"))
    expect(log.has("/src/button.tsx")).toBe(true)
    const record = await log.record(stamp, () => Promise.resolve("button v2"))
    expect(record.modules["/src/button.tsx"]).toEqual({ hash: "#button v1", files: ["/app/src/button.tsx"] })
    expect(servedChange(record, stamps("/app/src/button.tsx"), {})).toBe("/app/src/button.tsx")
  })

  it("counts a changed file as unchanged when every module made from it comes out the same", async () => {
    const { stamp, stamps, write } = disk({ "/app/src/index.css": "@import tailwindcss", "/app/app.par": "{}" })
    const log = new ServedLog(hash)
    log.serve("/src/index.css?inline", "css", stamps("/app/src/index.css", "/app/app.par"))
    // A design saved with no new class: Tailwind makes the same stylesheet.
    write("/app/app.par", '{"designs":[]}')
    const remade: string[] = []
    const record = await log.record(stamp, (url) => {
      remade.push(url)
      return Promise.resolve("css")
    })
    expect(remade).toEqual(["/src/index.css?inline"])
    expect(servedChange(record, stamps("/app/src/index.css", "/app/app.par"), {})).toBeUndefined()
  })

  it("keeps a changed file changed when a module made from it comes out differently, or can't be made", async () => {
    const { stamp, stamps, write } = disk({ "/app/src/index.css": "", "/app/app.par": "{}" })
    const log = new ServedLog(hash)
    log.serve("/src/index.css?inline", "css", stamps("/app/src/index.css", "/app/app.par"))
    write("/app/app.par", '{"className":"bg-pink-500"}')
    const record = await log.record(stamp, () => Promise.resolve("css with bg-pink-500"))
    expect(servedChange(record, stamps("/app/src/index.css", "/app/app.par"), {})).toBe("/app/app.par")
    const failing = await log.record(stamp, () => Promise.reject(new Error("deleted")))
    expect(servedChange(failing, stamps("/app/src/index.css", "/app/app.par"), {})).toBe("/app/app.par")
  })

  it("never remakes for a file the whole build depends on", async () => {
    const { stamp, stamps, write } = disk({ "/app/vite.config.ts": "a", "/app/src/index.css": "" })
    const log = new ServedLog(hash)
    log.depend(stamps("/app/vite.config.ts"))
    // Tailwind scans the config too, so the stylesheet lists it.
    log.serve("/src/index.css?inline", "css", stamps("/app/src/index.css", "/app/vite.config.ts"))
    write("/app/vite.config.ts", "b")
    let remade = 0
    const record = await log.record(stamp, () => {
      remade++
      return Promise.resolve("css")
    })
    expect(remade).toBe(0)
    expect(servedChange(record, stamps("/app/src/index.css", "/app/vite.config.ts"), {})).toBe("/app/vite.config.ts")
  })

  it("keeps the first hash of a module it makes itself", async () => {
    const log = new ServedLog(hash)
    log.make("guest", "#one")
    log.make("guest", "#two")
    expect(
      (
        await log.record(
          () => Promise.resolve(null),
          () => Promise.resolve(undefined)
        )
      ).made
    ).toEqual({
      guest: "#one"
    })
  })

  it("carries on a last builder's record, so what the pages still hold from it is checked too", async () => {
    const { stamp, stamps, write } = disk({ "/app/src/button.tsx": "v1", "/app/src/card.tsx": "v1" })
    const first = new ServedLog(hash)
    first.serve("/src/button.tsx", "button v1", stamps("/app/src/button.tsx"))
    first.make("guest", "#guest")
    const handed = await first.record(stamp, () => Promise.resolve(undefined))

    // The reopened project's pages draw the button from what they hold, and load only the card.
    const next = new ServedLog(hash, structuredClone(handed))
    next.serve("/src/card.tsx", "card v1", stamps("/app/src/card.tsx"))
    write("/app/src/button.tsx", "v2")
    const record = await next.record(stamp, (url) =>
      Promise.resolve(url === "/src/button.tsx" ? "button v2" : "card v1")
    )
    expect(Object.keys(record.modules)).toEqual(["/src/button.tsx", "/src/card.tsx"])
    expect(record.made).toEqual({ guest: "#guest" })
    expect(servedChange(record, stamps("/app/src/button.tsx", "/app/src/card.tsx"), { guest: "#guest" })).toBe(
      "/app/src/button.tsx"
    )
  })

  it("hands on a record that crosses as data", async () => {
    const { stamp, stamps } = disk({ "/app/src/button.tsx": "v1", "/app/.env": undefined })
    const log = new ServedLog(hash)
    log.depend(stamps("/app/.env"))
    log.serve("/src/button.tsx", "button v1", stamps("/app/src/button.tsx"))
    const record = await log.record(stamp, () => Promise.resolve(undefined))
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- the test checks the record survives JSON
    expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    expect(record.files["/app/.env"]).toBeNull()
  })
})

describe("mergeServed", () => {
  it("keeps what the earlier builder served first", () => {
    const earlier: ServedRecord = {
      files: { "/a": { mtime: 1, size: 1 } },
      modules: { "/a": { hash: "#1", files: ["/a"] } },
      made: { guest: "#1" },
      build: ["/lock"]
    }
    const later: ServedRecord = {
      files: { "/a": { mtime: 2, size: 1 }, "/b": { mtime: 2, size: 1 } },
      modules: { "/a": { hash: "#2", files: ["/a"] }, "/b": { hash: "#b", files: ["/b"] } },
      made: { guest: "#2" },
      build: ["/lock", "/env"]
    }
    expect(mergeServed(earlier, later)).toEqual({
      files: { "/a": { mtime: 1, size: 1 }, "/b": { mtime: 2, size: 1 } },
      modules: { "/a": { hash: "#1", files: ["/a"] }, "/b": { hash: "#b", files: ["/b"] } },
      made: { guest: "#1" },
      build: ["/lock", "/env"]
    })
  })
})
