/**
 * Sharing a project from the portal, and asking for access to one. The dialog shows where everyone's access comes
 * from (owning the project, a team, being an admin, an invite), puts requests waiting for an answer first, and keeps
 * to what Security allows: no public links, and guests for 90 days. Roles come from the collaboration explorations.
 */
import { Building2, Link, Lock, Mail, Send, X } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { agentRoles, RoleMenu, roles } from "../collaboration/sharing.tsx"
import { me, type Person, people } from "../explore-data.ts"
import { Avatar, GitHubMark, ParityMark } from "../parts.tsx"
import { OrgBadge } from "../start-page-parts.tsx"
import { event, ivy, noah, teams } from "./data.ts"
import { PortalWindow } from "./parts.tsx"
import { RecentsPage } from "./recents.tsx"

const { priya, maya, cursor } = people

/** Someone with access: who, where it comes from, and what they can do. */
function Row({ who, name, why, children }: { who: ReactNode; name: ReactNode; why: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/30">
      {who}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px]">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{why}</span>
      </span>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** Sharing Help center: a request first, then everyone with access and why, its agents, and who else can open it. */
function ShareDialog() {
  const people: { person: Person; why: string; role: "owner" | "edit" | "comment" | "view" }[] = [
    { person: priya, why: "Owns the project", role: "owner" },
    { person: me, why: "Admin of Kestrel", role: "edit" },
    { person: maya, why: "Through the Web team", role: "edit" },
    { person: noah, why: "Through the Web team, waiting on an editor seat", role: "view" }
  ]
  const request = event("ivy-access")
  return (
    <div className="flex w-[32rem] flex-col rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-base font-semibold">Share Help center</h2>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitHubMark size={12} /> kestrel/help-center
          </span>
        </div>
        <Button size="icon-xs" variant="ghost" aria-label="Close">
          <X />
        </Button>
      </div>
      <div className="flex items-start gap-2 px-5">
        <div className="flex min-h-9 flex-1 items-center gap-1 rounded-lg border bg-background px-2.5 py-1 text-sm text-muted-foreground">
          <span className="flex-1">Add people, teams or emails</span>
          <RoleMenu value="comment" options={roles} />
        </div>
        <Button className="h-9" disabled>
          Invite
        </Button>
      </div>
      <div className="flex flex-col gap-4 px-3 pt-4 pb-3">
        <Section title="Asking for access">
          <div className="mx-2 flex flex-col gap-2.5 rounded-lg border bg-muted/30 p-3">
            <span className="flex items-start gap-2.5">
              <Avatar person={ivy} size={28} />
              <span className="flex min-w-0 flex-1 flex-col text-[13px]">
                <span>
                  <span className="font-medium">Ivy Lopez</span>{" "}
                  <span className="text-muted-foreground">asked to comment, {request.when}</span>
                </span>
                <span className="text-xs text-muted-foreground">ivy@studio-north.com, a guest on Kestrel website</span>
              </span>
            </span>
            <p className="border-l-2 pl-2.5 text-[13px] text-foreground/85">{request.quote}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline">
                Let Ivy comment
              </Button>
              <Button size="sm" variant="ghost">
                Deny
              </Button>
              <span className="ml-auto self-center text-xs text-muted-foreground">Free, and ends in 90 days</span>
            </div>
          </div>
        </Section>
        <Section title="People with access">
          <Row
            who={<OrgBadge org={teams.web.org} size={28} />}
            name="Web team"
            why={`${teams.web.people.length} people, and anyone who joins it`}
          >
            <RoleMenu value="edit" options={roles} />
          </Row>
          {people.map((entry) => (
            <Row
              key={entry.person.name}
              who={<Avatar person={entry.person} size={28} />}
              name={
                <>
                  {entry.person.name}
                  {entry.person === me && <span className="text-muted-foreground"> (you)</span>}
                </>
              }
              why={entry.why}
            >
              {entry.role === "owner" ? (
                <span className="px-2 text-xs text-muted-foreground">Owner</span>
              ) : (
                <RoleMenu value={entry.role} options={roles} />
              )}
            </Row>
          ))}
          <Row
            who={
              <span className="grid size-7 place-items-center rounded-full border border-dashed text-muted-foreground">
                <Mail className="size-3.5" />
              </span>
            }
            name="ren@kestrel.dev"
            why="Invited as an editor, waiting for an admin to approve the seat"
          >
            <RoleMenu value="edit" options={roles} />
          </Row>
        </Section>
        <Section title="Agents">
          <Row who={<Avatar person={cursor} size={28} />} name="Cursor" why="Working for you on Docs home">
            <RoleMenu value="propose" options={agentRoles} />
          </Row>
        </Section>
        <Section title="Who else can open it">
          <Row
            who={
              <span className="grid size-7 place-items-center rounded-full bg-muted text-muted-foreground">
                <Building2 className="size-3.5" />
              </span>
            }
            name="Anyone at Kestrel"
            why="From the link. Public links are off, in Security"
          >
            <RoleMenu value="comment" options={roles} />
          </Row>
        </Section>
      </div>
      <div className="flex items-center gap-2 border-t px-5 py-3">
        <Button variant="outline" className="gap-1.5">
          <Link /> Copy link
        </Button>
        <Button className="ml-auto">Done</Button>
      </div>
    </div>
  )
}

/** Sharing, opened from a project in Recents: the dialog over the page, with Ivy's request waiting at the top. */
export function SharePage() {
  return (
    <div className="relative">
      <RecentsPage />
      <div className="absolute inset-0 top-[76px] z-30 grid place-items-center bg-black/50">
        <ShareDialog />
      </div>
    </div>
  )
}

/**
 * Opening a link to a project you can't see: what it is and who owns it, the role to ask for, and a note. Asking to
 * edit says it needs an editor seat, which an admin approves; viewing and commenting are free.
 */
export function RequestAccessPage() {
  return (
    <PortalWindow path="kestrel/help-center">
      <div className="grid h-full place-items-center bg-[#0f0f12]">
        <div className="flex w-[26rem] flex-col items-center gap-5 rounded-xl border bg-popover p-6 text-center text-popover-foreground shadow-2xl">
          <span className="flex items-center gap-2">
            <ParityMark size={22} />
            <span className="grid size-10 place-items-center rounded-full bg-muted">
              <Lock className="size-4 text-muted-foreground" />
            </span>
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">You need access to Help center</h2>
            <p className="text-sm text-muted-foreground">
              It belongs to Kestrel, where you're a guest on Kestrel website. Priya Raman owns it, and Priya and
              Kestrel's admins will get your request.
            </p>
          </div>
          <div className="flex w-full rounded-lg bg-muted p-0.5 text-xs">
            {(["view", "comment", "edit"] as const).map((key) => (
              <span
                key={key}
                className={`flex-1 rounded-md py-1.5 ${key === "comment" ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
              >
                {roles[key].title}
              </span>
            ))}
          </div>
          <span className="-mt-2 text-xs text-muted-foreground">
            Viewing and commenting are free. Editing needs an editor seat, which an admin approves.
          </span>
          <div className="w-full rounded-lg border bg-background px-3 py-2 text-left text-sm">
            {event("ivy-access").quote}
          </div>
          <Button className="w-full gap-1.5">
            <Send /> Ask to comment
          </Button>
          <span className="text-xs text-muted-foreground">
            Signed in as ivy@studio-north.com. <span className="underline underline-offset-2">Switch account</span>
          </span>
        </div>
      </div>
    </PortalWindow>
  )
}
