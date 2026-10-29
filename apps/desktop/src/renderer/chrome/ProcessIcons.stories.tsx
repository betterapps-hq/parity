import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ProcessStatus, ProjectProcess, ServerKind, TaskKind } from "../../shared/protocol.ts"
import { KindTile, Light } from "./Processes.tsx"

/**
 * Every kind of process Parity runs, in every status it can be in: its icon on a tile tinted its color, with the status
 * light on the corner, and the light alone as the status bar shows it. Servers run until they're stopped; tasks run
 * once and finish with a result. A new kind of process needs a row here.
 */
const meta = {
  title: "Parity/Chrome/Process icons",
  component: KindTile
} satisfies Meta<typeof KindTile>

export default meta
type Story = StoryObj<typeof meta>

/** Each kind by name. Typed by the kinds the service reports, so a new kind can't be left out. */
const servers: Record<ServerKind, string> = {
  builder: "Build server",
  storybook: "Storybook"
}

const tasks: Record<TaskKind, string> = {
  install: "Install",
  typecheck: "Type check",
  test: "Unit tests",
  e2e: "Playwright",
  format: "Format",
  lint: "Lint",
  verify: "Verify",
  build: "Build",
  export: "Export",
  accessibility: "Accessibility check"
}

const serverStatuses: { status: ProcessStatus; label: string }[] = [
  { status: "running", label: "Running" },
  { status: "starting", label: "Starting" },
  { status: "stopping", label: "Stopping" },
  { status: "stopped", label: "Stopped" },
  { status: "failed", label: "Crashed" }
]

const taskStatuses: { status: ProcessStatus; label: string }[] = [
  { status: "running", label: "Running" },
  { status: "stopping", label: "Canceling" },
  { status: "passed", label: "Passed" },
  { status: "failed", label: "Failed" },
  { status: "canceled", label: "Canceled" }
]

function example(kind: ProjectProcess["kind"], shape: ProjectProcess["shape"], status: ProcessStatus): ProjectProcess {
  return {
    id: `${kind}:${status}`,
    kind,
    shape,
    name: kind,
    projectId: "example",
    project: "example",
    status,
    startedAt: Date.now(),
    startedBy: "parity",
    canStop: false,
    canRestart: false
  }
}

function Section({
  title,
  shape,
  kinds,
  statuses
}: {
  title: string
  shape: ProjectProcess["shape"]
  kinds: Record<string, string>
  statuses: { status: ProcessStatus; label: string }[]
}) {
  return (
    <table className="border-separate border-spacing-x-6 border-spacing-y-3">
      <thead>
        <tr className="text-muted-foreground">
          <th className="text-left font-medium text-foreground">{title}</th>
          {statuses.map(({ status, label }) => (
            <th key={status} className="font-normal">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Object.entries(kinds).map(([kind, name]) => (
          <tr key={kind}>
            <td className="pr-4 text-muted-foreground">{name}</td>
            {statuses.map(({ status }) => (
              <td key={status} className="text-center">
                <span className="inline-grid">
                  <KindTile process={example(kind as ProjectProcess["kind"], shape, status)} />
                </span>
              </td>
            ))}
          </tr>
        ))}
        <tr>
          <td className="pr-4 text-muted-foreground">In the status bar</td>
          {statuses.map(({ status }) => (
            <td key={status} className="text-center">
              <span className="inline-grid place-items-center">
                <Light process={example("builder", shape, status)} size={6} />
              </span>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

function Grid() {
  return (
    <div className="flex min-h-screen flex-col gap-6 bg-background p-8 text-xs text-foreground">
      <Section title="Servers" shape="server" kinds={servers} statuses={serverStatuses} />
      <Section title="Tasks" shape="task" kinds={tasks} statuses={taskStatuses} />
    </div>
  )
}

/** Each kind's tile in every status, with the status bar's light for each status below. */
export const EveryKind: Story = {
  args: { process: example("builder", "server", "running") },
  render: () => <Grid />
}

/** The same, in the light theme. */
export const EveryKindLight: Story = {
  ...EveryKind,
  globals: { theme: "light" }
}
