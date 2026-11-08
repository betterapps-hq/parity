/** When a crash happened, as the reader would say it: "Today at 14:02", or "Yesterday at 09:15", or a date. */
export function crashTime(iso: string, now = new Date()): string {
  const time = new Date(iso)
  const clock = time.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const daysAgo = Math.round((day(now) - day(time)) / 86_400_000)
  if (daysAgo === 0) return `Today at ${clock}`
  if (daysAgo === 1) return `Yesterday at ${clock}`
  return `${time.toLocaleDateString(undefined, { month: "long", day: "numeric" })} at ${clock}`
}

/** "Today at 7:22 PM" as it reads mid-sentence: "today at 7:22 PM". */
export const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
