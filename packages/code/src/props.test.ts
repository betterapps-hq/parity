import { realpathSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import type { ComponentProp } from "@parity-app/core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { inferProps } from "./index.ts"

const example = resolve(import.meta.dirname, "../../../examples/shadcn-vite")

/**
 * A project with shadcn's components in its own code, shaped as shadcn writes them: cva variants, a component wrapping
 * a library's primitive, and classes on each one's element. React, cva and the primitive are declarations of their
 * shapes, so the tests read only what the project's own files say.
 */
const shadcnFiles = {
  "tsconfig.json": ['{ "compilerOptions": { "jsx": "preserve", "strict": true } }'],
  "node_modules/fake-react/index.d.ts": [
    "export type ReactNode = string | number | null | undefined",
    "export interface DOMAttributes { children?: ReactNode }",
    "export interface HTMLAttributes extends DOMAttributes { id?: string; className?: string; style?: object; 'aria-label'?: string }",
    "export interface ButtonHTMLAttributes extends HTMLAttributes {",
    "  disabled?: boolean",
    "  type?: 'submit' | 'reset' | 'button'",
    "  onClick?: (event: unknown) => void",
    "}"
  ],
  "node_modules/fake-cva/index.d.ts": [
    "type Config<T> = { variants: T; defaultVariants?: { [K in keyof T]?: keyof T[K] } }",
    "export declare function cva<T>(base: string, config: Config<T>): (props?: { [K in keyof T]?: keyof T[K] | null } & { className?: string }) => string",
    "export type VariantProps<F extends (...args: any) => any> = Omit<NonNullable<Parameters<F>[0]>, 'className'>"
  ],
  "node_modules/fake-tabs/index.d.ts": [
    'import type { ButtonHTMLAttributes } from "fake-react"',
    "export declare function Trigger(props: ButtonHTMLAttributes & { value: string }): null"
  ],
  "src/components/ui/button.tsx": [
    'import type { ButtonHTMLAttributes } from "fake-react"',
    'import { cva, type VariantProps } from "fake-cva"',
    'const buttonVariants = cva("inline-flex", {',
    "  variants: {",
    '    variant: { default: "", outline: "", secondary: "", ghost: "", destructive: "", link: "" },',
    '    size: { default: "h-9", sm: "h-8", "icon-sm": "size-8" }',
    "  },",
    '  defaultVariants: { variant: "default", size: "default" }',
    "})",
    "export function Button({",
    "  className,",
    '  variant = "default",',
    '  size = "default",',
    "  asChild = false,",
    "  ...props",
    "}: ButtonHTMLAttributes & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {",
    "  return <button className={buttonVariants({ variant, size, className })} {...props} />",
    "}"
  ],
  "src/components/ui/badge.tsx": [
    'import type { HTMLAttributes } from "fake-react"',
    'import { cva, type VariantProps } from "fake-cva"',
    'const badgeVariants = cva("h-5 px-2", { variants: { variant: { default: "", secondary: "" } } })',
    "export function Badge({ className, variant, ...props }: HTMLAttributes & VariantProps<typeof badgeVariants>) {",
    "  return <span className={badgeVariants({ variant, className })} {...props} />",
    "}"
  ],
  "src/components/ui/tabs.tsx": [
    'import { Trigger } from "fake-tabs"',
    "export function TabsTrigger(props: Parameters<typeof Trigger>[0]) {",
    "  return <Trigger {...props} />",
    "}"
  ],
  "src/components/ui/avatar.tsx": [
    'import type { HTMLAttributes } from "fake-react"',
    'export function Avatar(props: HTMLAttributes) { return <span className="relative flex size-8 shrink-0" {...props} /> }',
    'export function AvatarGroupCount(props: HTMLAttributes) { return <div className="flex size-8 items-center" {...props} /> }'
  ],
  "src/components/ui/card.tsx": [
    'import type { HTMLAttributes } from "fake-react"',
    'export function Card(props: HTMLAttributes) { return <div className="flex flex-col gap-6 rounded-xl" {...props} /> }',
    'export function CardHeader(props: HTMLAttributes) { return <div className="@container/card-header grid" {...props} /> }'
  ],
  "src/components/ui/separator.tsx": [
    'import type { HTMLAttributes } from "fake-react"',
    "export function Separator(props: HTMLAttributes) {",
    '  return <div className="bg-border data-horizontal:h-px data-horizontal:w-full" {...props} />',
    "}"
  ]
} satisfies Record<string, string[]>

/** Writes the shadcn project into a new folder and returns it. */
async function shadcnProject(): Promise<string> {
  const root = (await mkdtemp(join(tmpdir(), "canvas-shadcn-"))).replaceAll("\\", "/")

  for (const [path, lines] of Object.entries(shadcnFiles)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), lines.join("\n"))
  }

  return root
}

