import { Accordion } from "@base-ui/react/accordion"
import { HeartIcon } from "@heroicons/react/24/outline"
import { Star } from "lucide-react"
import { Tooltip } from "radix-ui"

export function App() {
  return (
    <main className="app">
      <h1>Headless validation</h1>
      <Accordion.Root>
        <Accordion.Item>
          <Accordion.Header>
            <Accordion.Trigger className="trigger">Base UI accordion</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>Its styles come from this project's CSS.</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger className="trigger">
            <HeartIcon width={16} /> Radix tooltip <Star size={16} />
          </Tooltip.Trigger>
          <Tooltip.Content className="tooltip">Hello</Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    </main>
  )
}
