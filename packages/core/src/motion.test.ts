import { describe, expect, it } from "vite-plus/test"
import { type DesignNode, nodeStyle } from "./document.ts"
import { springLinear, springSettle, transitionCss } from "./motion.ts"
import { resolveDesign } from "./render.ts"

describe("transitionCss", () => {
  it("writes Tailwind's defaults for an unset time and easing, and each set's properties", () => {
    expect(transitionCss([{ property: "opacity" }])).toBe(
      "opacity var(--default-transition-duration, 150ms) var(--default-transition-timing-function, cubic-bezier(0.4, 0, 0.2, 1))"
    )
    expect(transitionCss([{ property: "shadow", duration: 200, easing: "linear" }])).toBe("box-shadow 200ms linear")
    expect(transitionCss([{ property: "transform", duration: 300, easing: "ease-out" }])).toBe(
      ["transform", "translate", "scale", "rotate"]
        .map((property) => `${property} 300ms var(--ease-out, cubic-bezier(0, 0, 0.2, 1))`)
        .join(", ")
    )
  })

  it("names tokens' variables, keeps a curve of its own, and adds a delay", () => {
    expect(
      transitionCss([{ property: "width", duration: "duration-fast", easing: "ease-snappy", delay: "duration-slow" }])
    ).toBe("width var(--duration-fast) var(--ease-snappy) var(--duration-slow)")
    expect(transitionCss([{ property: "width", duration: 120, easing: "steps(4)", delay: 50 }])).toBe(
      "width 120ms steps(4) 50ms"
    )
  })

  it("takes a spring's settle time as its duration, drawn with linear()", () => {
    const spring = { stiffness: 300, damping: 20, mass: 1 }
    const css = transitionCss([{ property: "opacity", duration: 900, easing: { spring } }])
    expect(css).toBe(`opacity ${springSettle(spring)}ms ${springLinear(spring)}`)
    expect(springLinear({ duration: 400, bounce: 0.3 })).toMatch(/^linear\(0, .*, 1\)$/)
  })

  it("leaves out hidden transitions, and writes nothing without any on", () => {
    expect(transitionCss([{ property: "opacity", hidden: true }])).toBeUndefined()
    expect(transitionCss([])).toBeUndefined()
    expect(
      transitionCss([
        { property: "opacity", hidden: true },
        { property: "width", duration: 100 }
      ])
    ).toBe("width 100ms var(--default-transition-timing-function, cubic-bezier(0.4, 0, 0.2, 1))")
  })
})

describe("transitions in the document", () => {
  it("round-trip every form through the schema", () => {
    const transitions = [
      { property: "colors", duration: 200, easing: "ease-out", delay: 75 },
      { property: "width", duration: "duration-fast", easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      { property: "transform", easing: { spring: { duration: 500, bounce: 0.3 } } },
      { property: "opacity", easing: { spring: { stiffness: 300, damping: 20, mass: 1 } }, hidden: true }
    ]

    expect(nodeStyle.parse({ transitions })).toEqual({ transitions })
  })

  it("rejects a property that isn't a name, and a spring missing its settings", () => {
    expect(nodeStyle.safeParse({ transitions: [{ property: "background color" }] }).success).toBe(false)
    expect(nodeStyle.safeParse({ transitions: [{ property: "all", easing: { spring: { bounce: 1 } } }] }).success).toBe(
      false
    )
  })

  it("draws the transition the state shows, so switching to it animates the change", () => {
    const card: DesignNode = {
      type: "layout",
      id: "card",
      style: { background: "card", transitions: [{ property: "colors", duration: 200 }] },
      children: []
    }

    const hover = {
      id: "hover",
      name: "Hover",
      overrides: { card: { style: { background: "accent", transitions: [{ property: "all", duration: 300 }] } } }
    }

    const style = (state?: typeof hover) => {
      const [drawn] = resolveDesign(card, state, "desktop")

      return drawn?.kind === "element" ? drawn.style : undefined
    }

    expect(style()?.transition).toMatch(/^color 200ms /)
    expect(style(hover)).toMatchObject({ background: "var(--accent)" })
    expect(style(hover)?.transition).toMatch(/^all 300ms /)
  })
})
