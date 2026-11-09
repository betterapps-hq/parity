import { defineMain } from "@buildkitgg/storybook-config/main"
import { exampleProject } from "./example-project.ts"

/**
 * Stories for the canvas UI itself, such as how an agent's cursor moves, so they can be seen without an agent. Buildkit's
 * base adds the accessibility and Vitest addons and turns off telemetry (PAR-730).
 */
export default defineMain({
  stories: ["../src/renderer/**/*.stories.@(ts|tsx)"],
  // The app's Vite config serves the renderer from its own root on a fixed port; Storybook serves from here. Stories
  // open the example project, served here in place of its builder.
  viteFinal: (vite) => ({
    ...vite,
    root: undefined,
    server: { ...vite.server, port: undefined, strictPort: false },
    plugins: [exampleProject(), ...(vite.plugins ?? [])]
  })
})
