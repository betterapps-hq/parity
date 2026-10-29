/**
 * The first time, signed in with nothing yet. It keeps Home's layout, so nothing moves once there are projects: a
 * finished sample where Continue will be, what to set up where For you will be, and templates where Recent will be.
 */
import { ArrowRight, Check, FolderOpen, Layers } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { me, people } from "../explore-data.ts"
import { Avatar, AzureDevOpsMark, GitHubMark } from "../parts.tsx"
import { stacks, type StartProject, templatesOn } from "./data.ts"
import type { ExistingSource } from "./new-project.tsx"
import { agentChoices, CanvasArt, NewProjectButton, OpenMenu, parity, TemplateCard, useStart } from "./page.tsx"

/** A finished project to look around in, with designs, states, comments and an agent at work. */
export const sample: StartProject = {
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
  live: { who: people.claude, doing: "Show me around" },
  comments: 2
}

const sources: { id: ExistingSource; mark: ReactNode; name: string }[] = [
  { id: "github", mark: <GitHubMark size={16} />, name: "GitHub" },
  { id: "azure", mark: <AzureDevOpsMark size={16} />, name: "Azure DevOps" },
  { id: "folder", mark: <FolderOpen className="size-4" />, name: "A folder on this computer" }
]

function SideList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="flex flex-col">{children}</ul>
    </section>
  )
}

/** The first time: a project to explore, what to bring and connect, and templates to start from. */
export function FirstRunPage() {
  const start = useStart()
  const firsts = stacks.flatMap((stack) => templatesOn(stack.id).slice(0, 1))
  const openSample = () => start.create?.(sample)
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-11 px-10 pt-7 pb-14">
        <header className="flex items-end justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome to Parity, Andrew</h1>
            <p className="text-sm text-muted-foreground">
              Design with your app's real components, beside your team and your agents.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <OpenMenu size="default" />
            <NewProjectButton size="default" />
          </div>
        </header>
        <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-12">
          <section
            className="group/sample relative grid grid-cols-[minmax(0,400px)_minmax(0,1fr)] items-center gap-7"
            style={{ ["--parity" as string]: parity }}
          >
            <div className="overflow-hidden rounded-lg ring-1 ring-white/[0.07] transition-shadow duration-150 group-hover/sample:ring-2 group-hover/sample:ring-(--parity)">
              <CanvasArt project={sample} design={sample.designs[0]!} labels live={false} />
            </div>
            <div className="flex flex-col items-start gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Look around first</span>
                <h2 className="text-lg font-semibold tracking-tight">
                  <button
                    type="button"
                    onClick={openSample}
                    className="text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
                  >
                    {sample.name}
                  </button>
                </h2>
              </div>
              <p className="text-sm text-pretty text-muted-foreground">
                A finished sample with designs, states, comments and an agent at work. Nothing you do there can break.
              </p>
              <Button onClick={openSample} className="relative z-10 mt-1">
                Open the sample <ArrowRight />
              </Button>
            </div>
          </section>
          <div className="flex flex-col gap-7">
            <SideList title="Bring a project you have">
              {sources.map((source) => (
                <li key={source.id}>
                  <button
                    type="button"
                    onClick={() => start.newProject?.({ tab: "existing", source: source.id })}
                    className="group/source -mx-2 flex w-[calc(100%+16px)] items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-[22px] place-items-center text-muted-foreground">{source.mark}</span>
                    <span className="flex-1">{source.name}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/source:opacity-100" />
                  </button>
                </li>
              ))}
            </SideList>
            <SideList title="Connect your agents">
              {agentChoices.map((agent) => {
                const on = !!start.agents?.includes(agent.name)
                return (
                  <li key={agent.name} className="flex items-center gap-2.5 py-1.5 text-[13px]">
                    <Avatar person={agent} size={22} />
                    <span className="flex-1">{agent.name}</span>
                    {on ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Check className="size-3.5" /> Connected
                      </span>
                    ) : (
                      <Button size="xs" variant="outline" onClick={() => start.connectAgent?.(agent.name)}>
                        Connect
                      </Button>
                    )}
                  </li>
                )
              })}
            </SideList>
          </div>
        </div>
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Start from a template</h2>
            <button
              type="button"
              onClick={() => start.newProject?.()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              All templates <ArrowRight className="size-3" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-x-5 gap-y-7">
            {firsts.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
