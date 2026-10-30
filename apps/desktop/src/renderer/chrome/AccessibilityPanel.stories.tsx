import type { AccessibilityFinding } from "@parity-app/agent"
import { mapNode } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { design, example, node } from "../stories/fixtures.tsx"
import { answerNext, service } from "../stories/host.ts"
import { AccessibilityPanel } from "./AccessibilityPanel.tsx"
import { checkAgain, inspecting, InspectorStage, slowly } from "./inspector-stories.tsx"
import { Inspector } from "./Inspector.tsx"

/**
 * The inspector's Accessibility tab: the selected design checked with axe-core in every state and the modes it shows,
 * its problems grouped by rule, worst first, each listing the layers that break it and the frames they break it in.
 *
 * Checks are kept per design while Storybook runs, so each story with a check checks again for itself.
 */
const meta = {
  title: "Parity/Inspector/Accessibility",
  component: AccessibilityPanel,
  render: () => <Inspector />,
  decorators: [
    (Story) => (
      <InspectorStage>
        <Story />
      </InspectorStage>
    )
  ]
} satisfies Meta<typeof AccessibilityPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Opens the example on the Accessibility tab with a design selected, after `change` edits it when given. */
const checking = (designName: string, change?: (key: string) => void) =>
  inspecting("accessibility", () => {
    const key = design(designName)
    change?.(key)
    return { design: key }
  })

/** Nothing selected: it asks for a design, and says what a check covers. */
export const NothingSelected: Story = { loaders: [inspecting("accessibility")] }

/** A check running, with the service taking its time: the refresh button spins and the panel says what it's checking. */
export const Checking: Story = {
  loaders: [
    async () => {
      await checking("Projects")()
      // The check that starts when the tab opens takes ten minutes to answer.
      service.latency = 10 * 60 * 1000
    }
  ],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    // Checked already while Storybook runs: checks again, as slowly.
    const again = panel.queryByRole("button", { name: "Check again" })
    if (again) await userEvent.click(again)
    await panel.findByText("Checking every state and mode", undefined, slowly)
    // Only this check is slow; later requests answer as usual.
    service.latency = 150
  }
}

/**
 * What a check of Pricing found: a summary by impact, then each rule in plain words with why it matters, its layers
 * (contrast failures with a sample of the colors), the frames each fails in, and a link on how to fix it.
 */
export const Findings: Story = {
  loaders: [checking("Pricing")],
  play: ({ canvasElement }) => checkAgain(canvasElement, "Button has no name")
}

/** A design with no problems found, Order line: a check mark and how many frames were checked. */
export const NoIssues: Story = {
  loaders: [checking("Order line")],
  play: ({ canvasElement }) => checkAgain(canvasElement, "No issues found")
}

/** A check that couldn't run: the service's reason, in red, and the refresh button to try again. */
export const CheckFailed: Story = {
  loaders: [checking("Settings")],
  play: ({ canvasElement }) =>
    checkAgain(canvasElement, /Couldn.t check Settings/, () =>
      answerNext("accessibility.check", () =>
        Promise.reject(
          new Error(
            "Settings didn't render in Mobile Light within 30 seconds: the project's dev server stopped answering."
          )
        )
      )
    )
}

/** A check that finished with warnings about frames it couldn't render, listed after the findings. */
export const CheckWithWarnings: Story = {
  loaders: [checking("Sign in")],
  play: ({ canvasElement }) =>
    checkAgain(canvasElement, /couldn.t be rendered/, () =>
      answerNext("accessibility.check", async (_, real) => ({
        ...(await real()),
        warnings: [
          "Wrong password in Mobile Light couldn't be rendered: the frame timed out.",
          "Wrong password in Desktop Dark couldn't be rendered: the frame timed out."
        ]
      }))
    )
}

/**
 * Many problems of every impact on Dashboard: critical, serious, moderate and minor counted at the top, rules with
 * several layers, alike layers merged into one row, and a problem with the whole design rather than a layer.
 */
export const ManyFindings: Story = {
  loaders: [checking("Dashboard")],
  play: ({ canvasElement }) =>
    checkAgain(canvasElement, "Target is too small", () =>
      answerNext("accessibility.check", async (_, real) => {
        const result = (await real()) as { findings: AccessibilityFinding[]; frames: number; warnings: string[] }
        return { ...result, findings: [...result.findings, ...moreFindings()], frames: 9 }
      })
    )
}

/** A rule folded away by clicking its title: it keeps its title and says how many layers break it. */
export const RuleCollapsed: Story = {
  loaders: [checking("Pricing")],
  play: async ({ canvasElement }) => {
    await checkAgain(canvasElement, "Text contrast is too low")
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Text contrast is too low/ }))
  }
}

/** The design changed after its check, here its headline's text: a note says so, with a button to check again. */
export const OutOfDate: Story = {
  loaders: [checking("Sign in")],
  play: async ({ canvasElement }) => {
    await checkAgain(canvasElement, "Button has no name")
    const key = design("Sign in")
    const terms = node("Sign in", "Terms")
    example().store.updateContainer(key, "Edit text", (container) => ({
      ...container,
      root: mapNode(container.root, terms, (current) =>
        current.type === "text" ? { ...current, text: "By continuing you agree to our terms." } : current
      )
    }))
    await within(canvasElement).findByText("The design changed since this check.", undefined, slowly)
  }
}

/** A design with a very long name, in the panel's header beside the refresh button. */
export const LongDesignName: Story = {
  loaders: [
    checking("Order line", (key) =>
      example().store.updateContainer(key, "Rename design", (container) => ({
        ...container,
        name: "Order line with the discount code applied and the tax shown separately"
      }))
    )
  ],
  play: ({ canvasElement }) => checkAgain(canvasElement, "No issues found")
}

/** Findings for Dashboard's layers beyond the stand-in service's two rules, shaped like axe-core's. */
function moreFindings(): AccessibilityFinding[] {
  const finding = (
    rule: string,
    impact: AccessibilityFinding["impact"],
    help: string,
    layerName: string | undefined,
    detail: string,
    frames: [string, string][]
  ): AccessibilityFinding[] =>
    frames.map(([state, mode]) => ({
      state,
      mode,
      rule,
      impact,
      help,
      helpUrl: `https://dequeuniversity.com/rules/axe/4.10/${rule}`,
      ...(layerName ? { node: node("Dashboard", layerName), name: layerName } : {}),
      detail
    }))
  const everywhere: [string, string][] = ["default", "loading", "empty-workspace"].flatMap((state) =>
    ["desktop-light", "desktop-dark", "mobile-light"].map((mode): [string, string] => [state, mode])
  )
  return [
    ...finding(
      "target-size",
      "serious",
      "All touch targets must be 24px large, or leave sufficient space",
      "Greeting",
      "Target has insufficient size (16px by 16px, should be at least 24px by 24px)",
      [["default", "mobile-light"]]
    ),
    ...finding(
      "heading-order",
      "moderate",
      "Heading levels should only increase by one",
      "Subtitle",
      "Heading order invalid: an `h4` follows an `h1`",
      everywhere
    ),
    ...finding(
      "region",
      "moderate",
      "All page content should be contained by landmarks",
      undefined,
      "Some page content is not contained by landmarks such as `main` or `nav`",
      everywhere
    ),
    ...finding(
      "landmark-unique",
      "minor",
      "Landmarks should have a unique role or role/label/title combination",
      "Header",
      "The landmark must have a unique `aria-label`, `aria-labelledby`, or `title` to make landmarks distinguishable",
      [
        ["default", "desktop-light"],
        ["loading", "desktop-light"]
      ]
    )
  ]
}
