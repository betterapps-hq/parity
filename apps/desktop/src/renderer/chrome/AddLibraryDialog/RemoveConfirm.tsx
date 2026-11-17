import { Button } from "@buildkitgg/shadcn"
import type { OfferedLibrary } from "./offeredLibraries.ts"

export function RemoveConfirm({
  library,
  onCancel,
  onRemove
}: {
  library: OfferedLibrary
  onCancel: () => void
  onRemove: () => void
}) {
  return (
    <>
      <p className="min-w-0 flex-1 text-sm">
        Remove {library.name} from the project?{" "}
        <span className="text-muted-foreground">This uninstalls {library.package}.</span>
      </p>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={onRemove}>
        Remove
      </Button>
    </>
  )
}
