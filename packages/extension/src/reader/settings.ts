import { z } from "zod"
import type { JsonValue, SettingContribution, SettingValue } from "../index.ts"

/** Each type a setting can be, as the value it takes. */
const valueOfType = { string: z.string(), number: z.number(), boolean: z.boolean() } as const

/** Whether a value fits a setting's schema: its type, and one of its choices when it has them. */
export function fits(setting: SettingContribution, value: JsonValue | undefined): value is SettingValue {
  const read = valueOfType[setting.type].safeParse(value)

  return read.success && (!setting.enum || setting.enum.some((choice) => choice === read.data))
}
