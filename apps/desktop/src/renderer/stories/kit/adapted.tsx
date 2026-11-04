import {
  cn,
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
  Button,
  Kbd,
  KbdGroup,
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
  SonnerToaster
} from "@buildkitgg/shadcn-baseui-kit"
import { Plus, Save, Undo2 } from "lucide-react"
import { type ComponentProps, useEffect } from "react"
import { toast } from "sonner"
import { formatKeys } from "@/chrome/keys.ts"
import { useResolvedTheme } from "@/theme.ts"
import { Specimen, Stage } from "./compare.tsx"
import { MenuBody, type MenuParts, showToasts } from "./samples.tsx"

/*
 * The components the app changed by hand, drawn with Buildkit's kit and those changes made from outside it, as the app
 * would once the kit's files can't be edited: keys written "Ctrl S" shown as the platform writes them, the title bar's
 * own look, and toasts in the app's theme. The rest is as buildkit.tsx draws it.
 */

/** Keys as the app writes them, "Ctrl S", shown as the platform does: "⌘S" on a Mac, "Ctrl+S" elsewhere. */
function DropdownMenuKeys({ children }: { children: string }) {
  return <DropdownMenuShortcut>{formatKeys(children)}</DropdownMenuShortcut>
}

function ContextMenuKeys({ children }: { children: string }) {
  return <ContextMenuShortcut>{formatKeys(children)}</ContextMenuShortcut>
}

function MenubarKeys({ children }: { children: string }) {
  return <MenubarShortcut>{formatKeys(children)}</MenubarShortcut>
}

function CommandKeys({ children }: { children: string }) {
  return <CommandShortcut>{formatKeys(children)}</CommandShortcut>
}

function Keys({ children }: { children: string }) {
  return <Kbd>{formatKeys(children)}</Kbd>
}

/** The title bar's menus: no frame around the bar, and names set plainly in a taller, roomier hover. */
function TitleBarMenubar({ className, ...props }: ComponentProps<typeof Menubar>) {
  return <Menubar className={cn("h-auto rounded-none border-0 p-0", className)} {...props} />
}

function TitleBarMenubarTrigger({ className, ...props }: ComponentProps<typeof MenubarTrigger>) {
  return (
    <MenubarTrigger
      className={cn(
        "h-7 rounded-md px-2 py-0 font-normal hover:bg-accent focus-visible:bg-accent aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

/**
 * Menus as wide as what they hold, from 14rem, a little closer to the bar, that fade as they close. The kit's menubar
 * menus are its dropdown menus, as wide as their trigger and at least 9rem, so a menu under "Edit" wraps its items.
 */
function TitleBarMenubarContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof MenubarContent>) {
  return (
    <MenubarContent
      sideOffset={sideOffset}
      className={cn(
        "w-auto min-w-56 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      {...props}
    />
  )
}

/** Submenus as wide as what they hold, rather than as their item in the menu. */
function TitleBarMenubarSubContent({ className, ...props }: ComponentProps<typeof MenubarSubContent>) {
  return <MenubarSubContent className={cn("w-auto min-w-[96px]", className)} {...props} />
}

/** Group names small and dimmed, as the other menus' are. */
function TitleBarMenubarLabel({ className, ...props }: ComponentProps<typeof MenubarLabel>) {
  return <MenubarLabel className={cn("text-xs text-muted-foreground", className)} {...props} />
}

/** The check at the end of the item, where the app's other menus put it, rather than at its start. */
const checkAtEnd = "ps-1.5 pe-8 *:first:start-auto *:first:end-2"

function TitleBarMenubarCheckboxItem({ className, ...props }: ComponentProps<typeof MenubarCheckboxItem>) {
  return <MenubarCheckboxItem className={cn(checkAtEnd, className)} {...props} />
}

function TitleBarMenubarRadioItem({ className, ...props }: ComponentProps<typeof MenubarRadioItem>) {
  return <MenubarRadioItem className={cn(checkAtEnd, className)} {...props} />
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
              <Plus /> New design <CommandKeys>Ctrl N</CommandKeys>
            </CommandItem>
            <CommandItem>
              <Save /> Save <CommandKeys>Ctrl S</CommandKeys>
            </CommandItem>
            <CommandItem disabled>
              <Undo2 /> Undo <CommandKeys>Ctrl Z</CommandKeys>
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
  Shortcut: ContextMenuKeys,
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

const dropdownMenuParts: MenuParts = {
  Group: DropdownMenuGroup,
  Label: DropdownMenuLabel,
  Item: DropdownMenuItem,
  Shortcut: DropdownMenuKeys,
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

export function KbdSample() {
  return (
    <Stage>
      <Specimen label="Keys, as the app writes them">
        <Keys>Ctrl K</Keys>
        <Keys>Shift Ctrl P</Keys>
        <Keys>Alt F4</Keys>
        <Keys>Delete</Keys>
      </Specimen>
      <Specimen label="In a group">
        <KbdGroup>
          <Keys>Ctrl</Keys>
          <Keys>K</Keys>
        </KbdGroup>
      </Specimen>
    </Stage>
  )
}

const menubarParts: MenuParts = {
  Group: MenubarGroup,
  Label: TitleBarMenubarLabel,
  Item: MenubarItem,
  Shortcut: MenubarKeys,
  Separator: MenubarSeparator,
  Sub: MenubarSub,
  SubTrigger: MenubarSubTrigger,
  SubContent: TitleBarMenubarSubContent,
  CheckboxItem: TitleBarMenubarCheckboxItem,
  RadioGroup: MenubarRadioGroup,
  RadioItem: TitleBarMenubarRadioItem
}

/** The app's title bar menus, with Edit open. */
export function MenubarSample() {
  return (
    <Stage>
      <TitleBarMenubar>
        {["File", "Edit", "View"].map((name) => (
          <MenubarMenu key={name} defaultOpen={name === "Edit"}>
            <TitleBarMenubarTrigger>{name}</TitleBarMenubarTrigger>
            <TitleBarMenubarContent>
              <MenuBody parts={menubarParts} />
            </TitleBarMenubarContent>
          </MenubarMenu>
        ))}
      </TitleBarMenubar>
    </Stage>
  )
}

/** The kit's Sonner toaster in the app's theme, rather than the system's that `next-themes` would give it. */
export function ToasterSample() {
  const theme = useResolvedTheme()
  useEffect(() => {
    showToasts()
    return () => void toast.dismiss()
  }, [])
  return (
    <Stage>
      <p className="text-muted-foreground">Toasts show at the bottom right. Point at them to spread them out.</p>
      <SonnerToaster theme={theme} position="bottom-right" offset={{ bottom: 40, right: 16 }} />
    </Stage>
  )
}
