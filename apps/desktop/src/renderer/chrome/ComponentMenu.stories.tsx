import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Component } from "lucide-react"
import type { ReactNode } from "react"
import { expect, fireEvent, fn, userEvent, within } from "storybook/test"
import { kindColors } from "../canvas/kinds.tsx"
import { ComponentMenu } from "./ComponentMenu.tsx"

/**
 * A component's right-click menu in the Components panel (PAR-527): View in Storybook and View code, each greyed with
 * why when it can't act, then what else the row offers. Each story opens it on a row, as a right-click does.
 */
const meta = {
  title: "Parity/Left panel/Component menu",
  component: ComponentMenu,
  args: {
    storybook: { stories: true, running: true, open: fn() },
    code: { file: true, open: fn() }
  },
  render: (args) => <Opened name="Button">{<ComponentMenu {...args} />}</Opened>,
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByRole("button")
    const box = row.getBoundingClientRect()
    // Where a pointer would be, so the menu opens beside the row.
    await fireEvent.contextMenu(row, { clientX: box.left + 48, clientY: box.top + box.height / 2 })
    await within(document.body).findByRole("menu")
  }
} satisfies Meta<typeof ComponentMenu>

export default meta

type Story = StoryObj<typeof meta>

/** A row of the panel with its menu, which the story's play opens. */
function Opened({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <button
              type="button"
              className="flex h-7 w-60 items-center gap-2 rounded-md pr-8 pl-8 text-left text-sm hover:bg-accent"
            >
              <Component className="size-3.5 shrink-0" style={{ color: kindColors.component }} />
              {name}
            </button>
          }
        />
        <ContextMenuContent className="w-auto min-w-56 whitespace-nowrap">{children}</ContextMenuContent>
      </ContextMenu>
    </div>
  )
}

/** A component with stories, while Storybook runs: both ways to open it. */
export const WithStories: Story = {
  play: async (context) => {
    await meta.play(context)
    const items = await within(document.body).findAllByRole("menuitem")
    await expect(items.map((item) => item.textContent?.trim())).toEqual(["View in Storybook", "View code"])
  }
}

/** Choosing View code, which closes the menu and opens the file in the person's editor. */
export const ChoosingViewCode: Story = {
  play: async (context) => {
    await meta.play(context)
    await userEvent.click(await within(document.body).findByRole("menuitem", { name: "View code" }))
    await expect(context.args.code?.open).toHaveBeenCalledOnce()
    await expect(context.args.storybook?.open).not.toHaveBeenCalled()
  }
}

/** Storybook isn't running yet: View in Storybook still opens it, starting Storybook first, and says so. */
export const StorybookNotRunning: Story = {
  args: { storybook: { stories: true, running: false, open: fn() } },
  play: async (context) => {
    await meta.play(context)
    await within(document.body).findByText("Starts Storybook")
  }
}

/** A component without stories: View in Storybook is greyed, saying why, rather than left out. */
export const WithoutStories: Story = {
  args: { storybook: { stories: false, running: true, open: fn() } },
  play: async (context) => {
    await meta.play(context)
    const item = await within(document.body).findByRole("menuitem", { name: /View in Storybook/ })
    await expect(item).toHaveAttribute("aria-disabled", "true")
    await expect(item).toHaveTextContent("No stories")
  }
}

/** A library component without type declarations: there's no code of it in the project, so View code is greyed. */
export const NoCodeInTheProject: Story = {
  args: { storybook: undefined, code: { file: false, open: fn() } },
  play: async (context) => {
    await meta.play(context)
    const item = await within(document.body).findByRole("menuitem", { name: /View code/ })
    await expect(item).toHaveAttribute("aria-disabled", "true")
    await expect(item).toHaveTextContent("Not in the project")
  }
}

/** A library's component design: its two ways to insert, and no code to open. */
export const LibraryDesign: Story = {
  args: { storybook: undefined, code: undefined },
  render: (args) => (
    <Opened name="Pricing card">
      <ComponentMenu {...args}>
        <ContextMenuItem>Insert linked instance</ContextMenuItem>
        <ContextMenuItem>Insert detached copy</ContextMenuItem>
      </ComponentMenu>
    </Opened>
  )
}
