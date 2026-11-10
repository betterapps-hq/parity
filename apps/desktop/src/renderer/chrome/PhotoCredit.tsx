import type { ImageCredit } from "@parity-app/core"

/** Who took a photo, linked to them, and the library it's from: "Photo by Ana Lee on Pixabay". */
export function PhotoCredit({ credit, className = "" }: { credit: ImageCredit; className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      Photo by{" "}
      <a href={credit.url} target="_blank" rel="noreferrer" className="text-foreground hover:underline">
        {credit.name}
      </a>
      {credit.source ? ` on ${credit.source}` : ""}
    </p>
  )
}
