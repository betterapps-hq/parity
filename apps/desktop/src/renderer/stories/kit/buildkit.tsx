import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
  Kbd,
  KbdGroup,
  Label,
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Separator,
  SonnerToaster,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Link, Plus, Save, Search, Undo2 } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"
import { Specimen, Stage } from "./compare.tsx"
import { MenuBody, type MenuParts, showToasts, viewports } from "./samples.tsx"

/*
 * Each component as Buildkit's kit draws it, with the same content as ours.tsx. Where the two are written differently,
 * it's Base UI's API: a trigger takes `render` where Radix took `asChild`, a toggle group's value is a list, a select
 * names its items so its value shows their label, and a menu label sits in a group.
 */

const buttonVariants = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const
const badgeVariants = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const

export function BadgeSample() {
  return (
    <Stage>
      <Specimen label="Variants">
        {badgeVariants.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </Specimen>
      <Specimen label="With an icon">
        <Badge variant="secondary">
          <Plus data-icon="inline-start" /> New
        </Badge>
        <Badge variant="outline">3 modes</Badge>
      </Specimen>
    </Stage>
  )
}

export function ButtonSample() {
  return (
    <Stage>
      <Specimen label="Variants">
        {buttonVariants.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </Specimen>
      <Specimen label="Sizes">
        {(["xs", "sm", "default", "lg"] as const).map((size) => (
          <Button key={size} size={size} variant="outline">
            <Plus data-icon="inline-start" /> {size}
          </Button>
        ))}
      </Specimen>
      <Specimen label="Icon sizes">
        {(["icon-xs", "icon-sm", "icon", "icon-lg"] as const).map((size) => (
          <Button key={size} size={size} variant="ghost" aria-label={`Add, ${size}`}>
            <Plus />
          </Button>
        ))}
      </Specimen>
      <Specimen label="Unavailable">
        <Button disabled>Save</Button>
        <Button disabled variant="outline">
          Export
        </Button>
      </Specimen>
    </Stage>
  )
}

export function CommandSample() {
  return (
    <Stage>
      <Command className="w-80 rounded-xl border">
        <CommandInput placeholder="Search actions…" />
        <CommandList>
          <CommandEmpty>No actions found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem>
              <Plus /> New design <CommandShortcut>Ctrl N</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Save /> Save <CommandShortcut>Ctrl S</CommandShortcut>
            </CommandItem>
            <CommandItem disabled>
              <Undo2 /> Undo <CommandShortcut>Ctrl Z</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Designs">
            <CommandItem>Pricing</CommandItem>
            <CommandItem>Dashboard</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </Stage>
  )
}

const contextMenuParts: MenuParts = {
  Group: ContextMenuGroup,
  Label: ContextMenuLabel,
  Item: ContextMenuItem,
  Shortcut: ContextMenuShortcut,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
  CheckboxItem: ContextMenuCheckboxItem,
  RadioGroup: ContextMenuRadioGroup,
  RadioItem: ContextMenuRadioItem
}

/** Opens when its area is right-clicked, as the story's play does. */
export function ContextMenuSample() {
  return (
    <Stage>
      <ContextMenu>
        <ContextMenuTrigger
          data-sample="context-menu-trigger"
          className="flex h-32 w-full max-w-72 items-center justify-center rounded-xl border border-dashed text-muted-foreground"
        >
          Right-click here
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <MenuBody parts={contextMenuParts} />
        </ContextMenuContent>
      </ContextMenu>
    </Stage>
  )
}

export function DialogSample() {
  return (
    <Stage>
      <Dialog defaultOpen>
        <DialogTrigger render={<Button variant="outline" />}>Close tab…</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save changes to Pricing?</DialogTitle>
            <DialogDescription>Your changes are lost if you close the tab without saving them.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Don&apos;t save</DialogClose>
            <Button>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stage>
  )
}

const dropdownMenuParts: MenuParts = {
  Group: DropdownMenuGroup,
  Label: DropdownMenuLabel,
  Item: DropdownMenuItem,
  Shortcut: DropdownMenuShortcut,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
  CheckboxItem: DropdownMenuCheckboxItem,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem
}

export function DropdownMenuSample() {
  return (
    <Stage>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger render={<Button variant="outline" />}>Edit</DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <MenuBody parts={dropdownMenuParts} />
        </DropdownMenuContent>
      </DropdownMenu>
    </Stage>
  )
}

export function InputSample() {
  return (
    <Stage>
      <Specimen label="States">
        <Input className="w-48" defaultValue="Pricing" aria-label="Name" />
        <Input className="w-48" placeholder="Search layers" aria-label="Search layers" />
        <Input className="w-48" defaultValue="Locked" disabled aria-label="Locked" />
        <Input className="w-48" defaultValue="12px 8" aria-invalid aria-label="Padding" />
      </Specimen>
    </Stage>
  )
}

export function InputGroupSample() {
  return (
    <Stage>
      <Specimen label="Addons">
        <InputGroup className="w-64">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search shortcuts" />
          <InputGroupAddon align="inline-end">
            <Kbd>Ctrl K</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup className="w-64">
          <InputGroupAddon>
            <InputGroupText>https://</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput defaultValue="parity.example" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Copy link">
              <Link />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Specimen>
      <Specimen label="With a text area">
        <InputGroup className="w-80">
          <InputGroupTextarea placeholder="Describe the change" />
          <InputGroupAddon align="block-end">
            <InputGroupText>0 of 280</InputGroupText>
            <InputGroupButton size="sm" variant="default" className="ml-auto">
              Send
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Specimen>
    </Stage>
  )
}

export function KbdSample() {
  return (
    <Stage>
      <Specimen label="Keys, as the app writes them">
        <Kbd>Ctrl K</Kbd>
        <Kbd>Shift Ctrl P</Kbd>
        <Kbd>Alt F4</Kbd>
        <Kbd>Delete</Kbd>
      </Specimen>
      <Specimen label="In a group">
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Specimen>
    </Stage>
  )
}

export function LabelSample() {
  return (
    <Stage>
      <div className="grid w-64 gap-1.5">
        <Label htmlFor="kit-label-name">Design name</Label>
        <Input id="kit-label-name" defaultValue="Pricing" />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="kit-label-snap" defaultChecked />
        <Label htmlFor="kit-label-snap">Snap to pixels</Label>
      </div>
    </Stage>
  )
}

const menubarParts: MenuParts = {
  Group: MenubarGroup,
  Label: MenubarLabel,
  Item: MenubarItem,
  Shortcut: MenubarShortcut,
  Separator: MenubarSeparator,
  Sub: MenubarSub,
  SubTrigger: MenubarSubTrigger,
  SubContent: MenubarSubContent,
  CheckboxItem: MenubarCheckboxItem,
  RadioGroup: MenubarRadioGroup,
  RadioItem: MenubarRadioItem
}

/** The app's title bar menus, with Edit open. */
export function MenubarSample() {
  return (
    <Stage>
      <Menubar>
        {["File", "Edit", "View"].map((name) => (
          <MenubarMenu key={name} defaultOpen={name === "Edit"}>
            <MenubarTrigger>{name}</MenubarTrigger>
            <MenubarContent>
              <MenuBody parts={menubarParts} />
            </MenubarContent>
          </MenubarMenu>
        ))}
      </Menubar>
    </Stage>
  )
}

export function PopoverSample() {
  return (
    <Stage>
      <Popover defaultOpen>
        <PopoverTrigger render={<Button variant="outline" />}>Rename</PopoverTrigger>
        <PopoverContent align="start">
          <PopoverHeader>
            <PopoverTitle>Rename design</PopoverTitle>
            <PopoverDescription>The name shows on its board and in the layers.</PopoverDescription>
          </PopoverHeader>
          <Input defaultValue="Pricing" aria-label="Name" />
        </PopoverContent>
      </Popover>
    </Stage>
  )
}

export function RadioGroupSample() {
  return (
    <Stage>
      <RadioGroup defaultValue="fill" className="w-56">
        {[
          { value: "fit", label: "Fit the content" },
          { value: "fill", label: "Fill the container" },
          { value: "fixed", label: "Fixed size", disabled: true }
        ].map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <RadioGroupItem id={`kit-radio-${option.value}`} value={option.value} disabled={option.disabled} />
            <Label htmlFor={`kit-radio-${option.value}`}>{option.label}</Label>
          </div>
        ))}
      </RadioGroup>
    </Stage>
  )
}

