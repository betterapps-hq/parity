'use client'

import { Box, Button, Field, HStack, Input, InputGroup, Stack } from '@chakra-ui/react'
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
    <Box borderWidth="1px" p="6" className={classes.paper}>
      <form onSubmit={submit}>
        <Stack gap="4">
          <Field.Root required>
            <Field.Label>Name</Field.Label>
            <InputGroup startElement={<IconUser size={16} />}>
              <Input name="name" />
            </InputGroup>
          </Field.Root>
          <Field.Root required>
            <Field.Label>Email</Field.Label>
            <InputGroup startElement={<IconAt size={16} />}>
              <Input name="email" type="email" />
            </InputGroup>
          </Field.Root>
          <HStack justify="flex-end">
            <Button type="submit">Save</Button>
          </HStack>
        </Stack>
      </form>
    </Box>
  )
}
