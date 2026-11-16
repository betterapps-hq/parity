import { Button, makeStyles, Text, tokens } from "@fluentui/react-components"
import { MailInbox48Regular } from "@fluentui/react-icons"

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXXL,
    color: tokens.colorNeutralForeground3,
    textAlign: "center"
  }
})

export interface EmptyStateProps {
  title: string
  action?: string
  onAction?: () => void
}

export default function EmptyState({ title, action, onAction }: EmptyStateProps) {
  const styles = useStyles()

  return (
    <div className={styles.root}>
      <MailInbox48Regular />
      <Text size={400} weight="semibold">
        {title}
      </Text>
      {action && (
        <Button appearance="primary" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  )
}
