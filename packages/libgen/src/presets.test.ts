import { describe, expect, it } from "vitest"
import { presets } from "./presets.ts"

describe("Heroicons' tags", () => {
  const source = presets["@heroicons/react"]!.tags!
  const read = (scripts: { path: string; text: string }[]) => {
    if (!("page" in source)) throw new Error("Heroicons' tags should come from its website")
    return source.readScripts(scripts)
  }
  const icons = Array.from({ length: 60 }, (_, index) => `"icon-${index}":["word"]`).join(",")

  it("takes the largest object of word lists in the site's scripts", () => {
    const keywords = read([
      { path: "/_next/static/chunks/framework.js", text: `var sizes = { sm: ["a"], lg: ["b"] }` },
      {
        path: "/_next/static/chunks/pages/[[...slug]].js",
        text: `(self.webpackChunk = self.webpackChunk || []).push([[1], { 1: function (a, b, c) {
  var r = {"cog-6-tooth":["gear","settings"],${icons}}, s = c(2);
} }]);`
      }
    ])
    expect(keywords["cog-6-tooth"]).toEqual(["gear", "settings"])
    expect(Object.keys(keywords)).toHaveLength(61)
  })

  it("says so when the site no longer has them", () => {
    expect(() => read([{ path: "/main.js", text: `var r = {"x-mark":["close"]}` }])).toThrow(/keyword list/)
  })
})
