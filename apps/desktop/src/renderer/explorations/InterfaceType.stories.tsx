import {
  Badge,
  Button,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { AppWindow } from "../App.tsx"
import { inspecting, PanelColumn, SelectedStyles } from "../chrome/inspector-stories.tsx"
import { Inspector } from "../chrome/Inspector.tsx"
import { setLayout } from "../chrome/layout.ts"
import { LeftPanel } from "../chrome/LeftPanel.tsx"
import { StatusBar } from "../chrome/StatusBar.tsx"
import { design, example, frameDesigns, node, openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { Specimen, TypeCompare } from "./interface-type/compare.tsx"

/**
 * The app's interface type as it is and as proposed (PAR-709), on the real panels: Inter in place of Geist, fewer sizes
 * (11, 12, 13 and 15px for the chrome, nothing smaller), regular text a step heavier, section titles in sentence case,
 * and code in a monospace that matches it. Each story draws the same UI twice, current beside proposed, and both sides
 * work; the toolbar's Type control turns the proposed type on for any story in Storybook, menus and dialogs included.
 * The audit and the proposal are in docs/proposals/interface-type.md.
 */
const meta = {
  title: "Parity/Explorations/Interface type",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** The active project's providers around a comparison, which fills the window. */
function Stage({ children }: { children: ReactNode }) {
  return <ProjectStage className="h-screen">{children}</ProjectStage>
}

interface Role {
  name: string
  /** Where the app uses it. */
  where: string
  /** The sample, drawn with the classes the app draws it with; `data-sample` marks the element that's measured. */
  sample: ReactNode
}

const roles: Role[] = [
  {
    name: "Section title",
    where: "Titles of the inspector's sections",
    sample: (
      <h3 data-sample className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Appearance
      </h3>
    )
  },
  {
    name: "Group label",
    where: "Groups in lists: Layers, Tokens",
    sample: (
      <div className="relative flex h-7 items-center pl-3 text-xs text-muted-foreground">
        <span data-sample className="flex-1">
          Components
        </span>
      </div>
    )
  },
  {
    name: "Group title",
    where: "Groups in dialogs: Settings, Shortcuts",
    sample: (
      <div data-slot="dialog-content">
        <h3 data-sample className="pb-1 text-xs font-medium text-muted-foreground">
          Appearance
        </h3>
      </div>
    )
  },
  {
    name: "Label",
    where: "Field labels and secondary text in panels",
    sample: (
      <span data-sample className="text-xs text-muted-foreground">
        Padding
      </span>
    )
  },
  {
    name: "Value",
    where: "Values in fields, the status bar",
    sample: (
      <span data-sample className="text-xs">
        Follow layout
      </span>
    )
  },
  {
    name: "Unit and count",
    where: "Units beside values, counts, sizes of modes",
    sample: (
      <span className="flex items-baseline gap-1 text-xs">
        100
        <span data-sample className="text-[10px] text-muted-foreground">
          %
        </span>
      </span>
    )
  },
  {
    name: "Strong value",
    where: "The part of a line of labels that's read: the status bar's figures",
    sample: (
      <span className="text-xs text-muted-foreground">
        <strong data-sample className="font-medium text-foreground">
          587
        </strong>{" "}
        components in code
      </span>
    )
  },
  {
    name: "Item title",
    where: "A name or title heading a card, popover or panel",
    sample: (
      <span data-sample className="text-sm font-medium">
        Processes
      </span>
    )
  },
  {
    name: "Layer",
    where: "Rows in Layers",
    // A row as Layers draws one, a design at the top of its tree, not selected.
    sample: (
      <div role="tree" aria-label="Layers" className="text-[13px]">
        <div data-sample role="treeitem" aria-selected={false} className="flex items-baseline gap-2 font-medium">
          Plan card
          <span className="text-xs text-muted-foreground">2 states</span>
        </div>
      </div>
    )
  },
  {
    name: "Compact row",
    where: "Tokens and Processes: a 12px name, a caption under it",
    sample: (
      <div className="flex flex-col text-xs">
        <code data-sample className="font-mono text-xs">
          card-foreground
        </code>
        <span className="text-[11px] text-muted-foreground">Text on cards.</span>
      </div>
    )
  },
  {
    name: "Menu item and tab",
    where: "The kit's menus, tabs, selects and buttons",
    sample: (
      <span data-sample className="text-sm">
        Bring to front
      </span>
    )
  },
  {
    name: "Small button",
    where: "Buttons in panels",
    sample: (
      <Button data-sample variant="outline" size="sm">
        Find repeated parts
      </Button>
    )
  },
  {
    name: "Button",
    where: "Dialogs' actions",
    sample: (
      <Button data-sample variant="outline">
        Cancel
      </Button>
    )
  },
  {
    name: "Control and chip",
    where: "The kit's segmented controls and badges",
    sample: (
      <span className="flex items-center gap-2">
        <ToggleGroup variant="outline" size="sm" defaultValue={["layout"]}>
          <ToggleGroupItem data-sample value="layout">
            In layout
          </ToggleGroupItem>
          <ToggleGroupItem value="absolute">Absolute</ToggleGroupItem>
        </ToggleGroup>
        <Badge variant="secondary">Screen</Badge>
      </span>
    )
  },
  {
    name: "Description",
    where: "A section's or setting's description, which wraps",
    sample: (
      <p data-sample className="mb-3 max-w-56 px-1 text-xs text-muted-foreground">
        Find parts that repeat and turn them into components. Each copy becomes an instance.
      </p>
    )
  },
  {
    name: "Body",
    where: "A paragraph on a page: the start page's intros",
    sample: (
      <p data-sample className="max-w-72 text-sm text-pretty text-muted-foreground">
        Open a project folder to see its screens and components, and change them on the canvas.
      </p>
    )
  },
  {
    name: "Field label",
    where: "A label tied to its control: a switch's in a panel",
    sample: (
      <Label data-sample className="text-xs font-normal">
        Show every state on the canvas
      </Label>
    )
  },
  {
    name: "Message",
    where: "Messages and errors that are read: a field's, a token's",
    sample: (
      <p data-sample className="max-w-56 text-[11px] leading-snug text-destructive">
        That isn’t a color. Try oklch(0.6 0.2 250) or #2563eb.
      </p>
    )
  },
  {
    name: "Empty panel",
    where: "What a panel says when there's nothing to show",
    sample: (
      <p data-sample className="max-w-56 text-center text-sm text-muted-foreground">
        Select a screen, component or frame on the canvas or in Layers.
      </p>
    )
  },
  {
    name: "Empty panel hint",
    where: "The line under an empty panel's message",
    // As the Design tab draws it, inside the empty panel's message.
    sample: (
      <p className="flex max-w-56 flex-col gap-1 text-center text-sm text-muted-foreground">
        Select a screen.
        <span data-sample className="text-xs">
          Click inside one to select a layer, and double-click to go deeper.
        </span>
      </p>
    )
  },
  {
    name: "Figure",
    where: "A number read at a glance: Performance's frame rate, accessibility counts",
    sample: (
      <span data-sample className="text-base font-semibold tabular-nums">
        60
      </span>
    )
  },
  {
    name: "Selection title",
    where: "The inspector's title for what's selected: a design, a layer",
    sample: (
      <span data-sample className="text-base font-semibold">
        Pricing
      </span>
    )
  },
  {
    name: "Dialog title",
    where: "Titles of dialogs, as the kit draws them",
    sample: (
      <h2 data-sample data-slot="dialog-title" className="text-base leading-none font-medium">
        Settings
      </h2>
    )
  },
  {
    name: "Dialog description",
    where: "What a dialog is for, under its title",
    sample: (
      <p data-sample data-slot="dialog-description" className="max-w-56 text-sm text-muted-foreground">
        For every project, and remembered between runs.
      </p>
    )
  },
  {
    name: "Heading",
    where: "The start page and sign-in",
    sample: (
      <h2 data-sample className="text-lg font-semibold tracking-tight">
        kestrel-website
      </h2>
    )
  },
  {
    name: "Code",
    where: "Classes, token names and code",
    sample: (
      <code data-sample className="font-mono text-xs">
        text-5xl tracking-tight
      </code>
    )
  },
  {
    name: "Code block",
    where: "Code over many lines: the Code tab, stack traces",
    sample: (
      <pre data-sample className="font-mono text-xs whitespace-pre-wrap">
        {'<Button size="sm">\n  Find repeated parts\n</Button>'}
      </pre>
    )
  },
  {
    name: "Secondary code",
    where: "A file name, a token's path, a stack trace",
    sample: (
      <code data-sample className="font-mono text-[11px] text-muted-foreground">
        src/components/plan-card.tsx
      </code>
    )
  },
  {
    name: "Canvas chip",
    where: "A name over the canvas on a colored chip",
    sample: (
      <span
        data-sample
        className="rounded px-1.5 py-px text-[11px] font-medium text-white"
        // The proposed side draws on the darker chip fill the color change brings, as the chip will ship.
        style={{ background: "var(--canvas-chip-screen, var(--canvas-screen))" }}
      >
        Pricing
      </span>
    )
  }
]

/**
 * Each part of the interface's type, drawn with the classes the app draws it with, now and as proposed, with the size,
 * line height and weight each comes out at underneath ("12/16 450" is 12px on a 16px line at weight 450).
 */
export const Scale: Story = {
  render: () => (
    <div className="h-screen overflow-y-auto bg-background p-6 text-foreground">
      <Table className="max-w-4xl">
        <TableHeader>
          <TableRow>
            <TableHead className="w-64">Part</TableHead>
            <TableHead>Current</TableHead>
            <TableHead>Proposed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.name} className="hover:bg-transparent">
              <TableCell className="py-3 align-top">
                <div className="font-medium">{role.name}</div>
                <div className="text-xs whitespace-normal text-muted-foreground">{role.where}</div>
              </TableCell>
              <TableCell className="py-3 align-top whitespace-normal">
                <Specimen type="current">{role.sample}</Specimen>
              </TableCell>
              <TableCell className="py-3 align-top whitespace-normal">
                <Specimen type="proposed">{role.sample}</Specimen>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Pricing's headline selected: the style sections, the densest type in the app, with labels, values and units. */
export const InspectorStyles: Story = {
  name: "Inspector styles",
  loaders: [inspecting("design", () => layersSelection(design("Pricing"), [node("Pricing", "Headline")]))],
  render: () => (
    <Stage>
      <TypeCompare>
        <PanelColumn>
          <SelectedStyles />
        </PanelColumn>
      </TypeCompare>
    </Stage>
  )
}

/** Pricing selected: the Design tab with its name, states, repeated parts and modes. */
export const DesignTab: Story = {
  name: "Design tab",
  loaders: [inspecting("design", () => ({ design: design("Pricing") }))],
  render: () => (
    <Stage>
      <TypeCompare>
        <Inspector />
      </TypeCompare>
    </Stage>
  )
}

/** Pricing's headline selected: the inspector's title is the layer's name, in the same role as a design's. */
export const LayerSelected: Story = {
  name: "Layer selected",
  loaders: [inspecting("design", () => layersSelection(design("Pricing"), [node("Pricing", "Headline")]))],
  render: () => (
    <Stage>
      <TypeCompare>
        <Inspector />
      </TypeCompare>
    </Stage>
  )
}

/**
 * Sign in's card in the Code tab: its title, its component's name and file in code. Its elements and their lines come
 * from the canvas as it draws, so they show in Whole window, with the Code tab open and the card selected.
 */
export const CodeTab: Story = {
  name: "Code tab",
  loaders: [inspecting("code", () => layersSelection(design("Sign in"), [node("Sign in", "Sign in card")]))],
  render: () => (
    <Stage>
      <TypeCompare>
        <Inspector />
      </TypeCompare>
    </Stage>
  )
}

/** Layers, with a layer deep inside Plan card selected, so rows nest and names run long. */
export const Layers: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      example().selection.set({ design: design("Plan card"), node: node("Plan card", "Feature 3 text") })
    }
  ],
  render: () => (
    <Stage>
      <TypeCompare>
        <LeftPanel />
      </TypeCompare>
    </Stage>
  )
}

/**
 * The Tokens tab, where token names are code in fixed-width rows: the monospace's size and weight show most here. A
 * token's detail opens over the page, in the type the toolbar's Type control sets.
 */
export const Tokens: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      setLayout({ leftTab: "tokens" })
    }
  ],
  render: () => (
    <Stage>
      <TypeCompare>
        <LeftPanel />
      </TypeCompare>
    </Stage>
  )
}

/**
 * The status bar, as wide as the window, so one is above the other. Its Processes and Console open over the page, in
 * the type the toolbar's Type control sets.
 */
export const Status: Story = {
  name: "Status bar",
  loaders: [() => openProjects("example")],
  render: () => (
    <Stage>
      <TypeCompare stacked>
        <div className="w-full">
          <StatusBar />
        </div>
      </TypeCompare>
    </Stage>
  )
}

/**
 * The whole window with the example open. Switch Type in the toolbar between current and proposed to compare
 * everything, menus and dialogs included.
 */
export const WholeWindow: Story = {
  name: "Whole window",
  loaders: [() => openProjects("example")],
  play: () => frameDesigns("Dashboard", "Pricing", "Sign in", "Settings"),
  render: () => (
    <div className="h-screen">
      <AppWindow />
    </div>
  )
}
