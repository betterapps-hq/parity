import { type AdapterDetection, declares, type DetectContext, scriptConfigExtensions } from "@parity-app/core"

/** Storybook's `main` config, in its usual config folder, with each extension Storybook accepts. */
export const storybookConfigFiles = scriptConfigExtensions.map((extension) => `.storybook/main.${extension}`)

/**
 * Whether the project uses Storybook: `storybook` or a `@storybook/*` package in its package.json, and its `main`
 * config, in the folder its `storybook dev` script names with `-c` or `--config-dir`, else `.storybook`.
 */
export async function detectStorybook(project: DetectContext): Promise<AdapterDetection> {
  const { pkg } = project
  const dependency = declares(pkg, ["storybook"], "@storybook/")

  if (!dependency) {
    return { found: false, summary: "No storybook or @storybook/* package in package.json" }
  }

  const folder = configFolder(pkg.scripts) ?? ".storybook"

  for (const extension of scriptConfigExtensions) {
    const config = `${folder}/main.${extension}`

    if ((await project.read(config)) !== undefined) {
      return { found: true, config, summary: `${dependency} in package.json, config ${config}` }
    }
  }

  return { found: true, summary: `${dependency} in package.json, without a ${folder}/main config` }
}

/** The config folder a `storybook dev` script names: `-c .config/storybook`, `--config-dir=sb`. */
function configFolder(scripts: Record<string, string> | undefined): string | undefined {
  for (const command of Object.values(scripts ?? {})) {
    if (/\bstorybook\s+dev\b/.test(command)) {
      const match = /(?:^|\s)(?:-c|--config-dir)(?:=|\s+)(\S+)/.exec(command)

      if (match) {
        return match[1]!
          .replaceAll(/^["']|["']$/g, "")
          .replace(/^\.\//, "")
          .replace(/\/$/, "")
      }
    }
  }

  return undefined
}
