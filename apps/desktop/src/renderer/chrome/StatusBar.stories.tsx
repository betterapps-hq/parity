import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import {
  clearNotifications,
  frameDesigns,
  holdToast,
  keepingLinks,
  never,
  openAlso,
  openProjects,
  preferring,
  projectAt
} from "../stories/fixtures.tsx"
import { answering, service } from "../stories/host.ts"
import { workspace } from "../workspace.ts"
import { AtBottom, olderProjectAt, renameDesign, Window } from "./chrome-fixtures.tsx"
import { save } from "./commands.ts"
import { setLayout } from "./layout.ts"
import { StatusBar } from "./StatusBar.tsx"

/**
 * The strip along the bottom of a project: how the project was understood (its renderer, builder, components, tokens
 * and Storybook), and a save that failed. Shown on its own at the bottom of the window, except where a story needs
 * what it opens.
 */
const meta = {
  title: "Parity/Chrome/Status bar",
  component: StatusBar,
  decorators: [AtBottom],
  loaders: [clearNotifications]
} satisfies Meta<typeof StatusBar>

export default meta
type Story = StoryObj<typeof meta>

const body = () => within(document.body)
const statusBar = () => within(document.querySelector("footer")!)

/** The whole window, for stories that show what the status bar opens. */
const whole = { render: () => <AppWindow />, decorators: [Window] } satisfies Partial<Story>

/**
 * The example as it opens: React, Vite and its version, the components and tokens found, and Storybook. Unsaved
 * changes don't show here; the project's tab shows them.
 */
export const ExampleProject: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ performanceStats: false })
    }
  ]
}

/** Saving when the project's file can't be written: the status bar says so in red, and a notification says why. */
export const SaveFailed: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ performanceStats: false })
      renameDesign("Pricing", "Pricing (annual)")
      service.saveFails = true
    }
  ],
  play: async () => {
    void save()
    await expect(await body().findByRole("button", { name: /Couldn't save/ })).toBeVisible()
    await holdToast("Couldn't save")
  }
}

/** Clicking a failed save once the file can be written again: it saves, the warning goes, and a notification says so. */
export const RetryingAFailedSave: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ performanceStats: false })
      renameDesign("Pricing", "Pricing (annual)")
      service.saveFails = true
      await save()
      service.saveFails = false
    }
  ],
  play: async () => {
    await userEvent.click(await body().findByRole("button", { name: /Couldn't save/ }))
    await holdToast("Saved")
    await waitFor(() => expect(body().queryByRole("button", { name: /Couldn't save/ })).toBeNull())
  }
}

/**
 * Saving automatically after an edit, when the file can't be written: the warning, and a notification that says why
 * with a button to try again. Later saves that fail stay quiet until one succeeds.
 */
export const AutosaveFailed: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ autosave: true, performanceStats: false })
      service.saveFails = true
      renameDesign("Pricing", "Pricing (annual)")
    }
  ],
  play: async () => {
    await expect(await body().findByText("Couldn't save", {}, { timeout: 3000 })).toBeVisible()
    await holdToast(/Couldn't save/)
  }
}

/**
 * A project on React 18 and Vite 5, which Parity doesn't test: it opens as usual, with no warning. Only the renderer's
 * and builder's tooltips note that the versions are untested.
 */
export const OlderProject: Story = {
  loaders: [
    async () => {
      await openProjects()
      preferring({ performanceStats: false })
      await openAlso(olderProjectAt("D:/projects/legacy-admin"))
      workspace.activate("D:/projects/legacy-admin")
    }
  ],
  play: async () => {
    await expect(await statusBar().findByTitle(/React 18\.3\.1 from node_modules\/react; untested/)).toBeVisible()
    await expect(statusBar().getByTitle(/Vite 5\.4\.11 from node_modules\/vite; untested/)).toBeVisible()
  }
}

/** A small project without Storybook: one component, and no Storybook item. */
export const SmallProjectWithoutStorybook: Story = {
  loaders: [
    async () => {
      await openProjects()
      preferring({ performanceStats: false })
      await openAlso({ ...projectAt("D:/projects/landing-page"), componentCount: 1, storybook: undefined })
      workspace.activate("D:/projects/landing-page")
    }
  ]
}

/** Performance stats turned on from the View menu: frame rate, memory and CPU, measured each second. */
export const PerformanceStats: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ performanceStats: true })
    }
  ],
  play: async () => {
    await expect(await body().findByText("CPU", { exact: false }, { timeout: 4000 })).toBeVisible()
  }
}

