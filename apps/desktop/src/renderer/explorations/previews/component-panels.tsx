import {
  BookOpen,
  ChevronRight,
  Columns3,
  FileCode,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  Shapes,
  StretchHorizontal,
  Type
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Hint } from "../../chrome/Hint.tsx"
import { useHoverCard } from "../../chrome/hover-card.ts"
import { ComponentPreview, KindIcon, stateWords } from "./component-art.tsx"
import { components, groupTitles, type PreviewState, type SampleComponent } from "./preview-data.ts"

export type ComponentsView = "names" | "list" | "grid"

/** What a row says under a component's name: its variants, or why it has no picture. */
function meta(component: SampleComponent): { text: string; tone?: string } | undefined {
  const problem: Partial<Record<PreviewState, string>> = {
    failed: "text-destructive",
    "needs-props": "text-(--process-starting)",
    "needs-provider": "text-(--process-starting)",
    "server-only": "text-muted-foreground",
    "draws-nothing": "text-muted-foreground"
  }
  if (component.state in problem) return { text: stateWords[component.state].long, tone: problem[component.state] }
  const variants = Object.values(component.variants ?? {}).reduce((sum, options) => sum + options.length, 0)
  if (variants > 0) return { text: `${Object.keys(component.variants!).join(" and ")}, ${variants} options` }
  if (component.family && component.group !== "kit") return { text: component.family }
  return undefined
}

