import { describe, expect, it } from "vite-plus/test"
import {
  hiddenHeading,
  hiddenReason,
  type InsertOption,
  type InsertOrigin,
  insertRows,
  matchOption,
  nameWords
} from "./insert-search.ts"

const sources: Record<string, { origin: InsertOrigin; sourceName: string }> = {
  basics: { origin: "basic", sourceName: "Basics" },
  designs: { origin: "design", sourceName: "Component designs" },
  "project:kit": { origin: "kit", sourceName: "UI kit" },
  project: { origin: "app", sourceName: "shadcn-vite" },
  "project:pages": { origin: "page", sourceName: "Pages" },
  nova: { origin: "library", sourceName: "Shadcn Nova" },
  radix: { origin: "library", sourceName: "Radix Primitives" }
}

function option(source: string, key: string, extra: Partial<InsertOption> = {}): InsertOption {
  const name = key.split("/").at(-1)!
  return { key, name, source, ...sources[source]!, ...extra }
}

/** The example project as the audit found it (docs/proposals/editor-experience.md, task 22), in the panel's order. */
const example: InsertOption[] = [
  option("basics", "text", { name: "Text" }),
  option("basics", "column", { name: "Vertical layout" }),
  option("designs", "member-row", { name: "Member row" }),
  option("designs", "stat-card", { name: "Stat card" }),
  option("project:kit", "Avatar", { description: "avatar" }),
  option("project:kit", "AvatarBadge", { description: "avatar" }),
  option("project:kit", "Badge", { description: "badge" }),
  option("project:kit", "Button", { description: "button" }),
  option("project:kit", "Card", { description: "card" }),
  option("project", "App", { description: "src", hidden: "plumbing" }),
  option("project", "ThemeProvider", { description: "src/components", hidden: "provider" }),
  option("project", "MemberRow", { description: "src/components" }),
  option("nova", "nova/AccordionTrigger", { description: "accordion" }),
  option("nova", "nova/AlertDialogTrigger", { description: "alert-dialog" }),
  option("nova", "nova/AvatarBadge", { description: "avatar" }),
  option("nova", "nova/Badge", { description: "badge" }),
  option("nova", "nova/BreadcrumbPage", { description: "breadcrumb" }),
  option("nova", "nova/Dialog", { description: "dialog" }),
  option("nova", "nova/DialogOverlay", { description: "dialog", hidden: "internal" }),
  option("nova", "nova/MessageHeader", { description: "message" }),
  option("nova", "nova/ProgressIndicator", { description: "progress", hidden: "internal" }),
  option("nova", "nova/SidebarMenuBadge", { description: "sidebar" }),
  option("nova", "nova/TooltipProvider", { description: "tooltip", hidden: "provider" }),
  option("radix", "radix/Dialog.Root", { description: "index" }),
  option("radix", "radix/Dialog.Overlay", { description: "index" })
]

const names = (rows: ReturnType<typeof insertRows>) => rows.map((row) => row.name)

describe("hiddenReason", () => {
  it("hides a library's internal parts and portals", () => {
    expect(hiddenReason("nova/DialogOverlay", { internal: true })).toBe("internal")
    expect(hiddenReason("nova/ProgressIndicator", { internal: true })).toBe("internal")
    expect(hiddenReason("nova/ContextMenuPortal")).toBe("internal")
    expect(hiddenReason("radix/Dialog.Portal")).toBe("internal")
  })

  it("hides providers, namespaced or not", () => {
    expect(hiddenReason("ThemeProvider")).toBe("provider")
    expect(hiddenReason("nova/TooltipProvider")).toBe("provider")
    expect(hiddenReason("radix/Tooltip.Provider")).toBe("provider")
    expect(hiddenReason("AppProviders")).toBe("provider")
  })

  it("hides the app's root, its router and error boundaries", () => {
    expect(hiddenReason("App")).toBe("plumbing")
    expect(hiddenReason("Routes")).toBe("plumbing")
    expect(hiddenReason("ErrorBoundary")).toBe("plumbing")
  })

  it("keeps components people place", () => {
    const placed = ["Badge", "AppSidebar", "Appointment", "Toaster", "nova/DialogTrigger", "radix/Dialog.Root"]
    expect(placed.filter((name) => hiddenReason(name))).toEqual([])
  })
})

