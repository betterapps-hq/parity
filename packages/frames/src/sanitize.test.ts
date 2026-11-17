import { elementSourceAttribute } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { removedTag, sanitizePage, sanitizeRoot, sanitizeSheet } from "./sanitize.ts"
import type { FrozenElement, FrozenNode } from "./snapshot.ts"

const policy = { pageOrigin: "http://p1.localhost:5173" }

const element = (
  tag: string,
  attributes: [string, string][] = [],
  children: FrozenNode[] = [],
  namespace?: "svg" | "math"
): FrozenElement => {
  const made: FrozenElement = { tag, attributes, children }

  if (namespace) {
    made.namespace = namespace
  }

  return made
}

/** The one child of the body after sanitizing, and how many things were taken out. */
function sanitizeOne(child: FrozenElement) {
  const { body, removed } = sanitizePage(element("body", [], [child]), policy)
  const [only] = body.children

  if (!only || !(only instanceof Object)) {
    throw new Error("expected one element")
  }

  return { only, removed }
}

/** The value an attribute keeps after sanitizing, or undefined when it was dropped. */
function kept(tag: string, name: string, value: string, namespace?: "svg" | "math"): string | undefined {
  const { only } = sanitizeOne(element(tag, [[name, value]], [], namespace))

  return only.attributes.find(([attribute]) => attribute === name)?.[1]
}

const placeholder = element(removedTag)

describe("sanitizePage: elements", () => {
  it.each([
    ["script", undefined],
    ["iframe", undefined],
    ["frame", undefined],
    ["frameset", undefined],
    ["object", undefined],
    ["embed", undefined],
    ["portal", undefined],
    ["base", undefined],
    ["meta", undefined],
    ["link", undefined],
    ["noscript", undefined],
    ["template", undefined],
    ["style", undefined],
    ["script", "svg"],
    ["style", "svg"],
    ["animate", "svg"],
    ["set", "svg"],
    ["animateMotion", "svg"],
    ["animateTransform", "svg"],
    ["script", "math"]
  ] as const)("drops %s (%s) as an empty placeholder, children and all", (tag, namespace) => {
    const { only, removed } = sanitizeOne(element(tag, [["id", "x"]], ["alert(1)", element("p")], namespace))

    expect(only).toEqual(placeholder)
    expect(removed).toBe(1)
  })

  it("keeps HTML's content elements and their text", () => {
    const article = element("article", [], [element("h1", [], ["Plans"]), element("img"), "Pick one"])

    expect(sanitizeOne(article)).toEqual({ only: article, removed: 0 })
  })

  it("keeps SVG's drawing elements, with their namespace and case", () => {
    const svg = element(
      "svg",
      [["viewBox", "0 0 10 10"]],
      [element("linearGradient", [["id", "g"]], [], "svg"), element("path", [["d", "M0 0"]], [], "svg")],
      "svg"
    )

    expect(sanitizeOne(svg)).toEqual({ only: svg, removed: 0 })
  })

  it("keeps HTML inside an SVG foreignObject", () => {
    const svg = element("svg", [], [element("foreignObject", [], [element("div", [], ["Hi"])], "svg")], "svg")

    expect(sanitizeOne(svg).only).toEqual(svg)
  })

  it("keeps MathML's elements", () => {
    const math = element("math", [], [element("mfrac", [], [element("mi", [], ["x"], "math")], "math")], "math")

    expect(sanitizeOne(math)).toEqual({ only: math, removed: 0 })
  })

  it("drops an element that isn't on its namespace's list, as an SVG tag in HTML's", () => {
    expect(sanitizeOne(element("linearGradient")).only).toEqual(placeholder)
    expect(sanitizeOne(element("div", [], [], "svg")).only).toEqual(placeholder)
  })

  it("keeps custom elements' tags, so the page's CSS still matches them", () => {
    const custom = element("pricing-card", [["data-plan", "pro"]], ["Pro"])

    expect(sanitizeOne(custom)).toEqual({ only: custom, removed: 0 })
  })

  it("drops reserved names and names that aren't custom elements'", () => {
    expect(sanitizeOne(element("font-face")).only).toEqual(placeholder)
    expect(sanitizeOne(element("Pricing-Card")).only).toEqual(placeholder)
    expect(sanitizeOne(element("-card")).only).toEqual(placeholder)
    expect(sanitizeOne(element(removedTag, [["id", "x"]])).removed).toBe(1)
  })
})

