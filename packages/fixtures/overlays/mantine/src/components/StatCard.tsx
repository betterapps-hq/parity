import { Card, Group, Text } from '@mantine/core'
import classes from './StatCard.module.css'

export interface StatCardProps {
  label: string
  value: string
  /** Change since the last period, in percent. */
  change?: number
}

export function StatCard({ label, value, change }: StatCardProps) {
  return (
    <Card withBorder padding="lg" className={classes.card}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label}
      </Text>
      <Group justify="space-between" align="flex-end" mt="sm">
        <Text className={classes.value}>{value}</Text>
        {change !== undefined && (
          <Text c={change >= 0 ? 'teal' : 'red'} fw={600} size="sm">
            {change >= 0 ? '+' : ''}
            {change}%
          </Text>
        )}
      </Group>
    </Card>
  )
}
