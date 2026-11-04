import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { agentFilePath, readAgentConnection, releaseAgentFile } from "@parity-app/agent/connection"

/**
 * Lets go of the agent file as this copy quits (PAR-280). The service writes it, but quitting ends the service outright,
 * before it could clean up, so the main process does. It leaves a file naming another copy alone, gives one this copy
 * took over back to the copy it took it from while that's still running, and otherwise removes it.
 */
export function releaseAgentConnection(): void {
  const file = agentFilePath(process.env, homedir())
  let text: string
  try {
    text = readFileSync(file, "utf8")
  } catch {
    return
  }
  const release = releaseAgentFile(readAgentConnection(text), process.pid, (connection) => running(connection.app))
  if (release.kind === "remove") rmSync(file, { force: true })
  else if (release.kind === "restore") writeFileSync(file, JSON.stringify(release.write, null, 2), { mode: 0o600 })
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // A process the person's account can't signal is still running.
    return error instanceof Error && "code" in error && error.code === "EPERM"
  }
}
