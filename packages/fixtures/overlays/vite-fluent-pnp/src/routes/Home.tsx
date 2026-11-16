import { makeStyles, Table, TableBody, Title2, tokens } from "@fluentui/react-components"
import { StatCard } from "../components/StatCard.tsx"
import { TicketRow } from "../components/TicketRow.tsx"
import { tickets } from "../data/tickets.ts"

const useStyles = makeStyles({
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: tokens.spacingHorizontalL,
    margin: `${tokens.spacingVerticalL} 0 ${tokens.spacingVerticalXXL}`
  }
})

export function Home() {
  const styles = useStyles()

  return (
    <>
      <Title2>Overview</Title2>
      <div className={styles.stats}>
        <StatCard label="Open tickets" value="38" change="12% this week" />
        <StatCard label="First reply" value="2h 10m" change="8% slower" trend="down" />
        <StatCard label="Solved today" value="21" change="5 more than yesterday" />
      </div>
      <Table aria-label="Needs attention">
        <TableBody>
          {tickets
            .filter((ticket) => ticket.priority === "urgent" || ticket.priority === "high")
            .map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
        </TableBody>
      </Table>
    </>
  )
}
