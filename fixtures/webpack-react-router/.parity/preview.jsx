import { ThemeProvider } from 'styled-components'
import { darkTheme, lightTheme } from '../src/theme'

// The app's own theme, which no library file can give: App.jsx puts it around the app, and this puts it around every
// frame on the canvas, picked by the frame's theme.
const withTheme = (Story, context) => (
  <ThemeProvider theme={context.globals.theme === 'dark' ? darkTheme : lightTheme}>
    <Story />
  </ThemeProvider>
)

export const decorators = [withTheme]

export const globalTypes = {
  theme: { description: 'Theme', defaultValue: 'light' },
}
