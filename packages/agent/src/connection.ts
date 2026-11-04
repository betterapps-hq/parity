import { join } from "node:path"

/**
 * What a running Parity writes to the agent file, where the CLI and MCP find it: its address, its per-launch token and
 * which copy of the app it is. Two copies can run at once (the person's app beside `pnpm perf` or a session's dev copy),
 * and the file names one of them.
 */
export interface AgentConnection {
  url: string
  token: string
  /** The project service's process, which answers agents. */
  pid: number
  /** The app's main process: which copy wrote the file. A service the app restarts is the same copy. */
  app: number
  /** The connection this copy took over when asked to, which it gives back when it quits. */
  previous?: AgentConnection
}

/** The agent file: `PARITY_AGENT_FILE`, or `~/.parity/agent.json`. */
export function agentFilePath(env: Record<string, string | undefined>, home: string): string {
  return env.PARITY_AGENT_FILE || join(home, ".parity", "agent.json")
}

/** Whether this copy was asked to take agents from a copy that's already running: `PARITY_AGENT_TAKE_OVER=1`. */
export function asksToTakeOver(env: Record<string, string | undefined>): boolean {
  return env.PARITY_AGENT_TAKE_OVER === "1"
}

/** Reads the agent file's text, or nothing when it's missing or isn't a connection. */
export function readAgentConnection(text: string | undefined): AgentConnection | undefined {
  if (text === undefined) return undefined
  try {
    return connectionFrom(JSON.parse(text))
  } catch {
    return undefined
  }
}

function connectionFrom(value: unknown): AgentConnection | undefined {
  if (!value || typeof value !== "object") return undefined
  const fields = new Map<string, unknown>(Object.entries(value))
  const [url, token, pid, app] = ["url", "token", "pid", "app"].map((key) => fields.get(key))
  if (typeof url !== "string" || typeof token !== "string" || typeof pid !== "number") return undefined
  // A file from before copies were told apart names only the service, which stands for its copy.
  const connection: AgentConnection = { url, token, pid, app: typeof app === "number" ? app : pid }
  const before = connectionFrom(fields.get("previous"))
  return before ? { ...connection, previous: before } : connection
}

/** The file's connection, then the ones it took over, newest first: the order to look for a running copy in. */
export function connectionChain(current: AgentConnection | undefined): AgentConnection[] {
  const chain: AgentConnection[] = []
  for (let entry = current; entry; entry = entry.previous) chain.push(entry)
  return chain
}

/** Where a copy is, without what it took over. */
function alone({ url, token, pid, app }: AgentConnection): AgentConnection {
  return { url, token, pid, app }
}

/** Whether a starting copy takes the agent file, and what it writes there. */
export type Claim =
  | { kind: "take"; write: AgentConnection }
  | { kind: "leave"; owner: AgentConnection; write?: AgentConnection }

/**
 * What a starting copy does with the agent file. It takes the file when no other copy is running, and when the copy
 * named is itself (a restarted service). It leaves a running copy's file alone unless asked to take over, and then keeps
 * that copy in the file, to give back when it quits. A file naming a copy that's gone, over one still running, goes back
 * to the running one.
 *
 * @param current What the agent file holds.
 * @param running The first connection in the file's chain whose copy answers, if any.
 * @param mine This copy's connection.
 * @param takeOver Whether this copy was asked to take agents from a running copy.
 */
export function claimAgentFile(options: {
  current: AgentConnection | undefined
  running: AgentConnection | undefined
  mine: AgentConnection
  takeOver: boolean
}): Claim {
  const { current, running, takeOver } = options
  const mine = alone(options.mine)
  if (current?.app === mine.app) return { kind: "take", write: withPrevious(mine, current.previous) }
  if (!running) return { kind: "take", write: mine }
  if (running.app === mine.app) return { kind: "take", write: withPrevious(mine, running.previous) }
  if (takeOver) return { kind: "take", write: { ...mine, previous: running } }
  if (running.token === current?.token) return { kind: "leave", owner: running }
  return { kind: "leave", owner: running, write: running }
}

function withPrevious(connection: AgentConnection, previous: AgentConnection | undefined): AgentConnection {
  return previous ? { ...connection, previous } : connection
}

/** What a quitting copy does with the agent file. */
export type Release = { kind: "keep" } | { kind: "remove" } | { kind: "restore"; write: AgentConnection }

/**
 * What a quitting copy does with the agent file. It keeps a file that names another copy, and gives one naming itself
 * back to the first copy it took over that's still running, or removes it when none is.
 *
 * @param current What the agent file holds.
 * @param app The quitting copy's main process.
 * @param isRunning Whether a copy's app is still running.
 */
export function releaseAgentFile(
  current: AgentConnection | undefined,
  app: number,
  isRunning: (connection: AgentConnection) => boolean
): Release {
  if (current?.app !== app) return { kind: "keep" }
  const back = connectionChain(current.previous).find((entry) => entry.app !== app && isRunning(entry))
  return back ? { kind: "restore", write: back } : { kind: "remove" }
}
