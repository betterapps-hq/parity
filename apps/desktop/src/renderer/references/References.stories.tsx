import type { Found } from "@parity-app/connectors"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { design, example, frameDesigns, openProjects } from "../stories/fixtures.tsx"
import { answeringSearches } from "../stories/host.ts"
import { storyResults } from "../stories/library-results.ts"
import { placeReferences } from "./find-references.ts"

/**
 * References (PAR-840): screens from real apps placed beside a design to look at, never in it. Find references, on the
 * toolbar, R, the Object menu, a design's right-click menu and Search actions, opens the library browser on Mobbin for
 * the selected design, and Place N on canvas puts what's picked in a row beside it. On the canvas a reference moves,
 * nudges and deletes as text does, a double-click opens it in Mobbin, and the inspector shows where it's from.
 *
 * Every story searches made-up samples, the example's sign-in screens, in place of Mobbin's.
 */
const meta = {
  title: "Parity/Canvas/References",
  component: AppWindow,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof AppWindow>

export default meta

type Story = StoryObj<typeof meta>

/** The whole page, since the browser opens over the window rather than inside the story's own element. */
const body = () => within(document.body)

/** The example open with Pricing selected, answering searches with the samples. */
async function pricingSelected() {
  await openProjects("example")
  answeringSearches(storyResults)
  example().selection.set({ design: design("Pricing") })
}

/** The samples a search for `query` brings, as Mobbin's connector gives them. */
function samples(query: string, count: number, platform: "web" | "ios" = "web"): Found[] {
  const answer = storyResults({ connector: "mobbin", request: { query, kind: "screens", filters: { platform } } })

  return "found" in answer ? answer.found.slice(0, count) : []
}

/** References placed beside Pricing once its board has its size, the last one selected. */
async function placedBesidePricing(by?: string, notes: string[] = []) {
  await frameDesigns("Pricing")
  const query = "pricing page with a yearly toggle"
  const found = samples(query, 3)
  const session = example()

  placeReferences(session, found, design("Pricing"), new Map(found.map((each) => [each.id, query])))

  if (by) {
    for (const [index, entry] of session.store.getReferences().entries()) {
      const note = notes[index]
      session.store.updateReference(entry.key, "Placed by an agent", (reference) => ({ ...reference, by, note }))
    }
  }
}

/** Find references on the toolbar with Pricing selected: the browser opens on "pricing page", already searched. */
export const FromTheToolbar: Story = {
  loaders: [pricingSelected],
  play: async () => {
    await userEvent.click(await body().findByRole("button", { name: "Find references" }))
    await expect(await body().findByRole("list", { name: "Results" }, { timeout: 3000 })).toBeInTheDocument()
    await expect(body().getByRole("textbox", { name: /describe/i })).toHaveValue("pricing page")
  }
}

/** Picks two screens and places them: they land in a row beside Pricing, the canvas fits them in, and the last is selected. */
export const PlaceReferences: Story = {
  loaders: [pricingSelected],
  play: async () => {
    await frameDesigns("Pricing")
    await userEvent.keyboard("r")
    const results = await body().findByRole("list", { name: "Results" }, { timeout: 3000 })
    const [ledgerly] = await within(results).findAllByRole("button", { name: "Ledgerly" })
    const [budgetbird] = within(results).getAllByRole("button", { name: "Budgetbird" })
    await userEvent.click(ledgerly!)
    await userEvent.click(budgetbird!)
    await userEvent.click(body().getByRole("button", { name: "Place 2 on canvas" }))
    // The canvas glides to fit them in, and draws a reference once it's in view.
    await waitFor(() => expect(body().getAllByRole("img", { name: /^Reference: / })).toHaveLength(2), {
      timeout: 3000
    })
    await expect(await body().findByText("Placed by")).toBeInTheDocument()
  }
}

/**
 * References beside Pricing, the last selected. Each is its picture at its screen's width, with its app and Mobbin under
 * it. The inspector shows where it's from, the description that found it and who placed it, with a note to say why
 * it's here, Open in Mobbin and More from the app.
 */
export const OnTheCanvas: Story = {
  loaders: [() => openProjects("example")],
  play: () => placedBesidePricing()
}

/**
 * What an agent leaves after it's asked to rework Pricing: the screens it looked at, each with a note on what it took
 * from it, and its name as who placed it.
 */
export const PlacedByAnAgent: Story = {
  loaders: [() => openProjects("example")],
  play: () =>
    placedBesidePricing("Claude", [
      "Yearly is picked by default, and the saving sits on the toggle itself.",
      "Two plans only, the free one first. Questions sit straight under the plans.",
      "The trial is part of the yearly option, not a step of its own."
    ])
}

/** A reference whose picture's link has run out: it shows its app's name and Open in Mobbin in its place. */
export const PictureExpired: Story = {
  loaders: [() => openProjects("example")],
  play: async () => {
    await placedBesidePricing()
    const { store } = example()

    for (const { key } of store.getReferences()) {
      store.updateReference(key, "Expire", (reference) => ({
        ...reference,
        image: { ...reference.image, expiresAt: 1 }
      }))
    }

    await expect(await body().findAllByRole("button", { name: "Open in Mobbin" })).not.toHaveLength(0)
  }
}
