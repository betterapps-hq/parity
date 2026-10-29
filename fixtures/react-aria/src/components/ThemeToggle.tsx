import { Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ToggleButton } from 'react-aria-components'

export interface ThemeToggleProps {
  isDark: boolean
  onChange: (isDark: boolean) => void
}

export function ThemeToggle({ isDark, onChange }: ThemeToggleProps) {
  return (
    <ToggleButton
      isSelected={isDark}
      onChange={onChange}
      aria-label="Dark theme"
      className="rounded-lg border border-border p-2 text-foreground outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-accent"
    >
      <HugeiconsIcon icon={isDark ? Sun03Icon : Moon02Icon} size={18} />
    </ToggleButton>
  )
}
