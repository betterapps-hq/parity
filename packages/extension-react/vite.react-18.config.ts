import { defineProject } from "vite-plus"

/**
 * The guest's tests on React 18, which the workspace's tests list as a project of their own: `react` and `react-dom`
 * are React 18's, from the `react-18` and `react-dom-18` aliases, in a DOM from happy-dom. The rest of the package's
 * tests run on React 19. The setup file sends React 18's react-dom to React 18 too.
 */
export default defineProject({
  root: import.meta.dirname,
  resolve: {
    alias: [
      { find: /^react(\/.*)?$/, replacement: "react-18$1" },
      { find: /^react-dom(\/.*)?$/, replacement: "react-dom-18$1" }
    ]
  },
  test: {
    name: "react-18",
    include: ["src/**/*.react-18.test.ts"],
    environment: "happy-dom",
    setupFiles: ["src/react-18-setup.ts"]
  }
})
