import { describe, expect, it } from "vite-plus/test"
import { nodeStyle } from "./model.ts"
import {
  bezierCss,
  easingBeziers,
  easingCurves,
  plotCss,
  readEasingFunction,
  springLinear,
  springSettle,
  transitionCss
} from "./motion.ts"
import { isReadFailure } from "./read.ts"

describe("readEasingFunction", () => {
  it("reads a curve and steps as what they draw, which plotCss writes back", () => {
    for (const css of ["cubic-bezier(0.2, 0.8, 0.2, 1)", "steps(4)", "steps(3, jump-start)"]) {
      const plot = readEasingFunction(css)

      expect(isReadFailure(plot) ? plot.code : plotCss(plot)).toBe(css)
    }

    expect(readEasingFunction("steps(2, start)")).toEqual({ kind: "steps", count: 2, jump: "start" })
  })

  it("says what kind of failure it is", () => {
    expect(readEasingFunction("cubic-bezier(0.2, 0.8, 1)")).toMatchObject({ code: "arguments" })
    expect(readEasingFunction("cubic-bezier(1.2, 0, 0, 1)")).toMatchObject({ code: "out-of-range" })
    expect(readEasingFunction("steps(0)")).toMatchObject({ code: "out-of-range" })
    expect(readEasingFunction("ease-out")).toMatchObject({ code: "unreadable" })
  })
})

describe("easingCurves", () => {
  it("writes Tailwind's curves from the one table", () => {
    expect(easingCurves["ease-in"]).toBe("cubic-bezier(0.4, 0, 1, 1)")
    expect(bezierCss(easingBeziers["ease-in-out"])).toBe(easingCurves["ease-in-out"])
  })
})

describe("transitionCss", () => {
  it("writes Tailwind's defaults for an unset time and easing, and each set's properties", () => {
    expect(transitionCss([{ property: "opacity" }])).toBe(
      "opacity var(--default-transition-duration, 150ms) var(--default-transition-timing-function, cubic-bezier(0.4, 0, 0.2, 1))"
    )
    expect(transitionCss([{ property: "shadow", duration: { step: 200 }, easing: { keyword: "linear" } }])).toBe(
      "box-shadow 200ms linear"
    )
    expect(transitionCss([{ property: "transform", duration: { step: 300 }, easing: { keyword: "ease-out" } }])).toBe(
      ["transform", "translate", "scale", "rotate"]
        .map((property) => `${property} 300ms var(--ease-out, cubic-bezier(0, 0, 0.2, 1))`)
        .join(", ")
    )
  })

  it("names tokens' variables, keeps a curve of its own, and adds a delay", () => {
    expect(
      transitionCss([
        {
          property: "width",
          duration: { token: "duration-fast" },
          easing: { token: "ease-snappy" },
          delay: { token: "duration-slow" }
        }
      ])
    ).toBe("width var(--duration-fast) var(--ease-snappy) var(--duration-slow)")
    expect(
      transitionCss([
        { property: "width", duration: { step: 120 }, easing: { value: "steps(4)" }, delay: { step: 50 } }
      ])
    ).toBe("width 120ms steps(4) 50ms")
  })

  it("takes a spring's settle time as its duration, drawn with linear()", () => {
    const spring = { stiffness: 300, damping: 20, mass: 1 }
    const css = transitionCss([{ property: "opacity", duration: { step: 900 }, easing: { spring } }])
    expect(css).toBe(`opacity ${springSettle(spring)}ms ${springLinear(spring)}`)
    expect(springLinear({ duration: 400, bounce: 0.3 })).toMatch(/^linear\(0, .*, 1\)$/)
  })

  it("leaves out transitions that are off, and writes nothing without any on", () => {
    expect(transitionCss([{ property: "opacity", off: true }])).toBeUndefined()
    expect(transitionCss([])).toBeUndefined()
    expect(
      transitionCss([
        { property: "opacity", off: true },
        { property: "width", duration: { step: 100 } }
      ])
    ).toBe("width 100ms var(--default-transition-timing-function, cubic-bezier(0.4, 0, 0.2, 1))")
  })
})

describe("transition in the document", () => {
  it("round-trip every form through the schema", () => {
    const transition = [
      { property: "colors", duration: { step: 200 }, easing: { keyword: "ease-out" }, delay: { step: 75 } },
      {
        property: "width",
        duration: { token: "duration-fast" },
        easing: { value: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        delay: { token: "duration-slow" }
      },
      { property: "height", easing: { token: "ease-snappy" } },
      { property: "transform", easing: { spring: { duration: 500, bounce: 0.3 } } },
      { property: "opacity", easing: { spring: { stiffness: 300, damping: 20, mass: 1 } }, off: true }
    ]

    expect(nodeStyle.parse({ transition })).toEqual({ transition })
  })

  it("rejects a property that isn't a name, and a spring missing its settings", () => {
    expect(nodeStyle.safeParse({ transition: [{ property: "background color" }] }).success).toBe(false)
    expect(nodeStyle.safeParse({ transition: [{ property: "all", easing: { spring: { bounce: 1 } } }] }).success).toBe(
      false
    )
  })

  it("rejects a time or an easing in the form before this one, and a keyword that isn't an easing", () => {
    expect(nodeStyle.safeParse({ transition: [{ property: "all", duration: 200 }] }).success).toBe(false)
    expect(nodeStyle.safeParse({ transition: [{ property: "all", delay: "duration-fast" }] }).success).toBe(false)
    expect(nodeStyle.safeParse({ transition: [{ property: "all", duration: { value: "200ms" } }] }).success).toBe(false)
    expect(nodeStyle.safeParse({ transition: [{ property: "all", easing: "ease-out" }] }).success).toBe(false)
    expect(nodeStyle.safeParse({ transition: [{ property: "all", easing: { keyword: "ease" } }] }).success).toBe(false)
    expect(nodeStyle.safeParse({ transition: [{ property: "all", hidden: true }] }).success).toBe(false)
  })
})
