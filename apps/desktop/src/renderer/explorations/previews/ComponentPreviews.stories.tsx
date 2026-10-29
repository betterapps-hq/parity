import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { ComponentPreview, KindIcon, stateWords } from "./component-art.tsx"
import { ComponentCard, ComponentsPanel, type ComponentsView, InsertPicker } from "./component-panels.tsx"
import { CanvasBeside, Labeled, LeftPanelFrame, Stage } from "./frame.tsx"
import { component, type PreviewState } from "./preview-data.ts"

/**
 * Pictures of components, so people know what they're inserting: in the Components panel, its hover card and the `/`
 * picker. Each picture is a bitmap the offscreen renderer makes once and keeps on disk, never a live render in a
 * panel; here drawings stand in for the bitmaps. docs/proposals/previews.md says how they're made and kept.
 */
const meta = {
  title: "Parity/Explorations/Previews/Components",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const states: { state: PreviewState; example: string; when: string }[] = [
  { state: "queued", example: "Avatar", when: "Found, and waiting its turn. Ones in view go first." },
  { state: "making", example: "Tabs", when: "Being drawn offscreen. One at a time, while you're not working." },
  { state: "ready", example: "Button", when: "Made, and kept on disk until its code or the tokens change." },
  {
    state: "stale",
    example: "Plan card",
    when: "Its code changed. The last picture shows, dimmed, until the new one is made."
  },
  { state: "failed", example: "RevenueChart", when: "It throws while drawing. The card shows the error." },
  {
    state: "needs-props",
    example: "MemberRow",
    when: "A required prop has no value. A story's args or sample props fix it."
  },
  {
    state: "needs-provider",
    example: "ThemeToggle",
    when: "It needs a provider around it. A decorator fixes it."
  },
  {
    state: "server-only",
    example: "InvoicePdf",
    when: "It imports server code, so nothing in Parity can draw it."
  },
  {
    state: "draws-nothing",
    example: "ThemeProvider",
    when: "A provider or wrapper. Listed only when searched for by name."
  }
]

/**
 * Every state a preview can be in, at each size: a list row, a grid tile and the card. Made pictures sit on the
 * project's own background; everything else sits on the panel's fill, so a placeholder never passes for a picture.
 */
export const States: Story = {
  render: () => (
    <Stage>
      <div className="grid grid-cols-[180px_220px_140px_330px] items-center gap-x-6 gap-y-5">
        <span className="text-xs text-white/45">State</span>
        <span className="text-xs text-white/45">In a list row</span>
        <span className="text-xs text-white/45">In the grid</span>
        <span className="text-xs text-white/45">On the card and in the picker</span>
        {states.map(({ state, example, when }) => {
          const item = component(example)
          return [
            <div key={`${state}-what`} className="flex flex-col gap-1">
              <span className="text-sm">{stateWords[state].long}</span>
              <span className="text-[11px] text-white/45">{when}</span>
            </div>,
            <div key={`${state}-row`} className="flex h-11 items-center gap-2.5 rounded-md bg-background px-3">
              <ComponentPreview component={item} width={52} height={34} state={state} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px]">{item.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">{stateWords[state].short}</span>
              </span>
            </div>,
            <div key={`${state}-tile`} className="flex flex-col gap-1 rounded-md bg-background p-1">
              <ComponentPreview component={item} width={118} height={76} state={state} />
              <span className="flex items-center gap-1 px-0.5 text-[11px]">
                <KindIcon component={item} className="size-3" />
                {item.name}
              </span>
            </div>,
            <div key={`${state}-large`} className="w-fit rounded-md bg-background p-2">
              <ComponentPreview component={item} width={304} height={120} state={state} />
            </div>
          ]
        })}
      </div>
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-preview="Button"]:not([data-preview-state])')).not.toBeNull()
    await expect(canvasElement.querySelector('[data-preview="Tabs"][data-preview-state="making"]')).not.toBeNull()
  }
}

function Panel({ view, card, query }: { view: ComponentsView; card?: string; query?: string }) {
  return (
    <Stage className="flex gap-4 p-6">
      <LeftPanelFrame tab="components">
        <ComponentsPanel view={view} card={card} query={query} />
      </LeftPanelFrame>
      <CanvasBeside />
    </Stage>
  )
}

/**
 * The Components tab with a small picture on each row, and its variants or why it has no picture under its name.
 * Rows are taller than today's, so Names keeps today's list for people who know their components by name.
 */
export const PanelList: Story = {
  render: () => <Panel view="list" />
}

/** The grid: larger pictures two to a row, for browsing a kit you don't know yet. */
export const PanelGrid: Story = {
  render: () => <Panel view="grid" />
}

/** Names, as the panel is today: no pictures, and the hover card still shows one. */
export const PanelNames: Story = {
  render: () => <Panel view="names" card="Card" />
}

/**
 * A component's card, opened by resting the pointer on its row: a large picture, its variants as small ones (pointing
 * at one shows it large), where it's from, and Insert, Open file and Open in Storybook.
 */
export const HoverCard: Story = {
  render: () => <Panel view="list" card="Button" />,
  play: async () => {
    const card = await within(document.body).findByRole("dialog")
    await expect(within(card).getByText("src/components/ui/button.tsx")).toBeInTheDocument()
    await userEvent.hover(within(card).getByRole("button", { name: "variant destructive" }))
  }
}

/** A card for a component design whose board just changed: the last picture, dimmed, until the new one is made. */
export const HoverCardUpdating: Story = {
  render: () => <Panel view="grid" card="Plan card" />
}

/**
 * Cards for components with no picture say why and what fixes it: sample props for one that needs a prop, a decorator
 * for one that needs a provider, the error for one that throws.
 */
export const CardsWithoutPictures: Story = {
  render: () => (
    <Stage>
      <div className="flex flex-wrap items-start gap-4">
        {["MemberRow", "ThemeToggle", "RevenueChart", "InvoicePdf", "ThemeProvider", "Table"].map((name) => (
          <Labeled key={name} label={stateWords[component(name).state].long}>
            <div className="w-80 rounded-lg border bg-popover">
              <ComponentCard component={component(name)} />
            </div>
          </Labeled>
        ))}
      </div>
    </Stage>
  )
}

function Picker({ highlighted, query }: { highlighted?: string; query?: string }) {
  return (
    <Stage className="grid place-items-center">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative">
        <InsertPicker highlighted={highlighted} query={query} />
      </div>
    </Stage>
  )
}

/**
 * The `/` picker with a small picture beside each name and, beside the list, the highlighted one's card, which follows
 * the arrow keys. Basics get diagrams, since they have no component to picture.
 */
export const InsertPickerOpen: Story = {
  render: () => <Picker />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-preview="Project card"]')).not.toBeNull()
  }
}

/** Searching narrows the list, and the first match's card shows at once. */
export const InsertPickerSearching: Story = {
  render: () => <Picker highlighted="Member row" query="row" />
}

/** A component that can't be drawn is still listed, and its card says why before anyone inserts it. */
export const InsertPickerProblem: Story = {
  render: () => <Picker highlighted="MemberRow" />
}
