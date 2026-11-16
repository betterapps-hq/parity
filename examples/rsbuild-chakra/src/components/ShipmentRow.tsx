import { Badge, HStack, Stack, Text } from "@chakra-ui/react"
import { ShipIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export interface ShipmentRowProps {
  vessel: string
  route: string
  status: "On time" | "Delayed" | "Docked"
}

const palettes = { "On time": "green", Delayed: "orange", Docked: "blue" } as const

export function ShipmentRow({ vessel, route, status }: ShipmentRowProps) {
  return (
    <HStack justify="space-between" py="3" borderBottomWidth="1px">
      <HStack gap="3">
        <HugeiconsIcon icon={ShipIcon} size={20} />
        <Stack gap="0">
          <Text fontWeight="medium">{vessel}</Text>
          <Text textStyle="sm" color="fg.muted">
            {route}
          </Text>
        </Stack>
      </HStack>
      <Badge colorPalette={palettes[status]}>{status}</Badge>
    </HStack>
  )
}
