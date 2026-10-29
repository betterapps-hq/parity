import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import type { ProjectProcess } from "../../shared/protocol.ts"
import { openProjects, preferring } from "../stories/fixtures.tsx"
import { roots, running } from "../stories/host.ts"
import { AtBottom } from "./chrome-fixtures.tsx"
import { StatusBar } from "./StatusBar.tsx"

/**
 * What Parity runs, in the status bar: a light for each process, and a flyout with how long each has run and a way to
 * stop it. Servers, each open project's build server and the Storybooks Parity starts, run until they're stopped and
 * are named by Portless when a project uses it. Tasks, such as installs, type checks, tests and verify rounds, run once
 * and finish with a result, and the last result of each stays listed.
 */
const meta = {
  title: "Parity/Chrome/Processes",
  component: StatusBar,
  decorators: [AtBottom]
} satisfies Meta<typeof StatusBar>

export default meta
type Story = StoryObj<typeof meta>

const body = () => within(document.body)
const ago = (minutes: number) => Date.now() - minutes * 60_000

/** Opens the example with the stats out of the way, then has the stand-in service run `processes` beside it. */
async function runningWith(...processes: ProjectProcess[]): Promise<void> {
  await openProjects("example")
  preferring({ performanceStats: false })
  running.processes.push(...processes)
}

async function openFlyout(): Promise<HTMLElement> {
  await waitFor(() => expect(document.querySelector("[data-slot=processes-trigger]")).not.toBeNull())
  await userEvent.click(document.querySelector<HTMLElement>("[data-slot=processes-trigger]")!)
  return body().findByRole("dialog")
}

/**
 * A button on a process's row, by the process's name, once the list is current: right after a story opens, it can
 * still show the last story's processes for a moment.
 */
function rowButton(flyout: HTMLElement, name: string, button: string): Promise<HTMLElement> {
  return waitFor(() =>
    within(within(flyout).getByText(name, { selector: "ul span" }).closest("li")!).getByRole("button", { name: button })
  )
}

/** The example's Storybook, started by Parity 18 minutes ago, with the name Portless gives it. */
function storybook(overrides: Partial<ProjectProcess> = {}): ProjectProcess {
  return {
    id: `storybook:${roots.example}`,
    kind: "storybook",
    shape: "server",
    name: "Storybook",
    projectId: roots.example,
    project: "shadcn-vite",
    status: "running",
    startedAt: ago(18),
    pid: 18_240,
    url: "http://localhost:6006",
    domain: "https://storybook.shadcn-vite.localhost",
    startedBy: "parity",
    canStop: true,
    canRestart: true,
    ...overrides
  }
}

/** A task for the example: running for `minutes`, or finished that long ago when given a status that ends it. */
function task(
  kind: ProjectProcess["kind"],
  name: string,
  overrides: Partial<ProjectProcess> & { minutes?: number; took?: number } = {}
): ProjectProcess {
  const { minutes = 0.4, took = 0.3, ...rest } = overrides
  const done = rest.status && rest.status !== "running" && rest.status !== "stopping"
  return {
    id: `${kind}:${roots.example}`,
    kind,
    shape: "task",
    name,
    projectId: roots.example,
    project: "shadcn-vite",
    status: "running",
    startedAt: done ? ago(minutes + took) : ago(minutes),
    ...(done ? { stoppedAt: ago(minutes) } : {}),
    startedBy: "parity",
    canStop: !done,
    canRestart: true,
    ...rest
  }
}

/** The last result of each task the example has run, newest first in the list: what each found, and how long it took. */
function recent(): ProjectProcess[] {
  return [
    task("typecheck", "Type check", {
      status: "passed",
      minutes: 41,
      took: 0.05,
      summary: "Read 34 files, no changes"
    }),
    task("install", "Install Radix Themes", {
      id: "install:radix",
      status: "passed",
      minutes: 26,
      took: 0.4,
      summary: "Added @radix-ui/themes",
      canRestart: false
    }),
    task("format", "Format", { status: "passed", minutes: 12, took: 0.03, summary: "Formatted 12 files" }),
    task("lint", "Lint", { status: "failed", minutes: 9, took: 0.08, summary: "3 problems in 2 files" }),
    task("e2e", "Playwright", { status: "canceled", minutes: 4, took: 1.2, summary: "Canceled after 18 of 42 tests" })
  ]
}

/** The example alone: its build server, which renders the canvas, running for a few seconds. One light, breathing. */
export const JustTheBuildServer: Story = {
  loaders: [() => runningWith()]
}

/** The flyout with the example's build server and Storybook: each one's address, by its Portless name, and how long it has run. */
export const Open: Story = {
  loaders: [() => runningWith(storybook())],
  play: async () => {
    const flyout = await openFlyout()
    await waitFor(() => expect(within(flyout).getAllByText("storybook")).toHaveLength(1))
  }
}

/** Storybook starting, just asked for: the status bar says so, and its light turns until it's ready. */
export const Starting: Story = {
  loaders: [() => runningWith(storybook({ domain: undefined, status: "starting", startedAt: Date.now() - 9000 }))],
  play: async () => {
    await openFlyout()
  }
}

