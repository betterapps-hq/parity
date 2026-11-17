import { Checkbox, Field, FieldGroup, FieldLabel } from "@buildkitgg/shadcn"
import { LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { Breakpoints } from "./Breakpoints.tsx"
import { DetailActions, type Step } from "./DetailActions.tsx"
import { Families } from "./Families.tsx"
import { Figures } from "./Figures.tsx"
import { LibraryLinks } from "./LibraryLinks.tsx"
import { LibraryMark } from "./LibraryMark.tsx"
import { LookPreview } from "./LookPreview.tsx"
import type { LibraryChoice, OfferedLibrary } from "./offeredLibraries.ts"
import { RemoveConfirm } from "./RemoveConfirm.tsx"
import { SettingField } from "./SettingField.tsx"
import { TokenSpecimens } from "./TokenSpecimens.tsx"
import { previewKey, type Previews } from "./usePreviews.ts"

export function LibraryDetail({
  library,
  previews,
  onAdd,
  onRemove
}: {
  library: OfferedLibrary
  previews: Previews
  onAdd: (choice: LibraryChoice) => void
  onRemove: (library: string) => void
}) {
  const initial = Object.fromEntries((library.settings ?? []).map((setting) => [setting.id, setting.value]))
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [step, setStep] = useState<Step>("browse")
  const companion = library.companion
  const [withCompanion, setWithCompanion] = useState(!!companion && !companion.installed)
  const settings = library.settings ? values : undefined
  const preview = previews.shown.get(previewKey(library.id, settings))
  const loading = !previews.shown.has(previewKey(library.id, settings))
  const { want } = previews
  const [theme, setTheme] = useState("default")
  const changed = (library.settings ?? []).some((setting) => values[setting.id] !== setting.value)

  useEffect(() => want(library.id, settings), [want, library.id, settings])

  const add = () =>
    onAdd({
      library: library.id,
      settings: library.settings ? values : undefined,
      companions: companion && withCompanion && !companion.installed ? [companion.id] : []
    })

  return (
    <div className="@container/detail flex min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <header className="flex items-start gap-4 px-6 pt-5">
          <LibraryMark library={library} large />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <h2 className="text-xl font-semibold">{library.name}</h2>
              {library.version && <span className="text-sm text-muted-foreground tabular-nums">{library.version}</span>}
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">{library.description}</p>
            <LibraryLinks links={library.links} />
          </div>
        </header>
        {step === "settings" && library.settings && (
          <FieldGroup className="mx-6 mt-5 grid w-auto grid-cols-1 gap-x-6 gap-y-3 rounded-lg border p-4 @xl/detail:grid-cols-2">
            {library.settings.map((setting) => (
              <SettingField
                key={setting.id}
                setting={setting}
                value={values[setting.id] ?? setting.value}
                onChange={(value) => setValues({ ...values, [setting.id]: value })}
              />
            ))}
          </FieldGroup>
        )}
        {loading && (
          <LoaderCircle aria-label="Loading" className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />
        )}
        {preview && (
          <>
            {library.look && (
              <LookPreview name={library.name} look={library.look} preview={preview} theme={theme} onTheme={setTheme} />
            )}
            <Figures preview={preview} />
            <TokenSpecimens tokens={preview.tokens} keyframes={preview.keyframes} theme={theme} />
            <Families families={preview.families} total={preview.components} />
            <Breakpoints breakpoints={preview.breakpoints} />
          </>
        )}
      </div>
      <footer className="flex min-h-14 flex-wrap items-center gap-3 border-t px-6 py-3">
        {step === "remove" ? (
          <RemoveConfirm library={library} onCancel={() => setStep("browse")} onRemove={() => onRemove(library.id)} />
        ) : (
          <>
            <div className="min-w-0 flex-1">
              {companion && step === "browse" && (
                <Field orientation="horizontal" className="items-center gap-2">
                  <Checkbox
                    id={`companion-${companion.id}`}
                    checked={companion.installed || withCompanion}
                    disabled={companion.installed || library.installed}
                    onCheckedChange={(checked) => setWithCompanion(checked)}
                  />
                  <FieldLabel htmlFor={`companion-${companion.id}`} className="text-sm font-normal">
                    {companion.installed ? `${companion.name} added` : `Add ${companion.name}, its icon set`}
                  </FieldLabel>
                </Field>
              )}
            </div>
            <DetailActions library={library} step={step} changed={changed} onStep={setStep} onAdd={add} />
          </>
        )}
      </footer>
    </div>
  )
}
