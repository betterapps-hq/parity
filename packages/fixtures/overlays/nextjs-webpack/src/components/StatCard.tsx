import { Card, HStack, Text } from '@chakra-ui/react'
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react'
import classes from './StatCard.module.scss'

export interface StatCardProps {
  label: string
  value: string
  /** Change since the last period, in percent. */
  change?: number
}

export function StatCard({ label, value, change }: StatCardProps) {
  const Arrow = change !== undefined && change < 0 ? IconArrowDownRight : IconArrowUpRight
  return (
    <Card.Root variant="outline" className={classes.card}>
      <Card.Body>
        <Text textStyle="xs" color="fg.muted" textTransform="uppercase" fontWeight="bold">
          {label}
        </Text>
        <HStack justify="space-between" align="flex-end" mt="3">
          <Text className={classes.value}>{value}</Text>
          {change !== undefined && (
            <Text
              color={change >= 0 ? 'teal.fg' : 'red.fg'}
              fontWeight="semibold"
              textStyle="sm"
              className={classes.change}
            >
              {change >= 0 ? '+' : ''}
              {change}%
              <Arrow size={16} />
            </Text>
          )}
        </HStack>
      </Card.Body>
    </Card.Root>
  )
}
