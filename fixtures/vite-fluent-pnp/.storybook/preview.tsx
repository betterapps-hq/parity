import { FluentProvider, webLightTheme } from "@fluentui/react-components"
import type { Preview } from "@storybook/react-vite"
import "../src/index.css"

const preview: Preview = {
  decorators: [
    (Story) => (
      <FluentProvider theme={webLightTheme}>
        <Story />
      </FluentProvider>
    )
  ]
}

export default preview
