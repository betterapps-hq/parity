import type { Meta, StoryObj } from "@storybook/react-vite"
import { ChevronRight, icons } from "lucide-react"
import { useDeferredValue, useState } from "react"
import { auditedIcons } from "./audited-icons.ts"
import { fluentModules } from "./fluent-modules.ts"
import type { AuditedIcon, FluentChoice, IconArea } from "./types.ts"

type Style = "Regular" | "Filled" | "Color"

/** A size with its own drawing, or the unsized icon, which is drawn at 20 and scales with the font size. */
type Size = 16 | 20 | 24 | "unsized"

const areaLabels: Record<IconArea, string> = {
  app: "App",
  exploration: "Exploration",
  story: "Story"
}

/** A Lucide icon by its name in Lucide's own list, which an older name the app imports may differ from. */
function LucideIcon({ name }: { name: keyof typeof icons }) {
  const Icon = icons[name]

  return <Icon className="size-5" />
}

/** The drawn size closest to the one wanted, or undefined when there's only the unsized icon. */
function nearestSize(choice: FluentChoice, px: number) {
  return choice.sizes.reduce<number | undefined>(
    (best, size) => (best === undefined || Math.abs(size - px) < Math.abs(best - px) ? size : best),
    undefined
  )
}

/** The size in a Fluent export's name: the one wanted when it's drawn, else the nearest, and none for unsized. */
function exportSize(size: Size, drawn: boolean, from: number | undefined) {
  if (!drawn) {
    return from ?? ""
  }

  return size === "unsized" ? "" : size
}

/**
 * A Fluent icon at a size and in a style. When Fluent has no drawing at that size, the nearest drawing is scaled to it
 * and outlined, with a tooltip that says which size it came from.
 */
function FluentGlyph({ choice, size, style }: { choice: FluentChoice; size: Size; style: Style }) {
  const module = fluentModules.get(choice.file) ?? {}
  const px = size === "unsized" ? 20 : size
  const drawn = size === "unsized" ? choice.unsized : choice.sizes.includes(size)
  const from = drawn ? undefined : nearestSize(choice, px)

  const Icon =
    module[`${choice.name}${exportSize(size, drawn, from)}${style}`] ??
    module[`${choice.name}${style}`] ??
    module[`${choice.name}${choice.sizes.at(-1) ?? ""}${style}`]

  if (!Icon) {
    return <span className="inline-block" style={{ width: px, height: px }} />
  }

  const glyph = <Icon aria-hidden style={{ fontSize: px, width: px, height: px }} />

  if (drawn) {
    return glyph
  }

  return (
    <span
      className="inline-flex rounded-sm outline outline-1 outline-dashed outline-amber-500"
      title={`No ${size === "unsized" ? "unsized" : `${px}px`} drawing. Scaled from ${from ? `${from}px` : "the unsized icon"}.`}
    >
      {glyph}
    </span>
  )
}

/** A Fluent icon that turns filled while the `group` around it is hovered, as a menu item would. */
function HoverGlyph({ choice, size, filled }: { choice: FluentChoice; size: Size; filled: boolean }) {
  if (filled) {
    return <FluentGlyph choice={choice} size={size} style="Filled" />
  }

  return (
    <>
      <span className="inline-flex group-hover:hidden">
        <FluentGlyph choice={choice} size={size} style="Regular" />
      </span>
      <span className="hidden group-hover:inline-flex">
        <FluentGlyph choice={choice} size={size} style="Filled" />
      </span>
    </>
  )
}

function SizeNote({ choice }: { choice: FluentChoice }) {
  return (
    <span className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
      {choice.sizes.join(" ") || "unsized only"}
      {choice.color && " color"}
    </span>
  )
}

function Recommended({ choice, filled }: { choice: FluentChoice; filled: boolean }) {
  const shown: Size[] = [16, 20, 24]

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-xs font-medium">{choice.name}</span>
      <div className="group flex w-fit items-end gap-3 rounded-md px-1 py-1 hover:bg-muted">
        {shown.map((size) => (
          <figure key={size} className="flex flex-col items-center gap-0.5">
            <HoverGlyph choice={choice} size={size} filled={filled} />
            <figcaption className="font-mono text-[10px] text-muted-foreground">{size}</figcaption>
          </figure>
        ))}
        <figure className="flex flex-col items-center gap-0.5">
          <FluentGlyph choice={choice} size={20} style="Filled" />
          <figcaption className="text-[10px] text-muted-foreground">Filled</figcaption>
        </figure>
        {choice.color && (
          <figure className="flex flex-col items-center gap-0.5">
            <FluentGlyph choice={choice} size={20} style="Color" />
            <figcaption className="text-[10px] text-muted-foreground">Color</figcaption>
          </figure>
        )}
      </div>
      <SizeNote choice={choice} />
    </div>
  )
}

