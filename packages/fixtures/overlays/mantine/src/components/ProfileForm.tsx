import { Button, Group, Paper, Stack, TextInput } from '@mantine/core'
import type { FormEvent } from 'react'
import classes from './ProfileForm.module.css'

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
          <TextInput name="name" label="Name" required />
          <TextInput name="email" label="Email" type="email" required />
          <Group justify="flex-end">
            <Button type="submit">Save</Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  )
}
