import { Container, SimpleGrid, Stack, Title } from '@mantine/core'
import { StatCard } from '@/components/StatCard'

export default function DashboardPage() {
  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Title order={1}>Dashboard</Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <StatCard label="Revenue" value="$13,456" change={12} />
          <StatCard label="Orders" value="1,204" change={-3} />
          <StatCard label="Customers" value="8,931" change={4} />
        </SimpleGrid>
      </Stack>
    </Container>
  )
}
