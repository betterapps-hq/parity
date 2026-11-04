import type { Meta, StoryObj } from "@storybook/react-vite"
import {
  CommandSample,
  ContextMenuSample,
  DropdownMenuSample,
  KbdSample,
  MenubarSample,
  ToasterSample
} from "./adapted.tsx"
import { openContextMenu } from "./compare.tsx"
import "./kit.css"

/**
 * The components the app changed by hand, from Buildkit's kit with those changes made from outside it: keys shown as
 * the platform writes them, the title bar's own look, and toasts in the app's theme.
 */
const meta = {
  title: "Parity/Kit comparison/Buildkit with app changes"
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Command: Story = { render: CommandSample }
export const ContextMenu: Story = { render: ContextMenuSample, play: openContextMenu }
export const DropdownMenu: Story = { render: DropdownMenuSample }
export const Kbd: Story = { render: KbdSample }
export const Menubar: Story = { render: MenubarSample }
export const Toaster: Story = { render: ToasterSample }
