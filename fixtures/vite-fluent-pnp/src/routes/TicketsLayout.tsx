import { Button, makeStyles, Title2, tokens } from "@fluentui/react-components"
import { Add20Regular } from "@fluentui/react-icons"
import { Outlet } from "@tanstack/react-router"

const useStyles = makeStyles({
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: tokens.spacingVerticalL
  }
})

export function TicketsLayout() {
  const styles = useStyles()

  return (
    <>
      <div className={styles.header}>
        <Title2>Tickets</Title2>
        <Button appearance="primary" icon={<Add20Regular />}>
          New ticket
        </Button>
      </div>
      <Outlet />
    </>
  )
}