describe("hiddenHeading", () => {
  it("names what a source hides", () => {
    expect(hiddenHeading(["internal"])).toBe("Internal parts")
    expect(hiddenHeading(["provider", "plumbing", "provider"])).toBe("Providers and app plumbing")
    expect(hiddenHeading(["plumbing", "internal", "provider"])).toBe("Internal parts, providers and app plumbing")
    expect(hiddenHeading([])).toBe("")
  })
})

describe("nameWords", () => {
  it("splits names at capitals, dots, spaces and dashes", () => {
    expect(nameWords("AlertDialogTrigger")).toEqual(["alert", "dialog", "trigger"])
    expect(nameWords("Dialog.Root")).toEqual(["dialog", "root"])
    expect(nameWords("Member row")).toEqual(["member", "row"])
    expect(nameWords("HTMLInputField")).toEqual(["html", "input", "field"])
    expect(nameWords("alert-dialog")).toEqual(["alert", "dialog"])
  })
})

describe("matchOption", () => {
  const badge = option("project:kit", "Badge", { description: "badge" })
  const avatarBadge = option("project:kit", "AvatarBadge", { description: "avatar" })
  const trigger = option("nova", "nova/AlertDialogTrigger", { description: "alert-dialog" })

  it("ranks an exact name, then its start, then a word's start, then anywhere in it", () => {
    expect(matchOption(badge, "badge")?.tier).toBe(0)
    expect(matchOption(badge, "Bad")?.tier).toBe(1)
    expect(matchOption(avatarBadge, "badge")?.tier).toBe(2)
    expect(matchOption(trigger, "dialog trig")?.tier).toBe(2)
    expect(matchOption(avatarBadge, "tarba")?.tier).toBe(3)
  })

  it("matches descriptions only after names", () => {
    // `alert` is in the trigger's name; `nova` only in its source.
    expect(matchOption(trigger, "nova alert")).toEqual({ tier: 4, closeness: 1, sourceWords: 1 })
    expect(matchOption(avatarBadge, "avatar")?.tier).toBe(1)
    expect(matchOption(option("project", "MemberRow", { description: "src/components" }), "components")?.tier).toBe(5)
  })

  it("doesn't match a letter scattered through a name, as a fuzzy match would", () => {
    // The audit's search for "badge" found AlertDialogTrigger: a, d, g and e appear in order in it.
    expect(matchOption(trigger, "badge")).toBeUndefined()
  })

  it("matches everything for an empty search", () => {
    expect(matchOption(trigger, "  ")).toEqual({ tier: 0, closeness: 0, sourceWords: 0 })
  })
})

