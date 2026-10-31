import { describe, expect, it } from "vite-plus/test"
import { categorize, themeOfSelector } from "./policy.ts"

const media = (prelude: string) => ({ name: "media", prelude })

describe("themeOfSelector", () => {
  it.each([
    [":root", "default"],
    [":root, :host", "default"],
    ["html", "default"],
    [":where(:root)", "default"],
    [":root:not(.dark)", "default"],
    [".light", "default"],
    ["[data-theme=light]", "default"],
    [":root, [data-theme='light']", "default"],
    [".dark", "dark"],
    ['[data-theme="dark"]', "dark"],
    ["[data-theme='dark' i]", "dark"],
    ["[data-theme=dark]", "dark"],
    [":root.dark", "dark"],
    ['html[data-theme="dark"]', "dark"],
    [":host([data-mantine-color-scheme='dark'])", "dark"],
    [":root[data-mantine-color-scheme='dark'], :host([data-mantine-color-scheme='dark'])", "dark"],
    [".dark, [data-theme=dark]", "dark"],
    [".ocean", "ocean"]
  ])("reads %s as %s", (selector, theme) => {
    expect(themeOfSelector(selector, [])).toBe(theme)
  })

  it.each([
    ".dark .card",
    ".dark > .card",
    "[data-theme] .card",
    ".dark.contrast",
    "[data-theme^=dark]",
    "[data-theme]",
    "body",
    "[data-canvas-body]",
    ".card:hover",
    ".dark, .ocean",
    "*"
  ])("reads %s as no theme", (selector) => {
    expect(themeOfSelector(selector, [])).toBeUndefined()
  })

  it("keeps a value under @layer or @supports in its theme, and one under another at-rule in none", () => {
    expect(themeOfSelector(".dark", [{ name: "layer", prelude: "base" }])).toBe("dark")
    expect(themeOfSelector(":root", [{ name: "supports", prelude: "(color: red)" }])).toBe("default")
    expect(themeOfSelector("", [{ name: "media", prelude: "print" }])).toBeUndefined()
    expect(themeOfSelector(":root", [media("(width >= 40rem)")])).toBeUndefined()
    expect(themeOfSelector(":root", [{ name: "container", prelude: "(width > 1px)" }])).toBeUndefined()
  })

  it("reads Tailwind's @theme as the default only when asked to", () => {
    expect(themeOfSelector("", [{ name: "theme", prelude: "inline" }])).toBeUndefined()
    expect(themeOfSelector("", [{ name: "theme", prelude: "inline" }], { tailwindTheme: true })).toBe("default")
  })

  it("reads a prefers-color-scheme block as its theme only when asked to", () => {
    expect(themeOfSelector(":root", [media("(prefers-color-scheme: dark)")])).toBeUndefined()
    expect(themeOfSelector(":root", [media("(prefers-color-scheme: dark)")], { colorScheme: true })).toBe("dark")
    expect(themeOfSelector(":root", [media("(prefers-color-scheme: light)")], { colorScheme: true })).toBe("default")
    expect(themeOfSelector(".dark", [media("(prefers-color-scheme: dark)")], { colorScheme: true })).toBe("dark")
    expect(themeOfSelector(".ocean", [media("(prefers-color-scheme: dark)")], { colorScheme: true })).toBeUndefined()
    expect(themeOfSelector(":root", [media("screen and (prefers-color-scheme: dark)")], { colorScheme: true })).toBe(
      undefined
    )
  })
})

describe("categorize", () => {
  it.each([
    ["fontSizeBase300", "16px", "font-size"],
    ["text-sm", "0.875rem", "font-size"],
    ["text-shadow-sm", "0 1px red", "shadow"],
    ["text-color", "#000", "color"],
    ["text", "#18181b", "color"],
    ["mantine-line-height-md", "1.55", "leading"],
    ["font-weight-bold", "700", "font-weight"],
    ["font-sans", "Inter", "font"],
    ["tracking-wide", "0.025em", "tracking"],
    ["radius", "0.625rem", "radius"],
    ["mantine-radius-sm", "4px", "radius"],
    ["inset-shadow-xs", "inset 0 1px red", "shadow"],
    ["spacing", "0.25rem", "spacing"],
    ["mantine-spacing-md", "1rem", "spacing"],
    ["breakpoint-md", "48rem", "breakpoint"],
    ["container-3xs", "16rem", "container"],
    ["blur-xs", "4px", "effect"],
    ["backdrop-blur-sm", "8px", "effect"],
    ["perspective-near", "300px", "effect"],
    ["aspect-video", "16 / 9", "effect"],
    ["ease-in", "cubic-bezier(0.4, 0, 1, 1)", "motion"],
    ["animate-spin", "spin 1s linear infinite", "motion"],
    ["durationFast", "150ms", "motion"],
    ["color-red-500", "oklch(0.637 0.237 25.331)", "color"],
    ["primary", "oklch(0.205 0 0)", "color"],
    ["ring", "currentColor", "color"],
    ["surface", "light-dark(#fff, #000)", "color"],
    ["sidebar-width", "16rem", "other"]
  ])("puts --%s: %s in %s", (name, value, category) => {
    expect(categorize(name, value)).toBe(category)
  })
})
