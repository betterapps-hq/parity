import {
  Building2,
  Check,
  ChevronDown,
  Crosshair,
  ExternalLink,
  FolderGit2,
  Info,
  Layers,
  LayoutPanelTop,
  Link,
  Lock,
  Mail,
  X
} from "lucide-react"
import { type KeyboardEvent, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { me, people, type Person } from "../explore-data.ts"
import { Avatar, GitHubMark, MiniScreen } from "../parts.tsx"
import { mentionable } from "./collab-data.ts"

interface RoleInfo {
  title: string
  detail: string
}

export type Role = "edit" | "comment" | "view"

export const roles: Record<Role, RoleInfo> = {
  edit: { title: "Can edit", detail: "Change designs and their code" },
  comment: { title: "Can comment", detail: "Comment, review and follow along" },
  view: { title: "Can view", detail: "Look, and follow along" }
}

export type AgentRole = "edit" | "propose" | "view"

/** Agents get their own roles: one that asks before each change suits an agent better than a person. */
export const agentRoles: Record<AgentRole, RoleInfo> = {
  edit: { title: "Can edit", detail: "Its changes land as it makes them" },
  propose: { title: "Proposes changes", detail: "Asks first, and someone approves with a click" },
  view: { title: "Can view", detail: "Reads designs, changes nothing" }
}

/** Picks a role, each with what it allows, and removes access when that's allowed. */
export function RoleMenu<T extends string>({
  value,
  options,
  onChange,
  onRemove
}: {
  value: T
  options: Record<T, RoleInfo>
  onChange?: (value: T) => void
  onRemove?: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="ghost" className="gap-1 text-muted-foreground">
          {options[value].title}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {(Object.keys(options) as T[]).map((key) => (
          <DropdownMenuItem key={key} onSelect={() => onChange?.(key)} className="items-start">
            <span className="flex min-w-0 flex-1 flex-col">
              <span>{options[key].title}</span>
              <span className="text-xs text-muted-foreground">{options[key].detail}</span>
            </span>
            {key === value && <Check className="mt-0.5" />}
          </DropdownMenuItem>
        ))}
        {onRemove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              Remove access
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface Member {
  person?: Person
  email: string
  role: Role | "owner"
  /** Invited, and not joined yet. */
  invited?: string
  /** Can't push to the repository, so their edits open a pull request. */
  noPush?: boolean
}

const startingMembers: Member[] = [
  { person: me, email: "andrew@buildkit.dev", role: "owner" },
  { person: people.maya, email: "maya@buildkit.dev", role: "edit" },
  { person: people.jonas, email: "jonas@buildkit.dev", role: "edit" },
  { person: people.priya, email: "priya@buildkit.dev", role: "edit", noPush: true },
  { email: "sam@okafor.studio", role: "comment", invited: "2 days ago" }
]

const startingAgents: { agent: Person; by: Person; role: AgentRole }[] = [
  { agent: people.claude, by: me, role: "edit" },
  { agent: people.cursor, by: people.jonas, role: "propose" }
]

/** Copies text, quietly doing nothing where the clipboard isn't allowed. */
function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => undefined)
}

const projectLink = "parity://buildkit/website"

/**
 * Sharing a project: invite people by name or email with a role, change or remove anyone's access, set what agents may
 * do, and choose who else can open it with the link. A project lives in a repository, so the dialog says when someone
 * can edit here but can't push there.
 */
export function ShareDialog({ onClose }: { onClose?: () => void }) {
  const [members, setMembers] = useState(startingMembers)
  const [agents, setAgents] = useState(startingAgents)
  const [chips, setChips] = useState<string[]>([])
  const [draft, setDraft] = useState("")
  const [inviteRole, setInviteRole] = useState<Role>("edit")
  const [access, setAccess] = useState<"invited" | "organization">("organization")
  const [accessRole, setAccessRole] = useState<Role>("comment")
  const [copied, setCopied] = useState(false)

  const add = () => {
    const value = draft.trim().replace(/,$/, "")
    if (!value) return
    const person = mentionable.find(({ person }) => person.name.toLowerCase() === value.toLowerCase())?.person
    setChips([...chips, person?.name ?? value])
    setDraft("")
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault()
      add()
    } else if (event.key === "Backspace" && !draft && chips.length) {
      setChips(chips.slice(0, -1))
    }
  }
  const invite = () => {
    const invited = chips.map((chip): Member => {
      const person = mentionable.find((option) => option.person.name === chip)?.person
      return {
        person,
        email: person ? `${chip.split(" ")[0]!.toLowerCase()}@buildkit.dev` : chip,
        role: inviteRole,
        invited: "Just now"
      }
    })
    setMembers([...members, ...invited])
    setChips([])
  }
  const noPush = members.filter((member) => member.noPush && member.role === "edit")

  return (
    <div className="flex w-[30rem] flex-col rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-base font-semibold">Share Buildkit website</h2>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitHubMark size={12} /> buildkitgg/website
          </span>
        </div>
        <Button size="icon-xs" variant="ghost" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex items-start gap-2 px-5">
        <div className="flex min-h-9 flex-1 flex-wrap items-center gap-1 rounded-lg border bg-background px-1.5 py-1 focus-within:border-ring">
          {chips.map((chip) => (
            <span key={chip} className="flex items-center gap-1 rounded-md bg-muted py-0.5 pr-1 pl-2 text-xs">
              {chip}
              <button
                type="button"
                aria-label={`Remove ${chip}`}
                onClick={() => setChips(chips.filter((other) => other !== chip))}
                className="rounded text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={draft}
            aria-label="Invite people"
            placeholder={chips.length ? "" : "Add people by name or email"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={add}
            className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          <RoleMenu value={inviteRole} options={roles} onChange={setInviteRole} />
        </div>
        <Button className="h-9" disabled={!chips.length} onClick={invite}>
          Invite
        </Button>
      </div>
      <div className="flex max-h-[32rem] flex-col gap-4 overflow-y-auto px-3 pt-4 pb-3">
        <section className="flex flex-col">
          <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">People with access</h3>
          {members.map((member) => (
            <div key={member.email} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/30">
              {member.person ? (
                <Avatar person={member.person} size={28} />
              ) : (
                <span className="grid size-7 place-items-center rounded-full border border-dashed text-muted-foreground">
                  <Mail className="size-3.5" />
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px]">
                  {member.person?.name ?? member.email}
                  {member.person === me && <span className="text-muted-foreground"> (you)</span>}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {member.invited ? (
                    <>
                      Invited {member.invited.toLowerCase()}{" "}
                      <button type="button" className="underline-offset-2 hover:text-foreground hover:underline">
                        Resend
                      </button>
                    </>
                  ) : (
                    member.email
                  )}
                </span>
              </span>
              {member.role === "owner" ? (
                <span className="px-2 text-xs text-muted-foreground">Owner</span>
              ) : (
                <RoleMenu
                  value={member.role}
                  options={roles}
                  onChange={(role) =>
                    setMembers(members.map((other) => (other === member ? { ...other, role } : other)))
                  }
                  onRemove={() => setMembers(members.filter((other) => other !== member))}
                />
              )}
            </div>
          ))}
        </section>
        <section className="flex flex-col">
          <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">Agents</h3>
          {agents.map((entry) => (
            <div key={entry.agent.name} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/30">
              <Avatar person={entry.agent} size={28} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px]">{entry.agent.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  Connected by {entry.by === me ? "you" : entry.by.name}, through MCP
                </span>
              </span>
              <RoleMenu
                value={entry.role}
                options={agentRoles}
                onChange={(role) => setAgents(agents.map((other) => (other === entry ? { ...other, role } : other)))}
                onRemove={() => setAgents(agents.filter((other) => other !== entry))}
              />
            </div>
          ))}
        </section>
        <section className="flex flex-col">
          <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">General access</h3>
          <div className="flex items-center gap-3 px-2 py-1.5">
            <span className="grid size-7 place-items-center rounded-full bg-muted text-muted-foreground">
              {access === "organization" ? <Building2 className="size-3.5" /> : <Lock className="size-3.5" />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex w-fit items-center gap-1 text-[13px] font-medium">
                    {access === "organization" ? "Anyone at Buildkit" : "Only people invited"}
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onSelect={() => setAccess("invited")}>
                    <Lock /> Only people invited
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setAccess("organization")}>
                    <Building2 /> Anyone at Buildkit
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-xs text-muted-foreground">
                {access === "organization"
                  ? "Everyone in the organization can open it with the link"
                  : "Only the people above can open it"}
              </span>
            </span>
            {access === "organization" && <RoleMenu value={accessRole} options={roles} onChange={setAccessRole} />}
          </div>
        </section>
        {noPush.length > 0 && (
          <p className="mx-2 flex gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" />
            <span>
              {noPush.map((member) => member.person?.name ?? member.email).join(" and ")} can edit here but can&apos;t
              push to buildkitgg/website, so their changes open a pull request.
            </span>
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 border-t px-5 py-3">
        <Button
          variant="outline"
          className="gap-1.5"
          onClick={() => {
            copy(projectLink)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? <Check /> : <Link />}
          {copied ? "Link copied" : "Copy link"}
        </Button>
        <Button className="ml-auto" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}

const targets = [
  {
    id: "layer",
    icon: Crosshair,
    title: "Copy link to Plan card",
    detail: "Selects the layer, in whatever frame it's opened",
    url: "parity://buildkit/website/pricing?layer=plan-card"
  },
  {
    id: "frame",
    icon: Layers,
    title: "Copy link to this frame",
    detail: "Plan card in Desktop, Dark, with its state",
    url: "parity://buildkit/website/pricing?layer=plan-card&mode=desktop-dark&state=default"
  },
  {
    id: "design",
    icon: LayoutPanelTop,
    title: "Copy link to Pricing",
    detail: "The design, brought into view",
    url: "parity://buildkit/website/pricing"
  },
  {
    id: "project",
    icon: FolderGit2,
    title: "Copy link to the project",
    detail: "Opens Buildkit website",
    url: projectLink
  }
]

/**
 * Links to exactly what you mean: a layer, a layer in one frame, a design, or the project. They open in Parity, or in
 * the browser for someone without it. Picking one copies it and says what it'll open.
 */
export function CopyLinkMenu() {
  const [copied, setCopied] = useState<string>()
  const target = targets.find((candidate) => candidate.id === copied)
  return (
    <div className="flex flex-col gap-3">
      <div className="w-80 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
        {targets.map((candidate) => {
          const Icon = candidate.icon
          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => {
                copy(candidate.url)
                setCopied(candidate.id)
              }}
              className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm">{candidate.title}</span>
                <span className="text-xs text-muted-foreground">{candidate.detail}</span>
              </span>
              {copied === candidate.id && <Check className="mt-0.5 size-4 text-emerald-400" />}
            </button>
          )
        })}
      </div>
      {target && (
        <output className="flex w-80 items-start gap-2.5 rounded-lg border bg-popover px-3 py-2.5 text-sm shadow-xl">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
          <span className="flex min-w-0 flex-col gap-1">
            <span>Link copied</span>
            <code className="truncate font-mono text-[11px] text-muted-foreground">{target.url}</code>
          </span>
        </output>
      )}
    </div>
  )
}

/** A link to a layer pasted in a chat: the preview it unfurls to, with the layer's picture and its open comments. */
export function LinkUnfurl() {
  return (
    <div className="flex w-[30rem] gap-3">
      <Avatar person={people.maya} size={32} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-sm">
          <span className="font-semibold">Maya Chen</span> <span className="text-xs text-muted-foreground">10:42</span>
        </span>
        <span className="text-sm">
          Can someone look at the Team card?{" "}
          <span className="text-[oklch(0.75_0.12_250)] underline underline-offset-2">
            parity://buildkit/website/pricing?layer=plan-card
          </span>
        </span>
        <div className="flex gap-3 border-l-[3px] border-[oklch(0.64_0.18_256)] py-1 pl-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Parity</span>
            <span className="text-sm font-semibold text-[oklch(0.75_0.12_250)]">Plan card, in Pricing</span>
            <span className="text-[13px] text-foreground/80">
              Buildkit website, Desktop, Dark. 3 open comments, last from Jonas Weber.
            </span>
          </div>
          <div className="relative h-[72px] w-28 shrink-0 overflow-hidden rounded-md ring-1 ring-white/10">
            <MiniScreen kind="marketing" hue={162} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Opening a link without access: ask for it, with the role you need and why. */
export function RequestAccess() {
  const [role, setRole] = useState<Role>("comment")
  const [sent, setSent] = useState(false)
  return (
    <div className="flex w-96 flex-col items-center gap-5 rounded-xl border bg-popover p-6 text-center text-popover-foreground shadow-2xl">
      <span className="grid size-11 place-items-center rounded-full bg-muted">
        <Lock className="size-5 text-muted-foreground" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{sent ? "Request sent" : "You need access"}</h2>
        <p className="text-sm text-muted-foreground">
          {sent
            ? "Andrew Craswell will get your request. We'll tell you, and open the project, when they answer."
            : "Buildkit website belongs to Buildkit. Ask for access and Andrew Craswell will get your request."}
        </p>
      </div>
      {!sent && (
        <>
          <div className="flex w-full rounded-lg bg-muted p-0.5 text-xs">
            {(Object.keys(roles) as Role[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={role === key}
                onClick={() => setRole(key)}
                className={`flex-1 rounded-md py-1.5 ${role === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
              >
                {roles[key].title}
              </button>
            ))}
          </div>
          <Textarea aria-label="Message" placeholder="Add a note, if you like" className="min-h-16 text-left" />
          <Button className="w-full" onClick={() => setSent(true)}>
            Request access
          </Button>
        </>
      )}
      <span className="text-xs text-muted-foreground">
        Signed in as sam@okafor.studio.{" "}
        <button type="button" className="underline underline-offset-2 hover:text-foreground">
          Switch account
        </button>
      </span>
    </div>
  )
}

/** A request for access, as the owner gets it: who, what they asked for and why, and the answer. */
export function AccessRequest() {
  const [answer, setAnswer] = useState<string>()
  return (
    <div className="flex w-[26rem] flex-col gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-2xl">
      <div className="flex items-start gap-2.5">
        <Avatar person={people.sam} size={28} />
        <span className="text-[13px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">Sam Okafor</span> asked to edit{" "}
          <span className="font-medium text-foreground">Buildkit website</span>
          <span className="block text-xs">sam@okafor.studio, outside Buildkit</span>
        </span>
      </div>
      <p className="border-l-2 pl-2.5 text-[13px] text-foreground/85">
        I&apos;m picking up the checkout flow this week.
      </p>
      {answer ? (
        <span className="flex items-center gap-1.5 text-sm text-emerald-400">
          <Check className="size-4" /> {answer}
        </span>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setAnswer("Sam can edit now")}>
            Let them edit
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAnswer("Sam can comment now")}>
            Only comment
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setAnswer("Declined")}>
            Decline
          </Button>
        </div>
      )}
    </div>
  )
}

/** The bar along the top when someone opens a link in the browser instead of Parity. */
export function BrowserBanner() {
  return (
    <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2 text-sm">
      <span className="flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">You&apos;re viewing in a browser.</span> You can comment and
        follow along here. Open Parity to edit.
      </span>
      <Button size="sm" className="gap-1.5">
        <ExternalLink /> Open in Parity
      </Button>
    </div>
  )
}
