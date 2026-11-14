import type { ContainerSpec } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { codeDesignSettings, hasTriedSize, withCodeDesignSettings, withoutTriedSize } from "./tried-size.ts"

/** A story as its code draws it: a root hugging what it draws. */
const drawn: ContainerSpec = {
  id: "story",
  name: "Plan card / Default",
  kind: "screen",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    style: { width: { size: "hug" }, padding: { step: 4 } },
    children: [{ type: "component", id: "story", component: "PlanCard", props: { name: "Team" } }]
  }
}

/** The story dragged narrower, with its height set, and its args changed. */
const tried: ContainerSpec = {
  ...drawn,
  root: {
    type: "layout",
    id: "root",
    style: { width: { step: 33 }, padding: { step: 4 } },
    children: [
      {
        type: "component",
        id: "story",
        component: "PlanCard",
        props: { name: "Business" },
        style: { height: { step: 100 } }
      }
    ]
  }
}

describe("a size tried on a story", () => {
  it("is put back as its code draws it, on every layer, leaving its args", () => {
    expect(hasTriedSize(tried, drawn)).toBe(true)

    const reset = withoutTriedSize(tried, drawn)

    expect(reset.root).toEqual({
      type: "layout",
      id: "root",
      style: { width: { size: "hug" }, padding: { step: 4 } },
      children: [{ type: "component", id: "story", component: "PlanCard", props: { name: "Business" }, style: {} }]
    })
    expect(hasTriedSize(reset, drawn)).toBe(false)
  })

  it("leaves a design without one as it is", () => {
    expect(hasTriedSize(drawn, drawn)).toBe(false)
    expect(withoutTriedSize(drawn, drawn)).toBe(drawn)
  })
})

describe("what's set on a design drawn from code", () => {
  const shown: ContainerSpec = { ...tried, view: { modes: ["dark"], scales: { dark: 0.5 }, params: {} } }

  it("is its view and the sizes tried on it, not its args", () => {
    expect(codeDesignSettings(shown, drawn)).toEqual({
      view: { modes: ["dark"], scales: { dark: 0.5 } },
      sizes: { root: { width: { step: 33 } }, story: { height: { step: 100 } } }
    })
  })

  it("comes back when its code draws it again", () => {
    const again = withCodeDesignSettings(drawn, codeDesignSettings(shown, drawn))

    expect(again.view).toEqual({ modes: ["dark"], scales: { dark: 0.5 } })
    expect(again.root).toEqual({
      ...drawn.root,
      style: { width: { step: 33 }, padding: { step: 4 } },
      children: [
        {
          type: "component",
          id: "story",
          component: "PlanCard",
          props: { name: "Team" },
          style: { height: { step: 100 } }
        }
      ]
    })
  })

  it("is nothing while it's as its code draws it", () => {
    expect(codeDesignSettings(drawn, drawn)).toBeUndefined()
    expect(withCodeDesignSettings(drawn, undefined)).toBe(drawn)
  })
})
