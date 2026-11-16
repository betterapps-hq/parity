import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@buildkitgg/shadcn-baseui-kit"
import { type ProjectImage, removalOf } from "@parity-app/editor"
import { type MediaLayers, MediaUses } from "./MediaUses.tsx"

interface RemoveMediaDialogProps {
  /** The one being removed; the dialog is closed without one. */
  image: ProjectImage | undefined
  onClose: () => void
  onShow: (layers: MediaLayers) => void
  onRemove: (image: ProjectImage) => void
}

/**
 * Removing one something still uses: where it's used, each design with Show, and what removing it takes. One only
 * designs use goes with its layers. One the project's code names stays until the code changes, since Parity doesn't
 * edit a person's code for them.
 */
export function RemoveMediaDialog({ image, onClose, onShow, onRemove }: RemoveMediaDialogProps) {
  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      {image && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{titleOf(image)}</DialogTitle>
          </DialogHeader>
          <MediaUses
            image={image}
            onShow={onShow}
            className="max-h-64 overflow-y-auto rounded-md border py-1 pr-1.5 pl-3 text-sm"
          />
          {removalOf(image) === "code" ? (
            <>
              <p className="text-sm text-muted-foreground">Remove or replace it in the code first.</p>
              <DialogFooter>
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => onRemove(image)}>
                {actionOf(image)}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}

function titleOf(image: ProjectImage): string {
  if (image.kind === "linked") {
    return `${image.name} is linked from ${image.credit?.source ?? "outside the project"}`
  }

  return image.kind === "missing" ? `${image.name} has no file` : `${image.name} is still in use`
}

/** The button that removes it, saying what goes: "Remove file and 3 layers". */
function actionOf(image: ProjectImage): string {
  const count = image.usedBy.length
  const layers = count === 1 ? "1 layer" : `${count} layers`

  return removalOf(image) === "file-and-layers" ? `Remove file and ${layers}` : `Remove ${layers}`
}
