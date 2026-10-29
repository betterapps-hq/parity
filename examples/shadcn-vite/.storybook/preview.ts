import type { Preview } from "@storybook/react-vite"
import "../src/index.css"

const preview: Preview = {
  // Every component gets a docs page, which is where Parity opens it.
  tags: ["autodocs"]
}

export default preview
