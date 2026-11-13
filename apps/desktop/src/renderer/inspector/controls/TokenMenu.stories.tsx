import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent, within } from "storybook/test"
import { TokenMenu } from "./field-parts.tsx"
import { spacingTokens } from "./stand-in-tokens.ts"

/**
 * A field's token menu (`TokenMenu`), what a token field's chevron opens: its tokens in the scale's order, without the
 * ones the project has replaced; for a value of its own, the nearest token first, then Create token; and, in a project
 * set to Tokens only, Allow here. Each field's own story shows it in place; these are what any token menu does.
 */
const meta = {
  title: "Parity/Fields/Parts/Token menu",
  component: TokenMenu,
  args: { label: "Gap", tokens: spacingTokens, onPick: fn() },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="w-60 p-4">
          <Story />
        </div>
      </TooltipProvider>
    )
  ]
} satisfies Meta<typeof TokenMenu>

export default meta

type Story = StoryObj<typeof meta>

/** Holding spacing-gutter: it's checked, and picking another token reports it. */
export const Holding: Story = {
  args: { current: "spacing-gutter" },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /spacing-inset/ }))
    await expect(args.onPick).toHaveBeenCalledWith("spacing-inset")
  }
}

/** A value of its own, 18px: spacing-inset, the nearest, first, then the tokens and Create token. */
export const OwnValue: Story = {
  args: { own: "18px", nearest: spacingTokens[0], namespace: "spacing", onCreate: fn() }
}

/** The token it holds, spacing-card, has been replaced: it offers spacing-gutter, which replaced it. */
export const Replaced: Story = {
  args: { current: "spacing-card", replaced: { name: "spacing-card", by: spacingTokens[1]! } }
}

/** 18px in a project set to Tokens only: Allow here after the tokens, which asks why. */
export const TokensOnly: Story = {
  args: { own: "18px", nearest: spacingTokens[0], tokensOnly: true, onAllow: fn() }
}

/** With words besides its tokens, as Gap's Auto, and a search over the tokens. */
export const WithWordsAndSearch: Story = {
  args: {
    shown: "searched",
    keywords: {
      heading: "Spread",
      rows: [{ key: "auto", name: "Auto", detail: "Space between", current: false, onPick: () => undefined }]
    }
  }
}
