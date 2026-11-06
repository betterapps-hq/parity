import { Button, Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import {
  BookOpen,
  CircleAlert,
  Component,
  Diamond,
  EyeOff,
  FileCode,
  LoaderCircle,
  Plug,
  Plus,
  RefreshCw,
  Server,
  SquareDashed
} from "lucide-react"
import { type CSSProperties, type ReactElement, type ReactNode, useState } from "react"
import type { PreviewImage } from "../../shared/protocol.ts"
import { kindColors } from "../canvas/kinds.tsx"
import type { PreviewState } from "../component-previews.ts"
import { Hint } from "./Hint.tsx"
import type { useHoverCard } from "./hover-card.ts"
import { isProblem, type PreviewStatus, previewStatus, statusWords } from "./preview-status.ts"

/** The picture's box on the card, in CSS pixels: the card's width less its padding, and at most this tall. */
const stageWidth = 304
const stageHeight = 176
/** The least a made picture's box is, and the margin round the picture in it. */
const lowest = 96
const margin = 24
/** How many of a variant's options the card shows as small pictures; the rest are counted. */
const shownOptions = 5

/** One option of a component's variant on its card, with its own preview, made when the card first opens. */
export interface CardVariant {
  value: string | number | boolean
  preview: PreviewState | undefined
}

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
  /** The props it requires that its sample doesn't give, which say why its preview fails or draws nothing. */
  missing?: readonly string[]
  /** How it last drew on the canvas, when it failed there. */
  status?: string
  /** A prop whose options are shown as small pictures under the large one, as a button's `variant`. */
  variants?: { prop: string; options: CardVariant[] }
  /** How many times the project's designs place it. */
  uses?: number
  /** How many stories the project's Storybook has of it. */
  stories?: number
  /** Inserts it where the selection is; none where something else inserts, as Enter in the insert picker does. */
  onInsert?: () => void
  /** Opens its file in the person's editor; none for a component without one. */
  onOpenFile?: () => void
  /** Opens its stories in Storybook; none for a component without any. */
  onOpenStorybook?: () => void
  /** Something else pressing or dragging it does, said last. */
  actions?: ReactNode
}

/**
 * A component's card: its preview, large, on the project's own background, small previews of its variants, then its
 * name, where it's from, how often it's used and its stories, and a bar with what to do with it (PAR-208). It's the
 * panel's surface, a step up from the panel in either theme, so the pictures are the only things on it in the project's
 * colors (PAR-515).
 */
