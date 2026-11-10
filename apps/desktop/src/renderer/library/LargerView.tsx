import { Badge, Button } from "@buildkitgg/shadcn-baseui-kit"
import { type ConnectorInfo, creditOf, type Found, labelOf, sizeOf } from "@parity-app/connectors"
import { Check, ChevronLeft, ChevronRight, ExternalLink, Monitor, Smartphone, X } from "lucide-react"
import { useEffect, useRef } from "react"
import { IconButton } from "../chrome/IconButton.tsx"
import { ResultPicture } from "./ResultPicture.tsx"
import { PickedMark } from "./ResultsGrid.tsx"

interface LargerViewProps {
  library: ConnectorInfo
  found: Found
  results: Found[]
  picked: boolean
  pickable: boolean
  isPicked: (found: Found) => boolean
  onClose: () => void
  onStep: (by: number) => void
  onView: (id: string) => void
  onToggle: () => void
}

/**
 * A result as large as the browser allows, in place of the search and its results. Its bar names it, opens it at the
 * source and picks it, and a strip of every result runs under it, so what's before and after is in view.
 */
export function LargerView({
  library,
  found,
  results,
  picked,
  pickable,
  isPicked,
  onClose,
  onStep,
  onView,
  onToggle
}: LargerViewProps) {
  const name = creditOf(found)

  return (
    <section aria-label={name} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b p-3">
        <h3 className="shrink-0 pl-1 text-sm font-medium">{name}</h3>
        {found.platform ? (
          <Badge variant="secondary">
            {found.platform === "ios" ? <Smartphone /> : <Monitor />} {found.platform === "ios" ? "iOS" : "Web"}
          </Badge>
        ) : (
          <span className="truncate text-sm text-muted-foreground">{found.title}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => window.open(found.link, "_blank")}>
            <ExternalLink /> Open in {library.name}
          </Button>
          {pickable && (
            <Button variant={picked ? "secondary" : "outline"} size="sm" aria-pressed={picked} onClick={onToggle}>
              {picked && <Check />} {picked ? "Picked" : "Pick"}
            </Button>
          )}
          <IconButton label="Close" shortcut="Esc" size="icon" onClick={onClose}>
            <X />
          </IconButton>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 bg-muted/40 p-4 dark:bg-muted/20">
        <IconButton label="Previous" shortcut="←" size="icon" onClick={() => onStep(-1)}>
          <ChevronLeft />
        </IconButton>
        <Stage key={found.id} found={found} />
        <IconButton label="Next" shortcut="→" size="icon" onClick={() => onStep(1)}>
          <ChevronRight />
        </IconButton>
      </div>
      <Filmstrip results={results} current={found.id} isPicked={isPicked} onView={onView} />
    </section>
  )
}

/** The result itself, as large as the space allows. A video plays, without sound, with the browser's own controls. */
function Stage({ found }: { found: Found }) {
  const { width, height } = sizeOf(found)

  if (found.video) {
    return (
      <div className="flex h-full min-w-0 flex-1 items-center justify-center">
        <video
          src={found.video.url}
          poster={found.image.url}
          muted
          autoPlay
          loop
          playsInline
          controls
          aria-label={labelOf(found)}
          className="max-h-full max-w-full rounded-lg border shadow-md"
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-1 items-center justify-center">
      <ResultPicture
        found={found}
        className="rounded-lg border shadow-md"
        // Wide pictures fill the width; square and tall ones the height.
        style={width / height > 1.3 ? { width: "100%", maxWidth: 820 } : { height: "100%" }}
      />
    </div>
  )
}

/** Every result in a row under the one shown larger: the current one outlined, the picked ones checked. */
function Filmstrip({
  results,
  current,
  isPicked,
  onView
}: Pick<LargerViewProps, "results" | "isPicked" | "onView"> & { current: string }) {
  const strip = useRef<HTMLUListElement>(null)

  // Keeps the current one in the middle of the strip as the arrows move through.
  useEffect(() => {
    strip.current?.querySelector("[aria-current]")?.scrollIntoView({ inline: "center", block: "nearest" })
  }, [current])

  return (
    <ul ref={strip} aria-label="All results" className="flex shrink-0 gap-2 overflow-x-auto border-t p-3">
      {results.map((each) => (
        <li key={each.id} className="relative shrink-0">
          <button
            type="button"
            aria-label={labelOf(each)}
            aria-current={each.id === current ? "true" : undefined}
            onClick={() => onView(each.id)}
            className="block rounded-md opacity-60 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current]:opacity-100 aria-[current]:ring-2 aria-[current]:ring-foreground aria-[current]:ring-offset-2 aria-[current]:ring-offset-popover"
          >
            <ResultPicture found={each} small className="rounded-md border" style={{ height: 64 }} />
          </button>
          {isPicked(each) && <PickedMark small />}
        </li>
      ))}
    </ul>
  )
}