/** A component in the panel, in the chosen view, with its card on hover. */
function ComponentItem({
  component,
  view,
  card
}: {
  component: SampleComponent
  view: ComponentsView
  card?: boolean
}) {
  const hover = useHoverCard(card ?? false)
  const about = meta(component)
  let item: ReactNode
  if (view === "grid")
    item = (
      <button
        type="button"
        onPointerEnter={hover.enter}
        onPointerLeave={hover.leave}
        className="flex min-w-0 cursor-grab flex-col gap-1 rounded-md p-1 text-left hover:bg-accent aria-expanded:bg-accent"
        aria-expanded={hover.open}
      >
        <ComponentPreview component={component} width={118} height={76} />
        <span className="flex min-w-0 items-center gap-1 px-0.5 text-[11px]">
          <KindIcon component={component} className="size-3" />
          <span className="truncate">{component.name}</span>
        </span>
      </button>
    )
  else if (view === "list")
    item = (
      <button
        type="button"
        onPointerEnter={hover.enter}
        onPointerLeave={hover.leave}
        aria-expanded={hover.open}
        className="flex h-11 w-full min-w-0 cursor-grab items-center gap-2.5 rounded-md pr-2 pl-3 text-left hover:bg-accent aria-expanded:bg-accent"
      >
        <ComponentPreview component={component} width={52} height={34} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px]">{component.name}</span>
          {about && (
            <span className={`truncate text-[11px] ${about.tone ?? "text-muted-foreground"}`}>{about.text}</span>
          )}
        </span>
      </button>
    )
  else
    item = (
      <button
        type="button"
        onPointerEnter={hover.enter}
        onPointerLeave={hover.leave}
        aria-expanded={hover.open}
        className="flex h-7 w-full cursor-grab items-center gap-2 rounded-md pr-8 pl-8 text-left text-[13px] hover:bg-accent aria-expanded:bg-accent"
      >
        <KindIcon component={component} />
        <span className="truncate">{component.name}</span>
      </button>
    )
  return (
    <Popover open={hover.open} onOpenChange={hover.setOpen} modal={false}>
      <PopoverAnchor asChild>{item}</PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={14}
        className="w-[320px] p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={hover.stay}
        onPointerLeave={hover.leave}
      >
        <ComponentCard component={component} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The Components tab with previews. Names is today's list; List adds a small picture to each row, and Grid shows
 * larger ones two to a row. Hovering a component opens its card.
 */
export function ComponentsPanel({
  view: initialView = "list",
  card,
  query: initialQuery = ""
}: {
  view?: ComponentsView
  /** A component whose card shows open. */
  card?: string
  query?: string
}) {
  const [view, setView] = useState(initialView)
  const [query, setQuery] = useState(initialQuery)
  const needle = query.trim().toLowerCase()
  const shown = components.filter(
    (component) =>
      (!needle || component.name.toLowerCase().includes(needle)) &&
      // A provider or another export that draws nothing stays out unless it's searched for by name.
      (component.state !== "draws-nothing" || needle.length > 0)
  )
  const groups = Map.groupBy(shown, (component) => component.group)
  return (
    <>
      <div className="flex items-center gap-1 px-2 pt-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search components"
            aria-label="Search components"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Hint label="Add a library">
          <Button variant="ghost" size="icon" className="size-8" aria-label="Add a library">
            <Plus />
          </Button>
        </Hint>
      </div>
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="text-[11px] text-muted-foreground">{shown.length} components</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={view}
          onValueChange={(value) => value && setView(value as ComponentsView)}
          aria-label="Show components as"
        >
          {(
            [
              ["names", "Names", StretchHorizontal],
              ["list", "List with previews", List],
              ["grid", "Grid", LayoutGrid]
            ] as const
          ).map(([value, label, Icon]) => (
            <Hint key={value} label={label}>
              <ToggleGroupItem value={value} aria-label={label} className="h-6 w-7 aria-checked:bg-muted">
                <Icon className="size-3.5" />
              </ToggleGroupItem>
            </Hint>
          ))}
        </ToggleGroup>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2 text-[13px]">
        {[...groups].map(([group, list]) => (
          <section key={group} className="mb-1">
            <div className="flex h-7 w-full items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground">
              <ChevronRight className="size-3.5 rotate-90" />
              <KindIcon component={list[0]!} />
              <span className="min-w-0 flex-1 truncate">{groupTitles[group]}</span>
              <span className="tabular-nums">{list.length}</span>
            </div>
            {view === "grid" ? (
              <div className="grid grid-cols-2 gap-1 px-2">
                {list.map((component) => (
                  <ComponentItem key={component.id} component={component} view={view} card={component.name === card} />
                ))}
              </div>
            ) : (
              list.map((component) => (
                <ComponentItem key={component.id} component={component} view={view} card={component.name === card} />
              ))
            )}
          </section>
        ))}
        {shown.length === 0 && <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing matches.</p>}
      </div>
    </>
  )
}

/** What a card says about a preview that can't be made, and what fixes it. */
function Problem({ component }: { component: SampleComponent }) {
  const actions: Partial<Record<PreviewState, { say: ReactNode; act: string[] }>> = {
    failed: {
      say: "It throws while drawing, so there's no picture. The canvas shows the same error where it's used.",
      act: ["Open file", "Try again"]
    },
    "needs-props": {
      say: (
        <>
          It needs <code className="font-mono">{component.needs?.join(", ")}</code> to draw. A story&apos;s args or
          sample props give it one, and the preview follows.
        </>
      ),
      act: ["Set sample props", "Open file"]
    },
    "needs-provider": {
      say: (
        <>
          It needs <code className="font-mono">{component.needs?.join(", ")}</code> around it. A decorator adds it to
          every frame and preview.
        </>
      ),
      act: ["Add a decorator", "Open file"]
    },
    "server-only": {
      say: "It imports code that only runs on a server, so neither the canvas nor a preview can draw it.",
      act: ["Open file"]
    },
    "draws-nothing": {
      say: "It wraps other components and draws nothing of its own. It's listed because you searched for it.",
      act: ["Open file"]
    }
  }
  const entry = actions[component.state]
  if (!entry) return null
  return (
    <div className="flex flex-col gap-2 border-t p-3">
      <p className="text-xs">{entry.say}</p>
      {component.problem && (
        <pre className="max-h-16 overflow-hidden rounded-md bg-muted px-2 py-1.5 font-mono text-[10px] leading-snug whitespace-pre-wrap text-muted-foreground">
          {component.problem}
        </pre>
      )}
      <div className="flex gap-1.5">
        {entry.act.map((label, index) => (
          <Button key={label} size="sm" variant={index === 0 ? "secondary" : "ghost"} className="h-7 text-xs">
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}

/**
 * A component's card: a large preview, its variants as small ones (made when the card first opens), where it's from,
 * and what to do with it. A component that can't be drawn says why and what fixes it instead.
 */
export function ComponentCard({ component, insert = true }: { component: SampleComponent; insert?: boolean }) {
  const [variant, setVariant] = useState<string>()
  const [axis, options] = Object.entries(component.variants ?? {})[0] ?? []
  const drawn = component.state === "ready" || component.state === "stale"
  return (
    <div className="flex flex-col">
      <div className="p-2">
        <ComponentPreview component={component} width={304} height={176} variant={variant} />
      </div>
      {drawn && axis && options && (
        <div className="flex flex-col gap-1 px-3 pb-1">
          <span className="text-[11px] text-muted-foreground">{axis}</span>
          <div className="flex gap-1 overflow-hidden">
            {options.slice(0, 5).map((option) => (
              <Hint key={option} label={option}>
                <button
                  type="button"
                  aria-label={`${axis} ${option}`}
                  aria-pressed={variant === option || (!variant && option === options[0])}
                  onPointerEnter={() => setVariant(option)}
                  onFocus={() => setVariant(option)}
                  className="flex rounded-md outline-offset-1 aria-pressed:outline-2 aria-pressed:outline-(--canvas-component)"
                >
                  <ComponentPreview component={component} width={54} height={30} variant={option} />
                </button>
              </Hint>
            ))}
            {options.length > 5 && (
              <span className="grid h-[30px] w-9 place-items-center rounded-md bg-muted text-[11px] text-muted-foreground">
                +{options.length - 5}
              </span>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-center gap-2">
          <KindIcon component={component} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{component.name}</span>
          {component.size && drawn && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {component.size[0]} × {component.size[1]}
            </span>
          )}
        </div>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{component.file}</span>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {component.uses !== undefined && (
            <span>{component.uses === 0 ? "Not used yet" : `Used ${component.uses} times`}</span>
          )}
          {component.stories !== undefined && <span>{component.stories} stories</span>}
          {component.props && <span>Props: {component.props.join(", ")}</span>}
        </div>
      </div>
      <Problem component={component} />
      <div className="flex items-center gap-1.5 border-t px-3 py-2">
        {insert && drawn && (
          <Button size="sm" className="h-7 text-xs">
            <Plus /> Insert
          </Button>
        )}
        <Hint label="Open file">
          <Button size="icon" variant="ghost" className="size-7" aria-label="Open file">
            <FileCode />
          </Button>
        </Hint>
        {component.stories !== undefined && (
          <Hint label="Open in Storybook">
            <Button size="icon" variant="ghost" className="size-7" aria-label="Open in Storybook">
              <BookOpen />
            </Button>
          </Hint>
        )}
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          {component.state === "stale" && <RefreshCw className="size-3" />}
          {component.made ?? (drawn ? "" : stateWords[component.state].short)}
        </span>
      </div>
    </div>
  )
}

/** Layers every design can use, drawn as small diagrams, since they have no component to picture. */
const basics: { id: string; label: string; icon: typeof Type; art: ReactNode }[] = [
  {
    id: "text",
    label: "Text",
    icon: Type,
    art: <span className="text-[13px] leading-none font-medium text-muted-foreground">Aa</span>
  },
  {
    id: "column",
    label: "Vertical layout",
    icon: Rows3,
    art: (
      <span className="flex w-5 flex-col gap-0.5">
        {[0, 1, 2].map((index) => (
          <span key={index} className="h-1 rounded-[1px] bg-(--canvas-layer)/70" />
        ))}
      </span>
    )
  },
  {
    id: "row",
    label: "Horizontal layout",
    icon: Columns3,
    art: (
      <span className="flex h-3.5 gap-0.5">
        {[0, 1, 2].map((index) => (
          <span key={index} className="w-1.5 rounded-[1px] bg-(--canvas-layer)/70" />
        ))}
      </span>
    )
  }
]

/** What `/` lists, in its order: component designs, the UI kit, then the rest of the app. Pages and plumbing stay out. */
const insertable = components.filter((component) => component.group !== "pages" && component.state !== "draws-nothing")

/**
 * The `/` insert picker with previews: a small picture beside each name and, for the highlighted one, a large preview
 * with its variants and source beside the list, following the keyboard. Enter inserts it.
 */
export function InsertPicker({ highlighted = "Project card", query }: { highlighted?: string; query?: string }) {
  const [active, setActive] = useState(highlighted)
  const [search, setSearch] = useState(query ?? "")
  const current = insertable.find((component) => component.name === active)
  const basic = basics.find((entry) => entry.label === active)
  const groups = Map.groupBy(insertable, (component) => component.group)
  let detail: ReactNode = <div className="flex-1" />
  if (current)
    detail = (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ComponentCard component={current} insert={false} />
      </div>
    )
  else if (basic)
    detail = (
      <div className="flex flex-1 flex-col gap-2 p-3">
        <span className="grid h-44 place-items-center rounded-md border bg-muted/40 [&>*]:scale-[3]">{basic.art}</span>
        <span className="flex items-center gap-2 px-1 text-sm font-medium">
          <basic.icon className="size-3.5" /> {basic.label}
        </span>
        <span className="px-1 text-xs text-muted-foreground">Goes where a paste would: into the selected layout.</span>
      </div>
    )
  return (
    <div className="flex h-[490px] w-[760px] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      <Command value={active} onValueChange={setActive} loop className="w-[400px] shrink-0 rounded-none border-r">
        <CommandInput value={search} onValueChange={setSearch} placeholder="Insert a layer, component or icon" />
        <CommandList className="max-h-none flex-1">
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Basics">
            {basics.map(({ id, label, art }) => (
              <CommandItem key={id} value={label} className="gap-2.5">
                <span className="grid h-7 w-11 shrink-0 place-items-center rounded-md border bg-muted/50">{art}</span>
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
          {[...groups].map(([group, list]) => (
            <CommandGroup key={group} heading={groupTitles[group]}>
              {list.map((component) => (
                <CommandItem
                  key={component.id}
                  value={component.name}
                  keywords={[component.family ?? ""]}
                  className="gap-2.5"
                >
                  <ComponentPreview component={component} width={44} height={28} />
                  <span className="truncate">{component.name}</span>
                  {component.family && component.group !== "kit" && component.group !== "designs" && (
                    <span className="ml-auto truncate text-xs text-muted-foreground">{component.family}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {search.trim().length < 2 && (
            <p className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
              <Shapes className="size-3.5" /> Type to search 1,647 icons too
            </p>
          )}
        </CommandList>
      </Command>
      <div className="flex min-w-0 flex-1 flex-col">
        {detail}
        <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> Insert
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> Move
          </span>
          <span className="ml-auto">Or drag onto a design</span>
        </div>
      </div>
    </div>
  )
}
