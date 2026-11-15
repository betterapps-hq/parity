'use client'

import { ActionIcon, Group, Text, useMantineColorScheme } from '@mantine/core'
import { IconLayoutDashboard, IconMoon, IconSettings, IconSun } from '@tabler/icons-react'
import Link from 'next/link'
import classes from './NavBar.module.scss'

export function NavBar() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  return (
    <header className={classes.bar}>
      <Text fw={700}>Acme</Text>
      <Group gap="md">
        <Link href="/" className={classes.link}>
          <IconLayoutDashboard size={18} />
          Dashboard
        </Link>
        <Link href="/settings" className={classes.link}>
          <IconSettings size={18} />
          Settings
        </Link>
        <ActionIcon variant="default" aria-label="Switch color scheme" onClick={toggleColorScheme}>
          {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
        </ActionIcon>
      </Group>
    </header>
  )
}
