import { createRequire } from "node:module"
import { dirname } from "node:path"
import type { StorybookConfig } from "@storybook/react-vite"

const require = createRequire(import.meta.url)

// Plug'n'Play has no node_modules for Storybook to find its framework and addons in, so each is named by its folder.
function getAbsolutePath(value: string): string {
  return dirname(require.resolve(`${value}/package.json`))
}

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [getAbsolutePath("@storybook/addon-docs")],
  framework: getAbsolutePath("@storybook/react-vite")
}

export default config
