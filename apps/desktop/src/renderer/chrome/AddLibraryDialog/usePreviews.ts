import { useCallback, useRef, useState } from "react"
import type { ShownPreview } from "./offeredLibraries.ts"

/** The previews asked for while the dialog is open, by library and settings, each asked for once. */
export function usePreviews(
  load: (library: string, settings?: Record<string, string>) => Promise<ShownPreview | undefined>
) {
  const [shown, setShown] = useState<ReadonlyMap<string, ShownPreview | undefined>>(() => new Map())
  const asked = useRef(new Set<string>())

  const want = useCallback(
    (library: string, settings: Record<string, string> | undefined) => {
      const key = previewKey(library, settings)

      if (asked.current.has(key)) {
        return
      }

      asked.current.add(key)
      const settle = (preview: ShownPreview | undefined) => setShown((previews) => new Map(previews).set(key, preview))
      void load(library, settings).then(settle, () => settle(undefined))
    },
    [load]
  )

  return { shown, want }
}

export type Previews = ReturnType<typeof usePreviews>

export function previewKey(library: string, settings: Record<string, string> | undefined): string {
  return `${library} ${JSON.stringify(settings ?? {})}`
}