/** Base UI shows a select's value as written unless the select is told its items' labels. */
const viewportItems = [...viewports, { value: "custom", label: "Custom size…" }]

export function SelectSample() {
  return (
    <Stage>
      <Specimen label="Sizes, closed">
        <Select items={viewports} defaultValue="tablet">
          <SelectTrigger size="sm" className="w-36" aria-label="Viewport, small">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {viewports.map((viewport) => (
              <SelectItem key={viewport.value} value={viewport.value}>
                {viewport.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={viewports}>
          <SelectTrigger className="w-36" aria-label="Viewport, empty">
            <SelectValue placeholder="Viewport" />
          </SelectTrigger>
          <SelectContent>
            {viewports.map((viewport) => (
              <SelectItem key={viewport.value} value={viewport.value}>
                {viewport.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Specimen>
      <Specimen label="Open">
        <Select items={viewportItems} defaultValue="desktop" defaultOpen>
          <SelectTrigger className="w-44" aria-label="Viewport">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Viewports</SelectLabel>
              {viewports.map((viewport) => (
                <SelectItem key={viewport.value} value={viewport.value}>
                  {viewport.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectItem value="custom">Custom size…</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Specimen>
    </Stage>
  )
}

export function SeparatorSample() {
  return (
    <Stage>
      <div className="w-64">
        <p>Layers</p>
        <Separator className="my-3" />
        <p className="text-muted-foreground">Pricing, Dashboard</p>
      </div>
      <div className="flex h-5 items-center gap-3">
        <span>Design</span>
        <Separator orientation="vertical" />
        <span>Prototype</span>
        <Separator orientation="vertical" />
        <span>Inspect</span>
      </div>
    </Stage>
  )
}

export function SwitchSample() {
  return (
    <Stage>
      <Specimen label="Default size">
        <Switch defaultChecked aria-label="On" />
        <Switch aria-label="Off" />
        <Switch disabled aria-label="Unavailable" />
      </Specimen>
      <Specimen label="Small, as the inspector uses">
        <Switch size="sm" defaultChecked aria-label="On, small" />
        <Switch size="sm" aria-label="Off, small" />
      </Specimen>
    </Stage>
  )
}

export function TabsSample() {
  return (
    <Stage>
      {(["default", "line"] as const).map((variant) => (
        <Specimen key={variant} label={`${variant} list`}>
          <Tabs defaultValue="design" className="w-80">
            <TabsList variant={variant}>
              <TabsTrigger value="design">Design</TabsTrigger>
              <TabsTrigger value="prototype">Prototype</TabsTrigger>
              <TabsTrigger value="inspect" disabled>
                Inspect
              </TabsTrigger>
            </TabsList>
            <TabsContent value="design" className="text-muted-foreground">
              Layout, fill and type for the selection.
            </TabsContent>
            <TabsContent value="prototype" className="text-muted-foreground">
              What happens when it&apos;s clicked.
            </TabsContent>
          </Tabs>
        </Specimen>
      ))}
    </Stage>
  )
}

export function TextareaSample() {
  return (
    <Stage>
      <Specimen label="States">
        <Textarea className="w-64" placeholder="Add a description" aria-label="Description" />
        <Textarea className="w-64" defaultValue="Plans that grow with your team" aria-label="Heading" />
        <Textarea className="w-64" defaultValue="Locked" disabled aria-label="Locked" />
        <Textarea className="w-64" defaultValue="Too long" aria-invalid aria-label="Invalid" />
      </Specimen>
    </Stage>
  )
}

/**
 * The kit's Sonner toaster, where the app puts it, with toasts that stay until closed. The kit also has Base UI's own
 * toasts as `Toaster`; the app's `toast()` calls are Sonner's, so this is the like for like.
 */
export function ToasterSample() {
  useEffect(() => {
    showToasts()
    return () => void toast.dismiss()
  }, [])
  return (
    <Stage>
      <p className="text-muted-foreground">Toasts show at the bottom right. Point at them to spread them out.</p>
      <SonnerToaster position="bottom-right" offset={{ bottom: 40, right: 16 }} />
    </Stage>
  )
}

export function ToggleSample() {
  return (
    <Stage>
      {(["default", "outline"] as const).map((variant) => (
        <Specimen key={variant} label={`${variant}, small to large, then pressed`}>
          {(["sm", "default", "lg"] as const).map((size) => (
            <Toggle key={size} variant={variant} size={size} aria-label={`Bold, ${size}`}>
              <Bold />
            </Toggle>
          ))}
          <Toggle variant={variant} defaultPressed aria-label="Italic, pressed">
            <Italic /> Italic
          </Toggle>
        </Specimen>
      ))}
    </Stage>
  )
}

export function ToggleGroupSample() {
  const alignments = [
    { value: "left", label: "Align left", icon: AlignLeft },
    { value: "center", label: "Align center", icon: AlignCenter },
    { value: "right", label: "Align right", icon: AlignRight }
  ]
  return (
    <Stage>
      {(["default", "outline"] as const).map((variant) => (
        <Specimen key={variant} label={`${variant}, one choice`}>
          <ToggleGroup variant={variant} defaultValue={["left"]}>
            {alignments.map(({ value, label, icon: Icon }) => (
              <ToggleGroupItem key={value} value={value} aria-label={label}>
                <Icon />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup variant={variant} size="sm" spacing={0} defaultValue={["center"]}>
            {alignments.map(({ value, label, icon: Icon }) => (
              <ToggleGroupItem key={value} value={value} aria-label={`${label}, small`}>
                <Icon />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Specimen>
      ))}
      <Specimen label="Several choices">
        <ToggleGroup multiple variant="outline" defaultValue={["bold"]}>
          <ToggleGroupItem value="bold" aria-label="Bold">
            <Bold />
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic">
            <Italic />
          </ToggleGroupItem>
        </ToggleGroup>
      </Specimen>
    </Stage>
  )
}

export function TooltipSample() {
  return (
    <Stage>
      <div className="pt-10">
        <TooltipProvider>
          <Tooltip defaultOpen>
            <TooltipTrigger render={<Button variant="outline" size="icon-sm" aria-label="Save" />}>
              <Save />
            </TooltipTrigger>
            <TooltipContent>
              Save <Kbd>Ctrl S</Kbd>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </Stage>
  )
}
