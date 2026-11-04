import { ClipboardPaste, Copy, Scissors, Trash2 } from "lucide-react"
import { type ComponentType, type ReactNode, useState } from "react"
import { toast } from "sonner"

/**
 * A menu's parts in one kit, such as its dropdown menu's. Each kit's dropdown, context and menubar menus draw the same
 * body from their own parts, so the sides differ only in the kit.
 */
export type MenuParts = {
  Group: ComponentType<{ children: ReactNode }>
  Label: ComponentType<{ children: ReactNode }>
  Item: ComponentType<{
    children: ReactNode
    inset?: boolean
    disabled?: boolean
    variant?: "default" | "destructive"
  }>
  Shortcut: ComponentType<{ children: string }>
  Separator: ComponentType
  Sub: ComponentType<{ children: ReactNode; defaultOpen?: boolean }>
  SubTrigger: ComponentType<{ children: ReactNode }>
  SubContent: ComponentType<{ children: ReactNode }>
  CheckboxItem: ComponentType<{ children: ReactNode; checked: boolean; onCheckedChange: (checked: boolean) => void }>
  RadioGroup: ComponentType<{ children: ReactNode; value: string; onValueChange: (value: string) => void }>
  RadioItem: ComponentType<{ children: ReactNode; value: string }>
}

/**
 * What every menu here holds, as the app's menus do: a label, items with icons and keys, one without an icon and one
 * unavailable, a submenu, choices that are checked, one of several, and a destructive item.
 */
export function MenuBody({ parts }: { parts: MenuParts }) {
  const { Group, Label, Item, Shortcut, Separator, Sub, SubTrigger, SubContent, CheckboxItem, RadioGroup, RadioItem } =
    parts
  const [grid, setGrid] = useState(true)
  const [rulers, setRulers] = useState(false)
  const [zoom, setZoom] = useState("100%")
  return (
    <>
      <Group>
        <Label>Edit</Label>
        <Item>
          <Scissors /> Cut <Shortcut>Ctrl X</Shortcut>
        </Item>
        <Item>
          <Copy /> Copy <Shortcut>Ctrl C</Shortcut>
        </Item>
        <Item disabled>
          <ClipboardPaste /> Paste <Shortcut>Ctrl V</Shortcut>
        </Item>
        <Item inset>
          Select all <Shortcut>Ctrl A</Shortcut>
        </Item>
      </Group>
      <Separator />
      <Sub defaultOpen>
        <SubTrigger>Open recent</SubTrigger>
        <SubContent>
          <Item>pricing-site</Item>
          <Item>dashboard</Item>
          <Separator />
          <Item>Clear recent projects</Item>
        </SubContent>
      </Sub>
      <Separator />
      <CheckboxItem checked={grid} onCheckedChange={setGrid}>
        Pixel grid <Shortcut>Shift Ctrl G</Shortcut>
      </CheckboxItem>
      <CheckboxItem checked={rulers} onCheckedChange={setRulers}>
        Rulers
      </CheckboxItem>
      <Separator />
      <RadioGroup value={zoom} onValueChange={setZoom}>
        {["50%", "100%", "200%"].map((choice) => (
          <RadioItem key={choice} value={choice}>
            {choice}
          </RadioItem>
        ))}
      </RadioGroup>
      <Separator />
      <Item variant="destructive">
        <Trash2 /> Delete <Shortcut>Delete</Shortcut>
      </Item>
    </>
  )
}

/** The viewports a select offers, in groups as the app's are. */
export const viewports = [
  { value: "desktop", label: "Desktop" },
  { value: "tablet", label: "Tablet" },
  { value: "phone", label: "Phone" }
]

/** The toasts the app shows, kept open: plain, done, failed with a retry, and still going. */
export function showToasts(): void {
  toast("Saved pricing-site", { duration: Infinity })
  toast.success("Exported 3 designs", { description: "They're in the Downloads folder.", duration: Infinity })
  toast.error("Couldn't open the project", {
    description: "Its package.json isn't valid JSON.",
    action: { label: "Retry", onClick: () => undefined },
    duration: Infinity
  })
  toast.loading("Installing Lucide…", { duration: Infinity })
}
