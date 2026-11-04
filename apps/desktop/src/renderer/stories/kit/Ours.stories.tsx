import type { Meta, StoryObj } from "@storybook/react-vite"
import { openContextMenu } from "./compare.tsx"
import {
  BadgeSample,
  ButtonSample,
  CommandSample,
  ContextMenuSample,
  DialogSample,
  DropdownMenuSample,
  InputGroupSample,
  InputSample,
  KbdSample,
  LabelSample,
  MenubarSample,
  PopoverSample,
  RadioGroupSample,
  SelectSample,
  SeparatorSample,
  SwitchSample,
  TabsSample,
  TextareaSample,
  ToasterSample,
  ToggleGroupSample,
  ToggleSample,
  TooltipSample
} from "./ours.tsx"

/**
 * The app's shadcn components as it draws them now, from the radix-nova files in components/ui, with their popups
 * open. Kit comparison/Side by side shows each beside Buildkit's.
 */
const meta = {
  title: "Parity/Kit comparison/Ours"
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Badge: Story = { render: BadgeSample }
export const Button: Story = { render: ButtonSample }
export const Command: Story = { render: CommandSample }
export const ContextMenu: Story = { render: ContextMenuSample, play: openContextMenu }
export const Dialog: Story = { render: DialogSample }
export const DropdownMenu: Story = { render: DropdownMenuSample }
export const Input: Story = { render: InputSample }
export const InputGroup: Story = { render: InputGroupSample }
export const Kbd: Story = { render: KbdSample }
export const Label: Story = { render: LabelSample }
export const Menubar: Story = { render: MenubarSample }
export const Popover: Story = { render: PopoverSample }
export const RadioGroup: Story = { render: RadioGroupSample }
export const Select: Story = { render: SelectSample }
export const Separator: Story = { render: SeparatorSample }
export const Switch: Story = { render: SwitchSample }
export const Tabs: Story = { render: TabsSample }
export const Textarea: Story = { render: TextareaSample }
export const Toaster: Story = { render: ToasterSample }
export const Toggle: Story = { render: ToggleSample }
export const ToggleGroup: Story = { render: ToggleGroupSample }
export const Tooltip: Story = { render: TooltipSample }
