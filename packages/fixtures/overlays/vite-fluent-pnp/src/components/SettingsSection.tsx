import { Card, makeStyles, Text, tokens } from "@fluentui/react-components"
import type { ReactNode } from "react"

const useStyles = makeStyles({
  card: { maxWidth: "560px", gap: tokens.spacingVerticalM },
  fields: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM }
})

export interface SettingsSectionProps {
  title: string
  children: ReactNode
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  const styles = useStyles()

  return (
    <Card className={styles.card}>
      <Text size={400} weight="semibold">
        {title}
      </Text>
      <div className={styles.fields}>{children}</div>
    </Card>
  )
}
