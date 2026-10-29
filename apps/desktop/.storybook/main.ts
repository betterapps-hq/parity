import type { StorybookConfig } from "@storybook/react-vite"
import { exampleProject } from "./example-project.ts"

/** Stories for the canvas UI itself, such as how an agent's cursor moves, so they can be seen without an agent. */
const config: StorybookConfig = {
  stories: ["../src/renderer/**/*.stories.@(ts|tsx)"],
  framework: "@storybook/react-vite",
  // The app's Vite config serves the renderer from its own root on a fixed port; Storybook serves from here. Stories
  // open the example project, served here in place of its builder.
  viteFinal: (vite) => ({
    ...vite,
    root: undefined,
    server: { ...vite.server, port: undefined, strictPort: false },
    plugins: [exampleProject(), ...(vite.plugins ?? [])]
  })
}

export default config