/** A component in the shadcn project's own code, from its file in `src/components/ui`. */
const ui = (name: string, file: string) => [name, { path: `src/components/ui/${file}.tsx`, export: name }] as const

describe("inferProps", () => {
  let root: string
  let components: ReturnType<typeof inferProps>

  beforeAll(async () => {
    root = await shadcnProject()
    components = inferProps(
      root,
      Object.fromEntries([ui("Button", "button"), ui("Badge", "badge"), ui("TabsTrigger", "tabs")])
    )
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
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

  it("lists a library's other props its component's file declares as its own (PAR-457)", () => {
    expect(prop("appearance")).toMatchObject({ kind: "enum", options: ["primary", "subtle"], group: "own" })
  })
})

describe("components that pass their props to a void element", () => {
  let root: string
  let found: ReturnType<typeof inferProps>

  // React's shape: every element's attributes extend `DOMAttributes`, which declares `children`.
  const react = [
    "export type ReactNode = string | number | null | undefined",
    "export type Ref<T> = { current: T | null }",
    "export interface DOMAttributes { children?: ReactNode }",
    "export interface HTMLAttributes extends DOMAttributes { id?: string }",
    "export interface InputHTMLAttributes extends HTMLAttributes { value?: string }"
  ]

  const components = [
    'import type { HTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from "fake-react"',
    "export function TextField(props: InputHTMLAttributes) { return null }",
    "export function Rule(props: HTMLAttributes & { ref?: Ref<HTMLHRElement> }) { return null }",
    "export function Box(props: HTMLAttributes & { ref?: Ref<HTMLDivElement> }) { return null }",
    "export function LabelledField(props: InputHTMLAttributes & { children?: ReactNode }) { return null }"
  ]

  beforeAll(async () => {
    root = (await mkdtemp(join(tmpdir(), "canvas-void-"))).replaceAll("\\", "/")
    await mkdir(join(root, "node_modules", "fake-react"), { recursive: true })
    await writeFile(join(root, "node_modules", "fake-react", "index.d.ts"), react.join("\n"))
    await writeFile(join(root, "components.tsx"), components.join("\n"))
    const names = ["TextField", "Rule", "Box", "LabelledField"]
    found = inferProps(root, Object.fromEntries(names.map((name) => [name, { path: "components.tsx", export: name }])))
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const takesChildren = (name: string) => found[name]?.props.some((prop) => prop.name === "children")

  it("leaves out the children React declares for every element, which a void element throws on", () => {
    expect(found.TextField?.props.map((prop) => prop.name)).toEqual(["id", "value"])
    expect(takesChildren("Rule")).toBe(false)
  })

  it("keeps children for other elements, and for a component that declares its own", () => {
    expect(takesChildren("Box")).toBe(true)
    expect(takesChildren("LabelledField")).toBe(true)
  })
}, 60_000)

describe("a library's own props, declared beside the attributes it passes on (PAR-457)", () => {
  let root: string
  let found: ReturnType<typeof inferProps>

  // A kit shaped as Nova is: each component's props are an element's attributes and a type of its own, and its
  // compiled JavaScript holds the cva variants and the defaults its declarations drop.
  const react = [
    "export interface DOMAttributes { children?: string }",
    "export interface ButtonHTMLAttributes extends DOMAttributes { disabled?: boolean; type?: 'submit' | 'button' }",
    "export interface HTMLAttributes extends DOMAttributes { hidden?: boolean; id?: string }"
  ]

  const declarations = [
    'import type { ButtonHTMLAttributes, HTMLAttributes } from "fake-react"',
    "export declare function MenuButton({ isActive, variant, size, ...props }: ButtonHTMLAttributes & {",
    "  isActive?: boolean",
    "} & { variant?: 'default' | 'outline' | null; size?: 'sm' | 'lg' | null }): null",
    "export declare function Panel({ variant, ...props }: HTMLAttributes & { variant?: 'sidebar' | 'floating' }): null",
    "export declare function Provider({ defaultOpen, open, ...props }: HTMLAttributes & {",
    "  defaultOpen?: boolean",
    "  open?: boolean",
    "}): null"
  ]

  const implementation = [
    'import { cva } from "class-variance-authority"',
    'const menuButtonVariants = cva("", {',
    '  variants: { variant: { default: "", outline: "" }, size: { sm: "", lg: "" } },',
    '  defaultVariants: { variant: "default", size: "sm" }',
    "})",
    'export function MenuButton({ isActive = false, variant = "default", size = "sm", ...props }) { return null }',
    'export function Panel({ variant = "sidebar", ...props }) { return null }',
    "export function Provider({ defaultOpen = true, open, ...props }) { return null }"
  ]

  beforeAll(async () => {
    root = (await mkdtemp(join(tmpdir(), "canvas-kit-"))).replaceAll("\\", "/")
    await mkdir(join(root, "node_modules", "fake-react"), { recursive: true })
    await mkdir(join(root, "node_modules", "kit"), { recursive: true })
    await writeFile(join(root, "node_modules", "fake-react", "index.d.ts"), react.join("\n"))
    await writeFile(join(root, "node_modules", "kit", "index.d.ts"), declarations.join("\n"))
    await writeFile(join(root, "node_modules", "kit", "index.js"), implementation.join("\n"))

    const source = (name: string) => ({
      path: "kit",
      export: name,
      library: "kit",
      declaration: "node_modules/kit/index.d.ts"
    })

    found = inferProps(root, { MenuButton: source("MenuButton"), Panel: source("Panel"), Provider: source("Provider") })
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const listed = (name: string) =>
    found[name]?.props.filter((prop) => prop.group === "variant" || prop.group === "own").map((prop) => prop.name)

  const prop = (component: string, name: string) => found[component]?.props.find((each) => each.name === name)

  it("lists a prop the component's own file adds to its element's attributes, with its default from the JavaScript", () => {
    expect(prop("MenuButton", "isActive")).toMatchObject({ kind: "boolean", group: "own", default: false })
    expect(prop("Provider", "defaultOpen")).toMatchObject({ kind: "boolean", group: "own", default: true })
    expect(listed("Provider")).toEqual(["defaultOpen", "open"])
  })

  it("keeps the attributes it passes on with the attributes", () => {
    expect(prop("MenuButton", "disabled")).toMatchObject({ group: "html" })
    expect(prop("Provider", "id")).toMatchObject({ group: "html" })
    expect(listed("MenuButton")).toEqual(["variant", "size", "isActive"])
  })

  it("takes a cva variant's options only for a prop whose type has them", () => {
    expect(prop("MenuButton", "variant")).toMatchObject({
      group: "variant",
      options: ["default", "outline"],
      default: "default"
    })
    expect(prop("Panel", "variant")).toMatchObject({
      kind: "enum",
      group: "own",
      options: expect.arrayContaining(["sidebar", "floating"]),
      default: "sidebar"
    })
  })

  it("reads Nova's sidebar as it ships in the example", () => {
    // Where the package really is, as discovery finds it: pnpm links it from the store.
    const folder = realpathSync(join(example, "node_modules/@buildkitgg/shadcn-baseui-nova"))

    const nova = (name: string) => ({
      path: "@buildkitgg/shadcn-baseui-nova",
      export: name,
      library: "nova",
      declaration: relative(example, join(folder, "dist/ui/sidebar.d.ts")).replaceAll("\\", "/")
    })

    const sidebar = inferProps(example, {
      SidebarMenuButton: nova("SidebarMenuButton"),
      SidebarProvider: nova("SidebarProvider"),
      Sidebar: nova("Sidebar")
    })

    const own = (name: string) =>
      sidebar[name]?.props.filter((each) => each.group === "variant" || each.group === "own").map((each) => each.name)

    expect(sidebar.SidebarMenuButton?.props.find((each) => each.name === "isActive")).toMatchObject({
      kind: "boolean",
      group: "own",
      default: false
    })
    expect(own("SidebarMenuButton")).toEqual(expect.arrayContaining(["variant", "size", "isActive", "tooltip"]))
    expect(own("SidebarMenuButton")).not.toContain("disabled")
    expect(own("SidebarProvider")).toEqual(expect.arrayContaining(["defaultOpen", "open"]))
    expect(sidebar.Sidebar?.props.find((each) => each.name === "variant")).toMatchObject({
      group: "own",
      options: expect.arrayContaining(["sidebar", "floating", "inset"]),
      default: "sidebar"
    })
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

describe("components that set their own size (PAR-518)", () => {
  let root: string
  let shadcn: string

  // A library's compiled parts, as `implementationOf` reads them beside their declarations.
  const compiled = [
    'import { jsx as _jsx } from "react/jsx-runtime"',
    "function Icon({ className, ...props }) {",
    '  return _jsx("span", { className: cn("size-4 shrink-0 [&_svg]:size-4", className), ...props })',
    "}",
    "function Rule({ className, ...props }) {",
    '  return _jsx("div", { className: cn("bg-border data-horizontal:h-px data-horizontal:w-full", className), ...props })',
    "}",
    "function Panel({ className, ...props }) {",
    '  return _jsx("div", { className: cn("flex w-full gap-2 group-data-[size=sm]/card:size-6", className), ...props })',
    "}",
    "export { Icon, Rule, Panel }"
  ]

  const parts = ["Icon", "Rule", "Panel"]

  beforeAll(async () => {
    root = (await mkdtemp(join(tmpdir(), "canvas-sized-"))).replaceAll("\\", "/")
    await mkdir(join(root, "node_modules", "kit"), { recursive: true })
    const declaration = (name: string) => `export declare function ${name}(props: { children?: string }): null`
    await writeFile(join(root, "node_modules", "kit", "index.d.ts"), parts.map(declaration).join("\n"))
    await writeFile(join(root, "node_modules", "kit", "index.js"), compiled.join("\n"))
    shadcn = await shadcnProject()
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(shadcn, { recursive: true, force: true })
  })

  it("says so for a width, a height under a line or @container on its own element, in a project's code", () => {
    const found = inferProps(
      shadcn,
      Object.fromEntries([
        ui("Avatar", "avatar"),
        ui("AvatarGroupCount", "avatar"),
        ui("CardHeader", "card"),
        ui("Separator", "separator"),
        ui("Card", "card"),
        ui("Badge", "badge"),
        ui("Button", "button")
      ])
    )

    const sized = Object.entries(found).flatMap(([name, info]) => (info.fixedSize ? [name] : []))
    // `size-8`, `size-8`, `@container/card-header` and `data-horizontal:h-px`. Badge's `h-5` holds a line of text, and
    // Button's size comes from a cva variant, not classes written on its element.
    expect(sized.sort()).toEqual(["Avatar", "AvatarGroupCount", "CardHeader", "Separator"])
  })

  it("reads a library's compiled parts, leaving out classes for what's inside or taken from a parent", () => {
    const part = (name: string) => [
      name,
      { path: "kit", export: name, library: "kit", declaration: "node_modules/kit/index.d.ts" }
    ]

    const found = inferProps(root, Object.fromEntries(parts.map(part)))
    expect(parts.map((name) => found[name]?.fixedSize)).toEqual([true, true, undefined])
  })
}, 60_000)