/** Clicking the performance stats: the last minute's frame rate, and each process's CPU and memory. */
export const PerformanceStatsOpen: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ performanceStats: true })
    }
  ],
  play: async () => {
    await new Promise((resolve) => setTimeout(resolve, 3500))
    await userEvent.click(await body().findByRole("button", { name: /fps/ }))
    await expect(await body().findByText("All of Parity")).toBeInTheDocument()
  }
}

/** Clicking the components count: the left panel switches to Components. */
export const ShowsComponents: Story = {
  ...whole,
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ performanceStats: false })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    await userEvent.click(statusBar().getByRole("button", { name: /components$/ }))
    await expect(await body().findByRole("tab", { name: /Components/, selected: true })).toBeVisible()
  }
}

/** Clicking the tokens count with the left panel closed: the panel opens on Tokens. */
export const ShowsTokens: Story = {
  ...whole,
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ performanceStats: false })
      setLayout({ left: false })
    }
  ],
  play: async () => {
    await frameDesigns("Pricing", "Dashboard")
    await userEvent.click(statusBar().getByRole("button", { name: /tokens$/ }))
    await expect(await body().findByRole("tab", { name: /Tokens/, selected: true })).toBeVisible()
  }
}

/** Clicking Storybook while the project's Storybook starts: a notification says it can take a minute. */
export const OpeningStorybook: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ performanceStats: false })
      answering({ "storybook.open": () => never() })
    }
  ],
  play: async () => {
    await userEvent.click(await body().findByRole("button", { name: "Storybook" }))
    await holdToast("Opening Storybook…")
  }
}

/** Clicking Storybook once it's running: it opens in the browser, and a notification gives its address. */
export const OpenedStorybook: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ performanceStats: false })
      keepingLinks()
    }
  ],
  play: async () => {
    await userEvent.click(await body().findByRole("button", { name: "Storybook" }))
    await holdToast("Opened in your browser")
  }
}

/** Clicking Storybook when it won't start: a notification with the reason. */
export const StorybookFailed: Story = {
  loaders: [
    async () => {
      await openProjects("example")
      preferring({ performanceStats: false })
      answering({
        "storybook.open": () => {
          throw new Error("storybook dev exited with code 1: Port 6006 is in use by another program")
        }
      })
    }
  ],
  play: async () => {
    await userEvent.click(await body().findByRole("button", { name: "Storybook" }))
    await holdToast("Couldn't open Storybook")
  }
}

/**
 * A project with three designs and a design file that couldn't be read: the status bar doesn't mention it; only the
 * Layers panel does, after every design.
 */
export const UnreadableDesignFile: Story = {
  ...whole,
  loaders: [
    async () => {
      await openProjects()
      preferring({ performanceStats: false })
      const info = projectAt("D:/projects/marketing-site")
      const main = info.documents.find((entry) => entry.path === info.mainDocument)!.document!
      const kept = ["Pricing", "Plan card", "Sign in"]
      await openAlso({
        ...info,
        documents: [
          {
            path: info.mainDocument,
            document: { ...main, containers: main.containers.filter((design) => kept.includes(design.name)) }
          },
          { path: "designs/landing.par", error: "Unexpected token '}' in JSON at position 2817 (line 96, column 5)" }
        ]
      })
      workspace.activate("D:/projects/marketing-site")
    }
  ],
  play: async () => {
    await waitFor(() => expect(workspace.getActive()?.session?.errors).toHaveLength(1))
    const editor = await waitFor(
      () => {
        const mounted = workspace.getActive()?.session?.editor
        if (!mounted) throw new Error("The canvas hasn't mounted yet")
        return mounted
      },
      { timeout: 10000 }
    )
    // The boards size themselves as their frames render; then the canvas fits them all in.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    editor.zoomToFit()
  }
}
