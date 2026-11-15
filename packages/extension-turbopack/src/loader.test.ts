import { describe, expect, it } from "vite-plus/test"
import { guestLoaderSource, runtimeChunks, withoutStartup } from "./loader.ts"

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
      packageStyles: [],
      stylesheetBase: "http://127.0.0.1:4000/_next/"
    })

    expect(source).toContain('sessions["s1"] ??=')
    expect(source).toContain('await import("http://127.0.0.1:4000/__parity/runtime.js?src=x")')
    expect(source).toContain('context.r("[project]/.next/parity/app/guest.tsx [app-client] (ecmascript)")')
    expect(source).toContain('joined(["http://127.0.0.1:4000/_next/static/chunks/globals.css"])')
    expect(source).toContain("export default createGuest(")
  })
})
