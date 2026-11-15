"use client"

import { Field, Label, Switch } from "@headlessui/react"
import { useState } from "react"

export function ProjectSettings({ defaultPublic = false }: { defaultPublic?: boolean }) {
  const [isPublic, setPublic] = useState(defaultPublic)

  return (
    <Field className="flex items-center justify-between rounded-xl border border-gray-200 p-4">
      <Label className="text-sm font-medium">Public project</Label>
      <Switch
        checked={isPublic}
        onChange={setPublic}
        className="group inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition data-checked:bg-brand"
      >
        <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-checked:translate-x-6" />
      </Switch>
    </Field>
  )
}
