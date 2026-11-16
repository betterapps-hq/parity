import { Badge, Card, HStack, Stat } from "@chakra-ui/react"

export interface StatCardProps {
  label: string
  value: string
  change: string
  trend?: "up" | "down"
}

export function StatCard({ label, value, change, trend = "up" }: StatCardProps) {
  return (
    <Card.Root size="sm">
      <Card.Body>
        <Stat.Root>
          <Stat.Label>{label}</Stat.Label>
          <HStack justify="space-between">
            <Stat.ValueText>{value}</Stat.ValueText>
            <Badge colorPalette={trend === "up" ? "green" : "red"}>{change}</Badge>
          </HStack>
        </Stat.Root>
      </Card.Body>
    </Card.Root>
  )
}
