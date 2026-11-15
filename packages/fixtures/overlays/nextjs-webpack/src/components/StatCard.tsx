import { Card, Group, Text } from '@mantine/core'
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
    <Card withBorder padding="lg" className={classes.card}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label}
      </Text>
      <Group justify="space-between" align="flex-end" mt="sm">
        <Text className={classes.value}>{value}</Text>
        {change !== undefined && (
          <Text c={change >= 0 ? 'teal' : 'red'} fw={600} size="sm" className={classes.change}>
            {change >= 0 ? '+' : ''}
            {change}%
            <Arrow size={16} />
          </Text>
        )}
      </Group>
    </Card>
  )
}
