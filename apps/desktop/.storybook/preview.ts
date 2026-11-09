import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { definePreview } from "@buildkitgg/storybook-config/preview"
import { createElement } from "react"
import { setPreferences } from "../src/renderer/chrome/preferences.ts"
import { installClassMerger } from "../src/renderer/class-merger.ts"
import { restore } from "../src/renderer/stories/fixtures.tsx"
import { installHost } from "../src/renderer/stories/host.ts"
import { startTheme } from "../src/renderer/theme.ts"
// The app's own stylesheets, in the order its entry loads them.
import "tldraw/tldraw.css"
import "../src/renderer/styles.css"

// Stories run against a stand-in for the desktop host, follow the app's theme and merge classes as the app does.
installHost()

startTheme()

installClassMerger()

// Buildkit's base preview matches color and date controls by argument name (PAR-730).
export default definePreview({
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

      // Tooltips need a provider, which the app puts around everything.
      return createElement(TooltipProvider, null, Story())
    }
  ]
})
