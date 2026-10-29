import { useState } from 'react'
import { Button } from './Button.jsx'

/** Switches the theme with a `data-theme` attribute on the root element. */
export function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light')
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    setTheme(next)
  }
  return (
    <Button variant="secondary" onClick={toggle}>
      {theme === 'dark' ? 'Light theme' : 'Dark theme'}
    </Button>
  )
}
