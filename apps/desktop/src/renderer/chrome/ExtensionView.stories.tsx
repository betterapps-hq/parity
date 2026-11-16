import type { ViewData } from "@parity-app/extension"
import storybookPackage from "@parity-app/extension-storybook/package.json" with { type: "json" }
import { readExtension } from "@parity-app/extension/manifest"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { expect, userEvent, within } from "storybook/test"
import type { ExtensionStatus } from "../../shared/protocol.ts"
import type { PlacedView } from "../extension-views.ts"
import { ExtensionView, type ViewSize } from "./ExtensionView.tsx"

/**
 * Extensions' declarative views (PAR-1094): what Parity draws from the data an extension sends, in a panel's tab or a
 * Design tab section, and on a page. Each kind is drawn with the kit, so it has the editor's spacing, keyboard use,
 * themes and accessible names.
 */
const meta = {
  title: "Parity/Chrome/Panels/Extension views",
  component: ExtensionView
} satisfies Meta<typeof ExtensionView>

export default meta

type Story = StoryObj<typeof meta>

const { id, manifest } = readExtension(storybookPackage)
const session = { id: "example", untilClosed: () => undefined }

/** The Storybook extension, in a state, with what its code set. */
function extension(state: ExtensionStatus["state"] = "running", reason?: string): ExtensionStatus {
  const status: ExtensionStatus = {
    id,
    displayName: manifest.displayName,
    prefix: manifest.prefix,
    icon: manifest.icon,
    contributes: manifest.contributes,
    permissions: {},
    activates: manifest.activates,
    version: "0.0.0",
    internal: false,
    window: false,
    node: true,
    capabilities: [],
    extensionDependencies: [],
    settings: {},
    settingProblems: [],
    state,
    status: {},
    context: { "storybook.hasStories": ["Button"] },
    facts: {},
    views: {}
  }

  if (reason) {
    status.reason = reason
  }

  return status
}

function placed(title: string, data?: ViewData, from = extension()): PlacedView {
  const view: PlacedView = {
    extension: from,
    id: "storybook.stories",
    title,
    kind: data?.kind ?? "list",
    place: "left"
  }

  if (data) {
    view.data = data
  }

  return view
}

const open = [{ command: "storybook.open" }]
const button = { type: "component", key: "Button" } as const

const tree: ViewData = {
  kind: "tree",
  options: { itemActions: open },
  items: [
    { key: "Button", label: "Button", detail: "3 stories", icon: "component", target: button },
    { key: "Button#Primary", label: "Primary", icon: "bookmark", parent: "Button", target: button },
    { key: "Button#Outline", label: "Outline", icon: "bookmark", parent: "Button", target: button },
    { key: "Card", label: "Card", detail: "1 story", icon: "component" },
    { key: "Card#Plain", label: "Plain", icon: "bookmark", parent: "Card" }
  ]
}

const table: ViewData = {
  kind: "table",
  options: { columns: ["Route", "Load time"], itemActions: open },
  items: [
    { key: "/", label: "/", cells: ["120 ms"] },
    { key: "/pricing", label: "/pricing", cells: ["640 ms"], icon: "triangle-alert", tone: "warning" }
  ]
}

const keyValue: ViewData = {
  kind: "keyValue",
  options: {},
  items: [
    { key: "config", label: "Config", value: ".storybook/main.ts" },
    { key: "port", label: "Port", value: "6006" }
  ]
}

const form: ViewData = {
  kind: "form",
  options: { description: "How Storybook starts." },
  items: [
    { key: "port", label: "Port", type: "number", value: 6006 },
    { key: "open", label: "Open in the browser", type: "boolean", value: true },
    {
      key: "builder",
      label: "Builder",
      type: "select",
      value: "vite",
      options: [
        { value: "vite", label: "Vite" },
        { value: "webpack", label: "Webpack" }
      ]
    },
    { key: "args", label: "Arguments", type: "text", value: "", placeholder: "--no-manager-cache" }
  ]
}

const guide: ViewData = {
  kind: "list",
  options: {
    description: "Parity reads your stories from Storybook's config and opens them in Storybook.",
    toolbar: open
  },
  items: [
    {
      key: "config",
      label: "Config found",
      detail: "Storybook's config is in .storybook.",
      icon: "circle-check",
      tone: "success"
    },
    {
      key: "stories",
      label: "No stories yet",
      detail: "Add a .stories file beside a component, and its stories show in Parity.",
      icon: "circle-alert",
      tone: "warning"
    }
  ]
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex w-64 flex-col gap-2 rounded-lg border bg-background p-3">
      <h2 className="text-xs font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function view(title: string, data?: ViewData, size: ViewSize = "panel", from?: ExtensionStatus) {
  return <ExtensionView session={session} view={placed(title, data, from)} size={size} />
}

/** Every kind at a panel's size, and what stands in before the extension's code fills a view. */
export const Kinds: Story = {
  args: { session, view: placed("Stories", tree), size: "panel" },
  render: () => (
    <div className="flex flex-wrap items-start gap-4 p-4">
      <Panel title="Tree">{view("Stories", tree)}</Panel>
      <Panel title="Table">{view("Timings", table)}</Panel>
      <Panel title="Key-value pairs">{view("Storybook", keyValue)}</Panel>
      <Panel title="Form">{view("Options", form)}</Panel>
      <Panel title="List">{view("Storybook setup", guide)}</Panel>
      <Panel title="Starting">{view("Stories", undefined, "panel", extension("starting"))}</Panel>
      <Panel title="Stopped">
        {view("Stories", undefined, "panel", extension("crashed", "It crashed 3 times in a row."))}
      </Panel>
      <Panel title="Empty">
        {view("Stories", { kind: "tree", options: { empty: { title: "No stories found" } }, items: [] })}
      </Panel>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const stories = canvas.getByRole("tree", { name: "Stories" })
    const [first] = within(stories).getAllByRole("treeitem")

    // Arrow keys open a row and move into it.
    first!.focus()
    await userEvent.keyboard("{ArrowRight}{ArrowDown}")
    await expect(document.activeElement).toHaveTextContent("Primary")
    await expect(canvas.getByRole("button", { name: "Open in Storybook, /pricing" })).toBeVisible()
  }
}

/** A setup guide on a page, at a page's size. */
export const Page: Story = {
  args: { session, view: placed("Storybook setup", guide), size: "page" },
  render: (args) => (
    <div className="mx-auto max-w-3xl p-8">
      <ExtensionView {...args} />
    </div>
  )
}
