import type { Meta, StoryObj } from "@storybook/react-vite"
import { SideBySide } from "./compare.tsx"

/**
 * Each of the app's shadcn components beside Buildkit's, before the app's copies in components/ui give way to the kit
 * (PAR-530). The app's are radix-nova and the kit's base-nova, so what differs is Base UI against Radix as well as any
 * change the app made. The components the app changed by hand show a third side: the kit with those changes made from
 * outside it. Switch the theme in the toolbar to see both.
 */
const meta = {
  title: "Parity/Kit comparison/Side by side"
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** A component the app uses as shadcn made it. */
function compare(story: string): Story {
  return { render: (_args, { globals }) => <SideBySide story={story} theme={globals.theme} /> }
}

/** A component the app changed by hand, with the kit adapted to match as a third side. */
function compareAdapted(story: string, { stacked = false } = {}): Story {
  return {
    render: (_args, { globals }) => <SideBySide story={story} theme={globals.theme} adapted stacked={stacked} />
  }
}

/** Keys shown as the platform writes them, through `formatKeys`. */
export const Command = compareAdapted("Command")
/** Keys shown as the platform writes them. */
export const ContextMenu = compareAdapted("ContextMenu")
/** Keys shown as the platform writes them. */
export const DropdownMenu = compareAdapted("DropdownMenu")
/** Keys shown as the platform writes them. */
export const Kbd = compareAdapted("Kbd")
/** Keys shown as the platform writes them, and the title bar's own look: no frame, roomier names, wider menus. */
export const Menubar = compareAdapted("Menubar")
/** Toasts in the app's theme rather than the system's. The sides are stacked so each lays its toasts out full width. */
export const Toaster = compareAdapted("Toaster", { stacked: true })

export const Badge = compare("Badge")
export const Button = compare("Button")
export const Dialog = compare("Dialog")
export const Input = compare("Input")
export const InputGroup = compare("InputGroup")
export const Label = compare("Label")
export const Popover = compare("Popover")
export const RadioGroup = compare("RadioGroup")
export const Select = compare("Select")
export const Separator = compare("Separator")
export const Switch = compare("Switch")
export const Tabs = compare("Tabs")
export const Textarea = compare("Textarea")
export const Toggle = compare("Toggle")
export const ToggleGroup = compare("ToggleGroup")
export const Tooltip = compare("Tooltip")
