import { Container, Heading, SimpleGrid, Stack } from '@chakra-ui/react'
import { StatCard } from '@/components/StatCard'

export default function DashboardPage() {
  return (
    <Container maxW="4xl" py="8">
      <Stack gap="6">
        <Heading as="h1" size="2xl">
          Dashboard
        </Heading>
        <SimpleGrid columns={{ base: 1, sm: 3 }} gap="4">
          <StatCard label="Revenue" value="$13,456" change={12} />
          <StatCard label="Orders" value="1,204" change={-3} />
          <StatCard label="Customers" value="8,931" change={4} />
        </SimpleGrid>
      </Stack>
    </Container>
  )
}
