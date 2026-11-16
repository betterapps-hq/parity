import type { MountHandle, MountOptions, RenderNode } from "@parity-app/core"
import {
  Children,
  cloneElement,
  createElement,
  forwardRef,
  memo,
  type ReactElement,
  type ReactNode,
  type Ref,
  version
} from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { createGuest } from "./guest.ts"

// The project's `vite.react-18.config.ts` gives this file React 18 for `react` and `react-dom`, as a customer's project
// on React 18 gives the guest (PAR-1144, PAR-1157).

const mounted: MountHandle[] = []
let target: HTMLElement

beforeEach(() => {
  target = document.createElement("div")
  document.body.append(target)
  // React 18 logs each error it renders, caught or not, which these tests make on purpose.
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  for (const handle of mounted.splice(0)) {
    handle.unmount()
  }

  target.remove()
  vi.restoreAllMocks()
})

type OnError = NonNullable<MountOptions["onError"]>

function mount(guest: ReturnType<typeof createGuest>, tree: RenderNode[], onError?: OnError) {
  const handle = guest.mount(target, tree, { onError })
  mounted.push(handle)

  return handle
}

function component(nodeId: string, name: string, children: RenderNode[] = []): RenderNode {
  return { kind: "component", nodeId, component: name, props: {}, slots: children.length ? { children } : {} }
}

const paragraph: RenderNode = {
  kind: "element",
  nodeId: "text",
  tag: "p",
  declarations: [],
  children: [{ kind: "text", text: "Hello" }]
}

describe("frames on React 18", () => {
  it("draws with React 18", () => {
    expect(version).toBe("18.3.1")
  })

  it("tells the frame about an error a component's boundary caught, by the component's name", async () => {
    const Broken = () => {
      throw new Error("no price")
    }

    const onError = vi.fn<OnError>()

    mount(createGuest({ components: { Broken }, css: "" }), [component("card", "Broken")], onError)

    await vi.waitFor(() => expect(onError).toHaveBeenCalled())

    expect(onError).toHaveBeenCalledWith(new Error("Broken: no price"), { nodeId: "card", component: "Broken" })
    expect(target.querySelector("[data-failed-component=Broken]")?.getAttribute("data-error")).toBe("no price")
  })

  it("blanks the frame for an error outside every component's boundary, and draws it again on the next update", async () => {
    let broken = true

    const Provider = ({ children }: { children?: ReactNode }) => {
      if (broken) {
        throw new Error("no theme")
      }

      return children
    }

    const guest = createGuest({
      components: {},
      css: "",
      decorators: {
        list: [{ library: "theme", decorator: { wrap: { import: "theme", component: "Provider" } } }],
        modules: { theme: { Provider } }
      }
    })

    const onError = vi.fn<OnError>()
    const handle = mount(guest, [paragraph], onError)

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(new Error("no theme")))

    expect(target.textContent).toBe("")

    broken = false
    handle.update([paragraph])

    await vi.waitFor(() => expect(target.textContent).toBe("Hello"))
  })

  describe("a ref from a parent cloning a layer, as Slot does for asChild", () => {
    const Button = forwardRef<HTMLButtonElement>(function Button(props, ref) {
      return createElement("button", { ...props, ref }, "Go")
    })

    let given: HTMLElement | null = null

    const Slot = ({ children }: { children: ReactElement<{ ref?: Ref<HTMLElement> }> }) =>
      cloneElement(Children.only(children), { ref: (element: HTMLElement | null) => void (given = element) })

    const tree = [component("slot", "Slot", [component("button", "Button")])]

    beforeEach(() => {
      given = null
    })

    it("reaches a component given eagerly", async () => {
      mount(createGuest({ components: { Slot, Button }, css: "" }), tree)

      await vi.waitFor(() => expect(given).toBeInstanceOf(HTMLButtonElement))
    })

    it("reaches a component loaded on demand", async () => {
      const guest = createGuest({ components: { Slot }, lazyComponents: { Button: async () => Button }, css: "" })
      mount(guest, tree)

      await vi.waitFor(() => expect(given).toBeInstanceOf(HTMLButtonElement))
    })
  })
})

describe("a decorator drawing the frame's content itself", () => {
  /** A router as TanStack's is: made once, drawing its root route's component and not its own children. */
  interface Router {
    root: () => ReactNode
  }

  const Root = memo(function Root({ router }: { router: Router }) {
    return router.root()
  })

  const RouterProvider = ({ router }: { router: Router }) => createElement(Root, { router })

  const guest = () =>
    createGuest({
      components: {},
      css: "",
      decorators: {
        list: [
          {
            library: "router",
            decorator: {
              wrap: {
                import: "router",
                component: "RouterProvider",
                props: {
                  router: {
                    $call: { import: "router", export: "createRouter" },
                    args: [{ root: { $function: { $frame: "content" } } }]
                  }
                }
              }
            }
          }
        ],
        modules: { router: { RouterProvider, createRouter: (options: Router) => options } }
      }
    })

  const saying = (text: string): RenderNode => ({ ...paragraph, children: [{ kind: "text", text }] })

  it("draws it where the component puts it, once, and draws the frame's next content there too (PAR-1195)", async () => {
    const handle = mount(guest(), [saying("Hello")])

    await vi.waitFor(() => expect(target.textContent).toBe("Hello"))

    handle.update([saying("Goodbye")])

    await vi.waitFor(() => expect(target.textContent).toBe("Goodbye"))
  })
})
