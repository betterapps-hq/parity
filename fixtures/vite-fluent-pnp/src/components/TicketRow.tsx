import { Avatar, makeStyles, TableCell, TableCellLayout, TableRow, Text } from "@fluentui/react-components"
import { Link } from "@tanstack/react-router"
import type { Ticket } from "../data/tickets.ts"
import { PriorityBadge } from "./PriorityBadge.tsx"

const useStyles = makeStyles({
  subject: { color: "inherit", textDecoration: "none", ":hover": { textDecoration: "underline" } }
})

export interface TicketRowProps {
  ticket: Ticket
}

export function TicketRow({ ticket }: TicketRowProps) {
  const styles = useStyles()

  return (
    <TableRow>
      <TableCell>
        <Link to="/tickets/$ticketId" params={{ ticketId: ticket.id }} className={styles.subject}>
          <Text weight="semibold">{ticket.subject}</Text>
        </Link>
      </TableCell>
      <TableCell>
        <TableCellLayout media={<Avatar name={ticket.requester} size={24} />}>{ticket.requester}</TableCellLayout>
      </TableCell>
      <TableCell>
        <PriorityBadge priority={ticket.priority} />
      </TableCell>
      <TableCell>{ticket.updated}</TableCell>
    </TableRow>
  )
}
