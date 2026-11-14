import type {
  CommandContribution,
  CommandTarget,
  ComponentTarget,
  FormField,
  ViewAction,
  ViewData,
  ViewItem,
  ViewKind
} from "@parity-app/extension-api"
import type { ExtensionStatus } from "../shared/protocol.ts"
import { setLayout } from "./chrome/layout.ts"
import { extensionsOf, holdsFor, showing } from "./extensions.ts"
import { reportError } from "./report-error.ts"
import { request } from "./service.ts"
import { workspace } from "./workspace.ts"

/*
 * Extensions' declarative views (PAR-1094), as the window places them: the tabs each manifest adds to the left, right
 * and bottom panels, the sections it adds to the Design tab, and the pages it opens in tabs at the top. Each holds what
 * the extension's code last sent for it, or nothing until its code has filled it.
 */

/** Where a view sits. */
export type ViewPlace = "left" | "right" | "bottom" | "section" | "page"

/** A view an extension declares, where it sits, with what its code last sent for it. */
export interface PlacedView {
  extension: ExtensionStatus
  id: string
  title: string
  icon?: string
  kind: ViewKind
  place: ViewPlace
  data?: ViewData
}

/** Every view the extensions declare, in the order their manifests list them. */
function placedViews(extensions: readonly ExtensionStatus[]): PlacedView[] {
  return extensions.filter(showing).flatMap((extension) => {
    const { tabs = [], sections = [], pages = [] } = extension.contributes

    const placed = (
      contribution: { id: string; title: string; icon?: string; view: ViewKind },
      place: ViewPlace
    ): PlacedView => {
      const view: PlacedView = {
        extension,
        id: contribution.id,
        title: contribution.title,
        kind: contribution.view,
        place
      }

      const data = extension.views[contribution.id]

      if (contribution.icon !== undefined) {
        view.icon = contribution.icon
      }

      if (data !== undefined && data.kind === contribution.view) {
        view.data = data
      }

      return view
    }

    return [
      ...tabs.map((tab) => placed(tab, tab.area)),
      ...sections.map((section) => placed(section, "section")),
      ...pages.map((page) => placed(page, "page"))
    ]
  })
}

/** The tabs extensions add to a panel. */
export function tabsAt(extensions: readonly ExtensionStatus[], area: "left" | "right" | "bottom"): PlacedView[] {
  return placedViews(extensions).filter((view) => view.place === area)
}

/** What's selected, as a Design tab section's `nodeType` and `when` read it. */
export interface SectionTarget {
  nodeType: string
  target: ComponentTarget
}

/**
 * The Design tab sections that show for what's selected: those for its node type, or without one, whose `when` holds
 * for it. A section with neither shows for everything.
 */
export function sectionsFor(extensions: readonly ExtensionStatus[], selected: SectionTarget): PlacedView[] {
  return placedViews(extensions).filter((view) => {
    if (view.place !== "section") {
      return false
    }

    const section = view.extension.contributes.sections?.find((candidate) => candidate.id === view.id)

    return (
      section !== undefined &&
      (section.nodeType === undefined || section.nodeType === selected.nodeType) &&
      holdsFor(extensions, view.extension, section.when, selected.target)
    )
  })
}

/** A page an extension declares. */
export function pageOf(
  extensions: readonly ExtensionStatus[],
  extension: string,
  page: string
): PlacedView | undefined {
  return placedViews(extensions).find(
    (view) => view.place === "page" && view.extension.id === extension && view.id === page
  )
}

/** Whether a view's item is a form's field. */
export function isField(item: ViewItem | FormField): item is FormField {
  return "type" in item
}

/**
 * A view's items that show for what's selected: in a section, the items about it and those about nothing, with every
 * item under one of them in a tree. Elsewhere, all of them.
 */
export function shownItems(data: ViewData, selected?: ComponentTarget): (ViewItem | FormField)[] {
  if (!selected) {
    return data.items
  }

  const shown = new Set<string>()

  for (const item of data.items) {
    if (isField(item)) {
      shown.add(item.key)
    } else if (
      item.target === undefined ? item.parent === undefined || shown.has(item.parent) : item.target.key === selected.key
    ) {
      shown.add(item.key)
    }
  }

  return data.items.filter((item) => shown.has(item.key))
}

/** A row of a tree as it's drawn: its item, how deep it is, and whether it has items under it. */
export interface TreeRow {
  item: ViewItem
  depth: number
  parent: boolean
}

/**
 * A tree's rows in the order they're drawn: each item, then the items under it while it's open. An item whose parent
 * isn't in the tree is at the top.
 */
export function treeRows(items: readonly ViewItem[], open: ReadonlySet<string>): TreeRow[] {
  const keys = new Set(items.map((item) => item.key))
  const children = new Map<string | undefined, ViewItem[]>()

  for (const item of items) {
    const parent = item.parent !== undefined && keys.has(item.parent) ? item.parent : undefined
    children.set(parent, [...(children.get(parent) ?? []), item])
  }

  const rows: TreeRow[] = []
  const seen = new Set<string>()

  const visit = (parent: string | undefined, depth: number) => {
    for (const item of children.get(parent) ?? []) {
      // A tree whose items name each other as parents would go round forever.
      if (seen.has(item.key)) {
        continue
      }

      seen.add(item.key)
      const under = (children.get(item.key) ?? []).length > 0
      rows.push({ item, depth, parent: under })

      if (under && open.has(item.key)) {
        visit(item.key, depth + 1)
      }
    }
  }

  visit(undefined, 0)

  return rows
}

/** The commands a view offers for an item, or on its toolbar without one, whose `when` holds. */
export function actionsFor(
  extension: ExtensionStatus,
  actions: readonly ViewAction[] | undefined,
  target?: CommandTarget
): CommandContribution[] {
  return (actions ?? []).flatMap((action) => {
    const command = extension.contributes.commands?.find((declared) => declared.id === action.command)

    return command && holdsFor([extension], extension, action.when, target) ? [command] : []
  })
}

type Session = { id: string; untilClosed(stop: () => void): void }

/** Tells the service a tab or page opened, which starts an extension that activates on it. */
export function viewOpened(session: Pick<Session, "id">, view: string): void {
  void request("extensions.viewOpened", { projectId: session.id, view }).catch(() => undefined)
}

/** Sends the person's change to a form's field to its extension. */
export function changeField(
  session: Pick<Session, "id">,
  extension: ExtensionStatus,
  view: string,
  key: string,
  value: string | number | boolean
): void {
  void request("extensions.viewChanged", { projectId: session.id, extension: extension.id, view, key, value }).catch(
    (cause: unknown) =>
      reportError(cause, {
        operation: "extensions.viewChanged",
        title: `${extension.displayName} didn't get the change`,
        context: { extension: extension.id, view }
      })
  )
}

/**
 * Opens the tab or page that holds an extension's view: a panel's tab opens its panel on it, and a page opens in a tab
 * at the top, after its project's.
 */
export function revealView(session: Session, extension: string, view: string): void {
  const found = placedViews(extensionsOf(session).store.get().extensions).find(
    (candidate) => candidate.extension.id === extension && candidate.id === view
  )

  if (!found) {
    return
  }

  switch (found.place) {
    case "left":
      setLayout({ left: true, leftTab: view })
      break
    case "right":
      setLayout({ right: true, rightTab: view })
      break
    case "bottom":
      setLayout({ console: true, bottomTab: view })
      break
    case "page":
      workspace.openPage({ projectId: session.id, extension, page: view, title: found.title })
      break
    case "section":
      // A section shows with what it's about, so there's nothing to open.
      break
  }

  viewOpened(session, view)
}
