import { AdapterLogo } from "../AdapterLogo.tsx"
import type { OfferedLibrary } from "./offeredLibraries.ts"

/** A library's logo on a tile, in its brand's color, or a plain block for one without. */
export function LibraryMark({ library, large = false }: { library: OfferedLibrary; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center border bg-background [&_[data-brand]]:text-(--brand) ${large ? "size-11 rounded-lg" : "size-8 rounded-md"}`}
    >
      <AdapterLogo logo={library.logo} className={large ? "size-6" : "size-4.5"} />
    </span>
  )
}
