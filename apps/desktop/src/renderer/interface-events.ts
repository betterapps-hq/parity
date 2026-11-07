import type { EventAttributes, EventName, registeredEvents, Telemetry } from "@parity-app/telemetry"

type Events = typeof registeredEvents

/**
 * Where the window's interface and navigation events go (PAR-634). The stores that own tabs, panels, dialogs, modes and
 * preferences record their own changes through `recordInterface`, so each kind is recorded in one place. Until
 * `startTelemetry` hands over the window's telemetry, as in tests and stories, nothing is recorded.
 */
let telemetry: Telemetry<Events> | undefined

export function setInterfaceTelemetry(next: Telemetry<Events> | undefined): void {
  telemetry = next
}

export function recordInterface<Name extends EventName<Events>>(name: Name, attributes: EventAttributes<Events, Name>) {
  telemetry?.track(name, attributes)
}

export type TabKind = "home" | "project" | "new"

/** The tabs as the workspace has them: each one's id and whether it's a new tab, and which is in front. */
export interface TabsView {
  tabs: readonly { id: string; blank?: boolean }[]
  /** The tab in front, or undefined for Home. */
  active: string | undefined
}

type TabEvent =
  | { name: "tab.opened" | "tab.closed"; attributes: { kind: TabKind; tabs: number } }
  | { name: "tab.switched"; attributes: { from: TabKind; to: TabKind } }

/**
 * The tab events between two views of the workspace. A tab that opens or closes changes how many there are; one that
 * changes its id, as a project's does once its folder is known or a new tab's does when a project opens in it, isn't
 * an open or a close. Switching counts when what's in front shows something else, or another tab comes forward.
 */
export function tabEvents(before: TabsView, after: TabsView): TabEvent[] {
  const events: TabEvent[] = []
  const beforeIds = new Set(before.tabs.map((tab) => tab.id))
  const afterIds = new Set(after.tabs.map((tab) => tab.id))
  const added = after.tabs.filter((tab) => !beforeIds.has(tab.id))
  const removed = before.tabs.filter((tab) => !afterIds.has(tab.id))
  const change = after.tabs.length - before.tabs.length
  let counted: readonly { blank?: boolean }[] = []
  if (change > 0) counted = added.slice(-change)
  if (change < 0) counted = removed.slice(change)
  for (const tab of counted) {
    const name = change > 0 ? "tab.opened" : "tab.closed"
    events.push({ name, attributes: { kind: tab.blank ? "new" : "project", tabs: after.tabs.length } })
  }
  const from = kindOf(before, before.active)
  const to = kindOf(after, after.active)
  // A tab that took a new id is the same tab: it was swapped for one that wasn't there before.
  const renamed =
    removed.some((tab) => tab.id === before.active) && added.some((tab) => tab.id === after.active) && change === 0
  const moved = before.active !== after.active && !renamed && !(from === "home" && to === "home")
  if (moved) events.push({ name: "tab.switched", attributes: { from, to } })
  return events
}

function kindOf(view: TabsView, id: string | undefined): TabKind {
  const tab = view.tabs.find((candidate) => candidate.id === id)
  if (tab === undefined) return "home"
  return tab.blank ? "new" : "project"
}

/** Records the workspace's tab events as it changes, from one place rather than each way a tab opens or closes. */
export function watchTabs(source: { subscribe: (listener: () => void) => () => void; view: () => TabsView }) {
  let last = source.view()
  return source.subscribe(() => {
    const next = source.view()
    if (next.tabs === last.tabs && next.active === last.active) return
    for (const { name, attributes } of tabEvents(last, next)) recordInterface(name, attributes)
    last = next
  })
}
