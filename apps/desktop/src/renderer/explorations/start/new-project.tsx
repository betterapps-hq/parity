/**
 * Making a new project: from a template on a stack, or from something that exists already. Templates come from the
 * Scaffolder's catalog, so each one starts from a stack and asks only what's left.
 */
import { ArrowLeft, Check, Folder, FolderGit2, FolderOpen, LayoutGrid, Lock, Plus, Search } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { AzureDevOpsMark, GitHubMark } from "../parts.tsx"
import {
  type AudienceId,
  audiences,
  type OrgId,
  organizations,
  projects,
  repositories,
  type Repository,
  type Stack,
  stack as findStack,
  type StackId,
  stacks,
  type Template,
  templates,
  templatesOn
} from "./data.ts"
import { CanvasArt, parity, Segmented, StackMark } from "./page.tsx"
import { DesignRender } from "./renders.tsx"

export type ExistingSource = "projects" | "github" | "azure" | "folder"

/** Where the dialog opens: a stack's templates, one template's setup, or a source of existing projects. */
export type NewProjectStart =
  | { tab: "template"; stack?: StackId; template?: string }
  | { tab: "existing"; source?: ExistingSource; project?: string }

/** New project, over whatever page opened it. */
export function NewProjectDialog({
  start,
  open,
  onOpenChange
}: {
  start: NewProjectStart
  open: boolean
  onOpenChange?(open: boolean): void
}) {
  const [tab, setTab] = useState(start.tab)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(780px,calc(100vh-72px))] w-[1180px] max-w-[calc(100vw-72px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-72px)]"
        style={{ ["--parity" as string]: parity }}
      >
        <header className="flex h-14 shrink-0 items-center gap-5 border-b pr-14 pl-5">
          <DialogTitle className="text-[15px] font-semibold">New project</DialogTitle>
          <Segmented
            options={[
              { id: "template", label: "From a template" },
              { id: "existing", label: "From an existing project" }
            ]}
            value={tab}
            onChange={setTab}
          />
          <DialogDescription className="sr-only">
            Start a project from a template on a stack, or from a project, repository or folder you already have.
          </DialogDescription>
        </header>
        {tab === "template" ? (
          <TemplateFlow
            initialStack={start.tab === "template" ? start.stack : undefined}
            initialTemplate={start.tab === "template" ? start.template : undefined}
          />
        ) : (
          <ExistingFlow
            initialSource={start.tab === "existing" ? start.source : undefined}
            initialProject={start.tab === "existing" ? start.project : undefined}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A list's left column, as both flows have it: what to pick from. */
function SideList({ label, note, children }: { label: string; note: ReactNode; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex w-[264px] shrink-0 flex-col gap-1 border-r p-3">
      <span className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      <p className="mt-auto rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
        {note}
      </p>
    </nav>
  )
}

function SideItem({
  selected,
  onSelect,
  icon,
  title,
  detail,
  count
}: {
  selected: boolean
  onSelect(): void
  icon: ReactNode
  title: string
  detail: string
  count?: number
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="flex items-start gap-3 rounded-lg p-2.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted"
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center justify-between gap-2 text-sm font-medium">
          {title}
          {count !== undefined && (
            <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
          )}
        </span>
        <span className="text-xs leading-snug text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{children}</span>
}

/** Nothing but the stack, set up: no designs to start from. */
function blankOn(stack: Stack): Template {
  return {
    id: `blank-${stack.id}`,
    name: "Blank app",
    blurb: `Just ${stack.name}, set up`,
    stack: stack.id,
    designs: [],
    look: { hue: 0, brand: "Acme", icon: Plus, mono: true },
    adds: [],
    database: "None",
    jobs: "None",
    ...(stack.modes[0] ? { mode: stack.modes[0] } : {})
  }
}

/** Pick a stack, then a template on it. */
function TemplateFlow({ initialStack, initialTemplate }: { initialStack?: StackId; initialTemplate?: string }) {
  const [stackId, setStackId] = useState<StackId>(initialStack ?? "tanstack-start")
  const [picked, setPicked] = useState(() => templates.find((template) => template.id === initialTemplate))
  if (picked) return <TemplateSetup key={picked.id} template={picked} onBack={() => setPicked(undefined)} />
  const stack = findStack(stackId)
  return (
    <div className="flex min-h-0 flex-1">
      <SideList
        label="Stacks"
        note="Templates come from the Scaffolder's catalog. Each one starts from a stack and asks only what's left."
      >
        {stacks.map((candidate) => (
          <SideItem
            key={candidate.id}
            selected={candidate.id === stackId}
            onSelect={() => setStackId(candidate.id)}
            icon={<StackMark stack={candidate} size={28} />}
            title={candidate.name}
            detail={candidate.summary}
            count={templatesOn(candidate.id).length}
          />
        ))}
      </SideList>
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-3.5 border-b px-7 py-5">
          <div className="flex items-start gap-3">
            <StackMark stack={stack} size={36} />
            <div className="flex flex-col gap-0.5">
              <h3 className="text-lg font-semibold tracking-tight">{stack.name}</h3>
              <p className="text-sm text-muted-foreground">{stack.summary}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Every template includes</span>
            {stack.includes.map((item) => (
              <Chip key={item}>{item}</Chip>
            ))}
          </div>
          {stack.modes.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">
                {stack.id === "spawnkit" ? "Renders with" : "Runs as"}
              </span>
              {stack.modes.map((mode) => (
                <Chip key={mode}>{mode}</Chip>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-x-5 gap-y-7 p-7">
          {templatesOn(stackId).map((template) => (
            <TemplateTile key={template.id} template={template} onPick={setPicked} />
          ))}
          <TemplateTile template={blankOn(stack)} onPick={setPicked} />
        </div>
      </div>
    </div>
  )
}

/** A template in the picker: its first design, what it's for and what it adds to the stack. */
function TemplateTile({ template, onPick }: { template: Template; onPick(template: Template): void }) {
  const extra = template.adds.length - 3
  const first = template.designs[0]
  return (
    <button
      type="button"
      onClick={() => onPick(template)}
      className="group/tile flex flex-col gap-2.5 text-left outline-none"
    >
      <span className="relative block overflow-hidden rounded-xl ring-1 ring-white/[0.08] transition-shadow duration-150 group-hover/tile:ring-2 group-hover/tile:ring-(--parity) group-focus-visible/tile:ring-2 group-focus-visible/tile:ring-ring">
        {first ? (
          <DesignRender kind={first.kind} look={template.look} />
        ) : (
          <span className="grid aspect-[16/10] place-items-center bg-white/[0.015]">
            <span className="flex flex-col items-center gap-2 text-muted-foreground">
              <StackMark stack={findStack(template.stack)} size={30} />
              <Plus className="size-4" />
            </span>
          </span>
        )}
        {template.designs.length > 1 && (
          <span className="absolute top-2 right-2 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            {template.designs.length} designs
          </span>
        )}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{template.name}</span>
        <span className="text-xs text-muted-foreground">{template.blurb}</span>
      </span>
      {(template.mode || template.adds.length > 0) && (
        <span className="flex flex-wrap gap-1">
          {template.mode && <Chip>{template.mode}</Chip>}
          {template.adds.slice(0, 3).map((item) => (
            <Chip key={item}>{item}</Chip>
          ))}
          {extra > 0 && <Chip>{extra} more</Chip>}
        </span>
      )}
    </button>
  )
}

/** The designs a template opens with, drawn as the canvas will show them. */
function PreviewStage({ template, index }: { template: Template; index: number }) {
  const design = template.designs[index]
  const label = "absolute -top-5 left-0 text-[11px] font-medium whitespace-nowrap text-white/45"
  const shadow = "shadow-[0_24px_60px_-12px_rgb(0_0_0/0.7)] ring-1 ring-white/10"
  return (
    <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-xl bg-[#0f0f12] ring-1 ring-white/[0.06]">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(60% 60% at 35% 30%, oklch(0.55 0.14 ${template.look.hue} / ${template.look.mono ? 0 : 0.2}), transparent 70%)`
        }}
      />
      {design ? (
        <div className="absolute inset-0 flex items-center justify-center gap-[3%] px-[6%] pt-4">
          <div className={`relative ${design.mobile ? "w-[72%]" : "w-[88%]"}`}>
            <span className={label}>{design.name}</span>
            <DesignRender kind={design.kind} look={template.look} className={`rounded-md ${shadow}`} />
          </div>
          {design.mobile && (
            <div className="relative w-[20%]">
              <span className={label}>Phone</span>
              <DesignRender kind={design.kind} look={template.look} mobile className={`rounded-[10px] ${shadow}`} />
            </div>
          )}
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="grid aspect-[16/10] w-[70%] place-items-center rounded-md border border-dashed border-white/15 text-sm text-muted-foreground">
            An empty design, ready for your first component
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

/** A one-of choice from the catalog, such as the database. */
function SlotSelect({
  id,
  label,
  value,
  options,
  onChange
}: {
  id: string
  label: string
  value: string
  options: string[]
  onChange(value: string): void
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

const databases = ["Cloudflare D1", "Neon", "Convex", "None"]
const jobRunners = ["Queues and Workflows", "Trigger.dev", "Convex scheduler", "None"]
const physicsEngines = ["Arcade", "Matter", "Rapier 2D", "Rapier 3D", "None"]

/** Optional add-ons each stack's templates offer, with the template's defaults on. */
const extras: Record<StackId, { id: string; label: string; detail: string; on?: boolean }[]> = {
  "tanstack-start": [
    { id: "storybook", label: "Storybook", detail: "Stories for every component", on: true },
    { id: "i18n", label: "Localization", detail: "Lingui, with localized URLs" },
    { id: "analytics", label: "Product analytics", detail: "PostHog" },
    { id: "errors", label: "Error tracking", detail: "Sentry" }
  ],
  spawnkit: [
    { id: "playwright", label: "Browser tests", detail: "Playwright", on: true },
    { id: "telemetry", label: "Game telemetry", detail: "Sessions and level stats", on: true },
    { id: "storybook", label: "Storybook", detail: "For the game's HUD" },
    { id: "errors", label: "Error tracking", detail: "Sentry" }
  ],
  "react-library": [
    { id: "docs", label: "Docs site", detail: "Built from your stories", on: true },
    { id: "publish", label: "Publishing", detail: "beachball, to npm", on: true },
    { id: "visual", label: "Visual tests", detail: "A screenshot of every story" }
  ],
  nextjs: [
    { id: "storybook", label: "Storybook", detail: "Stories for every component" },
    { id: "analytics", label: "Product analytics", detail: "PostHog" }
  ]
}

const starterNames: Record<string, string> = {
  saas: "Acme dashboard",
  ai: "Acme assistant",
  marketing: "Acme website",
  marketplace: "Acme market",
  collab: "Acme boards",
  docs: "Acme docs",
  platformer: "Cave run",
  arena: "Arena",
  map: "World map",
  library: "Acme UI",
  "next-starter": "Acme app"
}

/** "A, B and C". */
function sentence(items: string[]): string {
  if (items.length < 2) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
}

/** A template picked: its designs beside the questions it still has, then Create. */
function TemplateSetup({ template, onBack }: { template: Template; onBack(): void }) {
  const stack = findStack(template.stack)
  const [shown, setShown] = useState(0)
  const [name, setName] = useState(starterNames[template.id] ?? "New app")
  const [org, setOrg] = useState<OrgId>("kestrel")
  const [audience, setAudience] = useState<AudienceId>(template.audience ?? "b2b")
  const [mode, setMode] = useState(template.mode ?? stack.modes[0] ?? "")
  const [database, setDatabase] = useState(template.database ?? "None")
  const [jobs, setJobs] = useState(template.jobs ?? "None")
  const [physics, setPhysics] = useState(
    template.adds.includes("Rapier 3D") ? "Rapier 3D" : template.adds.includes("Arcade physics") ? "Arcade" : "None"
  )
  const chosen = audiences.find((candidate) => candidate.id === audience)!
  const owner = org === "kestrel" ? "kestrel" : "andrew-craswell"
  const adds = [
    ...(template.audience
      ? [chosen.signIn, ...(chosen.billing === "None" ? [] : [chosen.billing.split(",")[0]!])]
      : []),
    ...(stack.id === "tanstack-start" && database !== "None" ? [database] : []),
    ...(stack.id === "spawnkit" && physics !== "None" ? [`${physics} physics`] : [])
  ]
  const designs = template.designs.length
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[56%] min-w-0 flex-col gap-4 overflow-y-auto border-r bg-[#0b0b0d] p-5">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1.5 flex w-fit items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" /> {stack.name} templates
        </button>
        <PreviewStage template={template} index={shown} />
        {designs > 0 && (
          <div className="flex items-center gap-2">
            <span className="mr-1 text-xs text-muted-foreground">Opens with</span>
            {template.designs.map((design, index) => (
              <button
                key={design.name}
                type="button"
                aria-pressed={index === shown}
                onClick={() => setShown(index)}
                className="flex items-center gap-2 rounded-lg border border-transparent p-1 pr-2.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-border aria-pressed:bg-muted/60 aria-pressed:text-foreground"
              >
                <span className="w-14 overflow-hidden rounded-[3px] ring-1 ring-white/10">
                  <DesignRender kind={design.kind} look={template.look} />
                </span>
                {design.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2.5 rounded-xl border bg-card/30 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">From {stack.name}</span>
            {stack.includes.map((item) => (
              <Chip key={item}>{item}</Chip>
            ))}
          </div>
          {template.adds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">The template adds</span>
              {template.adds.map((item) => (
                <Chip key={item}>{item}</Chip>
              ))}
            </div>
          )}
        </div>
      </div>
      <form className="flex min-w-0 flex-1 flex-col" onSubmit={(event) => event.preventDefault()}>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
          <div className="flex items-start gap-3">
            <StackMark stack={stack} size={32} />
            <div className="flex flex-col gap-0.5">
              <h3 className="text-lg leading-tight font-semibold tracking-tight">{template.name}</h3>
              <p className="text-sm text-muted-foreground">
                {template.blurb}, on {stack.name}
              </p>
            </div>
          </div>
          <Field label="Name" htmlFor="new-project-name">
            <Input id="new-project-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Where it lives" htmlFor="new-project-org">
            <div className="flex gap-2">
              <Select value={org} onValueChange={(value) => setOrg(value as OrgId)}>
                <SelectTrigger id="new-project-org" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(organizations).map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input px-2.5 text-sm dark:bg-input/30">
                <GitHubMark size={14} />
                <span className="truncate">
                  {owner}/{slugOf(name) || "new-app"}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="size-3" /> Private
                </span>
              </span>
            </div>
          </Field>
          {template.audience && (
            <fieldset className="flex flex-col">
              <legend className="mb-2 text-sm font-medium">Who it's for</legend>
              <RadioGroup
                value={audience}
                onValueChange={(value) => setAudience(value as AudienceId)}
                className="grid-cols-3"
              >
                {audiences.map((candidate) => (
                  <label
                    key={candidate.id}
                    htmlFor={`audience-${candidate.id}`}
                    className="flex cursor-pointer flex-col gap-1.5 rounded-lg border p-3 transition-colors hover:bg-muted/40 has-[[data-state=checked]]:border-(--parity) has-[[data-state=checked]]:bg-(--parity)/5"
                  >
                    <span className="flex items-start gap-2">
                      <RadioGroupItem id={`audience-${candidate.id}`} value={candidate.id} className="mt-px" />
                      <span className="text-[13px] leading-snug font-medium">{candidate.name}</span>
                    </span>
                    <span className="pl-6 text-xs leading-snug text-muted-foreground">
                      {candidate.signIn} sign-in, {candidate.billing === "None" ? "no billing" : candidate.billing}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          )}
          {stack.modes.length > 1 && (
            <div className="flex flex-col gap-2">
              <span id="new-project-mode" className="text-sm font-medium">
                {stack.id === "spawnkit" ? "Renderer" : "Rendering"}
              </span>
              <ToggleGroup
                type="single"
                variant="outline"
                value={mode}
                onValueChange={(value) => value && setMode(value)}
                aria-labelledby="new-project-mode"
                className="w-fit"
              >
                {stack.modes.map((option) => (
                  <ToggleGroupItem key={option} value={option} className="px-3">
                    {option}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}
          {stack.id === "tanstack-start" && (
            <div className="grid grid-cols-2 gap-4">
              <SlotSelect
                id="new-project-database"
                label="Database"
                value={database}
                options={databases}
                onChange={setDatabase}
              />
              <SlotSelect
                id="new-project-jobs"
                label="Background jobs"
                value={jobs}
                options={jobRunners}
                onChange={setJobs}
              />
            </div>
          )}
          {stack.id === "spawnkit" && (
            <div className="grid grid-cols-2 gap-4">
              <SlotSelect
                id="new-project-physics"
                label="Physics"
                value={physics}
                options={physicsEngines}
                onChange={setPhysics}
              />
            </div>
          )}
          <fieldset className="flex flex-col">
            <legend className="mb-2 text-sm font-medium">Extras</legend>
            <div className="grid grid-cols-2 gap-2">
              {extras[stack.id].map((extra) => (
                <div key={extra.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Label htmlFor={`extra-${extra.id}`} className="text-[13px]">
                      {extra.label}
                    </Label>
                    <span className="truncate text-xs text-muted-foreground">{extra.detail}</span>
                  </span>
                  <Switch id={`extra-${extra.id}`} defaultChecked={extra.on} />
                </div>
              ))}
            </div>
          </fieldset>
        </div>
        <footer className="flex items-center gap-4 border-t bg-card/30 px-6 py-4">
          <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
            {adds.length > 0 && <>Adds {sentence(adds)}. </>}
            The Scaffolder sets it up, then Parity opens it
            {designs > 0 ? ` with ${designs === 1 ? "its design" : `its ${designs} designs`}` : ""}. You can change any
            of this later.
          </p>
          <Button size="lg" type="submit" className="px-4">
            Create project
          </Button>
        </footer>
      </form>
    </div>
  )
}

/** Start from what exists: one of your projects, a repository or a folder. */
function ExistingFlow({ initialSource, initialProject }: { initialSource?: ExistingSource; initialProject?: string }) {
  const [source, setSource] = useState<ExistingSource>(initialSource ?? "projects")
  const tile = "grid size-7 shrink-0 place-items-center rounded-md bg-muted/80"
  const sources: { id: ExistingSource; icon: ReactNode; title: string; detail: string }[] = [
    {
      id: "projects",
      icon: <LayoutGrid className="size-4" />,
      title: "Your projects",
      detail: "Copy one as a starting point"
    },
    { id: "github", icon: <GitHubMark size={15} />, title: "GitHub", detail: repositories.github.account },
    { id: "azure", icon: <AzureDevOpsMark size={15} />, title: "Azure DevOps", detail: repositories.azure.account },
    {
      id: "folder",
      icon: <FolderOpen className="size-4" />,
      title: "This computer",
      detail: "A folder with a React app"
    }
  ]
  return (
    <div className="flex min-h-0 flex-1">
      <SideList
        label="Start from"
        note="Parity opens an app where it lives. Nothing changes in a repository until you commit."
      >
        {sources.map((candidate) => (
          <SideItem
            key={candidate.id}
            selected={candidate.id === source}
            onSelect={() => setSource(candidate.id)}
            icon={<span className={tile}>{candidate.icon}</span>}
            title={candidate.title}
            detail={candidate.detail}
          />
        ))}
      </SideList>
      {source === "projects" && <FromProject initial={initialProject ?? projects[0]!.id} />}
      {(source === "github" || source === "azure") && <FromRepository key={source} source={source} />}
      {source === "folder" && <FromFolder />}
    </div>
  )
}

const bringAlong = [
  { id: "stack", label: "Stack and settings", detail: "Always comes along", on: true, locked: true },
  { id: "components", label: "Components and tokens", detail: "Its UI kit, theme and icons", on: true },
  { id: "designs", label: "Designs", detail: "Boards, with their states and modes", on: true },
  { id: "data", label: "Scenarios and mock data", detail: "What fills the designs" },
  { id: "history", label: "Git history", detail: "Off starts a fresh repository" }
]

/** One of your projects as the starting point, and what comes with it. */
function FromProject({ initial }: { initial: string }) {
  const [picked, setPicked] = useState(initial)
  const chosen = projects.find((candidate) => candidate.id === picked) ?? projects[0]!
  const stack = findStack(chosen.stack)
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-1 px-6 pt-5 pb-4">
          <h3 className="text-base font-semibold">Start from one of your projects</h3>
          <p className="text-sm text-muted-foreground">
            The new project starts with its stack, components and tokens. Choose what else comes with it.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-5 px-6 pb-6">
          {projects.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={candidate.id === picked}
              onClick={() => setPicked(candidate.id)}
              className="group/pick flex flex-col gap-2 text-left outline-none"
            >
              <span className="relative block overflow-hidden rounded-xl ring-1 ring-white/[0.08] transition-shadow group-hover/pick:ring-white/25 group-focus-visible/pick:ring-2 group-focus-visible/pick:ring-ring group-aria-pressed/pick:ring-2 group-aria-pressed/pick:ring-(--parity)">
                <CanvasArt project={candidate} design={candidate.designs[0]!} live={false} />
                {candidate.id === picked && (
                  <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-(--parity) text-white shadow">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{candidate.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <StackMark stack={findStack(candidate.stack)} size={14} /> {findStack(candidate.stack).name}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <aside className="flex w-[320px] shrink-0 flex-col border-l bg-card/20">
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Starting from</span>
            <span className="text-[15px] font-semibold">{chosen.name}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <StackMark stack={stack} size={14} /> {stack.name}, {chosen.designs.length}{" "}
              {chosen.designs.length === 1 ? "design" : "designs"}
            </span>
          </div>
          <Field label="Name" htmlFor="copy-name">
            <Input id="copy-name" key={chosen.id} defaultValue={`${chosen.name} copy`} />
          </Field>
          <fieldset className="flex flex-col">
            <legend className="mb-1 text-sm font-medium">Bring along</legend>
            {bringAlong.map((item) => (
              <div key={item.id} className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Label htmlFor={`bring-${item.id}`} className="text-[13px]">
                    {item.label}
                  </Label>
                  <span className="text-xs text-muted-foreground">{item.detail}</span>
                </span>
                <Switch id={`bring-${item.id}`} defaultChecked={item.on} disabled={item.locked} />
              </div>
            ))}
          </fieldset>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Comments, history and who it's shared with stay with {chosen.name}.
          </p>
        </div>
        <footer className="border-t p-4">
          <Button size="lg" className="w-full">
            Create project
          </Button>
        </footer>
      </aside>
    </div>
  )
}

function RepositoryRow({ repo }: { repo: Repository }) {
  const usable = !!repo.detected
  return (
    <li className={`flex items-center gap-4 rounded-lg px-3 py-3 ${usable ? "hover:bg-muted/40" : ""}`}>
      <FolderGit2 className={`size-5 shrink-0 ${usable ? "text-muted-foreground" : "text-muted-foreground/40"}`} />
      <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${usable ? "" : "opacity-50"}`}>
        <span className="flex items-center gap-2 text-sm font-medium">
          {repo.name}
          {repo.inParity && (
            <span className="rounded-full bg-(--parity)/15 px-1.5 py-px text-[10px] font-semibold text-(--parity)">
              In Parity
            </span>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">{repo.description}</span>
      </span>
      <span className="w-[140px] shrink-0 text-xs">
        {repo.detected ? (
          <Chip>{repo.detected}</Chip>
        ) : (
          <span className="text-muted-foreground">No React app found</span>
        )}
      </span>
      <span className="w-[84px] shrink-0 text-xs text-muted-foreground">{repo.updated}</span>
      <span className="flex w-[124px] shrink-0 justify-end">
        {repo.inParity ? (
          <Button size="sm" variant="ghost">
            Open project
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={!usable}>
            Clone and open
          </Button>
        )}
      </span>
    </li>
  )
}

/** A connected account's repositories, with what Parity found in each. */
function FromRepository({ source }: { source: "github" | "azure" }) {
  const { account, repos } = repositories[source]
  const [query, setQuery] = useState("")
  const shown = repos.filter((repo) => repo.name.includes(query.trim().toLowerCase()))
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-4 border-b px-6 py-4">
        <span className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-muted/80">
            {source === "github" ? <GitHubMark size={18} /> : <AzureDevOpsMark size={18} />}
          </span>
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold">{account}</span>
            <span className="text-xs text-muted-foreground">Connected as andrew-craswell</span>
          </span>
        </span>
        <span className="relative ml-auto w-[320px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search repositories"
            placeholder="Search repositories, or paste a URL"
            className="pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </span>
      </div>
      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {shown.map((repo) => (
          <RepositoryRow key={repo.name} repo={repo} />
        ))}
      </ul>
      <footer className="border-t px-6 py-3 text-xs text-muted-foreground">
        Parity clones a repository to D:\code and opens its app. It never pushes without you.
      </footer>
    </div>
  )
}

const recentFolders = [
  { path: "D:\\code\\walkies", when: "Today" },
  { path: "D:\\code\\arena", when: "Last week" },
  { path: "D:\\code\\kestrel\\admin-portal", when: "2 weeks ago" }
]

/** A folder on this computer: choose one, or reopen a recent one. */
function FromFolder() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">Open a folder on this computer</h3>
        <p className="text-sm text-muted-foreground">
          Any folder with a package.json and a React app. Parity finds its components, theme and routes.
        </p>
      </div>
      <button
        type="button"
        className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.015] py-14 text-sm text-muted-foreground outline-none hover:border-(--parity) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FolderOpen className="size-7" />
        <span>
          <span className="font-medium text-foreground">Choose a folder</span> or drop one here
        </span>
        <Kbd>Ctrl O</Kbd>
      </button>
      <section className="flex flex-col gap-1">
        <h4 className="px-2 pb-1 text-xs font-medium text-muted-foreground">Recent folders</h4>
        {recentFolders.map((folder) => (
          <button
            key={folder.path}
            type="button"
            className="flex items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Folder className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium">{folder.path.split("\\").at(-1)}</span>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{folder.path}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{folder.when}</span>
          </button>
        ))}
      </section>
    </div>
  )
}
