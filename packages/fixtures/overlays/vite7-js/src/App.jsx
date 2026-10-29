import Avatar from './components/Avatar.jsx'
import Badge from './components/Badge.jsx'
import { Button } from './components/Button.jsx'
import { Card } from './components/Card.jsx'
import { ThemeToggle } from './components/ThemeToggle.jsx'

function App() {
  return (
    <main className="app">
      <ThemeToggle />
      <Card title="Ada Lovelace">
        <Avatar name="Ada Lovelace" />
        <Badge>Mathematician</Badge>
        <p>Wrote the first program for the Analytical Engine.</p>
        <Button>Follow</Button> <Button variant="secondary">Message</Button>
      </Card>
    </main>
  )
}

export default App
