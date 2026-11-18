// Makes a heavy app to measure the canvas on (PAR-1321): a copy of examples/shadcn-vite with many more routes, each a
// full screen of real components (stat cards, a long table, a chart, a form and an activity feed), and story files
// whose stories are those sections. The example's own pages are light and copacker's mostly draw signed-out pages, so
// measuring zoom on them was close to a best case. The copy shares the example's node_modules through a link, so it
// needs no install of its own; run `pnpm install` first so the example has them.
// Usage: node scripts/heavy-app.ts <folder> [--routes 40] [--stories 12]
// Then measure it: pnpm perf --project <folder>, or open it in the app with pnpm dev:prod <folder>.
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { print } from "../../../scripts/output.ts"

const args = process.argv.slice(2)

const option = (name: string) => {
  const index = args.indexOf(`--${name}`)

  return index === -1 ? undefined : args[index + 1]
}

const given = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : undefined

if (!given) {
  throw new Error("Usage: node scripts/heavy-app.ts <folder> [--routes 40] [--stories 12]")
}

const target = given

const routes = Number(option("routes") ?? 40)
const storyFiles = Number(option("stories") ?? 12)
const example = resolve(import.meta.dirname, "../../../examples/shadcn-vite")

if (!existsSync(join(example, "node_modules/.buildkit/shadcn"))) {
  throw new Error("examples/shadcn-vite has no node_modules yet: run pnpm install first")
}

// The link to the example's node_modules goes first, on its own, so clearing the folder never reaches through it.
rmSync(join(target, "node_modules"), { force: true })

rmSync(target, { recursive: true, force: true })

mkdirSync(target, { recursive: true })

cpSync(example, target, {
  recursive: true,
  // Its project file is made again for the new routes and stories, and its route tree by the router's Vite plugin.
  filter: (from) => !/[\\/](node_modules|dist|shadcn-vite\.par|routeTree\.gen\.ts)$/.test(from)
})

symlinkSync(join(example, "node_modules"), join(target, "node_modules"), "junction")

const kinds = ["overview", "orders", "people", "reports", "settings"] as const
const words = ["Atlas", "Beacon", "Cobalt", "Delta", "Ember", "Fjord", "Garnet", "Harbor", "Iris", "Juniper"]
const name = (n: number) => `${words[n % words.length]} ${kinds[n % kinds.length]} ${Math.floor(n / words.length) + 1}`

