import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { ComponentProp } from "@parity-app/core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
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

describe("Fluent's slots", () => {
  let root: string
  let props: ComponentProp[]

  // The shape of Fluent v9's `Slot` type, from @fluentui/react-utilities, in a package as a library's would be.
  const declarations = [
    "type ReactElement = { type: unknown; props: unknown; key: string | null }",
    "type ReactNode = ReactElement | string | number | Iterable<ReactNode> | null | undefined",
    "type SlotShorthandValue = ReactElement | string | number | Iterable<ReactNode>",
    'type WithSlotShorthandValue<Props> = Props | ("children" extends keyof Props ? Extract<SlotShorthandValue, Props["children"]> : never)',
    'type Slot<Type extends "span" | "input"> = WithSlotShorthandValue<{ as?: Type } & (Type extends "input" ? { value?: string } : { id?: string; children?: ReactNode })> | null',
    "type ButtonSlots = { root: NonNullable<Slot<'span'>>; icon?: Slot<'span'>; input?: Slot<'input'> }",
    'export type ButtonProps = Omit<ButtonSlots, never> & { appearance?: "primary" | "subtle"; children?: ReactNode }',
    "export declare function Button(props: ButtonProps): null"
  ]

  beforeAll(async () => {
    root = (await mkdtemp(join(tmpdir(), "canvas-slots-"))).replaceAll("\\", "/")
    await mkdir(join(root, "node_modules", "slots"), { recursive: true })
    await writeFile(join(root, "node_modules", "slots", "index.d.ts"), declarations.join("\n"))
    const found = inferProps(root, {
      Button: { path: "slots", export: "Button", library: "slots", declaration: "node_modules/slots/index.d.ts" }
    })
    props = found.Button?.props ?? []
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const prop = (name: string) => props.find((candidate) => candidate.name === name)

  it("shows a slot that takes content the way children shows, as one of the component's own props", () => {
    expect(prop("icon")).toMatchObject({ kind: "node", group: "own", type: "Slot<'span'>" })
    expect(prop("children")).toMatchObject({ kind: "node" })
  })

  it("reads a slot that takes only its part's props as an object", () => {
    expect(prop("input")).toMatchObject({ kind: "object", group: "html" })
  })

  it("leaves the root slot with the attributes, since it's the component itself", () => {
    expect(prop("root")).toMatchObject({ kind: "node", group: "html", required: true })
  })

  it("still reads a library's other props as before", () => {
    expect(prop("appearance")).toMatchObject({ kind: "enum", options: ["primary", "subtle"], group: "html" })
  })
})

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
