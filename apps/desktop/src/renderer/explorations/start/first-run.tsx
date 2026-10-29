import { ArrowRight, FolderOpen, Layers } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import { me, people } from "../explore-data.ts"
import { Avatar, AzureDevOpsMark, GitHubMark, ParityMark } from "../parts.tsx"
import { type StackId, stacks, type StartProject, type Template, templatesOn } from "./data.ts"
import { Backdrop, CanvasArt, Segmented, StackMark, TemplateCard } from "./page.tsx"

/** A finished project to look around in, with designs, states, comments and an agent at work. */
const sample: StartProject = {
  id: "sample",
  name: "Acme dashboard",
  org: "personal",
  look: { hue: 250, brand: "Acme", icon: Layers },
  stack: "tanstack-start",
  source: { type: "local", path: "Parity samples" },
  designs: [{ name: "Overview", kind: "overview", mobile: true }],
  edited: "Today",
  editedBy: me,
  people: [me],
  live: { who: people.claude, doing: "Show me around" }
}

function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-4 rounded-2xl border bg-card/40 p-5 ${className}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** Templates by stack, the main way in for someone with nothing yet. */
function TemplateGallery({ onPickTemplate }: { onPickTemplate?(template: Template): void }) {
  const [stackId, setStackId] = useState<StackId>("tanstack-start")
  return (
    <section className="flex flex-col gap-5 rounded-2xl border bg-card/40 p-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Start from a template</h2>
          <p className="text-sm text-muted-foreground">Pick a stack, then what you're building. You can change any of it later.</p>
        </div>
      </div>
      <Segmented
        options={stacks.map((stack) => ({
          id: stack.id,
          label: (
            <>
              <StackMark stack={stack} size={16} /> {stack.name}
            </>
          )
        }))}
        value={stackId}
        onChange={setStackId}
      />
      <div className="grid grid-cols-3 gap-x-5 gap-y-6">
        {templatesOn(stackId)
          .slice(0, 6)
          .map((template) => (
            <TemplateCard key={template.id} template={template} onPick={onPickTemplate} />
          ))}
      </div>
    </section>
  )
}

/** The first time: nothing to reopen yet, so the ways to start, and a project to explore. */
export function FirstRunPage({
  onPickTemplate,
  onPickExisting
}: {
  onPickTemplate?(template: Template): void
  onPickExisting?(): void
}) {
  return (
    <div className="relative h-full overflow-y-auto">
      <Backdrop strength={1.8} />
      <div className="relative mx-auto flex max-w-[1180px] flex-col gap-9 px-10 pt-11 pb-12">
        <header className="flex flex-col items-center gap-4 text-center">
          <ParityMark size={52} />
          <div className="flex flex-col gap-2">
            <h1 className="text-[34px] leading-tight font-semibold tracking-tight">Welcome to Parity, Andrew</h1>
            <p className="mx-auto max-w-[580px] text-[15px] text-muted-foreground">
              Design with your app's real components, beside your team and your agents. Start from a template, or
              bring a project you already have.
            </p>
          </div>
        </header>
        <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
          <TemplateGallery onPickTemplate={onPickTemplate} />
          <div className="flex flex-col gap-4">
            <Panel title="Bring a project you have">
              <div className="flex flex-col gap-1">
                {[
                  { mark: <GitHubMark size={18} />, name: "GitHub", detail: "Repositories you can push to", action: "Connect" },
                  { mark: <AzureDevOpsMark size={18} />, name: "Azure DevOps", detail: "Your organization's repositories", action: "Connect" },
                  { mark: <FolderOpen className="size-[18px]" />, name: "A folder", detail: "A React app on this computer", action: "Choose" }
                ].map((source) => (
                  <div key={source.name} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40">
                    <span className="grid size-9 place-items-center rounded-lg bg-muted/70">{source.mark}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">{source.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{source.detail}</span>
                    </span>
                    <Button size="sm" variant="outline" onClick={onPickExisting}>
                      {source.action}
                    </Button>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Look around first">
              <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.08]">
                <CanvasArt project={sample} design={sample.designs[0]!} />
              </div>
              <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
                A finished sample with designs, states, comments and an agent at work. Nothing you do there can break.
              </p>
              <Button variant="outline" className="w-full">
                Open the sample <ArrowRight />
              </Button>
            </Panel>
            <Panel title="Connect your agents">
              <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
                Agents read and change designs on the canvas beside you, with their own cursors.
              </p>
              <div className="flex flex-col gap-2.5">
                {[people.claude, people.cursor, { name: "Codex", hue: 160, agent: true }].map((agent) => (
                  <span key={agent.name} className="flex items-center gap-2.5 text-sm">
                    <Avatar person={agent} size={24} />
                    <span className="flex-1">{agent.name}</span>
                    <Button size="xs" variant="ghost">
                      Connect
                    </Button>
                  </span>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}
