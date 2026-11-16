import {
  Tab,
  Table,
  TableBody,
  TableHeader,
  TableHeaderCell,
  TableRow,
  TabList,
  type SelectTabData
} from "@fluentui/react-components"
import { useState } from "react"
import EmptyState from "../components/EmptyState.tsx"
import { TicketRow } from "../components/TicketRow.tsx"
import { type TicketStatus, tickets } from "../data/tickets.ts"

export function TicketList() {
  const [status, setStatus] = useState<TicketStatus>("open")
  const shown = tickets.filter((ticket) => ticket.status === status)

  return (
    <>
      <TabList selectedValue={status} onTabSelect={(_, data: SelectTabData) => setStatus(data.value as TicketStatus)}>
        <Tab value="open">Open</Tab>
        <Tab value="waiting">Waiting</Tab>
        <Tab value="solved">Solved</Tab>
      </TabList>
      {shown.length === 0 ? (
        <EmptyState title="No tickets here" />
      ) : (
        <Table aria-label="Tickets">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Subject</TableHeaderCell>
              <TableHeaderCell>Requester</TableHeaderCell>
              <TableHeaderCell>Priority</TableHeaderCell>
              <TableHeaderCell>Updated</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}
