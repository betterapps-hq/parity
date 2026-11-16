import {
  createToastManager,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager
} from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect, useState } from "react"

type Kind = "success" | "info" | "warning" | "error" | "loading" | "plain"

interface Shown {
  kind: Kind
  title: string
  description?: string
  action?: string
}

interface Entry {
  /** Where the toast comes from, as a person would do it. */
  when: string
  before: Shown
  /** What it says instead, or `null` when it should go. */
  after: Shown | null
  why: string
}

interface Group {
  name: string
  entries: Entry[]
}

/**
 * Every toast the app shows (explorations left out), as it says it now and as proposed. Errors use realistic reasons;
 * the human reasons after need a small mapping from system errors (permission, disk full, file in use, missing folder)
 * to plain words, falling back to the system's text.
 */
const groups: Group[] = [
  {
    name: "Saving",
    entries: [
      {
        when: "File > Save",
        before: {
          kind: "success",
          title: "Saved",
          description: "D:/projects/shadcn-vite/shadcn-vite.par, D:/projects/shadcn-vite/src/designs/pricing.par"
        },
        after: { kind: "success", title: "Saved the project" },
        why: "Says what was saved, without the list of paths."
      },
      {
        when: "File > Save, when the file can't be written",
        before: {
          kind: "error",
          title: "Couldn't save",
          description: "EPERM: operation not permitted, open 'D:\\projects\\shadcn-vite\\shadcn-vite.par'"
        },
        after: {
          kind: "error",
          title: "Couldn't save the project",
          description: "Parity isn't allowed to write to its folder.",
          action: "Try again"
        },
        why: "The reason in plain words, and the project without its name, which could be any length."
      },
      {
        when: "Saving in the background fails",
        before: {
          kind: "error",
          title: "Couldn't save shadcn-vite",
          description: "ENOSPC: no space left on device, write",
          action: "Retry"
        },
        after: {
          kind: "error",
          title: "Couldn't save the project",
          description: "The disk is full, so your changes are only in Parity.",
          action: "Try again"
        },
        why: "The reason, and what it means for your work. Try again, as everywhere else."
      },
      {
        when: "File > Save a copy",
        before: {
          kind: "success",
          title: "Saved a copy",
          description: "D:/projects/shadcn-vite copy.par",
          action: "Show"
        },
        after: {
          kind: "success",
          title: "Saved a copy",
          description: "D:/projects/shadcn-vite copy.par",
          action: "Show file"
        },
        why: "The button says what it shows."
      },
      {
        when: "File > Save a copy, when the place can't be written",
        before: {
          kind: "error",
          title: "Couldn't save the copy",
          description: "EACCES: permission denied, open 'C:\\Program Files\\shadcn-vite copy.par'"
        },
        after: {
          kind: "error",
          title: "Couldn't save the copy",
          description: "Parity isn't allowed to write there. Try another folder."
        },
        why: "Plain reason and what to do instead."
      },
      {
        when: "A design file changes on disk while it has unsaved edits",
        before: {
          kind: "warning",
          title: "src/designs/pricing.par changed on disk",
          description: "Your unsaved changes are kept. Saving writes them over it.",
          action: "Load from disk"
        },
        after: {
          kind: "warning",
          title: "A file changed outside Parity",
          description: "Reload pricing.par to get its changes, or save to keep yours.",
          action: "Reload"
        },
        why: "“On disk” is jargon, and the file's name goes in the description. Reload is the choice that loses your edits."
      }
    ]
  },
  {
    name: "Projects",
    entries: [
      {
        when: "The project service restarts and a project can't open again",
        before: {
          kind: "error",
          title: "Couldn't reopen shadcn-vite",
          description: "The project service couldn't start Vite: Cannot find module 'vite'"
        },
        after: {
          kind: "error",
          title: "Couldn't reopen the project",
          description: "shadcn-vite needs Vite, which isn't installed in it.",
          action: "Try again"
        },
        why: "No project service, which the person never sees. The project's name goes in the description."
      },
      {
        when: "The builder restarts and a project can't load from it",
        before: {
          kind: "error",
          title: "Couldn't load shadcn-vite from its restarted builder",
          description: "Failed to fetch dynamically imported module"
        },
        after: {
          kind: "error",
          title: "Couldn't reload the project",
          description: "shadcn-vite's preview stopped responding while it restarted.",
          action: "Try again"
        },
        why: "The title was longer than the message and named an internal part."
      },
      {
        when: "Opening a recent project whose folder moved",
        before: {
          kind: "plain",
          title: "Parity can't find shadcn-vite",
          description: "Its folder isn't at D:/projects/shadcn-vite any more. Put it back, or remove it from Recent.",
          action: "Remove"
        },
        after: {
          kind: "warning",
          title: "Can't find the project",
          description: "shadcn-vite is no longer at D:/projects/shadcn-vite.",
          action: "Remove"
        },
        why: "The button carries the instruction. Names go in the description."
      },
      {
        when: "Home, New project",
        before: {
          kind: "plain",
          title: "New project isn't ready yet",
          description: "For now, open a React app's folder.",
          action: "Open a folder"
        },
        after: {
          kind: "info",
          title: "New projects aren't available yet",
          description: "Open an existing React app's folder instead.",
          action: "Open folder"
        },
        why: "Same wording as the other unfinished controls; a shorter button."
      },
      {
        when: "A project card's menu, Copy link",
        before: { kind: "plain", title: "Links to projects aren't ready yet" },
        after: { kind: "info", title: "Project links aren't available yet" },
        why: "Same wording as the other unfinished controls."
      },
      {
        when: "Home, Clone",
        before: {
          kind: "plain",
          title: "Cloning isn't ready yet",
          description: "For now, clone the repository yourself and open its folder."
        },
        after: {
          kind: "info",
          title: "Cloning isn't available yet",
          description: "Clone it yourself, then open its folder here.",
          action: "Open folder"
        },
        why: "Shorter, and the folder can be opened from the toast."
      },
      {
        when: "Account menu, New organization or Invite",
        before: {
          kind: "plain",
          title: "Organizations aren't ready yet",
          description: "Parity can't make one or invite people yet."
        },
        after: { kind: "info", title: "Organizations aren't available yet" },
        why: "The description restated the title."
      },
      {
        when: "Account menu, switching to Personal",
        before: {
          kind: "plain",
          title: "Personal isn't ready yet",
          description: "It needs an organization of your own, which Parity can't make yet."
        },
        after: { kind: "info", title: "Personal isn't available yet" },
        why: "How it's built doesn't help the person."
      }
    ]
  },
  {
    name: "Pasting and dropping",
    entries: [
      {
        when: "Pasting something Parity can't read",
        before: { kind: "error", title: "The copy on the clipboard couldn't be read, so nothing was pasted" },
        after: {
          kind: "error",
          title: "Couldn't paste",
          description: "The clipboard holds something Parity can't read."
        },
        why: "A whole sentence as the title. Lead with what happened."
      },
      {
        when: "Pasting over layers inside a component instance",
        before: { kind: "info", title: "Layers inside an instance can't be pasted over" },
        after: {
          kind: "info",
          title: "Can't edit inside an instance",
          description: "Edit its component to change these layers."
        },
        why: "A short title, and the way round it. Shared with the next one."
      },
      {
        when: "Replacing layers inside a component instance",
        before: { kind: "info", title: "Layers inside an instance can't be replaced" },
        after: {
          kind: "info",
          title: "Can't edit inside an instance",
          description: "Edit its component to change these layers."
        },
        why: "One message for one rule."
      },
      {
        when: "Pasting over a selected screen when the clipboard holds layers",
        before: { kind: "info", title: "Copy screens or components to paste them over the selection" },
        after: {
          kind: "info",
          title: "Can't paste layers over a screen",
          description: "Copy a screen or component to replace it."
        },
        why: "The instruction was the title. Say what happened, then what works."
      },
      {
        when: "Pasting with an empty clipboard",
        before: { kind: "info", title: "There's nothing on the clipboard to paste" },
        after: { kind: "info", title: "Nothing to paste" },
        why: "Fewer words, same meaning."
      },
      {
        when: "Pasting over a design where there's no layout",
        before: { kind: "info", title: "There's no layout here to paste into" },
        after: {
          kind: "info",
          title: "Can't paste here",
          description: "Paste onto a layout or the empty canvas."
        },
        why: "Says where it works, as the drop hint does."
      },
      {
        when: "Pasting a screen where layers go",
        before: { kind: "info", title: "Copy layers to paste them here" },
        after: {
          kind: "info",
          title: "Can't paste a screen here",
          description: "Copy layers to paste them into a layout."
        },
        why: "The instruction was the title. Say what happened, then what works."
      },
      {
        when: "Replacing layers when the clipboard holds a screen",
        before: { kind: "info", title: "Copy layers to replace layers with them" },
        after: {
          kind: "info",
          title: "Can't replace layers with a screen",
          description: "Copy layers to replace these with them."
        },
        why: "The instruction was the title. Say what happened, then what works."
      },
      {
        when: "Pasting or dropping an image, while it's saved",
        before: { kind: "loading", title: "Adding the image…" },
        after: { kind: "loading", title: "Adding the image…" },
        why: "Clear already."
      },
      {
        when: "Pasting an image that can't be saved",
        before: {
          kind: "error",
          title: "Couldn't paste the image",
          description: "ENOSPC: no space left on device"
        },
        after: {
          kind: "error",
          title: "Couldn't paste the image",
          description: "The disk is full, so it couldn't be saved to the project."
        },
        why: "Plain reason."
      },
      {
        when: "Pasting layers that use components this project doesn't have",
        before: {
          kind: "warning",
          title: "Some components aren't in this project",
          description: "Plan card, Stat card"
        },
        after: {
          kind: "warning",
          title: "Some components are missing",
          description: "Plan card and Stat card aren't in this project, so they show as missing."
        },
        why: "A shorter title; the description is a sentence that says what you'll see."
      },
      {
        when: "Dropping files that aren't images",
        before: {
          kind: "warning",
          title: "Skipped notes.pdf",
          description: "notes.pdf isn't a PNG, JPEG, GIF, WebP or SVG image."
        },
        after: {
          kind: "warning",
          title: "Skipped a file",
          description: "notes.pdf isn't a PNG, JPEG, GIF, WebP or SVG image."
        },
        why: "The file's name goes in the description."
      },
      {
        when: "Dropping files over a design where there's no layout",
        before: { kind: "info", title: "There's no layout here to drop into" },
        after: {
          kind: "info",
          title: "Can't drop here",
          description: "Drop onto a layout or the empty canvas."
        },
        why: "Says where it works, matching the hint shown while dragging."
      },
      {
        when: "Dropping several images",
        before: { kind: "loading", title: "Adding 4 images…" },
        after: { kind: "loading", title: "Adding 4 images…" },
        why: "Clear already."
      },
      {
        when: "A dropped image can't be saved",
        before: { kind: "error", title: "Couldn't add hero.png", description: "EBUSY: resource busy or locked" },
        after: {
          kind: "error",
          title: "Couldn't add an image",
          description: "Another app has hero.png open. Close it and drop it again."
        },
        why: "Plain reason and the way round it."
      },
      {
        when: "The layout images were dropped on is deleted before they're saved",
        before: { kind: "info", title: "The layout they were dropped on is gone, so the images weren't placed" },
        after: {
          kind: "warning",
          title: "Images weren't placed",
          description: "The layout they were dropped on was deleted."
        },
        why: "Lead with the outcome. A warning, since the drop didn't happen."
      }
    ]
  },
  {
    name: "Layers and designs",
    entries: [
      {
        when: "Edit > Copy style",
        before: { kind: "success", title: "Copied the style" },
        after: { kind: "success", title: "Copied the style" },
        why: "Clear already."
      },
      {
        when: "Edit > Paste style with no style copied",
        before: { kind: "info", title: "Copy a layer's style first, with Ctrl+Alt+C" },
        after: {
          kind: "info",
          title: "No style copied",
          description: "Copy a layer's style first with Ctrl+Alt+C."
        },
        why: "The instruction was the title. The shortcut shows as ⌥⌘C on a Mac."
      },
      {
        when: "Arrange > Wrap in layout, when the layers can't be wrapped",
        before: { kind: "info", title: "Cannot read properties of undefined (reading 'children')" },
        after: {
          kind: "error",
          title: "Couldn't wrap these layers",
          description: "Layers need to share a layout to be wrapped together."
        },
        why: "A raw error was the title. Say what failed, then why."
      },
      {
        when: "Arrange > Unwrap layout, with a layer that isn't a layout",
        before: { kind: "info", title: "Select a layout to unwrap it" },
        after: { kind: "info", title: "Select a layout to unwrap it" },
        why: "Clear already."
      },
      {
        when: "Make component, when the layer can't become one",
        before: { kind: "info", title: 'No design "pricing" in src/designs/pricing.par' },
        after: {
          kind: "error",
          title: "Couldn't make a component",
          description: "Its file changed while Parity was reading it.",
          action: "Try again"
        },
        why: "A raw error was the title."
      },
      {
        when: "Nudging a layer whose side is a spacing token",
        before: { kind: "info", title: "Its left is the spacing-4 token, so it doesn't nudge that way" },
        after: {
          kind: "info",
          title: "Can't nudge that way",
          description: "Its left edge is set by the spacing-4 token."
        },
        why: "The title was the whole explanation. Lead with what happened."
      },
      {
        when: "Converting a frame into a component",
        before: {
          kind: "success",
          title: "Plan card is a component",
          description: "Place it in screens from Components.",
          action: "Undo"
        },
        after: {
          kind: "success",
          title: "Converted to a component",
          description: "Plan card is now a component.",
          action: "Undo"
        },
        why: "The hint teaches what the Components panel already shows. Names go in the description."
      },
      {
        when: "Converting a frame into a screen",
        before: {
          kind: "success",
          title: "Pricing is a screen",
          description: "Show it in more modes from its board's menu.",
          action: "Undo"
        },
        after: {
          kind: "success",
          title: "Converted to a screen",
          description: "Pricing is now a screen.",
          action: "Undo"
        },
        why: "Same as above."
      },
      {
        when: "Inserting from Components or Quick insert with nothing selected",
        before: { kind: "info", title: "Select a layout, or a layer to add it after" },
        after: {
          kind: "info",
          title: "Nowhere to add it",
          description: "Select a layout, or a layer to add it after."
        },
        why: "The instruction was the title. Say what happened, then what works."
      },
      {
        when: "Dropping a layer from another design on an instance's slot",
        before: { kind: "info", title: "Only layers in this design can go in Actions" },
        after: {
          kind: "info",
          title: "Can't drop that here",
          description: "Only layers in this design can go in Actions."
        },
        why: "The slot's name was in the title. Say what happened, then why."
      },
      {
        when: "Dropping an instance on one of its own slots",
        before: { kind: "info", title: "Plan card can't go in its own slot" },
        after: { kind: "info", title: "Can't drop that here", description: "Plan card can't go in its own slot." },
        why: "Same as above."
      },
      {
        when: "Dropping a layer on a slot of an instance inside it",
        before: { kind: "info", title: "Pricing grid can't go in Actions, which is inside it" },
        after: {
          kind: "info",
          title: "Can't drop that here",
          description: "Pricing grid can't go in Actions, which is inside it."
        },
        why: "Same as above."
      }
    ]
  },
  {
    name: "Copying and exporting",
    entries: [
      {
        when: "Copy as PNG with nothing selected",
        before: { kind: "info", title: "Select a screen, a component or a layer to copy it as a PNG" },
        after: { kind: "info", title: "Nothing selected", description: "Select what to copy as a PNG." },
        why: "A short title, and every kind of thing works, so don't list them."
      },
      {
        when: "Copy as PNG, while it draws",
        before: { kind: "loading", title: "Copying as PNG…" },
        after: { kind: "loading", title: "Copying as PNG…" },
        why: "Clear already."
      },
      {
        when: "Copy as PNG, done",
        before: { kind: "success", title: "Copied as PNG" },
        after: { kind: "success", title: "Copied as PNG" },
        why: "Clear already."
      },
      {
        when: "Copy as PNG, when nothing could be drawn",
        before: {
          kind: "error",
          title: "Couldn't copy as PNG",
          description: "Pricing in Mobile: an image didn't load: /images/plans-hero.png"
        },
        after: {
          kind: "error",
          title: "Couldn't copy as PNG",
          description: "An image in Pricing didn't load: plans-hero.png."
        },
        why: "Lead with what went wrong, and drop internal paths."
      },
      {
        when: "Copy as PNG or export, when some layers can't be drawn",
        before: {
          kind: "warning",
          title: "Some layers couldn't be drawn",
          description: "Hero in Pricing: an image didn't load: /images/plans-hero.png"
        },
        after: {
          kind: "warning",
          title: "Some layers were left out",
          description: "An image in Pricing's Hero didn't load: plans-hero.png."
        },
        why: "Says the outcome: the rest went through without them."
      },
      {
        when: "Export with nothing selected",
        before: { kind: "info", title: "Select a screen, a component or a layer to export it" },
        after: { kind: "info", title: "Nothing selected", description: "Select what to export." },
        why: "A short title, and every kind of thing works, so don't list them."
      },
      {
        when: "File > Export > Selection as PNG with nothing selected",
        before: { kind: "info", title: "Select a screen or component to export it" },
        after: { kind: "info", title: "Nothing selected", description: "Select a screen or component to export." },
        why: "Same shape as the other exports."
      },
      {
        when: "File > Export > All designs with none in the project",
        before: { kind: "info", title: "There are no screens or components to export" },
        after: {
          kind: "info",
          title: "Nothing to export",
          description: "This project has no screens or components yet."
        },
        why: "A short title; the reason goes in the description."
      },
      {
        when: "Exporting, while it draws",
        before: { kind: "loading", title: "Exporting Pricing…" },
        after: { kind: "loading", title: "Exporting a screen…" },
        why: "A name in the title could be any length."
      },
      {
        when: "Exporting, done",
        before: {
          kind: "success",
          title: "Exported 6 images",
          description: "D:/exports/shadcn-vite",
          action: "Show"
        },
        after: {
          kind: "success",
          title: "Exported 6 images",
          description: "D:/exports/shadcn-vite",
          action: "Open folder"
        },
        why: "The button says what it opens."
      },
      {
        when: "Exporting, when some previews have problems",
        before: {
          kind: "warning",
          title: "Some previews had problems",
          description:
            "Pricing (annual billing) in Mobile: an image didn't load: /images/plans-hero.png\nPricing in Desktop dark: rendering took longer than 10 seconds and was cut short"
        },
        after: {
          kind: "warning",
          title: "Some images may be incomplete",
          description:
            "Pricing (annual billing), Mobile: an image didn't load.\nPricing, Desktop dark: cut short after 10 seconds."
        },
        why: "About the exported images, not previews, and each problem in fewer words."
      },
      {
        when: "Exporting fails",
        before: { kind: "error", title: "Couldn't export", description: "The offscreen renderer stopped responding" },
        after: {
          kind: "error",
          title: "Couldn't export",
          description: "Drawing the designs stopped responding.",
          action: "Try again"
        },
        why: "No internal names, and a way forward."
      },
      {
        when: "Developer menu, Clear bitmap cache",
        before: { kind: "success", title: "Bitmap cache cleared" },
        after: { kind: "success", title: "Cleared the bitmap cache" },
        why: "Verb first, like Saved and Copied."
      },
      {
        when: "Developer menu, Clear bitmap cache fails",
        before: {
          kind: "error",
          title: "The bitmap cache couldn't be cleared",
          description: "EBUSY: resource busy or locked"
        },
        after: {
          kind: "error",
          title: "Couldn't clear the cache",
          description: "Another app has one of its files open."
        },
        why: "Every failure starts with Couldn't, and the title stays short."
      }
    ]
  },
  {
    name: "Libraries and project files",
    entries: [
      {
        when: "Adding a library, while it installs",
        before: { kind: "loading", title: "Installing Nova…", description: "With the project's package manager" },
        after: { kind: "loading", title: "Installing Nova…" },
        why: "How it's installed doesn't help the person."
      },
      {
        when: "Adding a library, done",
        before: { kind: "success", title: "Nova is ready" },
        after: { kind: "success", title: "Installed Nova" },
        why: "Ready for what? Say what happened."
      },
      {
        when: "Adding a library fails",
        before: {
          kind: "error",
          title: "Couldn't install Nova",
          description: "npm ERR! code ERESOLVE npm ERR! ERESOLVE unable to resolve dependency tree"
        },
        after: {
          kind: "error",
          title: "Couldn't install Nova",
          description: "Its packages conflict with the project's.",
          action: "Details"
        },
        why: "The package manager's log goes behind a button."
      },
      {
        when: "The Components panel can't list libraries",
        before: { kind: "error", title: "Couldn't list libraries", description: "fetch failed" },
        after: {
          kind: "error",
          title: "Couldn't load libraries",
          description: "Parity couldn't reach the library list.",
          action: "Try again"
        },
        why: "Plain reason and a way forward."
      },
      {
        when: "Importing a library's styles fails",
        before: {
          kind: "error",
          title: "Couldn't import its styles",
          description: "src/index.css changed since Parity read it"
        },
        after: {
          kind: "error",
          title: "Couldn't import Nova's styles",
          description: "src/index.css changed while Parity was writing it.",
          action: "Try again"
        },
        why: "“Its” has nothing to point at in a toast."
      },
      {
        when: "Parity changes a project file, such as importing styles (Show changes stays under the description)",
        before: {
          kind: "success",
          title: "Changed src/index.css",
          description: "Import Shadcn Nova's styles",
          action: "Undo"
        },
        after: {
          kind: "success",
          title: "Changed a project file",
          description: "Imported Nova's styles into src/index.css.",
          action: "Undo"
        },
        why: "The path moves to the description, which reads as what happened."
      },
      {
        when: "Undo on that toast, while it's put back",
        before: { kind: "loading", title: "Putting back src/index.css…" },
        after: { kind: "loading", title: "Undoing the change…" },
        why: "Matches the Undo that was pressed."
      },
      {
        when: "Undo, done",
        before: { kind: "success", title: "Put back src/index.css", description: "Import Shadcn Nova's styles" },
        after: { kind: "success", title: "Undid the change", description: "src/index.css is back as it was." },
        why: "Matches the Undo that was pressed."
      },
      {
        when: "Undo, when the file changed again since",
        before: {
          kind: "error",
          title: "Couldn't undo it",
          description: "src/index.css changed since this was made, so nothing was written"
        },
        after: {
          kind: "error",
          title: "Couldn't undo the change",
          description: "src/index.css was edited since, so Parity left it alone."
        },
        why: "Says what the change was, and that nothing was lost."
      },
      {
        when: "Undo, when the project can't reload after",
        before: {
          kind: "error",
          title: "Put back src/index.css, but couldn't reload the project",
          description: "The builder stopped responding"
        },
        after: {
          kind: "error",
          title: "Couldn't reload the project",
          description: "The change was undone, but the project didn't reload.",
          action: "Reload"
        },
        why: "The title was longer than the message, and the description says the undo itself worked."
      }
    ]
  },
  {
    name: "Code, Storybook and processes",
    entries: [
      {
        when: "Opening a layer's code in an editor that isn't installed",
        before: {
          kind: "error",
          title: "Couldn't open the code",
          description:
            "Couldn't find VS Code's `code` command. Install it on your PATH from VS Code, or choose another editor in Settings."
        },
        after: {
          kind: "error",
          title: "Couldn't open the code editor",
          description: "VS Code's code command isn't on your PATH.",
          action: "Change editor"
        },
        why: "The description was three ideas. Choosing another editor is the button."
      },
      {
        when: "Opening a component in Storybook",
        before: {
          kind: "loading",
          title: "Opening Storybook…",
          description: "If it isn't running yet, it starts first; that can take a minute."
        },
        after: { kind: "loading", title: "Opening Storybook…", description: "Starting it can take a minute." },
        why: "Shorter, same expectation."
      },
      {
        when: "Storybook opened",
        before: {
          kind: "success",
          title: "Opened in your browser",
          description: "http://localhost:6006/?path=/story/plan-card"
        },
        after: null,
        why: "The browser coming forward says it. Close the loading toast instead."
      },
      {
        when: "Storybook can't open",
        before: { kind: "error", title: "Couldn't open Storybook", description: "Storybook exited with code 1" },
        after: {
          kind: "error",
          title: "Couldn't open Storybook",
          description: "It stopped while starting.",
          action: "Details"
        },
        why: "Details opens its output in the Console panel."
      },
      {
        when: "Stopping a process fails",
        before: { kind: "error", title: "Couldn't stop Vite", description: "kill EPERM" },
        after: { kind: "error", title: "Couldn't stop a process", description: "Parity isn't allowed to stop Vite." },
        why: "Plain reason."
      },
      {
        when: "Restarting a server fails",
        before: { kind: "error", title: "Couldn't start Vite again", description: "Port 5173 is in use" },
        after: {
          kind: "error",
          title: "Couldn't restart a server",
          description: "Vite needs port 5173, and another app is using it."
        },
        why: "Restart is the word on its button."
      },
      {
        when: "Running a task again fails",
        before: { kind: "error", title: "Couldn't run lint again", description: "spawn pnpm ENOENT" },
        after: {
          kind: "error",
          title: "Couldn't run a task again",
          description: "lint needs pnpm, which isn't installed or isn't on your PATH."
        },
        why: "Plain reason."
      }
    ]
  },
  {
    name: "Account",
    entries: [
      {
        when: "Signing in on Linux without a keyring",
        before: {
          kind: "plain",
          title: "You're signed in until you quit Parity",
          description: "This system has no keyring to keep you signed in.",
          action: "What to do"
        },
        after: {
          kind: "info",
          title: "Signed in until you quit",
          description: "This system has no keyring to keep you signed in.",
          action: "Details"
        },
        why: "A shorter title. Details opens how to add a keyring."
      },
      {
        when: "Sign in can't start",
        before: { kind: "error", title: "Parity couldn't start signing you in", description: "Try again in a moment." },
        after: {
          kind: "error",
          title: "Couldn't start signing in",
          description: "You're still signed out of Parity.",
          action: "Try again"
        },
        why: "Every failure starts with Couldn't; the button replaces “Try again in a moment”."
      },
      {
        when: "Reopening the browser to sign in fails",
        before: { kind: "error", title: "Parity couldn't open your browser", description: "Try again in a moment." },
        after: {
          kind: "error",
          title: "Couldn't open your browser",
          description: "Sign-in is still waiting for you there.",
          action: "Try again"
        },
        why: "Says where things stand, and the button replaces the sentence."
      },
      {
        when: "Switching organizations fails",
        before: { kind: "error", title: "Parity couldn't switch organizations", description: "Try again in a moment." },
        after: {
          kind: "error",
          title: "Couldn't switch organizations",
          description: "Nothing changed; you're still in Acme.",
          action: "Try again"
        },
        why: "Says where things stand, and the button replaces the sentence."
      },
      {
        when: "Adding an account",
        before: { kind: "plain", title: "Added ana@acme.com" },
        after: { kind: "success", title: "Added an account", description: "You're signed in as ana@acme.com." },
        why: "An email can be any length, so it moves to the description."
      },
      {
        when: "Signing in again to an account that was signed out",
        before: { kind: "plain", title: "Signed in again as ana@acme.com" },
        after: { kind: "success", title: "Signed in again", description: "You're signed in as ana@acme.com." },
        why: "An email can be any length, so it moves to the description."
      },
      {
        when: "Adding an account that's already signed in",
        before: { kind: "plain", title: "ana@acme.com is already signed in" },
        after: { kind: "info", title: "Nothing to add", description: "ana@acme.com is already signed in." },
        why: "Says nothing happened, and why."
      },
      {
        when: "Removing an account",
        before: { kind: "plain", title: "Removed ana@acme.com" },
        after: { kind: "success", title: "Removed an account", description: "Parity forgot ana@acme.com." },
        why: "An email can be any length, so it moves to the description."
      },
      {
        when: "Signing out of the account you're in, with another signed in",
        before: { kind: "plain", title: "Signed out of ana@acme.com" },
        after: {
          kind: "success",
          title: "Signed out of an account",
          description: "You're in Acme as ben@acme.com now."
        },
        why: "Says which account you're in now, which is what changed."
      },
      {
        when: "Signing out of an account fails",
        before: { kind: "error", title: "Parity couldn't sign you out", description: "Try again in a moment." },
        after: {
          kind: "error",
          title: "Couldn't sign out",
          description: "ana@acme.com is still signed in.",
          action: "Try again"
        },
        why: "Says where things stand, and the button replaces the sentence."
      },
      {
        when: "Switching accounts",
        before: { kind: "plain", title: "Switched to ben@acme.com", description: "You're in Acme now." },
        after: { kind: "success", title: "Switched accounts", description: "You're in Acme as ben@acme.com now." },
        why: "An email can be any length, so it moves to the description."
      },
      {
        when: "Switching accounts fails",
        before: { kind: "error", title: "Parity couldn't switch accounts", description: "Try again in a moment." },
        after: {
          kind: "error",
          title: "Couldn't switch accounts",
          description: "You're still in Acme as ana@acme.com.",
          action: "Try again"
        },
        why: "Says where things stand, and the button replaces the sentence."
      },
      {
        when: "Signing out",
        before: { kind: "plain", title: "You're signed out", description: "Projects on this computer stay open." },
        after: { kind: "success", title: "You're signed out", description: "Projects on this computer stay open." },
        why: "Clear already; it answers the worry about open work."
      },
      {
        when: "Signing in on another device, copying the link or details",
        before: { kind: "success", title: "Copied the link" },
        after: { kind: "success", title: "Copied the link" },
        why: "Clear already."
      },
      {
        when: "Copying fails",
        before: { kind: "error", title: "Parity couldn't copy that" },
        after: { kind: "error", title: "Couldn't copy the link", action: "Try again" },
        why: "Says what failed. Parity can't tell why, so it doesn't guess."
      },
      {
        when: "About, copying the version details",
        before: { kind: "success", title: "Copied the version details" },
        after: { kind: "success", title: "Copied the version details" },
        why: "Clear already."
      }
    ]
  },
  {
    name: "Updates",
    entries: [
      {
        when: "Help > Check for updates, while it checks",
        before: { kind: "loading", title: "Checking for updates…", description: "Looking for stable releases." },
        after: { kind: "loading", title: "Checking for updates…" },
        why: "The description repeated the title."
      },
      {
        when: "Check for updates, nothing newer",
        before: { kind: "success", title: "No update available", description: "No newer stable release is available." },
        after: { kind: "success", title: "Parity is up to date", description: "You have the latest stable release." },
        why: "The description repeated the title; now it says which channel."
      },
      {
        when: "Check for updates fails",
        before: {
          kind: "error",
          title: "Couldn't check for updates",
          description: "Try again in a moment.",
          action: "Try again"
        },
        after: {
          kind: "error",
          title: "Couldn't check for updates",
          description: "Parity couldn't reach the update server.",
          action: "Try again"
        },
        why: "The description repeated the button; now it gives the reason."
      },
      {
        when: "Check for updates, downloading",
        before: {
          kind: "loading",
          title: "Updating Parity",
          description: "Downloading version 0.4.0\n54.2 MB of 129 MB"
        },
        after: { kind: "loading", title: "Downloading Parity 0.4.0", description: "54.2 MB of 129 MB downloaded" },
        why: "The title says what's happening, so the description is just progress."
      },
      {
        when: "An update finished downloading",
        before: {
          kind: "success",
          title: "Update ready",
          description: "Restart to install version 0.4.0.",
          action: "Restart to update"
        },
        after: {
          kind: "success",
          title: "Update ready",
          description: "Restart to install Parity 0.4.0.",
          action: "Restart"
        },
        why: "The button was long and repeated the description."
      },
      {
        when: "An update is available on a Mac that can't install it in place",
        before: {
          kind: "info",
          title: "Update available",
          description: "Version 0.4.0 is ready to download.",
          action: "Download update"
        },
        after: {
          kind: "info",
          title: "Update available",
          description: "Parity 0.4.0 is ready to download.",
          action: "Download"
        },
        why: "A shorter button."
      }
    ]
  },
  {
    name: "Extensions and the CLI",
    entries: [
      {
        when: "Help > Install the Parity CLI, when its folder isn't on PATH",
        before: {
          kind: "success",
          title: "Installed the Parity CLI",
          description: "Add C:/Users/sam/AppData/Local/Parity/bin to your PATH to run it."
        },
        after: {
          kind: "success",
          title: "Installed the Parity CLI",
          description: "Add C:/Users/sam/AppData/Local/Parity/bin to your PATH to run it."
        },
        why: "Clear already: the one thing left to do."
      },
      {
        when: "Help > Install the Parity CLI, when terminals open before need restarting",
        before: { kind: "success", title: "Installed the Parity CLI", description: "Open a new terminal to run it." },
        after: { kind: "success", title: "Installed the Parity CLI", description: "Open a new terminal to run it." },
        why: "Clear already."
      },
      {
        when: "Help > Install the Parity CLI, ready to run",
        before: { kind: "success", title: "Installed the Parity CLI" },
        after: { kind: "success", title: "Installed the Parity CLI" },
        why: "Clear already."
      },
      {
        when: "Help > Install the Parity CLI fails",
        before: {
          kind: "error",
          title: "Couldn't install the Parity CLI",
          description: "EACCES: permission denied, mkdir 'C:/Program Files/Parity/bin'"
        },
        after: {
          kind: "error",
          title: "Couldn't install the Parity CLI",
          description: "Parity doesn't have permission."
        },
        why: "The reason in plain words."
      },
      {
        when: "An extension's command fails",
        before: {
          kind: "error",
          title: "Open in Storybook didn't work",
          description: "Storybook isn't running in this project"
        },
        after: {
          kind: "error",
          title: "Couldn't run the command",
          description: "Storybook isn't running in this project."
        },
        why: "Failures start with Couldn't, and the command's name, which the extension picks, stays out of the title."
      },
      {
        when: "An extension's command fails because the extension stopped",
        before: {
          kind: "error",
          title: "Open in Storybook didn't work",
          description: "Storybook couldn't start: It crashed 3 times in a row.",
          action: "Restart"
        },
        after: {
          kind: "error",
          title: "Couldn't run the command",
          description: "Storybook couldn't start: It crashed 3 times in a row.",
          action: "Restart"
        },
        why: "Same as above."
      },
      {
        when: "An extension crashes",
        before: {
          kind: "warning",
          title: "Storybook stopped",
          description: "It crashed 3 times in a row.",
          action: "Restart"
        },
        after: {
          kind: "warning",
          title: "An extension stopped",
          description: "Storybook: It crashed 3 times in a row.",
          action: "Restart"
        },
        why: "The extension's name goes in the description, with the reason."
      },
      {
        when: "An extension stops answering",
        before: {
          kind: "warning",
          title: "Storybook isn't answering",
          description: "Not answering after 10 seconds",
          action: "Restart"
        },
        after: {
          kind: "warning",
          title: "An extension isn't answering",
          description: "Storybook: Not answering after 10 seconds.",
          action: "Restart"
        },
        why: "Same as above."
      },
      {
        when: "Restarting an extension fails",
        before: { kind: "error", title: "Couldn't restart the extension" },
        after: {
          kind: "error",
          title: "Couldn't restart the extension",
          description: "The project service isn't running."
        },
        why: "Adds the reason."
      }
    ]
  }
]

