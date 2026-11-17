import { Ruler } from "lucide-react"
import type { ShownPreview } from "./offeredLibraries.ts"
import { SectionHeading } from "./SectionHeading.tsx"

/**
 * The breakpoints on a ruler from nothing to the widest, each a tick where its width falls. Each one's name and width
 * end at its tick, on a line of their own above the ruler and over any tick that passes behind, so ticks close
 * together never put one label over another, and a longer label always means a wider breakpoint.
 */
export function Breakpoints({ breakpoints }: { breakpoints: ShownPreview["breakpoints"] }) {
  if (breakpoints.length === 0) {
    return null
  }

  const sorted = breakpoints.toSorted((first, second) => first.width - second.width)
  const widest = sorted.at(-1)!.width
  const row = 24

  return (
    <section aria-labelledby="library-breakpoints" className="mx-6 mt-8">
      <SectionHeading id="library-breakpoints" icon={Ruler} title="Breakpoints" count={breakpoints.length} />
      <ol className="relative mt-3 border-b border-foreground/40" style={{ height: sorted.length * row + 8 }}>
        {sorted.map((breakpoint, index) => {
          const share = (breakpoint.width / widest) * 100
          const top = index * row

          return (
            <li key={breakpoint.id}>
              <span
                aria-hidden
                className="absolute bottom-0 w-px bg-foreground/40"
                style={{ left: `calc(${share}% - 1px)`, top: top + 8 }}
              />
              <span
                className="absolute left-0 flex justify-end text-xs whitespace-nowrap"
                style={{ width: `${share}%`, top }}
              >
                <span className="flex min-w-0 items-baseline gap-1.5 bg-popover pr-2">
                  <span title={breakpoint.name} className="min-w-0 truncate">
                    {breakpoint.name}
                  </span>
                  <span className="text-muted-foreground tabular-nums">{breakpoint.width}px</span>
                </span>
              </span>
            </li>
          )
        })}
      </ol>
      <div className="mt-1 flex justify-between text-2xs text-muted-foreground tabular-nums">
        <span>0px</span>
        <span>{widest}px</span>
      </div>
    </section>
  )
}