export function ComponentCard({
  name,
  path,
  instance,
  note,
  preview,
  missing,
  status,
  variants,
  uses,
  stories,
  onInsert,
  onOpenFile,
  onOpenStorybook,
  actions
}: ComponentCardProps) {
  const [shown, setShown] = useState<CardVariant>()
  const slash = name.lastIndexOf("/")
  const from = slash > 0 ? name.slice(0, slash) : undefined
  const own = name.slice(slash + 1)
  const Icon = instance ? Diamond : Component
  const main = previewStatus(preview, missing)
  // A variant's picture takes the stage while it's pointed at, until it has one of its own to show.
  const variant = shown && previewStatus(shown.preview)
  const stage = variant && (variant.kind === "made" || variant.kind === "updating") ? variant : main
  const drawn = main.kind === "made" || main.kind === "updating"
  const facts = [
    uses !== undefined && (uses === 0 ? "Not used yet" : `Used ${uses} ${uses === 1 ? "time" : "times"}`),
    stories !== undefined && stories > 0 && `${stories} ${stories === 1 ? "story" : "stories"}`
  ].filter(Boolean)
  const bar = onInsert || onOpenFile || onOpenStorybook
  return (
    <div className="flex flex-col">
      <div className="p-2 pb-0">
        <PreviewStage status={stage} />
      </div>
      {drawn && variants && variants.options.length > 1 && (
        <div className="flex flex-col gap-1 px-3 pt-2" onPointerLeave={() => setShown(undefined)}>
          <span className="text-[11px] text-muted-foreground">{variants.prop}</span>
          <div className="flex gap-1">
            {variants.options.slice(0, shownOptions).map((option) => {
              const label = String(option.value)
              return (
                <Hint key={label} label={label}>
                  <button
                    type="button"
                    aria-label={`${variants.prop} ${label}`}
                    aria-pressed={shown?.value === option.value}
                    onPointerEnter={() => setShown(option)}
                    onFocus={() => setShown(option)}
                    onBlur={() => setShown(undefined)}
                    className="flex rounded-md outline-offset-1 aria-pressed:outline-2 aria-pressed:outline-(--canvas-component)"
                  >
                    <PreviewThumb status={previewStatus(option.preview)} width={48} height={30} />
                  </button>
                </Hint>
              )
            })}
            {variants.options.length > shownOptions && (
              <span className="grid h-[30px] w-9 place-items-center rounded-md bg-muted text-[11px] text-muted-foreground">
                +{variants.options.length - shownOptions}
              </span>
            )}
          </div>
        </div>
      )}
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
        {facts.length > 0 && (
          <span className="flex gap-3 text-[11px] text-muted-foreground">
            {facts.map((fact) => (
              <span key={String(fact)}>{fact}</span>
            ))}
          </span>
        )}
        {status && (
          <span className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            {status}
          </span>
        )}
      </div>
      {actions && <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">{actions}</div>}
      {bar && (
        <div className="flex items-center gap-1 border-t px-2 py-1.5">
          {onInsert && (
            <Button size="sm" className="h-7 text-xs" onClick={onInsert}>
              <Plus /> Insert
            </Button>
          )}
          {onOpenFile && (
            <Hint label="Open file">
              <Button size="icon" variant="ghost" className="size-7" aria-label="Open file" onClick={onOpenFile}>
                <FileCode />
              </Button>
            </Hint>
          )}
          {onOpenStorybook && (
            <Hint label="Open in Storybook">
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Open in Storybook"
                onClick={onOpenStorybook}
              >
                <BookOpen />
              </Button>
            </Hint>
          )}
        </div>
      )}
    </div>
  )
}

/** The icon each status without a picture shows, on the panel's fill. */
const statusIcons: Partial<Record<PreviewStatus["kind"], typeof CircleAlert>> = {
  failed: CircleAlert,
  "needs-props": SquareDashed,
  "needs-provider": Plug,
  "server-only": Server,
  "draws-nothing": EyeOff
}

/** The color a problem's words and icon take: red for a failure, amber for what a person can give it. */
export const statusTones: Partial<Record<PreviewStatus["kind"], string>> = {
  failed: "text-destructive",
  "needs-props": "text-(--process-starting)",
  "needs-provider": "text-(--process-starting)"
}

/**
 * The picture's box. A made picture sits on the project's page as it was drawn there, light or dark, framed so its edge
 * shows on a card of the same shade; anything else sits on the card's own muted fill with what it is in words, so a
 * placeholder never passes for a picture.
 */
function PreviewStage({ status }: { status: PreviewStatus }) {
  const box = "flex items-center justify-center overflow-hidden rounded-md"
  if (status.kind === "made" || status.kind === "updating") {
    const { image } = status
    const updating = status.kind === "updating"
    // At half its pixels, so it's sharp on a 2x screen, and never larger than the box less its margin.
    const scale = Math.min(1, stageWidth / (image.width / 2), (stageHeight - margin) / (image.height / 2))
    // The box fits the picture with a margin round it, so a small part isn't lost in a large white page.
    const height = Math.max(lowest, Math.min(stageHeight, (image.height / 2) * scale + margin))
    return (
      <div
        className={`${box} relative ring-1 ring-border ring-inset`}
        style={{ height, ...pageOf(image, image.large, stageWidth, stageHeight) }}
      >
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
  if (status.kind === "waiting" || status.kind === "making") {
    const making = status.kind === "making"
    return (
      <div className={`${box} gap-1.5 bg-muted text-xs text-muted-foreground`} style={{ height: lowest }}>
        {making && <LoaderCircle className="size-3.5 animate-spin" />}
        {statusWords[status.kind].long}
      </div>
    )
  }
  const Icon = statusIcons[status.kind] ?? CircleAlert
  const tone = statusTones[status.kind] ?? "text-muted-foreground"
  return (
    <div
      className={`${box} flex-col gap-1.5 px-4 py-3 text-center ${status.kind === "failed" ? "bg-destructive/10" : "bg-muted"}`}
      style={{ minHeight: lowest }}
    >
      <Icon className={`size-4 ${tone}`} />
      <span className={`text-xs ${tone}`}>{statusWords[status.kind].long}</span>
      {status.needs && status.needs.length > 0 && (
        <span className="font-mono text-[11px] text-muted-foreground">{status.needs.join(", ")}</span>
      )}
      {status.error && (
        <span className="line-clamp-3 font-mono text-[11px] break-all text-muted-foreground">{status.error}</span>
      )}
    </div>
  )
}

/**
 * A small picture of a component, for a row, a tile or the insert picker: its thumbnail on the page it was drawn on,
 * dimmed with a mark while it's updating; a shimmer while it's drawn; or an icon for why it has none. It says nothing
 * to a screen reader, as the words beside it say what it is. `fill` stretches it to its container's width in its
 * shape, as a grid's tiles are.
 */
export function PreviewThumb({
  status,
  width,
  height,
  fill = false
}: {
  status: PreviewStatus
  width: number
  height: number
  fill?: boolean
}) {
  const box = "relative grid shrink-0 place-items-center overflow-hidden rounded-[5px]"
  const size: CSSProperties = fill ? { width: "100%", aspectRatio: `${width} / ${height}` } : { width, height }
  if (status.kind === "made" || status.kind === "updating") {
    const { image } = status
    const room = 4
    const scale = Math.min(1, (width - room) / (image.width / 2), (height - room) / (image.height / 2))
    return (
      <span
        aria-hidden
        className={`${box} ring-1 ring-border ring-inset`}
        style={{ ...size, ...pageOf(image, image.thumb, width, height) }}
      >
        <img
          src={image.thumb}
          alt=""
          width={Math.max(1, (image.width / 2) * scale)}
          height={Math.max(1, (image.height / 2) * scale)}
          decoding="async"
          loading="lazy"
          className={`max-h-full max-w-full object-contain ${status.kind === "updating" ? "opacity-40" : ""}`}
        />
        {status.kind === "updating" && (
          <span className="absolute top-0.5 right-0.5 grid size-3.5 place-items-center rounded-full bg-popover/90 text-muted-foreground">
            <RefreshCw className="size-2.5" />
          </span>
        )}
      </span>
    )
  }
  if (status.kind === "making") {
    return (
      <span
        aria-hidden
        data-process-motion
        className={box}
        style={{
          ...size,
          background:
            "linear-gradient(100deg, var(--muted) 30%, color-mix(in oklch, var(--muted), var(--foreground) 10%) 50%, var(--muted) 70%) 0 0 / 200% 100%",
          animation: "process-shimmer 1.6s linear infinite"
        }}
      />
    )
  }
  const Icon = statusIcons[status.kind]
  const dashed = status.kind === "needs-props" ? "border border-dashed border-muted-foreground/40" : ""
  return (
    <span aria-hidden className={`${box} bg-muted ${dashed}`} style={size}>
      {Icon && <Icon className={`size-3.5 ${statusTones[status.kind] ?? "text-muted-foreground"}`} />}
    </span>
  )
}

/** What a component's row or tile says under its name: why it has no picture, when that's a problem. */
export function StatusLine({ status }: { status: PreviewStatus }) {
  if (!isProblem(status) || status.kind === "made") return null
  return (
    <span className={`truncate text-[11px] ${statusTones[status.kind] ?? "text-muted-foreground"}`}>
      {statusWords[status.kind].short}
    </span>
  )
}

/**
 * The page a picture was drawn on, in the mode matching Parity's theme, light or dark (PAR-521): its top left pixel,
 * which is in the room round the component, drawn larger than the box so it fills it. Nothing else says the page's
 * color, and the picture is already loaded for the box.
 */
function pageOf(image: PreviewImage, src: string, width: number, height: number): CSSProperties {
  return {
    backgroundImage: `url("${src}")`,
    backgroundSize: `${image.width * width}px ${image.height * height}px`,
    backgroundRepeat: "no-repeat"
  }
}

/**
 * A component's card beside its row, opened by resting the pointer on the row or by the right arrow key, as a token's
 * is: the same width, side and gap, and the same hover card, so moving down a list doesn't open one per row and moving
 * onto the card keeps it.
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
