import { spawnSync } from "node:child_process"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { guestLoaderSource, moduleLoaderSource, runtimeChunks, withoutStartup } from "./loader.ts"

/** Why Node won't parse a module's source, as its own check says, or nothing when it parses. */
async function parseError(source: string): Promise<string> {
  const file = join(await mkdtemp(join(tmpdir(), "parity-turbopack-loader-")), "module.mjs")
  await writeFile(file, source)

  return spawnSync(process.execPath, ["--check", file], { encoding: "utf8" }).stderr
}

/** The start of a runtime chunk as Turbopack writes it for a page, then the runtime itself. */
const runtime = [
  '(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([',
  '    "object" == typeof document ? document.currentScript : undefined,',
  '    {"otherChunks":["static/chunks/react-dom_1udv.js",{"path":"static/chunks/next_client_0awe.js","included":[]}],"runtimeModuleIds":["[project]/node_modules/next/dist/client/app-next-turbopack.js [app-client] (ecmascript)"]}',
  "]);",
  "const DUMMY_REFRESH_CONTEXT = {",
  "    register: (_type, _id)=>{},",
  "    signature: ()=>(_type)=>{},",
  "    registerExports: (_module, _helpers)=>{}",
  "};"
].join("\n")

describe("Turbopack's runtime chunk", () => {
  it("names the chunks its page starts with", () => {
    expect(runtimeChunks(runtime)).toEqual(["static/chunks/react-dom_1udv.js", "static/chunks/next_client_0awe.js"])
  })

  it("starts nothing once its start-up registration is taken out", () => {
    const loaded = withoutStartup(runtime)

    expect(loaded).not.toContain("otherChunks")
    expect(loaded).not.toContain("app-next-turbopack")
    expect(loaded.startsWith('(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = []));')).toBe(true)
  })

  it("gives back the component a refresh signature is given, as Next's refresh runtime does", () => {
    const loaded = withoutStartup(runtime)

    expect(loaded).toContain("signature: () => (_type) => _type")
    expect(loaded).not.toContain("signature: ()=>(_type)=>{}")
  })

  it("says so when it starts some other way", () => {
    expect(() => runtimeChunks("console.log(1)")).toThrow("doesn't start the way this Parity reads it")
    expect(() => withoutStartup("console.log(1)")).toThrow("doesn't start the way this Parity reads it")
  })
})

describe("the guest module", () => {
  it("loads the runtime and chunks once per session, and asks the runtime for the guest module by its id", () => {
    const source = guestLoaderSource({
      session: "s1",
      runtime: "http://127.0.0.1:4000/__parity/runtime.js?src=x",
      chunks: ["http://127.0.0.1:4000/_next/static/chunks/a.js"],
      id: "[project]/.next/parity/app/guest.tsx [app-client] (ecmascript)",
      styles: ["http://127.0.0.1:4000/_next/static/chunks/globals.css"],
      packageStyles: []
    })

    expect(source).toContain('sessions["s1"] ??=')
    expect(source).toContain('await import("http://127.0.0.1:4000/__parity/runtime.js?src=x")')
    expect(source).toContain('context.r("[project]/.next/parity/app/guest.tsx [app-client] (ecmascript)")')
    expect(source).toContain('joined(["http://127.0.0.1:4000/_next/static/chunks/globals.css"])')
    expect(source).toContain("export default createGuest(")
  })
})

const guestLoader = {
  session: "s1",
  runtime: "http://127.0.0.1:4000/__parity/runtime.js?src=x",
  chunks: [],
  id: "[project]/.next/parity/app/guest.tsx [app-client] (ecmascript)",
  styles: [],
  packageStyles: []
}

/** A module as the runtime keeps it, its factory or its instance, here by its id alone. */
interface RuntimeModule {
  id: string
}

/** Where the runtime keeps modules by id: in maps since Next.js 16.4, and in objects before. */
type ModuleStore = Map<string, RuntimeModule> | Record<string, RuntimeModule>

/** The runtime's module context, as far as the loader reads it: its factories and its instances. */
interface ModuleContext {
  M: ModuleStore
  c: ModuleStore
}

/** A chunk's registration as Turbopack writes it: its script, then each module's id and factory. */
type ChunkRegistration = [{ src: string }, ...(string | (() => null))[]]

declare global {
  /** Where Turbopack's runtimes register chunks: the last runtime started's, or the guest's router between them. */
  var TURBOPACK: { push(registration: ChunkRegistration): number }
}

