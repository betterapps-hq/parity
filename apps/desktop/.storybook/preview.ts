import type { Preview } from "@storybook/react-vite"
import { setPreferences } from "../src/renderer/chrome/preferences.ts"
import { restore } from "../src/renderer/stories/fixtures.tsx"
import { installHost } from "../src/renderer/stories/host.ts"
import { startTheme } from "../src/renderer/theme.ts"
// The app's own stylesheets, in the order its entry loads them.
import "tldraw/tldraw.css"
import "../src/renderer/styles.css"

// Stories run against a stand-in for the desktop host, and follow the app's theme as the app does.
installHost()
startTheme()

const preview: Preview = {
  parameters: { layout: "fullscreen" },
  // The app's chrome comes in light and dark, dark by default; designs choose their own theme through their modes.
  globalTypes: {
    theme: {
      description: "The app's theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" }
        ],
        dynamicTitle: true
      }
    }
  },
  initialGlobals: { theme: "dark" },
  // Whatever a story changed for itself is put back when it ends.
  beforeEach: () => restore,
  decorators: [
    (Story, context) => {
      // Set as the person would in Preferences, so everything that follows the theme, toasts among them, does here too.
      setPreferences({ theme: context.globals.theme === "light" ? "light" : "dark" })
      return Story()
    }
  ]
}

export default preview
