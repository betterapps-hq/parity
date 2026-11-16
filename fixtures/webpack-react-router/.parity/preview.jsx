import { StyleSheetManager, ThemeProvider } from 'styled-components'
import { darkTheme, lightTheme } from '../src/theme'

// The app's own theme, which no library file can give: App.jsx puts it around the app, and this puts it around every
// frame on the canvas, picked by the frame's theme. styled-components writes its styles into the frame, so they reach
// it on the canvas, where each frame has a shadow root of its own.
const withTheme = (Story, context) => (
  <StyleSheetManager target={context.canvasElement}>
    <ThemeProvider theme={context.globals.theme === 'dark' ? darkTheme : lightTheme}>
      <Story />
    </ThemeProvider>
  </StyleSheetManager>
)

export const decorators = [withTheme]

export const globalTypes = {
  theme: { description: 'Theme', defaultValue: 'light' },
}
