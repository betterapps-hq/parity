import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@buildkitgg/shadcn-baseui-kit"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { AppWindow } from "../App.tsx"
import { inspecting, PanelColumn, SelectedStyles } from "../chrome/inspector-stories.tsx"
import { Inspector } from "../chrome/Inspector.tsx"
import { LeftPanel } from "../chrome/LeftPanel.tsx"
import { StatusBar } from "../chrome/StatusBar.tsx"
import { design, example, frameDesigns, node, openProjects, ProjectStage } from "../stories/fixtures.tsx"
import { Specimen, TypeCompare } from "./interface-type/compare.tsx"

/**
 * The app's interface type as it is and as proposed (PAR-709), on the real panels: fewer sizes (11, 12, 13 and 15px for
 * the chrome, nothing smaller), regular text a step heavier, section titles in sentence case, and code in a monospace
 * that matches Geist. Each story draws the same UI twice, current beside proposed, and both sides work; the toolbar's
 * Type control turns the proposed type on for any story in Storybook, menus and dialogs included. The audit and the
 * proposal are in docs/proposals/interface-type.md.
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
    name: "Layer",
    where: "Rows in Layers",
    sample: (
      <span className="flex items-baseline gap-2">
        <span data-sample className="text-[13px] font-medium">
          Plan card
        </span>
        <span className="text-xs text-muted-foreground">2 states</span>
      </span>
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
    name: "Empty panel",
    where: "What a panel says when there's nothing to show",
    sample: (
      <p data-sample className="max-w-56 text-sm text-muted-foreground">
        Select a screen, component or frame on the canvas or in Layers.
      </p>
    )
  },
  {
    name: "Name",
    where: "The selected design's name, dialog titles",
    sample: (
      <span data-sample className="text-base font-semibold">
        Pricing
      </span>
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
    name: "Canvas label",
    where: "Names and sizes over the canvas",
    sample: (
      <span
        data-sample
        className="rounded px-1.5 py-px text-[11px] font-medium text-white"
        style={{ background: "var(--canvas-screen)" }}
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