describe("sanitizePage: attributes", () => {
  /** The element a denied attribute would mean something on, where it isn't a button's. */
  const carriers = new Map([
    ["http-equiv", "div"],
    ["autoplay", "video"]
  ])

  it.each([
    "onclick",
    "onerror",
    "onload",
    "autofocus",
    "autoplay",
    "is",
    "popover",
    "popovertarget",
    "action",
    "formaction",
    "form",
    "ping",
    "srcdoc",
    "http-equiv"
  ])("drops %s", (name) => {
    expect(kept(carriers.get(name) ?? "button", name, "x")).toBeUndefined()
  })

  it("drops an event handler on SVG's and MathML's elements", () => {
    expect(kept("circle", "onload", "alert(1)", "svg")).toBeUndefined()
    expect(kept("mi", "onclick", "alert(1)", "math")).toBeUndefined()
  })

  it("keeps global attributes that describe content", () => {
    for (const name of ["id", "class", "title", "lang", "dir", "hidden", "role", "slot", "part", "tabindex"]) {
      expect(kept("section", name, "a")).toBe("a")
    }
  })

  it("keeps data-*, aria-* and the builder's source attribute", () => {
    expect(kept("div", "data-state", "open")).toBe("open")
    expect(kept("div", "aria-label", "Close")).toBe("Close")
    expect(kept("div", elementSourceAttribute, "src/App.tsx:4:2")).toBe("src/App.tsx:4:2")
    expect(kept("path", "aria-hidden", "true", "svg")).toBe("true")
  })

  it("keeps a per-element attribute only on its elements", () => {
    expect(kept("input", "value", "ada@example.com")).toBe("ada@example.com")
    expect(kept("input", "checked", "")).toBe("")
    expect(kept("option", "selected", "")).toBe("")
    expect(kept("div", "value", "x")).toBeUndefined()
    expect(kept("td", "colspan", "2")).toBe("2")
    expect(kept("p", "colspan", "2")).toBeUndefined()
  })

  it("keeps SVG's presentation attributes and drops unknown ones", () => {
    expect(kept("rect", "fill", "red", "svg")).toBe("red")
    expect(kept("rect", "stroke-width", "2", "svg")).toBe("2")
    expect(kept("rect", "begin", "0s", "svg")).toBeUndefined()
  })

  it("keeps MathML's layout attributes and drops unknown ones", () => {
    expect(kept("mo", "stretchy", "true", "math")).toBe("true")
    expect(kept("mi", "href", `${policy.pageOrigin}/`, "math")).toBeUndefined()
  })

  it("drops a data-* name setAttribute wouldn't take", () => {
    expect(kept("div", "data-a b", "x")).toBeUndefined()
  })

  it("counts every attribute it takes out", () => {
    const { removed } = sanitizeOne(
      element("button", [
        ["onclick", "x"],
        ["formaction", "x"],
        ["type", "button"]
      ])
    )

    expect(removed).toBe(2)
  })
})

