import { defineExtension, type Parity } from "@parity-app/extension"
import type { StorybookApi } from "@parity-app/extension-storybook"
import { z } from "zod"
import { accessibilityPage } from "./accessibility.ts"

/*
 * Storybook's accessibility checks in Parity (PAR-1096): a small extension that builds on the Storybook extension's API
 * rather than finding stories or starting Storybook itself. It offers Check accessibility in Storybook wherever Open in
 * Storybook shows, opening a component's first story with the accessibility panel of `@storybook/addon-a11y` open, and
 * gives agents that page as a tool. Parity activates the Storybook extension first, since its manifest names it in
 * `extensionDependencies`.
 */

const storybookId = "@parity-app/extension-storybook"

/** The `a11y.page` tool's input, as its schema in the manifest gives it. */
const pageInput = z.object({ component: z.string() })

export default defineExtension({ activate })

async function activate(parity: Parity): Promise<void> {
  const storybook = parity.extensions.get<StorybookApi>(storybookId).api
  parity.context.set("a11y.hasStories", await storybook.componentsWithStories())

  /** A component's accessibility page, with Storybook running. */
  const pageOf = async (component: string) => accessibilityPage(await storybook.storyPage(component, "story"))

  parity.subscriptions.push(
    parity.commands.register("a11y.open", async (target) => {
      if (target?.type !== "component") {
        throw new Error("Choose a component with stories to check")
      }

      const url = await parity.ui.progress("Opening Storybook…", async (progress) => {
        progress.report("If it isn't running yet, it starts first, which can take a minute.")

        return pageOf(target.key)
      })

      await parity.ui.open(url)

      return { url }
    }),
    // Parity has checked the input against the tool's schema already; this reads it as that schema says.
    parity.agentTools.register("a11y.page", async (input) => ({ url: await pageOf(pageInput.parse(input).component) }))
  )
}
