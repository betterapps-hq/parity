import { Badge } from "@buildkitgg/shadcn-baseui-kit"
import { ExternalLink } from "lucide-react"
import type { ReactNode } from "react"

/**
 * A screenshot a product publishes of its own panel, shown from where it's published (never copied into the repo),
 * cropped to the field it shows. `crop` is the box's left, top, right and bottom as fractions of `size`.
 */
export interface Shot {
  src: string
  size: readonly [number, number]
  crop?: readonly [number, number, number, number]
  caption: string
  /** The help article the screenshot is from. */
  href: string
}

/** How another editor builds a kind of field: its own screenshots, what it does, and where it says so. */
export interface Example {
  product: string
  /** What it does, a sentence each. */
  how: readonly string[]
  shots?: readonly Shot[]
  sources: readonly { label: string; href: string }[]
}

/** A screenshot cropped to its field, by percentages, so it scales with the card; clicking opens the whole picture. */
function Cropped({ shot }: { shot: Shot }) {
  const [width, height] = shot.size
  const [left, top, right, bottom] = shot.crop ?? [0, 0, 1, 1]
  const across = right - left
  const down = bottom - top
  return (
    <figure className="flex flex-col gap-1">
      <a
        href={shot.src}
        target="_blank"
        rel="noreferrer"
        aria-label={`${shot.caption}, the whole screenshot`}
        className="relative block w-full overflow-hidden rounded-md border bg-white"
        style={{ aspectRatio: `${across * width} / ${down * height}` }}
      >
        <img
          src={shot.src}
          alt={shot.caption}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute max-w-none"
          style={{ width: `${100 / across}%`, left: `${(-left / across) * 100}%`, top: `${(-top / down) * 100}%` }}
        />
      </a>
      <figcaption className="text-[11px] text-muted-foreground">
        {shot.caption}{" "}
        <a href={shot.href} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          Source
        </a>
      </figcaption>
    </figure>
  )
}

/**
 * Where a story shows how other editors build the same kind of field, under the control, so ours is held to theirs.
 * Screenshots are the products' own, loaded from their help centers; products whose help centers this machine can't
 * reach say what they do in words, with links.
 */
export function Inspiration({ examples, takeaway }: { examples: readonly Example[]; takeaway?: ReactNode }) {
  return (
    <section aria-label="How others do it" className="flex w-full flex-col gap-3">
      <h2 className="text-sm font-medium">How others do it</h2>
      {takeaway && <div className="max-w-3xl text-sm text-muted-foreground">{takeaway}</div>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] items-start gap-3">
        {examples.map((example) => (
          <article key={example.product} className="flex flex-col gap-3 rounded-lg border p-3">
            <Badge variant="secondary" className="self-start">
              {example.product}
            </Badge>
            {example.shots?.map((shot) => (
              <Cropped key={shot.src} shot={shot} />
            ))}
            <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-muted-foreground">
              {example.how.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {example.sources.map((source) => (
                <a
                  key={source.href}
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-foreground underline-offset-2 hover:underline"
                >
                  {source.label}
                  <ExternalLink aria-hidden className="size-3" />
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
