import { z } from "zod"

/*
 * What the accessibility extension decides, as data: the page of a story with Storybook's accessibility panel open,
 * and whether a project's package.json has the addon that draws that panel.
 */

/** The id of the panel `@storybook/addon-a11y` adds, which Storybook opens from a page's `addonPanel`. */
export const accessibilityPanel = "storybook/a11y/panel"

/**
 * A story's page with Storybook's accessibility panel open. Throws for a page that isn't a story's, as Storybook's home,
 * since only a story has the panel.
 */
export function accessibilityPage(storyPage: string): string {
  if (!storyPage.includes("?path=/story/")) {
    throw new Error("Only a story's page has the accessibility panel")
  }

  return `${storyPage}&addonPanel=${accessibilityPanel}`
}

/** The addon whose panel the extension opens. */
export const addon = "@storybook/addon-a11y"

const dependencies = z.record(z.string(), z.unknown()).optional()

/** The fields of a package.json that name its dependencies. */
const packageManifest = z.looseObject({
  dependencies,
  devDependencies: dependencies,
  optionalDependencies: dependencies
})

/** Whether a package.json, as JSON parsed it, depends on the addon, in any kind of dependencies. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a project's package.json, read here
export function hasAddon(packageJson: unknown): boolean {
  const found = packageManifest.safeParse(packageJson).data

  return [found?.dependencies, found?.devDependencies, found?.optionalDependencies].some(
    (listed) => listed !== undefined && Object.hasOwn(listed, addon)
  )
}