write(
  "src/components/heavy/sections.tsx",
  `import {
  Avatar, AvatarFallback, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Input,
  Label, Progress, Separator, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsList,
  TabsTrigger, Textarea
} from "@buildkitgg/shadcn"

// Seeded, so a screen draws the same each time and every frame of it agrees.
function random(seed: number) {
  let state = seed * 9301 + 49297
  return () => {
    state = (state * 9301 + 49297) % 233280
    return state / 233280
  }
}

const people = ["Ada Park", "Ben Ito", "Cleo Diaz", "Dev Rao", "Eli Moss", "Fay Chen", "Gus Hale", "Hana Ruiz"]
const statuses = ["Paid", "Pending", "Refunded", "Failed", "Shipped"] as const
const tones = { Paid: "default", Pending: "secondary", Refunded: "outline", Failed: "destructive", Shipped: "secondary" } as const

export function StatCards({ seed, count = 8 }: { seed: number; count?: number }) {
  const next = random(seed)
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: count }, (_, i) => {
        const value = Math.round(next() * 90000)
        const change = Math.round(next() * 400 - 200) / 10
        return (
          <Card key={i}>
            <CardHeader>
              <CardDescription>Metric {i + 1}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{value.toLocaleString("en-US")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Badge variant={change < 0 ? "destructive" : "secondary"}>{change}%</Badge>
              <Progress value={Math.round(next() * 100)} />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export function OrdersTable({ seed, rows = 40 }: { seed: number; rows?: number }) {
  const next = random(seed + 1)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders</CardTitle>
        <CardDescription>{rows} most recent</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"><Checkbox /></TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }, (_, i) => {
              const person = people[Math.floor(next() * people.length)]
              const status = statuses[Math.floor(next() * statuses.length)]
              return (
                <TableRow key={i}>
                  <TableCell><Checkbox defaultChecked={next() > 0.7} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-6"><AvatarFallback>{person.split(" ").map((p) => p[0]).join("")}</AvatarFallback></Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium">{person}</span>
                        <span className="text-xs text-muted-foreground">{person.toLowerCase().replace(" ", ".")}@example.com</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">#{10000 + Math.floor(next() * 89999)}</TableCell>
                  <TableCell><Badge variant={tones[status]}>{status}</Badge></TableCell>
                  <TableCell>{1 + Math.floor(next() * 9)}</TableCell>
                  <TableCell className="text-right tabular-nums">\${(next() * 900).toFixed(2)}</TableCell>
                  <TableCell><Button variant="ghost" size="sm">View</Button></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function RevenueChart({ seed, points = 120 }: { seed: number; points?: number }) {
  const next = random(seed + 2)
  const values = Array.from({ length: points }, () => 20 + next() * 160)
  const line = values.map((v, i) => \`\${(i / (points - 1)) * 600},\${200 - v}\`).join(" ")
  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue</CardTitle>
        <Tabs defaultValue="month">
          <TabsList>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="year">Year</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <svg viewBox="0 0 600 200" className="h-48 w-full text-primary">
          {Array.from({ length: 5 }, (_, i) => (
            <line key={i} x1="0" x2="600" y1={i * 50} y2={i * 50} className="stroke-border" />
          ))}
          {values.map((v, i) => (
            <rect key={i} x={(i / points) * 600} y={200 - v / 2} width={600 / points - 1} height={v / 2} className="fill-muted" />
          ))}
          <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </CardContent>
    </Card>
  )
}

export function ProfileForm({ seed, fields = 10 }: { seed: number; fields?: number }) {
  const next = random(seed + 3)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardDescription>Shown to everyone on the team.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Label htmlFor={\`field-\${seed}-\${i}\`}>Field {i + 1}</Label>
            <Input id={\`field-\${seed}-\${i}\`} defaultValue={next() > 0.4 ? people[i % people.length] : ""} placeholder="Type here" />
          </div>
        ))}
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label>Notes</Label>
          <Textarea defaultValue="Ships on Mondays and Thursdays." />
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border p-3">
            <Label>Setting {i + 1}</Label>
            <Switch defaultChecked={next() > 0.5} />
          </div>
        ))}
        <div className="flex gap-2 md:col-span-2">
          <Button>Save</Button>
          <Button variant="outline">Cancel</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function ActivityFeed({ seed, items = 24 }: { seed: number; items?: number }) {
  const next = random(seed + 4)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: items }, (_, i) => {
          const person = people[Math.floor(next() * people.length)]
          return (
            <div key={i} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <Avatar className="size-8"><AvatarFallback>{person[0]}</AvatarFallback></Avatar>
                <div className="flex flex-1 flex-col">
                  <p className="text-sm"><span className="font-medium">{person}</span> updated order #{10000 + i}</p>
                  <p className="text-xs text-muted-foreground">{1 + Math.floor(next() * 59)} minutes ago</p>
                </div>
                <Badge variant="outline">{statuses[i % statuses.length]}</Badge>
              </div>
              <Separator />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

/** A full screen of every section, in an order that differs by kind so screens aren't all alike. */
export function HeavyScreen({ seed, title }: { seed: number; title: string }) {
  const sections = [
    <StatCards key="stats" seed={seed} />,
    <RevenueChart key="chart" seed={seed} />,
    <OrdersTable key="table" seed={seed} />,
    <div key="pair" className="grid gap-4 lg:grid-cols-2"><ProfileForm seed={seed} /><ActivityFeed seed={seed} /></div>
  ]
  const turn = seed % sections.length
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">Everything for {title.toLowerCase()} in one place.</p>
        </div>
        <div className="flex gap-2"><Input placeholder="Search" className="w-56" /><Button>New</Button></div>
      </div>
      {[...sections.slice(turn), ...sections.slice(0, turn)]}
    </div>
  )
}
`
)

for (let n = 0; n < routes; n++) {
  const path = `area-${String(n + 1).padStart(2, "0")}`
  write(
    `src/routes/${path}.tsx`,
    `import { createFileRoute } from "@tanstack/react-router"
import { HeavyScreen } from "@/components/heavy/sections"

export const Route = createFileRoute("/${path}")({ component: () => <HeavyScreen seed={${n + 1}} title="${name(n)}" /> })
`
  )
}

const sections = ["StatCards", "OrdersTable", "RevenueChart", "ProfileForm", "ActivityFeed"] as const

for (let n = 0; n < storyFiles; n++) {
  const group = `Heavy ${String(n + 1).padStart(2, "0")}`
  write(
    `src/stories/heavy-${String(n + 1).padStart(2, "0")}.stories.tsx`,
    `import type { Meta, StoryObj } from "@storybook/react-vite"
import * as Heavy from "@/components/heavy/sections"

const meta = { title: "${group}/Sections" } satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

${sections
  .map(
    (section, i) =>
      `export const ${section}: Story = { render: () => <div className="w-[960px] p-4"><Heavy.${section} seed={${n * 10 + i}} /></div> }`
  )
  .join("\n")}
`
  )
}

print(`Made ${target}: ${routes} heavy routes and ${storyFiles * sections.length} stories.`)

function write(path: string, text: string) {
  const file = join(target, path)
  mkdirSync(resolve(file, ".."), { recursive: true })
  writeFileSync(file, text)
}
