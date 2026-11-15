import { Button, Card, Field, Heading, Input, Stack, Switch } from "@chakra-ui/react"

export function Settings() {
  return (
    <Stack gap="6" maxW="lg">
      <Heading size="xl">Settings</Heading>
      <Card.Root>
        <Card.Body>
          <Stack gap="4">
            <Field.Root>
              <Field.Label>Port name</Field.Label>
              <Input defaultValue="Halifax" />
            </Field.Root>
            <Switch.Root defaultChecked>
              <Switch.HiddenInput />
              <Switch.Control />
              <Switch.Label>Email me when a vessel is late</Switch.Label>
            </Switch.Root>
            <Button alignSelf="flex-start">Save</Button>
          </Stack>
        </Card.Body>
      </Card.Root>
    </Stack>
  )
}