describe("insertRows", () => {
  it("lists the project's own component designs and components first, before libraries'", () => {
    const rows = insertRows(example)
    const origins = rows.map((row) => row.options[0]!.origin)
    expect(origins).toEqual([...origins].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    expect(names(rows).slice(0, 6)).toEqual([
      "Text",
      "Vertical layout",
      "Member row",
      "Stat card",
      "Avatar",
      "AvatarBadge"
    ])
  })

  it("leaves out internal parts, providers and app plumbing", () => {
    const shown = names(insertRows(example))
    for (const name of ["App", "ThemeProvider", "DialogOverlay", "ProgressIndicator", "TooltipProvider"]) {
      expect(shown).not.toContain(name)
    }
  })

  it("shows them when they're searched for by name", () => {
    expect(names(insertRows(example, "ThemeProvider"))).toEqual(["ThemeProvider"])
    expect(names(insertRows(example, "theme"))).toEqual(["ThemeProvider"])
    expect(names(insertRows(example, "app"))).toEqual(["App"])
    expect(names(insertRows(example, "overlay"))).toEqual(["Dialog.Overlay", "DialogOverlay"])
    expect(names(insertRows(example, "progress ind"))).toEqual(["ProgressIndicator"])
  })

  it("doesn't show them for a search that only matches their description", () => {
    // App and ThemeProvider are listed under `src`, as MemberRow is under `src/components`.
    expect(names(insertRows(example, "src"))).toEqual(["MemberRow"])
    expect(names(insertRows(example, "components"))).toEqual(["MemberRow"])
  })

  it("puts hidden ones a search partly names after the rest, and ones it names in full with them", () => {
    expect(names(insertRows(example, "dialog"))).toEqual([
      "Dialog",
      "Dialog.Root",
      "Dialog.Overlay",
      "AlertDialogTrigger",
      "DialogOverlay"
    ])
    expect(names(insertRows(example, "dialog overlay"))).toEqual(["DialogOverlay", "Dialog.Overlay"])
  })

  it("shows a component found in two places once, with both sources, the project's own first", () => {
    const rows = insertRows(example)
    const badges = rows.filter((row) => row.name === "Badge")
    expect(badges).toHaveLength(1)
    expect(badges[0]!.options.map((each) => each.sourceName)).toEqual(["UI kit", "Shadcn Nova"])
    expect(badges[0]!.key).toBe("Badge")
  })

  it("picks the source a search names, ranking the closest names first", () => {
    const rows = insertRows(example, "nova badge")
    expect(names(rows)).toEqual(["Badge", "AvatarBadge", "SidebarMenuBadge"])
    expect(rows[0]!.options.map((each) => each.key)).toEqual(["nova/Badge"])
  })

  it("keeps two components of one name from one source apart", () => {
    const rows = insertRows([
      option("project", "(portal)/ErrorPage", { name: "ErrorPage", description: "(portal)" }),
      option("project", "app/ErrorPage", { name: "ErrorPage", description: "app" })
    ])
    expect(rows.map((row) => row.key)).toEqual(["(portal)/ErrorPage", "app/ErrorPage"])
  })

  it("keeps a component design apart from a component of its name", () => {
    const rows = insertRows([
      option("designs", "badge-design", { name: "Badge" }),
      option("project:kit", "Badge", { description: "badge" })
    ])
    expect(rows.map((row) => row.key)).toEqual(["badge-design", "Badge"])
  })

  it("finds Badge for `badge`, then components with a word starting it, and nothing it's scattered through", () => {
    // The audit's search returned AlertDialogTrigger, BreadcrumbPage, MessageHeader and AccordionTrigger.
    const rows = insertRows(example, "badge")
    expect(names(rows)).toEqual(["Badge", "AvatarBadge", "SidebarMenuBadge"])
    expect(rows[0]!.options.map((each) => each.key)).toEqual(["Badge", "nova/Badge"])
  })

  it("ranks names before descriptions, then by where they come from", () => {
    // `avatar` starts Avatar and AvatarBadge, and is only the description of nothing else; `card` is Card and a word
    // of the Stat card design; `alert` is a word of AlertDialogTrigger and the description of nothing.
    expect(names(insertRows(example, "avatar"))).toEqual(["Avatar", "AvatarBadge"])
    expect(names(insertRows(example, "card"))).toEqual(["Card", "Stat card"])
    const described = [
      option("nova", "nova/Accordion", { description: "accordion" }),
      option("nova", "nova/Item", { description: "accordion" }),
      option("project:kit", "AccordionPanel", { description: "panels" })
    ]
    // The kit's AccordionPanel has `accordion` in its name; Nova's Item only in its file.
    expect(names(insertRows(described, "accordion"))).toEqual(["Accordion", "AccordionPanel", "Item"])
  })

  it("finds basic layers by name", () => {
    expect(names(insertRows(example, "vertical"))).toEqual(["Vertical layout"])
  })

  it("finds nothing for a search nothing matches", () => {
    expect(insertRows(example, "zebra crossing")).toEqual([])
  })
})

const order = ["basic", "design", "kit", "app", "page", "library-design", "library"]