const icons = {
  success: <CircleCheckIcon aria-hidden="true" />,
  info: <InfoIcon aria-hidden="true" />,
  warning: <TriangleAlertIcon aria-hidden="true" />,
  error: <OctagonXIcon className="text-destructive" aria-hidden="true" />,
  loading: <Loader2Icon className="animate-spin" aria-hidden="true" />,
  plain: null
}

/** The kit's toast list, drawn in place rather than in the window's corner. */
/** Proposed: success and warning icons colored like error's, each readable on both themes. */
const tints: Partial<Record<Kind, string>> = {
  success: "light-dark(oklch(0.55 0.14 150), oklch(0.76 0.15 150))",
  warning: "light-dark(oklch(0.62 0.15 70), oklch(0.8 0.15 80))"
}

function Shown({ tinted }: { tinted: boolean }) {
  const { toasts } = useToastManager()

  return toasts.map((shown) => {
    // SAFETY: Specimen only adds toasts whose type is a Kind, or none for a plain one.
    const kind = (shown.type ?? "plain") as Kind

    return (
      <Toast key={shown.id} toast={shown} className="relative bottom-auto h-auto [transform:none]">
        <ToastContent>
          {icons[kind] && (
            <span
              className="shrink-0 [&_svg:not([class*='size-'])]:size-4"
              style={tinted ? { color: tints[kind] } : undefined}
            >
              {icons[kind]}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <ToastTitle />
            <ToastDescription className="whitespace-pre-line" />
          </div>
          <ToastAction />
          <ToastClose />
        </ToastContent>
      </Toast>
    )
  })
}

/** One toast exactly as the kit draws it, held open. */
function Specimen({ shown, tinted = false }: { shown: Shown; tinted?: boolean }) {
  const [manager] = useState(() => createToastManager())

  useEffect(() => {
    const options: Parameters<typeof manager.add>[0] = {
      type: shown.kind === "plain" ? undefined : shown.kind,
      title: shown.title,
      description: shown.description,
      timeout: 0
    }

    if (shown.action) {
      options.actionProps = { children: shown.action }
    }

    const id = manager.add(options)

    return () => manager.close(id)
  }, [manager, shown])

  return (
    <ToastProvider toastManager={manager}>
      <ToastViewport className="static mx-0 w-full max-w-sm">
        <Shown tinted={tinted} />
      </ToastViewport>
    </ToastProvider>
  )
}

/** Number, before, after. */
const columns = { gridTemplateColumns: "3rem minmax(0, 1fr) minmax(0, 1fr)" }

/** Each entry with its number, counted through every group. */
const numbered = groups.map((group, index) => {
  const before = groups.slice(0, index).reduce((sum, earlier) => sum + earlier.entries.length, 0)

  return { ...group, entries: group.entries.map((entry, at) => ({ ...entry, number: before + at + 1 })) }
})

function Audit() {
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0)
  const changed = groups.reduce((sum, group) => sum + group.entries.filter((entry) => !same(entry)).length, 0)

  return (
    <div className="bg-background p-8 text-foreground" style={{ height: "100vh", overflowY: "auto" }}>
      <h1 className="text-lg font-semibold">Toast audit</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        {total} toasts, {changed} changed. A title says what happened in two to five words and is always shorter than
        the description. A description is at most one sentence: why something failed, or the one consequence that
        changes what you do, and it’s left out when it adds nothing. A button is a verb of one or two words. Failures
        start with “Couldn’t”, system errors are put in plain words, and internal names go. Names from the person’s
        project, which can be any length, stay out of titles and go in the description. After also colors success and
        warning icons, as error’s already are.
      </p>
      {numbered.map((group) => (
        <section key={group.name} style={{ marginTop: "2.5rem" }}>
          <h2 className="border-b pb-2 text-sm font-semibold">{group.name}</h2>
          <div className="grid gap-x-6 text-xs font-medium text-muted-foreground" style={columns}>
            <span />
            <span className="pt-3">Before</span>
            <span className="pt-3">After</span>
          </div>
          {group.entries.map(({ number, ...entry }) => {
            return (
              <article key={number} className="grid items-start gap-x-6 border-b py-5" style={columns}>
                <span className="text-2xl font-semibold text-muted-foreground tabular-nums">{number}</span>
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-medium">{entry.when}</p>
                  <Specimen shown={entry.before} />
                </div>
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    {same(entry) ? "No change. " : ""}
                    {entry.why}
                  </p>
                  {entry.after ? (
                    <Specimen shown={entry.after} tinted />
                  ) : (
                    <p className="max-w-sm rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                      No toast
                    </p>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      ))}
    </div>
  )
}

function same({ before, after }: Entry): boolean {
  return JSON.stringify(before) === JSON.stringify(after)
}

const meta = {
  title: "Parity/Chrome/Toast audit",
  component: Audit,
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof Audit>

export default meta

type Story = StoryObj<typeof meta>

/** Every toast in the app, numbered, as it reads now and as proposed. */
export const EveryToast: Story = {}
