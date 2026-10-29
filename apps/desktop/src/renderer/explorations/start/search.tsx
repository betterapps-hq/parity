/**
 * Search, from Ctrl K or the start page's field: designs, projects, components, people, templates and commands in one
 * list, with the matching part of each name marked.
 */
import { Component, CreditCard, FolderOpen, type LucideIcon, Plus, Settings, UserPlus, Users } from "lucide-react"
import { useState } from "react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { me, people } from "../explore-data.ts"
import { Avatar, GitHubMark } from "../parts.tsx"
import { projects, stack, templates } from "./data.ts"
import type { NewProjectStart } from "./new-project.tsx"
import { parity, StackMark, useStart } from "./page.tsx"
import { DesignRender } from "./renders.tsx"

/** Components as the project's code names them, with the file each lives in. */
const components = [
  { name: "BillingToggle", path: "src/components/pricing/billing-toggle.tsx", project: "website" },
  { name: "BillingSummary", path: "src/routes/billing/summary.tsx", project: "dashboard" },
  { name: "InvoiceTable", path: "src/routes/billing/invoice-table.tsx", project: "dashboard" },
  { name: "PlanCard", path: "src/components/pricing/plan-card.tsx", project: "website" },
  { name: "WalkerCard", path: "src/components/walker-card.tsx", project: "walkies" },
  { name: "Button", path: "src/button/button.tsx", project: "library" }
]

const commands: { label: string; icon: LucideIcon; shortcut?: string; mark?: boolean; starts?: NewProjectStart }[] = [
  { label: "New project", icon: Plus, shortcut: "Ctrl N", starts: { tab: "template" } },
  { label: "Open a folder", icon: FolderOpen, shortcut: "Ctrl O", starts: { tab: "existing", source: "folder" } },
  { label: "Clone a repository", icon: FolderOpen, mark: true, starts: { tab: "existing", source: "github" } },
  { label: "Invite people to Kestrel", icon: UserPlus },
  { label: "Billing and seats", icon: CreditCard },
  { label: "Switch organization", icon: Users },
  { label: "Settings", icon: Settings, shortcut: "Ctrl ," }
]

const everyone = [me, ...Object.values(people)]

function matches(query: string, ...texts: string[]): boolean {
  const wanted = query.trim().toLowerCase()
  return !wanted || texts.some((text) => text.toLowerCase().includes(wanted))
}

/** A name with the part that matches the search marked. */
function Highlight({ text, query }: { text: string; query: string }) {
  const wanted = query.trim().toLowerCase()
  const at = wanted ? text.toLowerCase().indexOf(wanted) : -1
  if (at < 0) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, at)}
      <mark className="rounded-[3px] bg-(--parity)/30 px-px text-foreground">{text.slice(at, at + wanted.length)}</mark>
      {text.slice(at + wanted.length)}
    </span>
  )
}

