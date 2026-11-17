import type { LibraryLook } from "../../../shared/protocol.ts"
import { fontStyle, lookIn, themeLabel } from "./libraryLook.ts"
import type { ShownPreview } from "./offeredLibraries.ts"
import { ThemePicker } from "./ThemePicker.tsx"

/**
 * The library's look, drawn with nothing but its tokens: a card on its surface, with a heading and quieter text, a
 * field, its main button and a plain one, and a tag, in whichever of its themes is chosen.
 */
export function LookPreview({
  name,
  look,
  preview,
  theme,
  onTheme
}: {
  name: string
  look: LibraryLook
  preview: ShownPreview
  theme: string
  onTheme: (theme: string) => void
}) {
  const drawn = lookIn(look, preview.tokens, theme)
  const corner = drawn.radius

  return (
    <section aria-label={`${name}'s look`} className="mx-6 mt-5">
      <div
        className="flex flex-col gap-4 overflow-hidden rounded-xl border p-4 @lg/detail:p-6"
        style={{ background: `color-mix(in srgb, ${drawn.text ?? "#000"} 6%, ${drawn.surface ?? "transparent"})` }}
      >
        <div className="flex justify-end">
          <ThemePicker
            themes={preview.themes.map((each) => ({ value: each, label: themeLabel(each) }))}
            theme={theme}
            onTheme={onTheme}
          />
        </div>
        <div
          className="mx-auto mb-2 flex w-full max-w-sm flex-col gap-4 border p-5"
          style={{
            background: drawn.surface,
            color: drawn.text,
            borderColor: drawn.border,
            borderRadius: corner,
            boxShadow: drawn.shadow,
            ...fontStyle(drawn.font)
          }}
        >
          <div className="flex flex-col gap-1">
            <span style={{ fontSize: "1.125em", fontWeight: 600 }}>Weekly report</span>
            <span style={{ color: drawn.muted, fontSize: "0.875em" }}>Three new sign-ups since Monday</span>
          </div>
          <span
            className="flex h-9 items-center border px-3"
            style={{ borderColor: drawn.border, borderRadius: corner, color: drawn.muted, fontSize: "0.875em" }}
          >
            Search reports
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex h-9 items-center px-4"
              style={{
                background: drawn.primary,
                color: drawn.onPrimary,
                borderRadius: corner,
                fontSize: "0.875em",
                fontWeight: 500
              }}
            >
              Share
            </span>
            <span
              className="inline-flex h-9 items-center border px-4"
              style={{ borderColor: drawn.border, borderRadius: corner, fontSize: "0.875em", fontWeight: 500 }}
            >
              Export
            </span>
            <span
              className="ml-auto inline-flex h-6 items-center px-2"
              style={{
                background: `color-mix(in srgb, ${drawn.primary ?? "currentColor"} 14%, transparent)`,
                color: drawn.primary,
                borderRadius: corner,
                fontSize: "0.75em",
                fontWeight: 500
              }}
            >
              New
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
