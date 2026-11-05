import type { Meta, StoryObj } from "@storybook/react-vite"
import { Group } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { keymap } from "../../chrome/keymap.ts"
import { formatKeys } from "../../chrome/keys.ts"
import { PanelSection } from "../../chrome/PanelSection.tsx"

/**
 * PAR-201: a component that takes `style` but puts it on an element inside it, as a form field passes it to its
 * input. The canvas outlines the field, but the size and styles the inspector sets land on the input, and nothing says
 * so. Each option is the inspector's Design tab for such a layer, an `EmailField` in Sign in, with a different way of
 * saying where its styles go. The canvas would find the inner element from the frame: the element the layer's props
 * reach, inside the layer's own box.
 */
const meta = {
  title: "Parity/Explorations/Styles on an inner element",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** A column as wide as the inspector, with the layer's header, its props and the styles below whatever's being tried. */
function Panel({ title, children, size }: { title: string; children?: ReactNode; size?: ReactNode }) {
  return (
    <figure className="flex w-[280px] shrink-0 flex-col gap-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div className="overflow-hidden rounded-lg border bg-background text-sm">
        <div className="flex flex-col gap-0.5 border-b px-4 py-3">
          <span className="font-medium">Email</span>
          <span className="text-xs text-muted-foreground">EmailField component</span>
        </div>
        <PanelSection title="Props">
          <Row label="placeholder">
            <Input readOnly value="you@example.com" className="h-7 text-xs" />
          </Row>
        </PanelSection>
        {children}
        <PanelSection title="Size">
          {size}
          <div className="grid grid-cols-2 gap-2 px-1">
            <Input readOnly aria-label="Width" value="W 320" className="h-7 text-xs tabular-nums" />
            <Input readOnly aria-label="Height" value="H Hug" className="h-7 text-xs" />
          </div>
        </PanelSection>
        <PanelSection title="Fill">
          <Row label="Background">
            <Input readOnly value="background" className="h-7 text-xs" />
          </Row>
        </PanelSection>
      </div>
    </figure>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 px-1">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

/** Wrap in layout, as the note for a component without `style` offers it. */
function WrapButton() {
  return (
    <Button variant="outline" size="sm">
      <Group /> {keymap.wrap.label}{" "}
      <span className="ml-auto text-xs text-muted-foreground">{formatKeys(keymap.wrap.keys[0])}</span>
    </Button>
  )
}

/** A: a note above the styles, worded and placed as the one for a component without `style`, with Wrap in layout. */
function AboveTheStyles() {
  return (
    <Panel title="A: Note above the styles">
      <div className="flex flex-col gap-2 border-b px-4 py-2.5">
        <p className="text-xs text-muted-foreground">
          EmailField puts its <code>style</code> on the <code>input</code> inside it, so the size and styles below
          change the input, not the whole field. Wrap it in a layout to size the field.
        </p>
        <WrapButton />
      </div>
    </Panel>
  )
}

/** B: a line under Size only, since a size is what most visibly lands somewhere else, with Wrap in layout beside it. */
function InSize() {
  return (
    <Panel
      title="B: A line in Size"
      size={
        <div className="mb-3 flex flex-col gap-2 px-1">
          <p className="text-xs text-muted-foreground">
            Sizes and styles go to the <code>input</code> inside EmailField, not the whole field.
          </p>
          <WrapButton />
        </div>
      }
    />
  )
}

/** The two side by side, then each alone. */
export const Options: Story = {
  render: () => (
    <div className="flex flex-wrap gap-8 bg-muted/40 p-8">
      <AboveTheStyles />
      <InSize />
    </div>
  )
}

/** A, as the inspector would show it. */
export const NoteAboveTheStyles: Story = {
  render: () => (
    <div className="bg-muted/40 p-8">
      <AboveTheStyles />
    </div>
  )
}

/** B, as the inspector would show it. */
export const LineInSize: Story = {
  render: () => (
    <div className="bg-muted/40 p-8">
      <InSize />
    </div>
  )
}