/** Search across everything you can open, as a palette over the page. */
export function SearchPalette({
  open,
  onOpenChange,
  initialQuery = ""
}: {
  open: boolean
  onOpenChange?(open: boolean): void
  initialQuery?: string
}) {
  const start = useStart()
  const [query, setQuery] = useState(initialQuery)
  const searching = query.trim() !== ""
  /** Does what a result says, then gets out of the way. */
  const pick = (act?: () => void) => () => {
    onOpenChange?.(false)
    act?.()
  }
  const designs = projects
    .flatMap((project) => project.designs.map((design) => ({ project, design })))
    .filter(({ project, design }) => matches(query, design.name, ...(searching ? [] : [project.name])))
    .slice(0, searching ? 6 : 4)
  const projectHits = projects.filter((project) => matches(query, project.name)).slice(0, 4)
  const componentHits = searching ? components.filter((component) => matches(query, component.name)) : []
  const peopleHits = searching ? everyone.filter((person) => matches(query, person.name)) : []
  const templateHits = searching
    ? templates.filter((template) => matches(query, template.name, template.blurb)).slice(0, 3)
    : []
  const commandHits = commands.filter((command) => matches(query, command.label))
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search designs, projects, components, people, templates and commands"
      className="sm:max-w-[680px]"
    >
      <Command shouldFilter={false} style={{ ["--parity" as string]: parity }}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search designs, projects, components and people"
        />
        <CommandList className="max-h-[min(520px,60vh)]">
          <CommandEmpty>Nothing matches. Try a design, a project or a person.</CommandEmpty>
          {designs.length > 0 && (
            <CommandGroup heading={searching ? "Designs" : "Recent designs"}>
              {designs.map(({ project, design }) => (
                <CommandItem
                  key={`${project.id}-${design.name}`}
                  value={`${project.id}-${design.name}`}
                  onSelect={pick(() => start.openProject?.(project.id))}
                  className="gap-3"
                >
                  <span className="w-[72px] shrink-0 overflow-hidden rounded-[3px] ring-1 ring-white/10">
                    <DesignRender kind={design.kind} look={project.look} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">
                      <Highlight text={design.name} query={query} />
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {project.name}
                      {design.mobile ? ", desktop and phone" : ""}
                    </span>
                  </span>
                  {project.live && (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <Avatar person={project.live.who} size={16} />
                      {project.live.who.agent
                        ? `${project.live.who.name} is working`
                        : `${project.live.who.name.split(" ")[0]} is here`}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {projectHits.length > 0 && (
            <CommandGroup heading={searching ? "Projects" : "Recent projects"}>
              {projectHits.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`project-${project.id}`}
                  onSelect={pick(() => start.openProject?.(project.id))}
                  className="gap-3"
                >
                  <StackMark stack={stack(project.stack)} size={20} />
                  <span className="flex-1 truncate">
                    <Highlight text={project.name} query={query} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {project.designs.length} {project.designs.length === 1 ? "design" : "designs"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {componentHits.length > 0 && (
            <CommandGroup heading="Components">
              {componentHits.map((component) => (
                <CommandItem
                  key={component.name}
                  value={`component-${component.name}`}
                  onSelect={pick(() => start.openProject?.(component.project))}
                  className="gap-3"
                >
                  <Component className="text-[oklch(0.7_0.2_304)]" />
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[13px]">
                      <Highlight text={component.name} query={query} />
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">{component.path}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {projects.find((project) => project.id === component.project)!.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {peopleHits.length > 0 && (
            <CommandGroup heading="People and agents">
              {peopleHits.map((person) => (
                <CommandItem key={person.name} value={`person-${person.name}`} onSelect={pick()} className="gap-3">
                  <Avatar person={person} size={20} />
                  <Highlight text={person.name} query={query} />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {templateHits.length > 0 && (
            <CommandGroup heading="Templates">
              {templateHits.map((template) => (
                <CommandItem
                  key={template.id}
                  value={`template-${template.id}`}
                  onSelect={pick(() =>
                    start.newProject?.({ tab: "template", stack: template.stack, template: template.id })
                  )}
                  className="gap-3"
                >
                  <span className="w-[72px] shrink-0 overflow-hidden rounded-[3px] ring-1 ring-white/10">
                    <DesignRender kind={template.designs[0]!.kind} look={template.look} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span>
                      New project from <Highlight text={template.name} query={query} />
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      <Highlight text={template.blurb} query={query} />, on {stack(template.stack).name}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {commandHits.length > 0 && (
            <CommandGroup heading="Commands">
              {commandHits.map((command) => (
                <CommandItem
                  key={command.label}
                  value={`command-${command.label}`}
                  onSelect={pick(command.starts && (() => start.newProject?.(command.starts)))}
                  className="gap-3"
                >
                  {command.mark ? <GitHubMark size={16} /> : <command.icon />}
                  <Highlight text={command.label} query={query} />
                  {command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        <footer className="flex items-center gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> Open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Ctrl Enter</Kbd> Open in a new tab
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Esc</Kbd> Close
          </span>
        </footer>
      </Command>
    </CommandDialog>
  )
}
