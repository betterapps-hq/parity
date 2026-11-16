/**
 * Who's driving a run, and the tags that say so on every event, span and replay (PAR-630): a test pass's `test_run`, and
 * whether a person or an agent is at the controls, with the agent's caller name (PAR-450) and client.
 */

/** An agent that called the app: its name as it declared it, the id that tells same-named ones apart, and its client. */
export interface AgentCaller {
  name: string
  id: string
  /** The program it calls through, such as `claude-code` or `codex`, when it says. */
  client?: string | undefined
}

export type Driver = { kind: "person" } | { kind: "agent"; caller: AgentCaller }

/** The variables that name a test pass and a tester. */
export interface RunVariables {
  /** Set by CI, an agent or `pnpm perf` for one pass, so its events group together. */
  PARITY_TEST_RUN?: string | undefined
  /** The tester's name, shown as Sentry's user. */
  PARITY_TESTER?: string | undefined
}

/** A variable's value, or nothing when it's unset or blank. */
function given(value: string | undefined): string | undefined {
  return value?.trim() || undefined
}

/** The tags a whole run carries: its test pass, when one is named. */
export function runTags(variables: RunVariables): Record<string, string> {
  const testRun = given(variables.PARITY_TEST_RUN)

  return testRun ? { test_run: testRun } : {}
}

/**
 * The tags for who's driving. A person's events clear the agent's, since Sentry's scope keeps a tag until it's
 * replaced, so each names `undefined` where it has nothing.
 */
export function driverTags(driver: Driver): Record<"driver" | "agent" | "agent_client", string | undefined> {
  if (driver.kind === "person") {
    return { driver: "person", agent: undefined, agent_client: undefined }
  }

  return { driver: "agent", agent: driver.caller.name, agent_client: driver.caller.client }
}

/** Sentry's user: the install, named by the tester when set, else by the agent driving. */
export function telemetryUser(
  installId: string,
  variables: RunVariables,
  driver: Driver
): { id: string; username?: string } {
  const username = given(variables.PARITY_TESTER) ?? (driver.kind === "agent" ? driver.caller.id : undefined)

  return username ? { id: installId, username } : { id: installId }
}

/**
 * Follows who's driving as a session goes from a person to an agent and back. An agent drives from its call until a
 * person acts, or until `agentForMs` passes without another call, since a person's pointer isn't always seen.
 */
export function createDriverTracker({
  agentForMs = 10_000,
  now = () => Date.now(),
  onChange
}: {
  agentForMs?: number
  now?: () => number
  /** Called when who's driving changes, with who it is now. */
  onChange?: (driver: Driver) => void
} = {}) {
  let driver: Driver = { kind: "person" }
  let lastCall = 0

  const set = (next: Driver) => {
    const same =
      next.kind === driver.kind &&
      (next.kind === "person" ||
        (driver.kind === "agent" &&
          driver.caller.id === next.caller.id &&
          driver.caller.name === next.caller.name &&
          driver.caller.client === next.caller.client))

    driver = next

    if (!same) {
      onChange?.(driver)
    }
  }

  return {
    /** An agent called the app. */
    agentCalled(caller: AgentCaller): void {
      lastCall = now()
      set({ kind: "agent", caller })
    },
    /** A person typed, clicked or otherwise used the app. */
    personActed(): void {
      set({ kind: "person" })
    },
    /** Who's driving now. */
    current(): Driver {
      if (driver.kind === "agent" && now() - lastCall >= agentForMs) {
        set({ kind: "person" })
      }

      return driver
    }
  }
}

export type DriverTracker = ReturnType<typeof createDriverTracker>
