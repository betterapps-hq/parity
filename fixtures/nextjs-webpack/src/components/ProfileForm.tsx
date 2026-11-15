'use client'

import { Button, Group, Paper, Stack, TextInput } from '@mantine/core'
import { IconAt, IconUser } from '@tabler/icons-react'
import type { FormEvent } from 'react'
import classes from './ProfileForm.module.scss'

export interface ProfileFormProps {
  onSubmit?: (values: { name: string; email: string }) => void
}

export function ProfileForm({ onSubmit }: ProfileFormProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onSubmit?.({ name: String(data.get('name')), email: String(data.get('email')) })
  }
  return (
    <Paper withBorder p="lg" className={classes.paper}>
      <form onSubmit={submit}>
        <Stack>
          <TextInput name="name" label="Name" leftSection={<IconUser size={16} />} required />
          <TextInput name="email" label="Email" type="email" leftSection={<IconAt size={16} />} required />
          <Group justify="flex-end">
            <Button type="submit">Save</Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  )
}
