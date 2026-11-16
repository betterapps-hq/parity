import { createTheme } from '@mui/material/styles'

// Light and dark schemes as CSS variables, switched by a class on <html>.
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: { light: true, dark: true },
  palette: { primary: { main: '#4f46e5' } },
  shape: { borderRadius: 10 },
})
