import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"
import type { CatalogLibrary } from "../../../shared/protocol.ts"
import { storyCatalog, storyPreview } from "../../stories/libraries.ts"
import { slowly } from "../inspector-stories.tsx"
import { AddLibraryDialog } from "./AddLibraryDialog.tsx"
import { offeredLibraries } from "./offeredLibraries.ts"

/*
 * The component libraries dialog on its own, offering the registry's catalog. Each library shows what Parity's registry
 * file for it holds: its tokens, with their themes, its components by family and its breakpoints.
 */

/** The dialog as the app opens it, with a link to open it again once it's closed. */
function Stage({ catalog = storyCatalog(), library }: { catalog?: CatalogLibrary[]; library?: string }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="p-4">
      <button type="button" className="text-sm underline" onClick={() => setOpen(true)}>
        Open again
      </button>
      <AddLibraryDialog
        open={open}
        onOpenChange={setOpen}
        libraries={offeredLibraries(catalog)}
        loadPreview={(id, settings) => Promise.resolve(storyPreview(id, settings))}
        initialLibrary={library}
        onAdd={(choice) => {
          added(choice)
          setOpen(false)
        }}
        onRemove={(id) => {
          removed(id)
          setOpen(false)
        }}
      />
    </div>
  )
}

const added = fn()

const removed = fn()

const meta = {
  title: "Parity/Chrome/Dialogs/Component libraries",
  component: Stage,
  parameters: { layout: "fullscreen" }
} satisfies Meta<typeof Stage>

export default meta

type Story = StoryObj<typeof meta>

/** As it opens: Shadcn first, its look in its own tokens, then every token by kind, its components and breakpoints. */
export const Shadcn: Story = {}

/** Mantine, with its five breakpoints on a ruler. */
export const Mantine: Story = { args: { library: "mantine" } }

/** Mantine's look and tokens in its dark theme. */
export const MantineDark: Story = {
  args: { library: "mantine" },
  play: async () => {
    const dialog = within(await within(document.body).findByRole("dialog"))
    await userEvent.click(await dialog.findByRole("button", { name: "Dark" }, slowly))
  }
}

/** Chakra UI, whose animations run its own keyframes while hovered. */
export const ChakraUi: Story = { args: { library: "chakra" } }

/** Chakra UI's spacing, every one of its tokens of that kind, from its tab. */
export const ChakraUiSpacing: Story = {
  args: { library: "chakra" },
  play: async () => {
    const dialog = within(await within(document.body).findByRole("dialog"))
    await userEvent.click(await dialog.findByRole("tab", { name: /Spacing/ }, slowly))
    await expect(dialog.getByRole("tab", { name: /Spacing/ })).toHaveAttribute("aria-selected", "true")
  }
}

/** Fluent UI, which has its own icon set, offered alongside, and five themes, picked from a list. */
export const FluentUi: Story = { args: { library: "fluent" } }

/** Material UI, whose font tokens are shorthands, drawn as written. */
export const MaterialUi: Story = { args: { library: "mui" } }

/** Shadcn's second step: its theme, color, base and icons. Its look follows the theme chosen. */
export const ShadcnSettings: Story = {
  play: async () => {
    const dialog = within(await within(document.body).findByRole("dialog"))
    await userEvent.click(dialog.getByRole("button", { name: "Next" }))
    await userEvent.click(dialog.getByRole("combobox", { name: "Theme" }))
    const listbox = await within(document.body).findByRole("listbox", undefined, slowly)
    await userEvent.click(within(listbox).getByRole("option", { name: "Lyra" }))
    await expect(dialog.getByRole("button", { name: "Add Shadcn" })).toBeEnabled()
  }
}

/** A project that has Shadcn: Change opens its settings as they are, and Apply waits for one to change. */
export const ShadcnAdded: Story = {
  args: {
    catalog: storyCatalog({
      added: ["shadcn"],
      shadcn: { base: "base", style: "mira", theme: "stone", icons: "fluent" }
    })
  },
  play: async () => {
    const dialog = within(await within(document.body).findByRole("dialog"))
    await userEvent.click(dialog.getByRole("button", { name: "Change" }))
    await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled()
  }
}

/** Removing a library the project has: Remove asks first, naming the package it uninstalls. */
export const RemovingALibrary: Story = {
  args: { library: "mantine", catalog: storyCatalog({ added: ["mantine"] }) },
  play: async () => {
    const dialog = within(await within(document.body).findByRole("dialog"))
    await userEvent.click(dialog.getByRole("button", { name: "Remove" }))
    await expect(dialog.getByText(/This uninstalls @mantine\/core/)).toBeInTheDocument()
  }
}