function Alternatives({ choices, size, filled }: { choices: FluentChoice[]; size: Size; filled: boolean }) {
  return (
    <ul className="grid grid-cols-4 gap-2">
      {choices.map((choice) => (
        <li
          key={choice.name}
          className="group flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 hover:bg-muted"
        >
          <HoverGlyph choice={choice} size={size} filled={filled} />
          <span className="w-full text-center font-mono text-[10px] break-all">{choice.name}</span>
          <SizeNote choice={choice} />
        </li>
      ))}
    </ul>
  )
}

function Usage({ icon }: { icon: AuditedIcon }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm">{icon.context}</span>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">
          {icon.files} {icon.files === 1 ? "file" : "files"}
          {icon.areas.map((area) => (
            <span key={area} className="ml-1.5 rounded bg-muted px-1 py-px text-[10px] text-foreground">
              {areaLabels[area]}
            </span>
          ))}
        </summary>
        <ul className="mt-1 flex flex-col gap-1">
          {icon.sites.map((site) => (
            <li key={`${site.file}:${site.line}`} className="flex flex-col">
              <span className="font-mono text-[10px]">
                {site.file}
                {site.line > 0 && `:${site.line}`}
              </span>
              {site.code && <code className="truncate text-[10px] opacity-70">{site.code}</code>}
            </li>
          ))}
          {icon.moreSites > 0 && <li>and {icon.moreSites} more</li>}
        </ul>
      </details>
    </div>
  )
}

interface IconAuditProps {
  /** The size alternatives are shown at. */
  size: Size
  /** Shows every Fluent icon filled, rather than only the hovered one. */
  filled: boolean
  /** Hides icons used only in explorations and stories. */
  appOnly: boolean
  /** Shows only the icons whose picks are still to be verified. */
  toVerifyOnly: boolean
}

/**
 * Icons whose picks are waiting for review, by Lucide name so the marks survive renumbering: those marked in the review
 * of rows 1 to 120, and those picked again after it from where they're used and how the candidates look.
 */
const toVerify = new Set([
  "AlignHorizontalSpaceAround",
  "Blocks",
  "ChevronsDownUp",
  "CircleDot",
  "Component",
  "Contrast",
  "CornerDownLeft",
  "Crosshair",
  "Database",
  "DiamondPlus",
  "Gem",
  "Grid3x3",
  "HandGrab",
  "Heading",
  "ImageDown",
  "ImagePlay",
  "Languages",
  "Layers",
  "LifeBuoy",
  "List",
  "Maximize",
  "Menu",
  "MessageCircle",
  "MonitorPlay",
  "PenTool",
  "SaveAll",
  "SeparatorHorizontal",
  "Server",
  "SquareArrowOutUpRight",
  "Squircle",
  "StretchHorizontal",
  "SunMoon",
  "Telescope",
  "TextCursor",
  "TextCursorInput",
  "TextSelect"
])

/**
 * Icons whose recommended Fluent icon neither looks like the Lucide one nor stands for the same thing, by Lucide name.
 * A different drawing of the same idea, such as Lucide's wheelchair and Fluent's accessibility figure, still counts as
 * a match.
 */
const lessConfident = new Set([
  "ArrowUpToLine",
  "Component",
  "DiamondPlus",
  "FileJson",
  "GitMerge",
  "HandGrab",
  "Magnet",
  "OctagonAlert",
  "Skull",
  "Squircle",
  "SunMoon",
  "Telescope",
  "TextCursor"
])

/** Each icon with the number it's referred to by, which stays the same whatever's filtered. */
const numbered = auditedIcons.map((icon, index) => ({ icon, number: index + 1 }))

/** Fluent icons recommended for more than one Lucide icon. */
const reusedPicks = new Set(
  auditedIcons
    .map((icon) => icon.fluent.name)
    .filter((name, _, names) => names.indexOf(name) !== names.lastIndexOf(name))
)

interface AuditTableProps {
  title: string
  rows: typeof numbered
  size: Size
  filled: boolean
  /** Rules off each run of rows that share a recommended icon. */
  grouped?: boolean
}

