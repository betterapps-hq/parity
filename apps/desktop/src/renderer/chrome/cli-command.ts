import { toast } from "sonner"
import { reportError } from "../report-error.ts"

/**
 * Help > Install the parity command (PAR-906): main puts a `parity` command on PATH that runs the CLI shipped with the
 * app, and this says what a terminal needs to find it.
 */
export async function installCliCommand(): Promise<void> {
  try {
    const { folder, onPath, newTerminal } = await window.canvasHost.installCli()

    if (!onPath) {
      toast.success("Installed the parity command", { description: `Add ${folder} to your PATH to run it.` })
    } else if (newTerminal) {
      toast.success("Installed the parity command", { description: "Open a new terminal to run it." })
    } else {
      toast.success("Installed the parity command")
    }
  } catch (error) {
    reportError(error, {
      operation: "cli.install",
      title: "Couldn't install the parity command",
      description: (error instanceof Error ? error.message : String(error)).replace(
        /^Error invoking remote method '[^']+': (Error: )?/,
        ""
      )
    })
  }
}
