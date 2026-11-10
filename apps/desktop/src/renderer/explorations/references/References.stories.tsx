import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { panelLimits, setLayout } from "../../chrome/layout.ts"
import { openProjects } from "../../stories/fixtures.tsx"
import { Explainer, type Placed, ReferencesWorkspace, type Start } from "./workspace.tsx"

/**
 * Design references from Mobbin (docs/proposals/references.md). A References tab after Images searches real apps'
 * screens, flows and sections in plain words. A result placed on the canvas sits beside your designs to look at, labeled
 * with its app and source, and never goes into a design, the project's files or its code.
 *
 * Every story is the same window, started in a different place, and all of it works: search, switch between Screens,
 * Flows and Sections and between Web and iOS, click a result to place it, or drag one onto the canvas. On the canvas,
 * drag a reference to move it, press Delete to remove the selected one, and double-click one to open it in Mobbin.
 * The apps and their screens are made up, drawn in plain blocks where the tab would show Mobbin's screenshots.
 */
const meta = {
  title: "Parity/Explorations/References",
  parameters: { layout: "fullscreen" },
  loaders: [
    async () => {
      await openProjects("example")
      setLayout({ leftTab: "references" })
    }
  ]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function workspace(start: Start = {}) {
  return () => <ReferencesWorkspace start={start} />
}

// Connecting

/**
 * Before connecting: what the tab does, that references stay out of designs and code, and which Mobbin plans it needs.
 * Connect Mobbin opens Mobbin's sign-in in the browser, and the tab waits for it.
 */
export const NotConnected: Story = {
  render: workspace({ state: { account: "disconnected" } })
}

/** Waiting for the browser, with Cancel. Once the person allows Parity there, the tab shows results. */
export const Connecting: Story = {
  render: workspace({ state: { account: "connecting" } })
}

/** Connect Mobbin, then the wait for the browser, then results once the person allows Parity there. */
export const ConnectMobbin: Story = {
  render: workspace({ state: { account: "disconnected" } }),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement)
    await userEvent.click(body.getByRole("button", { name: "Connect Mobbin" }))
    await expect(await body.findByText("Finish connecting in your browser")).toBeVisible()
    await expect(await body.findByRole("list", { name: "Results" }, { timeout: 3000 })).toBeVisible()
  }
}

/**
 * Connected, on a Mobbin plan without search from other apps: the free plan. The tab says which plans have it and
 * links to Mobbin's plans.
 */
export const PlanWithoutAccess: Story = {
  render: workspace({ state: { account: "no-plan" } })
}

// Searching

/**
 * Web screens for "pricing", one to a row so each is big enough to read. Hover one for Place on canvas and Open in
 * Mobbin; a click places it beside Pricing.
 */
export const WebScreens: Story = {
  render: workspace()
}

/** iOS screens, tall, as many to a row as fit. */
export const PhoneScreens: Story = {
  render: workspace({ state: { platform: "ios", query: "pricing" } })
}

/** Flows, each with how many steps it has. A click opens one; its + places every step in a row. */
export const Flows: Story = {
  render: workspace({ state: { kind: "flows", platform: "ios", query: "onboarding" } })
}

/** A flow open in place of the results: its steps in order, each placeable by itself, or Place all. */
export const FlowOpen: Story = {
  render: workspace({
    state: { kind: "flows", platform: "ios", query: "onboarding", flow: "budgetbird-onboarding-flow" }
  })
}

/** Website sections, such as pricing tables and footers. Sections are web only, so iOS is off. */
export const Sections: Story = {
  render: workspace({ state: { kind: "sections", query: "pricing" } })
}

/** Waiting on Mobbin, as a deep search takes a moment. */
export const Searching: Story = {
  render: workspace({ state: { status: "searching" } })
}

/** Nothing matches. */
export const NoResults: Story = {
  render: workspace({ state: { query: "spaceship cockpit" } })
}

/** Mobbin's limit of 60 searches a minute, reached. Agents searching through the same account count too. */
export const LimitReached: Story = {
  render: workspace({ state: { status: "limited" } })
}

/** The tab at the panel's narrowest. */
export const NarrowPanel: Story = {
  render: workspace(),
  loaders: [
    async () => {
      await openProjects("example")
      setLayout({ leftTab: "references", leftWidth: panelLimits.left[0] })
    }
  ]
}

// On the canvas

const placed: Placed[] = [
  { key: "ledgerly", id: "ledgerly-pricing", x: 1400, y: 0, width: 1440 },
  { key: "step-1", id: "lumen-paywall", x: 2960, y: 0, width: 390 },
  { key: "section", id: "northwind-pricing-section", x: 1400, y: 1060, width: 1440 }
]

/**
 * References beside Pricing: a web screen, a phone paywall and a pricing section. Each has its picture at its own
 * size and its app and source under it, with no board, states or modes. Drag one to move it, Delete removes the
 * selected one, and a double-click opens it in Mobbin.
 */
export const OnTheCanvas: Story = {
  render: workspace({
    placed,
    selected: "ledgerly",
    zoom: 0.25,
    pan: { x: 48, y: 96 },
    overlay: (
      <div className="rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Explainer title="For looking at, not building with" width={280}>
          References aren&apos;t designs: they never go into one, into the project&apos;s files or into code, and
          exports leave them out.
        </Explainer>
      </div>
    )
  })
}

/** A click on a result places it to the right of what's on the canvas, selected, and says it stays out of designs. */
export const PlaceAReference: Story = {
  render: workspace({ zoom: 0.25, pan: { x: 48, y: 96 } }),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement)
    await userEvent.click(body.getByRole("button", { name: "Place Ledgerly on canvas" }))
    const canvas = body.getByRole("application", { name: "Canvas" })
    await expect(await within(canvas).findByRole("img", { name: "Reference: Ledgerly, from Mobbin" })).toBeVisible()
  }
}
