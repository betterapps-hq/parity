// @vitest-environment happy-dom
import type { GuestDecorators, MountHandle, MountOptions, RenderNode } from "@parity-app/core"
import * as portableStories from "@storybook/react"
import { createContext, createElement, type ReactNode, useContext, useEffect, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { createGuest } from "./guest.ts"

// A project's `.storybook/preview.*` as the guest gets it when there's no Parity preview file: its exports, and the
// project's own Storybook package, whose portable stories API composes it (PAR-98). These use Storybook's real API.

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
  globals: { theme?: string; locale?: string }
  parameters: { layout?: string }
  loaded: { messages?: string }
  canvasElement: HTMLElement
}

const Theme = createContext("none")

let mounts = 0

/** Shows the theme it's drawn in, and counts how many times it mounted. */
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

function mount(
  project: GuestDecorators["project"],
  options: MountOptions = {},
  composer: GuestDecorators["composer"] = portableStories
) {
  const guest = createGuest({
    components: { Themed },
    css: "",
    decorators: {
      list: [{ library: "ui", decorator: { wrap: { import: "ui", component: "Provider" } } }],
      modules: {
        ui: { Provider: ({ children }: { children?: ReactNode }) => createElement("main", null, children) }
      },
      project,
      composer
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

describe("the project's Storybook preview, composed with its portable stories API", () => {
  it("wraps frames inside the libraries' decorators, the last in its list outermost, as Storybook nests them", async () => {
    mount({ decorators: [box("inner"), box("outer")] })

    await vi.waitFor(() => expect(target.textContent).toBe("theme: none"))

    expect(nesting()).toEqual(["main", "outer", "inner"])
  })

  it("gives its decorators the frame's mode values over the preview's defaults, its parameters and the frame", async () => {
    const seen: Context[] = []

    const withTheme = (Inner: Story, context: Context) => {
      seen.push(context)

      return createElement(Theme.Provider, { value: String(context.globals.theme) }, createElement(Inner))
    }

    mount(
      {
        default: {
          parameters: { layout: "centered" },
          decorators: [withTheme],
          globalTypes: { theme: { defaultValue: "light" }, locale: { defaultValue: "en" } },
          initialGlobals: { locale: "fr" }
        }
      },
      { globals: { theme: "dark" } }
    )

    await vi.waitFor(() => expect(target.textContent).toBe("theme: dark"))

    expect(seen[0]?.globals).toMatchObject({ theme: "dark", locale: "fr" })
    expect(seen[0]?.parameters).toMatchObject({ layout: "centered" })
    expect(seen[0]?.canvasElement).toBe(target.parentElement)
  })

  it("runs its loaders before the frame draws, with what they gave in the context, and the guest waits", async () => {
    let finish: (value: { messages: string }) => void = () => undefined

    const loader = vi.fn<() => Promise<{ messages: string }>>(
      () => new Promise<{ messages: string }>((resolve) => (finish = resolve))
    )

    const withMessages = (Inner: Story, context: Context) =>
      createElement(Theme.Provider, { value: String(context.loaded.messages) }, createElement(Inner))

    const { guest } = mount({ decorators: [withMessages], loaders: [loader] })
    let settled = false
    const waiting = guest.loaded?.().then(() => (settled = true))

    await vi.waitFor(() => expect(loader).toHaveBeenCalled())

    expect(target.textContent).toBe("")
    expect(settled).toBe(false)

    finish({ messages: "bonjour" })
    await waiting

    await vi.waitFor(() => expect(target.textContent).toBe("theme: bonjour"))
  })

  it("lets its decorators use hooks, and keeps what's inside mounted from one draw to the next", async () => {
    mounts = 0

    function Stateful({ children }: { children: ReactNode }) {
      const [theme] = useState("stateful")

      return createElement(Theme.Provider, { value: theme }, children)
    }

    const { handle } = mount({ decorators: [(Inner: Story) => createElement(Stateful, null, createElement(Inner))] })

    await vi.waitFor(() => expect(target.textContent).toBe("theme: stateful"))

    handle.update([themed])
    handle.update([themed])

    await vi.waitFor(() => expect(target.textContent).toBe("theme: stateful"))

    expect(mounts).toBe(1)
  })

  it("composes each frame with its own project's preview, though another project's guest set its own since", async () => {
    const first = { decorators: [box("first")] }
    mount(first)
    await vi.waitFor(() => expect(nesting()).toEqual(["main", "first"]))

    // Another project's guest on the same page, which sets Storybook's annotations to its own preview.
    const other = document.createElement("div")
    document.body.append(other)

    const otherGuest = createGuest({
      components: { Themed },
      css: "",
      decorators: { list: [], modules: {}, project: { decorators: [box("second")] }, composer: portableStories }
    })

    mounted.push(otherGuest.mount(other, [themed]))
    await vi.waitFor(() => expect(other.querySelector("[data-box=second]")).not.toBeNull())

    for (const handle of mounted.splice(0)) {
      handle.unmount()
    }

    mount(first)

    await vi.waitFor(() => expect(nesting()).toEqual(["main", "first"]))
    other.remove()
  })

  it("says why when the preview's loaders fail, and the frame stays empty", async () => {
    const onError = vi.fn<NonNullable<MountOptions["onError"]>>()
    mount({ loaders: [() => Promise.reject(new Error("no messages"))] }, { onError })

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(new Error("the preview's loaders failed: no messages")))

    expect(target.textContent).toBe("")
  })

  it("says why the preview or Storybook's package didn't load, and frames draw in the libraries' decorators", async () => {
    const onError = vi.fn<NonNullable<MountOptions["onError"]>>()
    mount({ decorators: [box("outer")] }, { onError }, { loadError: "Cannot find module '@storybook/react'" })

    await vi.waitFor(() => expect(target.textContent).toBe("theme: none"))

    expect(onError).toHaveBeenCalledWith(
      new Error("the package that composes the preview didn't load: Cannot find module '@storybook/react'")
    )
    expect(nesting()).toEqual(["main"])
  })
})