describe("sanitizePage: URLs", () => {
  const other = "https://cdn.example.com/a.png"

  it("keeps any URL on the page's origin", () => {
    expect(kept("a", "href", `${policy.pageOrigin}/pricing`)).toBe(`${policy.pageOrigin}/pricing`)
    expect(kept("img", "src", `${policy.pageOrigin}/logo.svg`)).toBe(`${policy.pageOrigin}/logo.svg`)
    expect(kept("use", "href", `${policy.pageOrigin}/sprite.svg#a`, "svg")).toBe(`${policy.pageOrigin}/sprite.svg#a`)
  })

  it("keeps https: images, fonts and media on any host", () => {
    expect(kept("img", "src", other)).toBe(other)
    expect(kept("video", "src", "https://cdn.example.com/a.mp4")).toBe("https://cdn.example.com/a.mp4")
    expect(kept("audio", "src", "https://cdn.example.com/a.mp3")).toBe("https://cdn.example.com/a.mp3")
    expect(kept("source", "src", "https://cdn.example.com/a.webm")).toBe("https://cdn.example.com/a.webm")
    expect(kept("video", "poster", other)).toBe(other)
    expect(kept("image", "href", other, "svg")).toBe(other)
    expect(kept("image", "xlink:href", other, "svg")).toBe(other)
  })

  it("drops a link to another host, and a non-media load from one", () => {
    expect(kept("a", "href", "https://example.com/")).toBeUndefined()
    expect(kept("a", "href", "https://example.com/", "svg")).toBeUndefined()
    expect(kept("use", "href", "https://example.com/sprite.svg#a", "svg")).toBeUndefined()
    expect(kept("track", "src", "https://example.com/captions.vtt")).toBeUndefined()
  })

  it("drops http: on any other host, even for images", () => {
    expect(kept("img", "src", "http://cdn.example.com/a.png")).toBeUndefined()
    expect(kept("img", "src", "http://p1.localhost:5174/a.png")).toBeUndefined()
  })

  it("drops javascript:, blob: and other schemes", () => {
    expect(kept("a", "href", "javascript:alert(1)")).toBeUndefined()
    expect(kept("a", "href", " JavaScript:alert(1)")).toBeUndefined()
    expect(kept("img", "src", "blob:http://p1.localhost:5173/x")).toBeUndefined()
    expect(kept("a", "href", "mailto:ada@example.com")).toBeUndefined()
  })

  it("keeps data: URLs of images and fonts only", () => {
    expect(kept("img", "src", "data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA")
    expect(kept("img", "src", "data:text/html,<script>alert(1)</script>")).toBeUndefined()
    expect(kept("a", "href", "data:image/png;base64,AAAA")).toBeUndefined()
  })

  it("drops a relative URL, which would resolve against Parity's address", () => {
    expect(kept("img", "src", "/logo.svg")).toBeUndefined()
    expect(kept("a", "href", "pricing")).toBeUndefined()
  })

  it("keeps a reference to an element in the same copy", () => {
    expect(kept("use", "href", "#icon", "svg")).toBe("#icon")
    expect(kept("a", "href", "#plans")).toBe("#plans")
  })

  it("keeps only a srcset's allowed candidates, and drops it when none are", () => {
    const srcset = `${other} 1x, javascript:alert(1) 2x, data:image/png;base64,AA,AA 3x, http://x.example/a.png 4x`

    expect(kept("img", "srcset", srcset)).toBe(`${other} 1x, data:image/png;base64,AA,AA 3x`)
    expect(kept("img", "srcset", "javascript:alert(1) 1x")).toBeUndefined()
  })

  it("takes disallowed url()s out of a style attribute", () => {
    const style = `background: url("javascript:alert(1)") no-repeat; mask: url(${other}); color: red`

    expect(kept("div", "style", style)).toBe(`background: none no-repeat; mask: url(${other}); color: red`)
    expect(kept("rect", "style", "fill: url(#g)", "svg")).toBe("fill: url(#g)")
  })

  it("takes disallowed url()s out of SVG's presentation attributes", () => {
    expect(kept("g", "filter", "url(http://evil.example/f.svg#f)", "svg")).toBe("none")
    expect(kept("rect", "fill", "url(#g) red", "svg")).toBe("url(#g) red")
    expect(kept("path", "mask", `url(${policy.pageOrigin}/m.svg#m)`, "svg")).toBe(`url(${policy.pageOrigin}/m.svg#m)`)
    expect(kept("path", "d", "M0 0L10 10", "svg")).toBe("M0 0L10 10")
  })
})

describe("sanitizeRoot", () => {
  it("keeps <html>'s classes and allowed attributes, with its style's URLs checked", () => {
    const root = {
      classes: ["geist", "dark"],
      attributes: [
        ["lang", "en"],
        ["onclick", "alert(1)"],
        ["data-theme", "dark"]
      ] satisfies [string, string][],
      style: "background: url(http://evil.example/a.png); --brand: red"
    }

    expect(sanitizeRoot(root, policy)).toEqual({
      root: {
        classes: ["geist", "dark"],
        attributes: [
          ["lang", "en"],
          ["data-theme", "dark"]
        ],
        style: "background: none; --brand: red"
      },
      removed: 1
    })
  })
})

describe("sanitizeSheet", () => {
  it("refuses @import, which the page inlined", () => {
    expect(sanitizeSheet(`@import url("https://evil.example/a.css"); a { color: red }`, policy)).toBe(
      " a { color: red }"
    )
    expect(sanitizeSheet(`@IMPORT 'x.css' screen;b{}`, policy)).toBe("b{}")
  })

  it("keeps url()s on the page's origin, https: hosts, data: images and fonts, and fragments", () => {
    const css = [
      `a { background: url(${policy.pageOrigin}/bg.png) }`,
      `@font-face { src: url("https://fonts.example.com/a.woff2") format("woff2") }`,
      `b { background: url('data:image/svg+xml,<svg/>') }`,
      `c { src: url(data:font/woff2;base64,AA) }`,
      `d { clip-path: url(#clip) }`
    ].join("\n")

    expect(sanitizeSheet(css, policy)).toBe(css)
  })

  it("takes out every other url()", () => {
    expect(sanitizeSheet(`a { background: url(http://evil.example/x.png) }`, policy)).toBe("a { background: none }")
    expect(sanitizeSheet(`a { background: URL( "javascript:alert(1)" ) }`, policy)).toBe("a { background: none }")
    expect(sanitizeSheet(`a { background: url(data:text/html,x) }`, policy)).toBe("a { background: none }")
    expect(sanitizeSheet(`a { background: url(/relative.png) }`, policy)).toBe("a { background: none }")
  })

  it("reads escapes in a url() before checking it", () => {
    expect(sanitizeSheet(String.raw`a { background: url("\6a avascript:alert(1)") }`, policy)).toBe(
      "a { background: none }"
    )
  })

  it("reads escapes in an unquoted url()", () => {
    expect(sanitizeSheet(String.raw`a { background: url(\6a avascript:alert\(1\)) }`, policy)).toBe(
      "a { background: none }"
    )
  })

  it("finds url() and @import when escapes spell their names", () => {
    expect(sanitizeSheet(String.raw`a { background: u\72l(http://evil.example/x.png) }`, policy)).toBe(
      "a { background: none }"
    )
    expect(sanitizeSheet(String.raw`@\69mport "http://evil.example/a.css"; b{}`, policy)).toBe(" b{}")
  })

  it("keeps escapes in names that don't load anything, as Tailwind's selectors", () => {
    const css = String.raw`.md\:flex { display: flex } .w-\[10px\] { width: 10px }`

    expect(sanitizeSheet(css, policy)).toBe(css)
  })

  it("checks every image-set() candidate past a url() one, and leaves type() descriptors alone", () => {
    const css = `a { background: image-set(url(https://cdn.example/a.png) 1x, "http://evil.example/b.png" 2x) }`

    expect(sanitizeSheet(css, policy)).toBe(`a { background: image-set(url(https://cdn.example/a.png) 1x, none 2x) }`)

    const typed = `a { background: image-set("${policy.pageOrigin}/a.avif" type("image/avif"), "${policy.pageOrigin}/a.png" type("image/png")) }`

    expect(sanitizeSheet(typed, policy)).toBe(typed)
  })

  it("reads past comments, which CSS ignores, before checking image-set()", () => {
    expect(sanitizeSheet(`a { background: image-set(/* photo */ "http://evil.example/a.png" 1x) }`, policy)).toBe(
      "a { background: image-set(  none 1x) }"
    )
    expect(
      sanitizeSheet(
        `a { background: image-set(url(https://cdn.example/a.png) 1x /* ) */, "http://evil.example/b.png" 2x) }`,
        policy
      )
    ).toBe("a { background: image-set(url(https://cdn.example/a.png) 1x  , none 2x) }")
  })

  it("refuses an image-set() or src() image that says what it loads only when drawn, as var() does", () => {
    expect(
      sanitizeSheet(`a { --photo: "http://evil.example/a.png"; background: image-set(var(--photo) 1x) }`, policy)
    ).toBe(`a { --photo: "http://evil.example/a.png"; background: image-set(none) }`)
    expect(sanitizeSheet(`a { background: image-set(linear-gradient(red, blue) 1x) }`, policy)).toBe(
      "a { background: image-set(linear-gradient(red, blue) 1x) }"
    )
    expect(sanitizeSheet(`a { background: src(var(--photo)) }`, policy)).toBe("a { background: src(none) }")
    expect(sanitizeSheet(`a { background: src("http://evil.example/a.png") }`, policy)).toBe(
      "a { background: src(none) }"
    )
  })

  it("reads a backslash before a newline in a url() string as the string going on", () => {
    expect(sanitizeSheet(`a { background: url("http:\\\n//evil.example/a.png") }`, policy)).toBe(
      "a { background: none }"
    )
    expect(sanitizeSheet(`a { background: url('http:\\\r\n//evil.example/a.png') }`, policy)).toBe(
      "a { background: none }"
    )
  })

  it("checks a url() left open at the end of the text, which CSS still loads", () => {
    expect(sanitizeSheet("a{background:url(http://evil.example/x.png", policy)).toBe("a{background:none")
    expect(sanitizeSheet(`a{background:url("http://evil.example/x.png`, policy)).toBe("a{background:none")
    expect(sanitizeSheet(`a{background:url(${policy.pageOrigin}/x.png`, policy)).toBe(
      `a{background:url(${policy.pageOrigin}/x.png`
    )
  })

  it("disarms an @import that taking out another would make", () => {
    expect(sanitizeSheet(`@im@import "";port "http://evil.example/a.css"; b{}`, policy)).toBe(
      `@-parity-removed-import "http://evil.example/a.css"; b{}`
    )
  })

  it("reads long names in one pass", () => {
    const started = performance.now()

    sanitizeSheet(`a{--x:${"a".repeat(1_000_000)}}`, policy)

    expect(performance.now() - started).toBeLessThan(2000)
  })

  it("checks image-set()'s strings as it does url()s", () => {
    expect(
      sanitizeSheet(
        `a { background: image-set("http://evil.example/a.png" 1x, "${policy.pageOrigin}/b.png" 2x) }`,
        policy
      )
    ).toBe(`a { background: image-set(none 1x, "${policy.pageOrigin}/b.png" 2x) }`)
  })
})
