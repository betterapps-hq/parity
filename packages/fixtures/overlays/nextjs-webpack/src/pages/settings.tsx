import { Container, Stack, Title } from '@mantine/core'
import { ProfileForm } from '@/components/ProfileForm'

export default function SettingsPage() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1}>Settings</Title>
        <ProfileForm />
      </Stack>
    </Container>
  )
}
