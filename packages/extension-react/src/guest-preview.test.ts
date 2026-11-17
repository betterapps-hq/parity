// @vitest-environment happy-dom
import type { GuestDecorators, MountHandle, MountOptions, RenderNode } from "@parity-app/core"
import { createContext, createElement, type ReactNode, useContext, useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { createGuest } from "./guest.ts"

// A project's `.parity/preview.tsx` as the guest gets it: its exports, or the error it failed to load with (PAR-100).

const mounted: MountHandle[] = []
let target: HTMLElement

beforeEach(() => {
  target = document.createElement("div")
  document.body.append(target)
})

afterEach(() => {
  for (const handle of mounted.splice(0)) {
    handle.unmount()
  }

  target.remove()
})

type Story = () => ReactNode

/** What these tests' decorators read of their context. */
interface Context {
  globals: { theme?: string; density?: string }
  parameters: { layout?: string }
  loaded: { theme?: string }
  canvasElement: HTMLElement
}

const Theme = createContext("none")

/** Shows the theme it's drawn in, and counts how many times it mounted. */
let mounts = 0

function Themed() {
  useEffect(() => void mounts++, [])

  return createElement("p", null, `theme: ${useContext(Theme)}`)
}

const themed: RenderNode = { kind: "component", nodeId: "card", component: "Themed", props: {}, slots: {} }

/** A decorator drawing a named box around what's inside, as `<Story />` draws it. */
function box(name: string) {
  return function Box(Inner: Story): ReactNode {
    return createElement("section", { "data-box": name }, createElement(Inner))
  }
}

function mount(project: GuestDecorators["project"], options: MountOptions = {}) {
  const guest = createGuest({
    components: { Themed },
    css: "",
    decorators: {
      list: [{ library: "ui", decorator: { wrap: { import: "ui", component: "Provider" } } }],
      modules: {
        ui: { Provider: ({ children }: { children?: ReactNode }) => createElement("main", null, children) }
      },
      project
    }
  })

  const handle = guest.mount(target, [themed], options)
  mounted.push(handle)

  return { guest, handle }
}

/** The boxes from the outside in, by name or tag. */
function nesting(): string[] {
  const names: string[] = []
  let element = target.firstElementChild

  while (element && element.tagName !== "P") {
    names.push(element.getAttribute("data-box") ?? element.tagName.toLowerCase())
    element = element.firstElementChild
  }

  return names
}

describe("a project's preview file", () => {
  it("wraps frames inside the libraries' decorators, the last in its list outermost, as Storybook nests them", async () => {
    mount({ decorators: [box("inner"), box("outer")] })

    await vi.waitFor(() => expect(target.textContent).toBe("theme: none"))

    expect(nesting()).toEqual(["main", "outer", "inner"])
  })

  it("gives its decorators the frame's mode values over the file's own defaults, its parameters and the frame", async () => {
    const seen: Context[] = []

    const withTheme = (Inner: Story, context: Context) => {
      seen.push(context)

      return createElement(Theme.Provider, { value: String(context.globals.theme) }, createElement(Inner))
    }

    mount(
      {
        default: { parameters: { layout: "centered" } },
        decorators: [withTheme],
        globalTypes: { theme: { defaultValue: "light" }, density: { defaultValue: "comfortable" } },
        initialGlobals: { density: "compact" }
      },
      { globals: { theme: "dark" } }
    )

    await vi.waitFor(() => expect(target.textContent).toBe("theme: dark"))

    expect(seen[0]?.globals).toEqual({ theme: "dark", density: "compact" })
    expect(seen[0]?.parameters).toEqual({ layout: "centered" })
    expect(seen[0]?.canvasElement).toBe(target.parentElement)
  })

  it("keeps what's inside mounted from one draw to the next", async () => {
    mounts = 0
    const { handle } = mount({ decorators: [box("outer")] })

    await vi.waitFor(() => expect(mounts).toBe(1))

    handle.update([themed])
    handle.update([themed])

    await vi.waitFor(() => expect(target.textContent).toBe("theme: none"))

    expect(mounts).toBe(1)
  })

  it("draws once its loaders are done, with what they gave in the context, and the guest waits for them", async () => {
    let finish: (value: { theme: string }) => void = () => undefined

    const loader = vi.fn<() => Promise<{ theme: string }>>(
      () => new Promise<{ theme: string }>((resolve) => (finish = resolve))
    )

    const withLoaded = (Inner: Story, context: Context) =>
      createElement(Theme.Provider, { value: String(context.loaded.theme) }, createElement(Inner))

    const { guest } = mount({ decorators: [withLoaded], loaders: [loader] }, { globals: { theme: "dark" } })
    let settled = false
    const waiting = guest.loaded?.().then(() => (settled = true))

    await vi.waitFor(() => expect(loader).toHaveBeenCalledWith(expect.objectContaining({ globals: { theme: "dark" } })))

    expect(target.textContent).toBe("")
    expect(settled).toBe(false)

    finish({ theme: "loaded dark" })
    await waiting

    await vi.waitFor(() => expect(target.textContent).toBe("theme: loaded dark"))
  })

  it("reads a file written with Storybook's definePreview from its preview object's input (PAR-97)", async () => {
    const preview = { _tag: "Preview", input: { decorators: [box("inner"), box("outer")] }, composed: {} }
    mount({ default: preview })

    await vi.waitFor(() => expect(target.textContent).toBe("theme: none"))

    expect(nesting()).toEqual(["main", "outer", "inner"])
  })

  it("says why it didn't load, and the frame draws in the libraries' decorators without it", async () => {
    const onError = vi.fn<NonNullable<MountOptions["onError"]>>()
    mount({ loadError: "Unexpected token" }, { onError })

    await vi.waitFor(() => expect(target.textContent).toBe("theme: none"))

    expect(onError).toHaveBeenCalledWith(new Error("the project's preview file didn't load: Unexpected token"))
    expect(nesting()).toEqual(["main"])
  })
})
