import IconButton from '@mui/material/IconButton'
import { useColorScheme } from '@mui/material/styles'
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'

export function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme()
  const dark = (mode === 'system' ? systemMode : mode) === 'dark'

  return (
    <IconButton
      color="inherit"
      aria-label={dark ? 'Use light theme' : 'Use dark theme'}
      onClick={() => setMode(dark ? 'light' : 'dark')}
    >
      {dark ? <LightModeOutlined /> : <DarkModeOutlined />}
    </IconButton>
  )
}
