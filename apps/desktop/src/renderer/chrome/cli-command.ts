import { reportError } from "../report-error.ts"
import { notify } from "../toasts.tsx"

/**
 * Help > Install the Parity CLI (PAR-906): main puts a `parity` command on PATH that runs the CLI shipped with the
 * app, and this says what a terminal needs to find it.
 */
export async function installCliCommand(): Promise<void> {
  try {
    const { folder, onPath, newTerminal } = await window.canvasHost.installCli()

    if (!onPath) {
      notify.done("Installed the Parity CLI", { description: `Add ${folder} to your PATH to run it.` })
    } else if (newTerminal) {
      notify.done("Installed the Parity CLI", { description: "Open a new terminal to run it." })
    } else {
      notify.done("Installed the Parity CLI")
    }
  } catch (error) {
    reportError(error, { operation: "cli.install", title: "Couldn't install the Parity CLI" })
  }
}
