import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
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

  it("follows components that wrap a library primitive", () => {
    expect(components.TabsTrigger?.props.find((prop) => prop.name === "value")).toMatchObject({
      kind: "string",
      required: true
    })
    expect(components.TabsTrigger?.props.find((prop) => prop.name === "disabled")).toMatchObject({ kind: "boolean" })
    expect(components.Badge?.props.find((prop) => prop.name === "variant")?.kind).toBe("enum")
  })
}, 60_000)
