import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { CircleAlert, Component, Diamond, LoaderCircle } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import { kindColors } from "../canvas/kinds.tsx"
import type { PreviewState } from "../component-previews.ts"
import type { useHoverCard } from "./hover-card.ts"

/** The picture's box on the card, in CSS pixels: the card's width less its padding, and at most this tall. */
const stageWidth = 304
const stageHeight = 176
/** The least a made picture's box is, and the margin round the picture in it. */
const lowest = 96
const margin = 24

export interface ComponentCardProps {
  /** Its name in the panel, as `nova/InputGroupText`: the part before the last slash is where it's from. */
  name: string
  /** Its file in the project, when it's the project's own or a kit's. */
  path?: string
  /** An instance of a library's component rather than the project's own. */
  instance?: boolean
  /** Something about how it's listed, as "listed by hand". */
  note?: string
  /** Its preview, or none while the project's previews are first looked up. */
  preview: PreviewState | undefined
  /** How it last drew on the canvas, when it failed there. */
  status?: string
  /** What pressing or dragging it does, said last. */
  actions?: ReactNode
}

/**
 * A component's card: its preview, large, on the project's own background, and under it its name, where it's from and
 * what to do with it. It's the panel's surface, a step up from the panel in either theme, so the picture is the only
 * thing on it in the project's colors (PAR-515).
 */
export function ComponentCard({ name, path, instance, note, preview, status, actions }: ComponentCardProps) {
  const slash = name.lastIndexOf("/")
  const from = slash > 0 ? name.slice(0, slash) : undefined
  const own = name.slice(slash + 1)
  const Icon = instance ? Diamond : Component
  return (
    <div className="flex flex-col">
      <div className="p-2 pb-0">
        <PreviewStage preview={preview} />
      </div>
      <div className="flex flex-col gap-0.5 px-3 pt-2.5 pb-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className="size-3.5 shrink-0" style={{ color: kindColors.component }} />
          <span className="min-w-0 truncate text-sm font-medium">{own}</span>
          {from && <span className="shrink-0 text-xs text-muted-foreground">{from}</span>}
        </div>
        {path && <span className="truncate font-mono text-[11px] text-muted-foreground">{path}</span>}
        {note && (
          <span className="text-[11px] text-muted-foreground">{note.charAt(0).toUpperCase() + note.slice(1)}</span>
        )}
        {status && (
          <span className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            {status}
          </span>
        )}
      </div>
      {actions && <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">{actions}</div>}
    </div>
  )
}

/**
 * The picture's box. A made picture sits on the project's page as it was drawn there, framed so its edge shows on a
 * light card too; anything else sits on the card's own muted fill, so a placeholder never passes for a picture.
 */
function PreviewStage({ preview }: { preview: PreviewState | undefined }) {
  const box = "flex items-center justify-center overflow-hidden rounded-md"
  if (preview?.state === "failed") {
    return (
      <div className={`${box} flex-col gap-1.5 bg-destructive/10 px-4 py-3 text-center`} style={{ minHeight: lowest }}>
        <CircleAlert className="size-4 text-destructive" />
        <span className="text-xs text-destructive">Its preview fails to draw</span>
        <span className="line-clamp-3 font-mono text-[11px] break-all text-muted-foreground">{preview.error}</span>
      </div>
    )
  }
  const image = preview?.state === "made" ? preview.image : preview?.last
  if (!image) {
    const making = preview?.state === "making"
    return (
      <div className={`${box} gap-1.5 bg-muted text-xs text-muted-foreground`} style={{ height: lowest }}>
        {making && <LoaderCircle className="size-3.5 animate-spin" />}
        {making ? "Drawing its preview" : "Its preview is waiting its turn"}
      </div>
    )
  }
  const updating = preview?.state !== "made"
  // At half its pixels, so it's sharp on a 2x screen, and never larger than the box less its margin.
  const scale = Math.min(1, stageWidth / (image.width / 2), (stageHeight - margin) / (image.height / 2))
  // The box fits the picture with a margin round it, so a small part isn't lost in a large white page.
  const height = Math.max(lowest, Math.min(stageHeight, (image.height / 2) * scale + margin))
  return (
    <div className={`${box} relative bg-white ring-1 ring-border ring-inset`} style={{ height }}>
      <img
        src={image.large}
        alt=""
        width={(image.width / 2) * scale}
        height={(image.height / 2) * scale}
        decoding="async"
        className={updating ? "opacity-40" : undefined}
      />
      {updating && (
        <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-sm bg-popover/90 px-1.5 py-0.5 text-[11px] text-popover-foreground shadow-sm">
          <LoaderCircle className="size-3 animate-spin" />
          Updating
        </span>
      )}
    </div>
  )
}

/**
 * A component's card beside its row, opened by resting the pointer on the row, as a token's is: the same width, side
 * and gap, and the same hover card, so moving down a list doesn't open one per row and moving onto the card keeps it.
 */
export function ComponentPopover({
  card,
  children,
  ...props
}: ComponentCardProps & { card: ReturnType<typeof useHoverCard>; children: ReactElement }) {
  return (
    <Popover open={card.open} onOpenChange={card.setOpen}>
      {/* The row opens its card by resting on it or by a key; a click does what the row does instead. */}
      <PopoverTrigger render={children} onClick={(event) => event.preventBaseUIHandler()} />
      <PopoverContent
        className="w-80 p-0"
        align="start"
        side="right"
        sideOffset={12}
        id={card.id}
        initialFocus={card.takesFocus}
        finalFocus={card.returnFocus}
        onPointerEnter={card.stay}
        onPointerLeave={card.leave}
      >
        <ComponentCard {...props} />
      </PopoverContent>
    </Popover>
  )
}
