// @vitest-environment happy-dom
import { createElement } from "react"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { isAppRoot, reactHydration } from "./page.ts"

// React reads the hook once, as react-dom loads, so the hook is installed first and react-dom imported after it.

afterEach(() => {
  document.body.innerHTML = ""
  Reflect.deleteProperty(globalThis, "__NEXT_DATA__")
})

async function settles(promise: Promise<void>, ms = 200): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))
  ])
}

describe("reactHydration", () => {
  it("resolves on React's first commit to the app's root, and not to a root in a shadow root", async () => {
    reactHydration.install()
    const { createRoot } = await import("react-dom/client")
    const { flushSync } = await import("react-dom")
    const hydrated = reactHydration.hydrated(new AbortController().signal)

    // Next's development overlay renders its own React into a shadow root of its own.
    const portal = document.createElement("nextjs-portal")
    document.body.append(portal)
    const overlay = portal.attachShadow({ mode: "open" }).appendChild(document.createElement("div"))
    flushSync(() => createRoot(overlay).render(createElement("p", null, "Issues")))

    expect(await settles(hydrated)).toBe(false)

    const app = document.body.appendChild(document.createElement("div"))
    app.id = "root"
    flushSync(() => createRoot(app).render(createElement("main", null, "Pricing")))

    expect(await settles(hydrated)).toBe(true)
  })

  it("gives up when it's aborted", async () => {
    const abort = new AbortController()
    abort.abort(new Error("Gone"))

    await expect(reactHydration.hydrated(abort.signal)).rejects.toThrow("Gone")
  })
})

describe("isAppRoot", () => {
  it("takes the document, as Next's App Router hydrates it, and an element in the page", () => {
    const root = document.body.appendChild(document.createElement("div"))

    expect(isAppRoot(document)).toBe(true)
    expect(isAppRoot(root)).toBe(true)
    expect(isAppRoot(document.createElement("div"))).toBe(false)
    expect(isAppRoot("root")).toBe(false)
  })

  it("takes only #__next or the document under Next", () => {
    Reflect.set(globalThis, "__NEXT_DATA__", {})
    const next = document.body.appendChild(document.createElement("div"))
    next.id = "__next"
    const toast = document.body.appendChild(document.createElement("div"))

    expect(isAppRoot(next)).toBe(true)
    expect(isAppRoot(document)).toBe(true)
    expect(isAppRoot(toast)).toBe(false)
  })
})
