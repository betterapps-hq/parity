import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { inferProps } from "./index.ts"

const example = resolve(import.meta.dirname, "../../../examples/shadcn-vite")

describe("inferProps", () => {
  const components = inferProps(example, {
    Button: { path: "src/components/ui/button.tsx", export: "Button" },
    Badge: { path: "src/components/ui/badge.tsx", export: "Badge" },
    TabsTrigger: { path: "src/components/ui/tabs.tsx", export: "TabsTrigger" }
  })

  it("finds cva variants with their options and defaults", () => {
    const variant = components.Button?.props.find((prop) => prop.name === "variant")
    expect(variant).toMatchObject({
      kind: "enum",
      group: "variant",
      default: "default",
      options: ["default", "outline", "secondary", "ghost", "destructive", "link"]
    })
    expect(components.Button?.props.find((prop) => prop.name === "size")?.options).toContain("icon-sm")
  })

  it("reads own props, their defaults, and what passes through to the element", () => {
    const props = components.Button!.props
    expect(props.find((prop) => prop.name === "asChild")).toMatchObject({
      kind: "boolean",
      group: "own",
      default: false
    })
    expect(props.find((prop) => prop.name === "children")).toMatchObject({ kind: "node" })
    expect(props.find((prop) => prop.name === "disabled")).toMatchObject({ kind: "boolean", group: "html" })
    expect(props.find((prop) => prop.name === "type")?.options).toEqual(
      expect.arrayContaining(["submit", "reset", "button"])
    )
    expect(props.find((prop) => prop.name === "onClick")).toMatchObject({ kind: "function", group: "event" })
    expect(props.find((prop) => prop.name === "aria-label")).toMatchObject({ group: "aria" })
    expect(props.some((prop) => prop.name === "className" || prop.name === "ref")).toBe(false)
    expect(props.slice(0, 2).map((prop) => prop.group)).toEqual(["variant", "variant"])
  })

  it("says a component passing its element's attributes takes a style", () => {
    expect(components.Button?.takesStyle).toBe(true)
  })

  it("follows components that wrap a library primitive", () => {
    expect(components.TabsTrigger?.props.find((prop) => prop.name === "value")).toMatchObject({
      kind: "string",
      required: true
    })
    expect(components.TabsTrigger?.props.find((prop) => prop.name === "disabled")).toMatchObject({ kind: "boolean" })
    expect(components.Badge?.props.find((prop) => prop.name === "variant")?.kind).toBe("enum")
  })
}, 60_000)

describe("whether a component takes a style", () => {
  let root: string

  beforeAll(async () => {
    root = (await mkdtemp(join(tmpdir(), "canvas-props-"))).replaceAll("\\", "/")
    await writeFile(
      join(root, "components.tsx"),
      [
        "export function MemberRow({ member }: { member: { name: string } }) { return null }",
        "export function Styled(props: { label: string; style?: { width?: string } }) { return null }",
        "export function Logo() { return null }",
        "export function Loose(props: any) { return null }",
        "export function Open(props: Record<string, unknown>) { return null }"
      ].join("\n")
    )
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("is false when the props have no style, and unknown when they could have any key", () => {
    const names = ["MemberRow", "Styled", "Logo", "Loose", "Open"]
    const found = inferProps(
      root,
      Object.fromEntries(names.map((name) => [name, { path: "components.tsx", export: name }]))
    )
    expect(names.map((name) => found[name]?.takesStyle)).toEqual([false, true, false, undefined, undefined])
  })
})
