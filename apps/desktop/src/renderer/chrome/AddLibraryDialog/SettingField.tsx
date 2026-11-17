import { Field, FieldLabel } from "@buildkitgg/shadcn"
import { useId } from "react"
import type { LibrarySetting } from "../../../shared/protocol.ts"
import { AppSelect } from "../AppSelect.tsx"

export function SettingField({
  setting,
  value,
  onChange
}: {
  setting: LibrarySetting
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()

  return (
    <Field orientation="horizontal" className="items-center *:data-[slot=field-label]:flex-none">
      <FieldLabel id={id} className="w-14 text-sm font-normal text-muted-foreground">
        {setting.label}
      </FieldLabel>
      <AppSelect
        variant="dialog"
        aria-labelledby={id}
        className="w-full min-w-0 flex-1"
        items={setting.options}
        value={value}
        onValueChange={(next) => {
          if (next !== null) {
            onChange(next)
          }
        }}
      />
    </Field>
  )
}
