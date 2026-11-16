/*
 * What the accessibility extension decides, as data: the page of a story with Storybook's accessibility panel open.
 * Parity finds the addon that draws that panel by the manifest's peer dependency.
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
