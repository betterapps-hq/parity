import { Button } from "@buildkitgg/shadcn"
import type { OfferedLibrary } from "./offeredLibraries.ts"

export type Step = "browse" | "settings" | "remove"

/** The footer's buttons: Remove for a library the project has, then Add, or Next to its settings and Add from there. */
export function DetailActions({
  library,
  step,
  changed,
  onStep,
  onAdd
}: {
  library: OfferedLibrary
  step: Exclude<Step, "remove">
  changed: boolean
  onStep: (step: Step) => void
  onAdd: () => void
}) {
  if (step === "settings") {
    return (
      <>
        <Button key="back" variant="ghost" onClick={() => onStep("browse")}>
          Back
        </Button>
        <Button disabled={library.installed && !changed} onClick={onAdd}>
          {library.installed ? "Apply" : `Add ${library.name}`}
        </Button>
      </>
    )
  }

  const remove = library.installed && (
    <Button key="remove" variant="ghost" className="text-destructive" onClick={() => onStep("remove")}>
      Remove
    </Button>
  )

  if (library.settings) {
    return (
      <>
        {remove}
        <Button onClick={() => onStep("settings")}>{library.installed ? "Change" : "Next"}</Button>
      </>
    )
  }

  return (
    <>
      {remove}
      <Button disabled={library.installed} onClick={onAdd}>
        {library.installed ? "Added" : `Add ${library.name}`}
      </Button>
    </>
  )
}
