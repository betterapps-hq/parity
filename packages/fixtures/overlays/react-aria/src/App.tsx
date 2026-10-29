import { useState } from 'react'
import { Form } from 'react-aria-components'
import { Button } from './components/Button'
import { TextField } from './components/TextField'
import { ThemeToggle } from './components/ThemeToggle'

function App() {
  const [isDark, setDark] = useState(false)
  return (
    <div className={isDark ? 'dark' : undefined}>
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 bg-background p-8 text-foreground">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Sign up</h1>
          <ThemeToggle isDark={isDark} onChange={setDark} />
        </header>
        <Form className="flex flex-col gap-4">
          <TextField label="Name" isRequired />
          <TextField label="Email" type="email" description="We never share it." isRequired />
          <div className="flex gap-2">
            <Button type="submit">Create account</Button>
            <Button variant="secondary" type="reset">
              Clear
            </Button>
          </div>
        </Form>
      </main>
    </div>
  )
}

export default App
