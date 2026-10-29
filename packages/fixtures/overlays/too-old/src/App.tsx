import { useState } from 'react'
import { Button } from './components/ui/button'
import { Card, CardContent, CardTitle } from './components/ui/card'

function App() {
  const [dark, setDark] = useState(false)
  return (
    <div className={dark ? 'dark' : undefined}>
      <main className="mx-auto min-h-screen max-w-md bg-background p-8 text-foreground">
        <Card>
          <CardTitle>Upgrade your plan</CardTitle>
          <CardContent className="flex gap-2">
            <Button>Upgrade</Button>
            <Button variant="outline" onClick={() => setDark(!dark)}>
              {dark ? 'Light' : 'Dark'}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default App