/** Storybook crashed a minute after starting: the status bar turns red, and the flyout says why and offers to start it again. */
export const Crashed: Story = {
  loaders: [
    () =>
      runningWith(
        storybook({
          status: "failed",
          startedAt: ago(4.2),
          stoppedAt: ago(3),
          canStop: false,
          error: "Stopped by itself, with exit code 1"
        })
      )
  ],
  play: async () => {
    const flyout = await openFlyout()
    await within(flyout).findByText("Crashed")
  }
}

/** Stop asks once more in place, with the stop button focused: Enter stops, Escape keeps it running. */
export const AskingToStop: Story = {
  loaders: [() => runningWith(storybook())],
  play: async () => {
    const flyout = await openFlyout()
    const stop = await rowButton(flyout, "Storybook", "Stop")
    stop.focus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(document.activeElement).toHaveTextContent("Stop"))
  }
}

/** Once stopping is confirmed: the light turns and the word shimmers until the process has exited. */
export const Stopping: Story = {
  loaders: [() => runningWith(storybook())],
  play: async () => {
    const flyout = await openFlyout()
    const stop = await rowButton(flyout, "Storybook", "Stop")
    stop.focus()
    await userEvent.keyboard("{Enter}")
    await userEvent.keyboard("{Enter}")
    await within(flyout).findByText("Stopping")
  }
}

/**
 * A verify round and unit tests running beside the servers: what each is doing and how far it has got. The status bar
 * names the first, with its progress.
 */
export const TasksRunning: Story = {
  loaders: [
    () =>
      runningWith(
        storybook(),
        task("verify", "Verify", { minutes: 1.6, detail: "Checking types", progress: { done: 2, total: 6 } }),
        task("test", "Unit tests", { minutes: 0.3, detail: "button.test.tsx", progress: { done: 214, total: 340 } })
      )
  ],
  play: async () => {
    const flyout = await openFlyout()
    await within(flyout).findByText("214 of 340")
  }
}

/**
 * Lint failed while the flyout was closed: the status bar says so in red, with a mark beside the lights, until the
 * flyout is opened.
 */
export const TaskFailed: Story = {
  loaders: [
    () =>
      runningWith(
        storybook(),
        task("lint", "Lint", { status: "failed", minutes: 0.1, took: 0.08, summary: "3 problems in 2 files" })
      )
  ]
}

/**
 * Each task's last result, under Last results: what it found and when. A result stays until the task runs again, it's
 * dismissed, or the project closes.
 */
export const LastResults: Story = {
  loaders: [() => runningWith(storybook(), ...recent())],
  play: async () => {
    const flyout = await openFlyout()
    await within(flyout).findByText("3 problems in 2 files")
  }
}

/** Canceling a running task asks once more in place, as stopping a server does. */
export const CancelingATask: Story = {
  loaders: [
    () =>
      runningWith(
        storybook(),
        task("e2e", "Playwright", { minutes: 1.2, detail: "checkout.spec.ts", progress: { done: 18, total: 42 } })
      )
  ],
  play: async () => {
    const flyout = await openFlyout()
    const cancel = await rowButton(flyout, "Playwright", "Cancel")
    cancel.focus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(document.activeElement).toHaveTextContent("Cancel"))
  }
}

/** Running a finished type check again: its last result gives way to the new run, which then passes. */
export const RunningATaskAgain: Story = {
  loaders: [() => runningWith(storybook(), ...recent())],
  play: async () => {
    const flyout = await openFlyout()
    const again = await rowButton(flyout, "Type check", "Run again")
    again.focus()
    await userEvent.keyboard("{Enter}")
    await within(flyout).findByText("Checks types")
  }
}

/** A project without Portless: each address is a local port. */
export const WithoutPortless: Story = {
  loaders: [() => runningWith(storybook({ domain: undefined }))],
  play: async () => {
    const flyout = await openFlyout()
    await within(flyout).findByText(":6006")
  }
}

/** Another project open too, with its own Storybook: each project has its own group, the active tab's first. */
export const TwoProjects: Story = {
  loaders: [
    () =>
      runningWith(
        storybook(),
        {
          id: "builder:D:/projects/dashboard",
          kind: "builder",
          shape: "server",
          name: "Vite",
          projectId: "D:/projects/dashboard",
          project: "dashboard",
          status: "running",
          startedAt: ago(47),
          pid: 3,
          url: "http://localhost:51832",
          startedBy: "parity",
          canStop: false,
          canRestart: false
        },
        storybook({
          id: "storybook:D:/projects/dashboard",
          projectId: "D:/projects/dashboard",
          project: "dashboard",
          pid: 24_018,
          url: "http://localhost:6007",
          domain: "https://storybook.dashboard.localhost",
          startedAt: ago(33)
        })
      )
  ],
  play: async () => {
    await openFlyout()
  }
}

/** The flyout in the light theme. */
export const Light: Story = {
  ...Open,
  globals: { theme: "light" }
}