function moduleContext(kind: "map" | "object", ids: string[]): ModuleContext {
  const store = (): ModuleStore =>
    kind === "map" ? new Map(ids.map((id) => [id, { id }])) : Object.fromEntries(ids.map((id) => [id, { id }]))

  return { M: store(), c: store() }
}

const has = (store: ModuleStore, id: string) => (store instanceof Map ? store.has(id) : id in store)

describe("modules loaded again in Turbopack's runtime", () => {
  const card = "[project]/src/Card.tsx [app-client] (ecmascript)"
  const react = "[project]/node_modules/react/index.js [app-client] (ecmascript)"
  const factory = () => null

  for (const kind of ["map", "object"] as const) {
    it(`routes each chunk to its session's runtime, forgetting the project's modules in a stamped one (${kind})`, async () => {
      const source = guestLoaderSource(guestLoader)
      const helpers = source.slice(source.indexOf("// Next.js 16.4"), source.indexOf("// One runtime"))
      Object.assign(globalThis, { location: { href: "http://127.0.0.1:4000/" } })

      const { startSession } = await import(
        `data:text/javascript,${encodeURIComponent(`${helpers}\nexport { startSession }`)}`
      )

      /** A session's runtime, as the guest starts it: it takes `globalThis.TURBOPACK` until the next starts. */
      const runtime = (session: string) => {
        const registered: ChunkRegistration[] = []
        const context = moduleContext(kind, [card, react])
        Object.assign(globalThis, {
          TURBOPACK: { push: (registration: ChunkRegistration) => registered.push(registration) }
        })
        startSession(session, context)

        return { registered, context }
      }

      const first = runtime(`first-${kind}`)
      const second = runtime(`second-${kind}`)
      const push = (src: string) => globalThis.TURBOPACK.push([{ src }, card, factory, react, factory])

      push(`http://127.0.0.1:4000/_next/static/chunks/card.js?parity-session=first-${kind}`)

      expect([first.registered.length, second.registered.length]).toEqual([1, 0])
      expect(has(first.context.M, card)).toBe(true)

      push(`http://127.0.0.1:4000/_next/static/chunks/card.js?t=2&parity-session=first-${kind}`)

      expect([has(first.context.M, card), has(first.context.c, card)]).toEqual([false, false])
      expect([has(first.context.M, react), has(first.context.c, react)]).toEqual([true, true])
      expect(has(second.context.M, card)).toBe(true)

      // A chunk that names no session, as one the runtime loads itself, goes to the last runtime started.
      push("http://127.0.0.1:4000/_next/static/chunks/other.js")

      expect([first.registered.length, second.registered.length]).toEqual([2, 1])
    })
  }

  it("writes a guest module and a module loader that parse whole", async () => {
    const module = moduleLoaderSource({ session: "s1", id: "x", chunks: [], stylesheets: [], names: ["default", "A"] })

    expect(await parseError(guestLoaderSource(guestLoader))).toBe("")
    expect(await parseError(module)).toBe("")
  })

  it("keeps the session's runtime context for modules to load into", () => {
    const source = guestLoaderSource(guestLoader)

    expect(source).toContain('contexts["s1"] = context')
    expect(source).toContain('startSession("s1", context)')
  })

  it("loads a module's chunks at its change's stamp, makes its client module again and gives its exports", async () => {
    const id = "[project]/.next/parity/app/parity-modules/src-Card-1a2b3c4d.tsx [app-client] (ecmascript)"

    const source = moduleLoaderSource({
      session: "s2",
      id,
      chunks: ["http://127.0.0.1:4000/_next/static/chunks/card.js"],
      stylesheets: ["http://127.0.0.1:4000/_next/static/chunks/card.css?v=1"],
      names: ["Card", "default", "Card"],
      stamp: 7
    })

    expect(source).toContain('["http://127.0.0.1:4000/_next/static/chunks/card.js?t=7&parity-session=s2"]')
    expect(source).toContain('["http://127.0.0.1:4000/_next/static/chunks/card.css?v=1&t=7"]')

    const context = {
      c: new Map([[id, { id }]]),
      r: () => ({ parityModule: { Card: "the card", default: "the page" } })
    }

    Object.assign(globalThis, { __parityTurbopackContexts: { s2: context } })

    // Only the module's last lines run here: the browser loads its chunks and links.
    const body = source.slice(source.indexOf("// The client module"))

    const head =
      "const context = globalThis.__parityTurbopackContexts.s2\nconst forget = (store, id) => store.delete(id)\n"

    const module = await import(`data:text/javascript,${encodeURIComponent(head + body)}`)

    expect(context.c.has(id)).toBe(false)
    expect({ ...module }).toEqual({ Card: "the card", default: "the page" })
  })
})
