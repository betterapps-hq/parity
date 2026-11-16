import { Link } from "react-router"
import { Button } from "~/components/Button"
import styles from "~/styles/pages.module.css"
import type { Route } from "./+types/home"

export function meta(_: Route.MetaArgs) {
  return [{ title: "Trellis" }, { name: "description", content: "Plan projects with your whole team." }]
}

export default function Home() {
  return (
    <section className={styles.hero}>
      <h1 className={styles.display}>Plan projects with your whole team</h1>
      <p className={styles.lead}>Trellis keeps every project's plan, people and files in one place.</p>
      <div className={styles.actions}>
        <Button asChild size="lg">
          <Link to="/projects">Get started</Link>
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link to="/pricing">See pricing</Link>
        </Button>
      </div>
    </section>
  )
}
