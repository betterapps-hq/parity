import type { SettingContribution } from "@parity-app/extension"
import { defaultOf } from "@parity-app/extension-host/settings"
import type { Control, Extension, Setting } from "./definitions.ts"

/*
 * Extensions' settings as Settings draws them (PAR-1090): from each manifest's JSON Schema, with the kit's controls. A
 * setting with choices is a select, a true or false a switch, a number a number field, and any other string a text
 * field. Each keeps its manifest's key as its id, `storybook.openIn`, and goes on its extension's page.
 */

/** The control a setting's schema calls for. */
function controlOf(setting: SettingContribution): Control {
  if (setting.enum) {
    return {
      kind: "select",
      options: setting.enum.map((value, index) => ({ value, label: setting.enumTitles?.[index] ?? value }))
    }
  }

  switch (setting.type) {
    case "boolean":
      return { kind: "switch" }
    case "number":
      return { kind: "number" }
    case "string":
      return { kind: "text" }
  }
}

/** An extension's settings, as its manifest declares them, on its page. */
export function extensionSettings(id: string, declared: Record<string, SettingContribution> | undefined): Setting[] {
  return Object.entries(declared ?? {}).map(([key, setting]) => ({
    id: key,
    page: `ext:${id}`,
    label: setting.title,
    scope: setting.scope,
    control: controlOf(setting),
    default: defaultOf(setting)
  }))
}

/** The extension a setting is, and its key after the prefix, as settings.json and the project's file keep it. */
export function extensionPlace(
  setting: Setting,
  extensions: readonly Extension[]
): { prefix: string; key: string } | undefined {
  const extension = extensions.find((entry) => entry.settings.some((own) => own.id === setting.id))
  const prefix = extension?.prefix

  if (!prefix || !setting.id.startsWith(`${prefix}.`)) {
    return undefined
  }

  return { prefix, key: setting.id.slice(prefix.length + 1) }
}