/** A titled table of icons, each with its usage, recommended Fluent icon and alternatives. */
function AuditTable({ title, rows, size, filled, grouped = false }: AuditTableProps) {
  if (rows.length === 0) {
    return null
  }

  return (
    <details open className="group/table">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 pt-6 pb-2 select-none">
        <ChevronRight
          aria-hidden
          className="size-4 text-muted-foreground transition-transform group-open/table:rotate-90"
        />
        <h2 className="text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground tabular-nums">{rows.length}</span>
        </h2>
      </summary>
      <table className="w-full table-fixed border-collapse text-left">
        <thead className="sticky top-14 z-10 bg-background text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="w-20 px-4 py-2 font-medium">#</th>
            <th className="w-56 px-2 py-2 font-medium">Lucide</th>
            <th className="w-72 px-2 py-2 font-medium">Used for</th>
            <th className="w-64 px-2 py-2 font-medium">Recommended Fluent</th>
            <th className="px-2 py-2 pr-4 font-medium">Alternatives</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ icon, number }, index) => (
            <tr
              key={icon.lucide}
              className={
                grouped && index > 0 && rows[index - 1].icon.fluent.name !== icon.fluent.name
                  ? "border-t-4 border-b align-top"
                  : "border-b align-top"
              }
            >
              <td className="px-4 py-3">
                <span className="flex flex-col items-start gap-1">
                  <span className="font-mono text-sm text-muted-foreground tabular-nums">{number}</span>
                  {toVerify.has(icon.lucide) && (
                    <span className="rounded bg-amber-500/15 px-1 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      Verify
                    </span>
                  )}
                </span>
              </td>
              <td className="px-2 py-3">
                <span className="flex items-center gap-2">
                  <LucideIcon name={icon.lucideKey} />
                  <span className="font-mono text-xs">{icon.lucide}</span>
                </span>
              </td>
              <td className="overflow-hidden px-2 py-3 break-words">
                <Usage icon={icon} />
              </td>
              <td className="px-2 py-3">
                <Recommended choice={icon.fluent} filled={filled} />
              </td>
              <td className="px-2 py-3 pr-4">
                <Alternatives choices={icon.alternatives} size={size} filled={filled} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function IconAudit({ size, filled, appOnly, toVerifyOnly }: IconAuditProps) {
  const [query, setQuery] = useState("")
  const needle = useDeferredValue(query).trim().toLowerCase()

  const rows = numbered.filter(({ icon, number }) => {
    if (appOnly && !icon.areas.includes("app")) {
      return false
    }

    if (toVerifyOnly && !toVerify.has(icon.lucide)) {
      return false
    }

    if (!needle) {
      return true
    }

    return (
      String(number) === needle ||
      [icon.lucide, icon.context, icon.fluent.name, ...icon.alternatives.map((choice) => choice.name)].some((text) =>
        text.toLowerCase().includes(needle)
      )
    )
  })

  return (
    <div className="h-screen overflow-auto bg-background text-foreground">
      <div className="min-w-[88rem]">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-6 border-b bg-background px-4 whitespace-nowrap">
          <h1 className="text-base font-semibold">Icon audit</h1>
          <span className="text-sm text-muted-foreground">
            {rows.length} of {auditedIcons.length} Lucide icons
          </span>
          <input
            type="search"
            aria-label="Find an icon by number or name"
            placeholder="Number or name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 w-56 rounded-md border bg-transparent px-2 text-sm"
          />
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Hover a Fluent icon to see it filled.
            <span className="inline-block size-3 rounded-sm outline outline-1 outline-dashed outline-amber-500" />
            Fluent has no drawing at that size, so a nearby one is scaled.
          </span>
        </header>
        <AuditTable
          title="Confident"
          rows={rows.filter(({ icon }) => !reusedPicks.has(icon.fluent.name) && !lessConfident.has(icon.lucide))}
          size={size}
          filled={filled}
        />
        <AuditTable
          title="Less confident"
          rows={rows.filter(({ icon }) => !reusedPicks.has(icon.fluent.name) && lessConfident.has(icon.lucide))}
          size={size}
          filled={filled}
        />
        <AuditTable
          title="Reused icons"
          rows={rows
            .filter(({ icon }) => reusedPicks.has(icon.fluent.name))
            .toSorted((a, b) => a.icon.fluent.name.localeCompare(b.icon.fluent.name) || a.number - b.number)}
          size={size}
          filled={filled}
          grouped
        />
      </div>
    </div>
  )
}

/**
 * Every Lucide icon the app imports, numbered, with where each is used, a recommended Fluent icon and four
 * alternatives, for moving the app to Fluent icons. Icons whose recommendation matches the Lucide icon's look or meaning
 * come first, the rest after. The shadcn kit's own icons are left out, since shadcn-sync swaps them. Fluent draws each icon separately at 16, 20 and 24 pixels (and more), with a filled version of each for hover
 * and selected states, and colored versions of some. The usage is as of 2026-11-18; see `audited-icons.ts`.
 */
const meta = {
  title: "Parity/Explorations/Icon audit",
  component: IconAudit,
  parameters: { layout: "fullscreen" },
  args: { size: 20, filled: false, appOnly: false, toVerifyOnly: false },
  argTypes: {
    size: { control: "inline-radio", options: [16, 20, 24, "unsized"] },
    filled: { control: "boolean" },
    appOnly: { control: "boolean" },
    toVerifyOnly: { control: "boolean" }
  }
} satisfies Meta<typeof IconAudit>

export default meta

type Story = StoryObj<typeof meta>

/** Every icon, with alternatives at 20 pixels. */
export const EveryIcon: Story = {}

/** Only icons the app itself uses, leaving out those only explorations and stories use. */
export const AppOnly: Story = { args: { appOnly: true } }

/** Every Fluent icon filled, as a hovered or selected menu item shows it. */
export const Filled: Story = { args: { filled: true } }

/** Only the icons whose picks are still to be verified, keeping their numbers. */
export const ToVerify: Story = { args: { toVerifyOnly: true } }
