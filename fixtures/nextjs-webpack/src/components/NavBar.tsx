'use client'

import { HStack, IconButton, Text } from '@chakra-ui/react'
import { IconLayoutDashboard, IconMoon, IconSettings, IconSun } from '@tabler/icons-react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import classes from './NavBar.module.scss'

export function NavBar() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return (
    <header className={classes.bar}>
      <Text fontWeight="bold">Acme</Text>
      <HStack gap="4">
        <Link href="/" className={classes.link}>
          <IconLayoutDashboard size={18} />
          Dashboard
        </Link>
        <Link href="/settings" className={classes.link}>
          <IconSettings size={18} />
          Settings
        </Link>
        <IconButton
          variant="outline"
          size="sm"
          aria-label="Switch color scheme"
          onClick={() => setTheme(dark ? 'light' : 'dark')}
        >
          {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
        </IconButton>
      </HStack>
    </header>
  )
}
