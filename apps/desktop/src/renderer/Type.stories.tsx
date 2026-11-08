import {
  Badge,
  Button,
  Kbd,
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
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Name } from "./chrome/Name.tsx"
import { DialogGroupTitle, GroupLabel, PanelSectionTitle } from "./chrome/PanelSection.tsx"

/**
 * The interface's type (docs/typography.md): every role drawn with the classes the app draws it with, and the size,
 * line height, weight and tracking it comes out at measured underneath, so a change to a role is reviewed where it
 * shows. A panel's select isn't here, since it's a popup: open one in the inspector's stories.
 */
const meta = {
  title: "Parity/Type",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface Role {
  name: string
  /** Its classes or component, as typography.md lists them. */
  classes: string
  /** The sample; `data-sample` marks the element that's measured. */
  sample: ReactNode
}

const roles: Role[] = [
  {
    name: "Caption",
    classes: "text-2xs",
    sample: (
      <span className="flex items-baseline gap-1 text-xs">
        100
        <span data-sample className="text-2xs text-muted-foreground">
          %
        </span>
      </span>
    )
  },
  {
    name: "Canvas chip",
    classes: "text-2xs font-medium tabular-nums",
    sample: (
      <span
        data-sample
        className="rounded px-1.5 py-px text-2xs font-medium text-white tabular-nums"
        style={{ background: "var(--canvas-screen-chip, var(--canvas-screen))" }}
      >
        Pricing
      </span>
    )
  },
  {
    name: "Label",
    classes: "text-xs text-muted-foreground",
    sample: (
      <span data-sample className="text-xs text-muted-foreground">
        Padding
      </span>
    )
  },
  {
    name: "Value",
    classes: "text-xs",
    sample: (
      <span data-sample className="text-xs tabular-nums">
        Follow layout
      </span>
    )
  },
  {
    name: "Description",
    classes: "type-description text-muted-foreground",
    sample: (
      <p data-sample className="max-w-56 type-description text-muted-foreground">
        Find parts that repeat and turn them into components. Each copy becomes an instance.
      </p>
    )
  },
  {
    name: "Body",
    classes: "type-body",
    sample: (
      <p data-sample className="max-w-72 type-body text-muted-foreground">
        Open a project folder to see its screens and components, and change them on the canvas.
      </p>
    )
  },
  {
    name: "Message",
    classes: "type-message",
    sample: (
      <p data-sample className="max-w-56 type-message text-destructive">
        That isn’t a color. Try oklch(0.6 0.2 250) or #2563eb.
      </p>
    )
  },
  {
    name: "Section title",
    classes: "PanelSectionTitle",
    sample: <PanelSectionTitle title="Appearance" count={3} />
  },
  {
    name: "Group label",
    classes: "GroupLabel",
    sample: (
      <GroupLabel>
        <span data-sample>Components</span>
      </GroupLabel>
    )
  },
  {
    name: "Group title",
    classes: "DialogGroupTitle",
    sample: <DialogGroupTitle>Appearance</DialogGroupTitle>
  },
  {
    name: "Strong value",
    classes: "font-medium text-foreground inside a Label",
    sample: (
      <span className="text-xs text-muted-foreground">
        <strong data-sample className="font-medium text-foreground tabular-nums">
          587
        </strong>{" "}
        components in code
      </span>
    )
  },
  {
    name: "Row, menu item, tab",
    classes: "text-sm",
    sample: (
      <span data-sample className="text-sm">
        <Name>Plan card</Name>
      </span>
    )
  },
  {
    name: "Item title",
    classes: "text-sm font-medium",
    sample: (
      <span data-sample className="text-sm font-medium">
        Processes
      </span>
    )
  },
  {
    name: "Control, chip",
    classes: "ToggleGroup size=sm, Kbd, Badge",
    sample: (
      <span className="flex items-center gap-2">
        <ToggleGroup variant="outline" size="sm" defaultValue={["layout"]}>
          <ToggleGroupItem data-sample value="layout">
            In layout
          </ToggleGroupItem>
          <ToggleGroupItem value="absolute">Absolute</ToggleGroupItem>
        </ToggleGroup>
        <Kbd>Ctrl+Shift+C</Kbd>
        <Badge variant="secondary">src/pricing.tsx</Badge>
      </span>
    )
  },
  {
    name: "Field label",
    classes: "Label with text-xs in a panel",
    sample: (
      <Label data-sample className="text-xs">
        Show every state on the canvas
      </Label>
    )
  },
  {
    name: "Compact row",
    classes: "text-xs, with a Caption under it",
    sample: (
      <div className="flex flex-col">
        <code data-sample className="font-mono text-xs">
          card-foreground
        </code>
        <span className="text-2xs text-muted-foreground">Text on cards.</span>
      </div>
    )
  },
  {
    name: "Small button",
    classes: 'Button size="sm"',
    sample: (
      <Button data-sample variant="outline" size="sm">
        Find repeated parts
      </Button>
    )
  },
  {
    name: "Button",
    classes: "Button",
    sample: (
      <Button data-sample variant="outline">
        Cancel
      </Button>
    )
  },
  {
    name: "Empty panel",
    classes: "type-empty text-muted-foreground text-center",
    sample: (
      <p data-sample className="flex max-w-56 flex-col gap-1 type-empty text-center text-muted-foreground">
        Select a screen, component or frame on the canvas or in Layers.
        <span className="text-xs">Click inside one to select a layer, and double‑click to go deeper.</span>
      </p>
    )
  },
  {
    name: "Empty panel hint",
    classes: "text-xs inside type-empty",
    sample: (
      <p className="flex max-w-56 flex-col gap-1 type-empty text-center text-muted-foreground">
        Select a screen.
        <span data-sample className="text-xs">
          Click inside one to select a layer, and double‑click to go deeper.
        </span>
      </p>
    )
  },
  {
    name: "Figure",
    classes: "text-base font-semibold tabular-nums",
    sample: (
      <span data-sample className="text-base font-semibold tabular-nums">
        60
      </span>
    )
  },
  {
    name: "Selection title",
    classes: "text-base font-semibold",
    sample: (
      <span data-sample className="text-base font-semibold">
        <Name>Pricing</Name>
      </span>
    )
  },
  {
    name: "Dialog title and description",
    classes: "DialogTitle, DialogDescription",
    // The kit's own title and description need an open dialog, so these carry their slots and classes as it draws them.
    sample: (
      <div className="flex max-w-64 flex-col gap-2">
        <h2 data-sample data-slot="dialog-title" className="text-base leading-none font-medium">
          Settings
        </h2>
        <p data-slot="dialog-description" className="text-sm text-muted-foreground">
          For every project, and remembered between runs.
        </p>
      </div>
    )
  },
  {
    name: "Heading",
    classes: "text-lg font-semibold tracking-tight",
    sample: (
      <h2 data-sample className="text-lg font-semibold tracking-tight">
        Couldn’t open kestrel-website
      </h2>
    )
  },
  {
    name: "Page title",
    classes: "text-2xl font-semibold tracking-tight",
    sample: (
      <h1 data-sample className="text-2xl font-semibold tracking-tight">
        Sign in to Parity
      </h1>
    )
  },
  {
    name: "Code",
    classes: "font-mono text-xs",
    sample: (
      <code data-sample className="font-mono text-xs">
        text-5xl tracking-tight
      </code>
    )
  },
  {
    name: "Code block",
    classes: "type-code font-mono",
    sample: (
      <pre data-sample className="type-code font-mono whitespace-pre-wrap">
        {'<Button size="sm">\n  Find repeated parts\n</Button>'}
      </pre>
    )
  },
  {
    name: "Secondary code",
    classes: "font-mono text-2xs",
    sample: (
      <code data-sample className="font-mono text-2xs text-muted-foreground">
        src/components/plan-card.tsx
      </code>
    )
  }
]

/** What `element` is drawn in, as "12/16 450": its size and line height in pixels, its weight and any tracking. */
function measure(element: Element): string {
  const style = getComputedStyle(element)
  const px = (value: string) => (value === "normal" ? "normal" : String(Math.round(Number.parseFloat(value) * 10) / 10))
  const tracking = style.letterSpacing === "normal" || style.letterSpacing === "0px" ? "" : ` ${style.letterSpacing}`
  return `${px(style.fontSize)}/${px(style.lineHeight)} ${style.fontWeight}${tracking}`
}

/**
 * A sample with what it comes out at underneath, measured from the page rather than written down, so the numbers
 * can't drift from what's shown. It measures the element marked `data-sample`, or else the sample's first heading.
 */
function Specimen({ children }: { children: ReactNode }) {
  const sample = useRef<HTMLDivElement>(null)
  const [spec, setSpec] = useState("")
  useLayoutEffect(() => {
    const text = sample.current?.querySelector("[data-sample]") ?? sample.current?.querySelector("h3")
    if (text) setSpec(measure(text))
  }, [])
  return (
    <div className="flex flex-col gap-1.5">
      <div ref={sample}>{children}</div>
      <span className="font-mono text-2xs text-muted-foreground tabular-nums">{spec}</span>
    </div>
  )
}

/** Every role, with its classes and what it comes out at. */
export const Scale: Story = {
  render: () => (
    <div className="h-screen overflow-y-auto bg-background p-6 text-foreground">
      <Table className="max-w-4xl">
        <TableHeader>
          <TableRow>
            <TableHead className="w-48">Role</TableHead>
            <TableHead className="w-72">Classes</TableHead>
            <TableHead>Sample</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.name} className="hover:bg-transparent">
              <TableCell className="py-3 align-top text-sm font-medium">{role.name}</TableCell>
              <TableCell className="py-3 align-top whitespace-normal">
                <code className="font-mono text-xs text-muted-foreground">{role.classes}</code>
              </TableCell>
              <TableCell className="py-3 align-top whitespace-normal">
                <Specimen>{role.sample}</Specimen>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
