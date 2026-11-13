import { describe, expect, it, vi } from "vite-plus/test"
import { createStore, resetWindowStores, resetWithWindow, signal, windowStore } from "./store.ts"

describe("a store", () => {
  it("tells its listeners of each change until they stop listening", () => {
    const filter = createStore(() => ({ query: "" }))
    const heard = vi.fn<() => void>()
    const stop = filter.subscribe(heard)

    filter.set({ query: "card" })
    filter.update((now) => ({ query: `${now.query}s` }))
    expect(filter.get()).toEqual({ query: "cards" })
    expect(heard).toHaveBeenCalledTimes(2)

    stop()
    filter.set({ query: "" })
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it("puts back a fresh first value on reset, and tells its listeners", () => {
    const found = createStore(() => new Map<string, number>())
    const first = found.get()
    first.set("card", 2)
    const heard = vi.fn<() => void>()
    found.subscribe(heard)

    found.reset()
    expect(found.get()).not.toBe(first)
    expect(found.get().size).toBe(0)
    expect(heard).toHaveBeenCalledOnce()
  })

  it("lets go of its listeners without telling them once disposed, as a project's tab closes", () => {
    const adding = createStore<string | undefined>(() => undefined)
    const heard = vi.fn<() => void>()
    adding.subscribe(heard)
    adding.set("label")
    heard.mockClear()

    adding.dispose()
    expect(adding.get()).toBeUndefined()
    adding.set("title")
    expect(heard).not.toHaveBeenCalled()
  })
})

describe("a signal", () => {
  it("tells its listeners when notified, for a value read some other way", () => {
    const changes = signal()
    const heard = vi.fn<() => void>()
    changes.subscribe(heard)

    changes.notify()
    changes.dispose()
    changes.notify()
    expect(heard).toHaveBeenCalledOnce()
  })
})

describe("resetting the window's stores", () => {
  it("puts back every window store and whatever asked to be reset with them, but not a project's stores", () => {
    const dialog = windowStore<string | undefined>(() => undefined)
    const filter = createStore(() => "all")
    let picked = ["frame"]
    resetWithWindow(() => {
      picked = []
    })
    dialog.set("settings")
    filter.set("errors")

    resetWindowStores()
    expect(dialog.get()).toBeUndefined()
    expect(picked).toEqual([])
    expect(filter.get()).toBe("errors")
  })
})
