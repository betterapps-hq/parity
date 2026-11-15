import { Card, Heading, SimpleGrid, Stack } from "@chakra-ui/react"
import { NoticeBanner } from "../components/NoticeBanner"
import { ShipmentRow } from "../components/ShipmentRow"
import { StatCard } from "../components/StatCard"

export function Home() {
  return (
    <Stack gap="6">
      <Heading size="xl">Overview</Heading>
      <NoticeBanner title="Storm warning" description="Two vessels may reach port a day late." />
      <SimpleGrid columns={{ base: 1, md: 3 }} gap="4">
        <StatCard label="Vessels at sea" value="24" change="+3" />
        <StatCard label="Containers today" value="1,280" change="+8%" />
        <StatCard label="Late arrivals" value="2" change="+1" trend="down" />
      </SimpleGrid>
      <Card.Root>
        <Card.Header>
          <Heading size="md">Shipments</Heading>
        </Card.Header>
        <Card.Body pt="0">
          <ShipmentRow vessel="Northern Star" route="Rotterdam to Halifax" status="On time" />
          <ShipmentRow vessel="Coral Bay" route="Singapore to Sydney" status="Delayed" />
          <ShipmentRow vessel="Ardent" route="Le Havre to Lisbon" status="Docked" />
        </Card.Body>
      </Card.Root>
    </Stack>
  )
}
