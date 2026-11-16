import type { Mark } from "@parity-app/connectors"

/** A library's own mark, as its connector draws it, in the color of the text beside it. */
export function SourceMark({ mark, className = "size-4" }: { mark: Mark; className?: string }) {
  return (
    <svg viewBox={mark.box} aria-hidden className={`shrink-0 fill-current ${className}`}>
      <path d={mark.path} />
    </svg>
  )
}
