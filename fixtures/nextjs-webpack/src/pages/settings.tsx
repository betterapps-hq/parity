import { Container, Heading, Stack } from '@chakra-ui/react'
import { ProfileForm } from '@/components/ProfileForm'

export default function SettingsPage() {
  return (
    <Container maxW="xl" py="8">
      <Stack gap="6">
        <Heading as="h1" size="2xl">
          Settings
        </Heading>
        <ProfileForm />
      </Stack>
    </Container>
  )
}
