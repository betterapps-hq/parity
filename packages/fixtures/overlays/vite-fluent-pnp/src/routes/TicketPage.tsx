import {
  Avatar,
  Button,
  Card,
  Field,
  makeStyles,
  MessageBar,
  MessageBarBody,
  Text,
  Textarea,
  Title3,
  tokens
} from "@fluentui/react-components"
import { Send20Regular } from "@fluentui/react-icons"
import { useParams } from "@tanstack/react-router"
import EmptyState from "../components/EmptyState.tsx"
import { PriorityBadge } from "../components/PriorityBadge.tsx"
import { tickets } from "../data/tickets.ts"

const useStyles = makeStyles({
  card: { maxWidth: "720px", gap: tokens.spacingVerticalL },
  meta: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: tokens.spacingHorizontalM }
})

export function TicketPage() {
  const styles = useStyles()
  const { ticketId } = useParams({ from: "/tickets/$ticketId" })
  const ticket = tickets.find((each) => each.id === ticketId)

  if (!ticket) {
    return <EmptyState title="This ticket doesn't exist" />
  }

  return (
    <Card className={styles.card}>
      <Title3>{ticket.subject}</Title3>
      <div className={styles.meta}>
        <Avatar name={ticket.requester} size={32} />
        <Text>{ticket.requester}</Text>
        <PriorityBadge priority={ticket.priority} />
        <Text size={200}>Updated {ticket.updated}</Text>
      </div>
      {ticket.status === "waiting" && (
        <MessageBar intent="info">
          <MessageBarBody>Waiting for the requester to reply.</MessageBarBody>
        </MessageBar>
      )}
      <Field label="Reply">
        <Textarea resize="vertical" placeholder="Write a reply" />
      </Field>
      <div>
        <Button appearance="primary" icon={<Send20Regular />}>
          Send
        </Button>
      </div>
    </Card>
  )
}
