import type { AccessibilityFinding } from "@parity-app/agent"
import { mapNode } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
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

    if (again) {
      await userEvent.click(again)
    }

    // The first check, or checking again with the last check's findings faded below.
    await panel.findByText(/^Checking (every state and mode|again)$/, undefined, slowly)
    // Only this check is slow; later requests answer as usual.
    service.latency = 150
  }
}

/**
 * Checking again, with the service taking its time: the last check's findings stay, faded, under a note that it's
 * checking, so the panel doesn't empty while it works.
 */
export const CheckingAgain: Story = {
  loaders: [checking("Pricing")],
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)
    const [again] = await panel.findAllByRole("button", { name: "Check again" }, slowly)
    await panel.findAllByText("Text contrast is too low", undefined, slowly)
    service.latency = 10 * 60 * 1000
    await userEvent.click(again!)
    await panel.findByText("Checking again", undefined, slowly)
    await expect(panel.getByText("Text contrast is too low")).toBeVisible()
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
        const result = await real()

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

/**
 * A contrast failure with its fix: the project's token closest to the text's color that passes in every frame, drawn on
 * the same background, with the ratio it reaches. Apply colors the layer's text with it as one undoable step, then
 * checks the design again, since only a check shows the fix worked. The stand-in service finds the same failure again.
 */
export const ContrastFix: Story = {
  loaders: [checking("Pricing")],
  play: async ({ canvasElement }) => {
    await checkAgain(canvasElement, "Text contrast is too low")
    const panel = within(canvasElement)
    const [apply] = panel.getAllByRole("button", { name: "Apply" })
    await userEvent.click(apply!)
    await panel.findByText("Checking again", undefined, slowly)
    const root = example().store.getEntry(design("Pricing"))!.container.root
    await expect(JSON.stringify(root)).toContain('"foreground":"foreground"')
    // Checked after the change, so it's not out of date.
    await waitFor(() => expect(panel.queryByText("Checking again")).toBeNull(), slowly)
    await expect(panel.queryByText("This screen changed after it was checked.")).toBeNull()
  }
}

/** A contrast failure no token fixes, since none of the project's colors pass on its background: it says so. */
export const NoPassingToken: Story = {
  loaders: [checking("Pricing")],
  play: ({ canvasElement }) =>
    checkAgain(canvasElement, /None of the project.s colors pass/, () =>
      answerNext("accessibility.check", async (_, real) => {
        const result = await real()

        return {
          ...result,
          findings: result.findings.map((finding) =>
            finding.contrast
              ? {
                  ...finding,
                  detail: "#a3a3a3 on #737373 is 1.9:1, and 14px text needs 4.5:1.",
                  contrast: {
                    ...finding.contrast,
                    foreground: "#a3a3a3",
                    background: "#737373",
                    ratio: 1.9,
                    fix: "none"
                  }
                }
              : finding
          )
        }
      })
    )
}

/**
 * The note at the panel's foot in German, about 40% longer than English, as a stand-in for a translation: it wraps to
 * four lines, and the findings still scroll above it.
 */
export const LongNote: Story = {
  loaders: [checking("Dashboard")],
  play: async ({ canvasElement }) => {
    await checkAgain(canvasElement, "Button has no name")
    const note = await within(canvasElement).findByText(/^Automated checks miss some issues/)
    note.textContent =
      "Automatische Prüfungen übersehen manche Probleme. Probieren Sie es zusätzlich mit einer Tastatur und einem Bildschirmleseprogramm aus."
  }
}

/**
 * The design changed after its check, here its headline's text: a warning says so with Check again, the findings
 * fade since they may be wrong now, and the refresh button gets a dot.
 */
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
    await within(canvasElement).findByText("This screen changed after it was checked.", undefined, slowly)
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
    frames.map(([state, mode]) => {
      const result: AccessibilityFinding = {
        state,
        mode,
        rule,
        impact,
        help,
        helpUrl: `https://dequeuniversity.com/rules/axe/4.10/${rule}`,
        detail
      }

      if (layerName) {
        result.node = node("Dashboard", layerName)
        result.name = layerName
      }

      return result
    })

  // A screen has only its base state, so its findings differ by mode alone.
  const everywhere: [string, string][] = ["desktop-light", "desktop-dark", "mobile-light"].map(
    (mode): [string, string] => ["default", mode]
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
        ["default", "desktop-dark"]
      ]
    )
  ]
}
