import { Card, CardHeader, makeStyles, mergeClasses, Text, tokens } from "@fluentui/react-components"
import { ArrowTrending16Regular, ArrowTrendingDown16Regular } from "@fluentui/react-icons"

const useStyles = makeStyles({
  value: { fontSize: tokens.fontSizeHero800, fontWeight: tokens.fontWeightSemibold },
  change: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  up: { color: tokens.colorPaletteGreenForeground1 },
  down: { color: tokens.colorPaletteRedForeground1 }
})

export interface StatCardProps {
  label: string
  value: string
  change: string
  trend?: "up" | "down"
}

export function StatCard({ label, value, change, trend = "up" }: StatCardProps) {
  const styles = useStyles()

  return (
    <Card>
      <CardHeader header={<Text weight="semibold">{label}</Text>} />
      <Text className={styles.value}>{value}</Text>
      <Text size={200} className={mergeClasses(styles.change, trend === "up" ? styles.up : styles.down)}>
        {trend === "up" ? <ArrowTrending16Regular /> : <ArrowTrendingDown16Regular />}
        {change}
      </Text>
    </Card>
  )
}
