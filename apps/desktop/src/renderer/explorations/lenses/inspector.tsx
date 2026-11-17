import { TabsContent } from "@buildkitgg/shadcn"
import {
  Code,
  Columns2,
  KeyRound,
  Link2,
  MonitorSmartphone,
  MousePointerClick,
  SlidersHorizontal,
  Table2
} from "lucide-react"
import { Hint } from "../../chrome/Hint.tsx"
import { IconButton } from "../../chrome/IconButton.tsx"
import { ModesPanel } from "../../chrome/ModesPanel.tsx"
import { Name } from "../../chrome/Name.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { Value } from "../../chrome/RoutePanel.tsx"
import { headingIcon, headingName, SelectionHeading } from "../../chrome/SelectionHeading.tsx"
import { Field, FieldGrid } from "../../inspector/controls/field-row.tsx"
import { kindLooks, lensOrder, lenses, type Ref, thing, type ThingKind } from "./data.ts"
import type { LensId } from "./model.ts"
import { type PanelTab, PanelFrame } from "./panel.tsx"

/** What each kind's facts are headed as, as the app heads a route's (`RouteSection`). */
const factTitles: Record<ThingKind, string> = {
  page: "Route",
  layout: "Route",
  screen: "Design",
  component: "Source",
  story: "Story",
  "story-file": "Stories",
  table: "Table"
}

/** The lenses whose things are designs, which the project's modes draw. */
const drawn: LensId[] = ["pages", "screens", "components"]

/**
 * The inspector for the canvas in focus: what's selected in its lens, and what it's linked to in the others. Each link
 * shows its lens with the thing selected, in the canvas in focus, or to the side with the button beside it.
 */
export function LensInspector({
  lens,
  selected,
  tab,
  onTab,
  onHide,
  onShow,
  onShowBeside,
  onPeek
}: {
  lens: LensId
  selected: string | undefined
  tab: string
  onTab: (tab: string) => void
  onHide: () => void
  onShow: (ref: Ref) => void
  onShowBeside: (ref: Ref) => void
  onPeek: (ref: Ref | undefined) => void
}) {
  const info = lenses[lens]

  const tabs: PanelTab[] = [
    { value: "design", label: info.inspector, icon: lens === "data" ? Table2 : SlidersHorizontal },
    ...(drawn.includes(lens) ? [{ value: "modes", label: "Modes", icon: MonitorSmartphone }] : [])
  ]

  return (
    <PanelFrame side="right" label="Inspector" tabs={tabs} tab={tab} onTab={onTab} onHide={onHide}>
      <TabsContent value="design" className="min-h-0 overflow-x-hidden overflow-y-auto">
        <Selected lens={lens} selected={selected} onShow={onShow} onShowBeside={onShowBeside} onPeek={onPeek} />
      </TabsContent>
      {drawn.includes(lens) && (
        <TabsContent value="modes" className="min-h-0 overflow-x-hidden overflow-y-auto">
          <ModesPanel />
        </TabsContent>
      )}
    </PanelFrame>
  )
}

function Selected({
  lens,
  selected,
  onShow,
  onShowBeside,
  onPeek
}: {
  lens: LensId
  selected: string | undefined
  onShow: (ref: Ref) => void
  onShowBeside: (ref: Ref) => void
  onPeek: (ref: Ref | undefined) => void
}) {
  const info = lenses[lens]
  const item = thing(lens, selected)

  if (info.missing) {
    return null
  }

  if (!item) {
    return (
      <div className="type-empty flex flex-col items-center gap-2 px-6 py-12 text-center text-muted-foreground">
        <MousePointerClick className="size-5" />
        {info.nothing}
      </div>
    )
  }

  const look = kindLooks[item.kind]
  const Icon = look.icon

  const linked = lensOrder.flatMap((other) => {
    const refs = (item.links ?? []).filter((ref) => ref.lens === other)

    return refs.length > 0 ? [[other, refs] as const] : []
  })

  return (
    <>
      <section className="border-b py-4 pr-3 pl-3">
        <SelectionHeading
          icon={<Icon className={headingIcon} />}
          color={look.color}
          kind={look.word}
          name={<span className={`${headingName} truncate pl-1.5`}>{item.name}</span>}
          action={
            <IconButton label="Open in editor" onClick={() => undefined}>
              <Code />
            </IconButton>
          }
        />
      </section>
      {item.facts && item.facts.length > 0 && (
        <PanelSection title={factTitles[item.kind]}>
          <FieldGrid>
            {item.facts.map(([label, value]) => (
              <Field key={label} label={label}>
                <Value>{value}</Value>
              </Field>
            ))}
          </FieldGrid>
        </PanelSection>
      )}
      {item.columns && (
        <PanelSection title="Columns" count={item.columns.length}>
          <ul className="-mx-1 flex flex-col">
            {item.columns.map((column) => (
              <li key={column.name} className="flex h-7 items-center gap-2 px-1 text-sm">
                <span className="grid size-3.5 shrink-0 place-items-center">
                  {column.key === "primary" && (
                    <KeyRound className="size-3.5 text-amber-500" aria-label="Primary key" />
                  )}
                  {column.key === "foreign" && (
                    <Link2
                      className="size-3.5"
                      style={{ color: look.color }}
                      aria-label={`Refers to ${column.refers}`}
                    />
                  )}
                </span>
                <span className="truncate font-mono text-[13px]">{column.name}</span>
                {column.refers && <span className="truncate text-xs text-muted-foreground">{column.refers}</span>}
                <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{column.type}</span>
              </li>
            ))}
          </ul>
        </PanelSection>
      )}
      {linked.map(([other, refs]) => (
        <PanelSection key={other} title={lenses[other].label} count={refs.length}>
          <ul className="-mx-1.5 flex flex-col">
            {refs.map((ref) => (
              <LinkRow key={ref.id} target={ref} onShow={onShow} onShowBeside={onShowBeside} onPeek={onPeek} />
            ))}
          </ul>
        </PanelSection>
      ))}
    </>
  )
}

/**
 * A link to a thing in another lens: a click shows it there, with it selected, in the canvas in focus; the button at
 * the end, Show beside, splits its lens to the right, as VS Code's Open to the Side does.
 */
function LinkRow({
  target,
  onShow,
  onShowBeside,
  onPeek
}: {
  target: Ref
  onShow: (ref: Ref) => void
  onShowBeside: (ref: Ref) => void
  onPeek: (ref: Ref | undefined) => void
}) {
  const item = thing(target.lens, target.id)

  if (!item) {
    return null
  }

  const look = kindLooks[item.kind]
  const Icon = look.icon

  return (
    <li
      className="group/link flex h-8 items-center gap-0.5 rounded-md hover:bg-accent/50"
      onPointerEnter={() => onPeek(target)}
      onPointerLeave={() => onPeek(undefined)}
    >
      <Hint label={`Show in ${lenses[target.lens].label}`} wait>
        <button
          type="button"
          onClick={() => onShow(target)}
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Icon className="size-3.5 shrink-0" style={{ color: look.color }} />
          <Name className="min-w-0">{item.name}</Name>
          {item.detail && <span className="min-w-0 truncate text-xs text-muted-foreground">{item.detail}</span>}
        </button>
      </Hint>
      <span className="opacity-0 group-focus-within/link:opacity-100 group-hover/link:opacity-100">
        <IconButton label="Show beside" onClick={() => onShowBeside(target)}>
          <Columns2 />
        </IconButton>
      </span>
    </li>
  )
}
