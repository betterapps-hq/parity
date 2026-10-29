import { Badge, Button, Card, Heading, Stack, Text } from "@chakra-ui/react"
import { Heart } from "@phosphor-icons/react"
import { IconStar } from "@tabler/icons-react"

export function App() {
  return (
    <Stack padding="8" gap="4" maxWidth="md">
      <Heading>Chakra validation</Heading>
      <Card.Root>
        <Card.Body>
          <Text>
            Components from Chakra UI v3, icons from Phosphor and Tabler. <Badge>New</Badge>
          </Text>
        </Card.Body>
      </Card.Root>
      <Button>
        <Heart /> Like <IconStar size={16} />
      </Button>
    </Stack>
  )
}
