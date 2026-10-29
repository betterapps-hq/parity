/**
 * The org's admin pages that charging per seat needs: members and their seats, billing, plans and security. Only
 * editors pay; viewing and commenting are free. The plans are Figma's at half the price. A seat request is approved
 * against the open seats first; buying more is only offered past them.
 */
import {
  Armchair,
  Bot,
  Check,
  ChevronDown,
  CreditCard,
  Download,
  FolderOpen,
  History,
  KeyRound,
  Lock,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserPlus
} from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { me, type Person, people } from "../explore-data.ts"
import { Avatar, GitHubMark } from "../parts.tsx"
import { OrgBadge } from "../start-page-parts.tsx"
import { ivy, noah, teams } from "./data.ts"
import { Pills, SettingsPage } from "./parts.tsx"

const { maya, jonas, priya, sam, lena, claude, cursor } = people
const seatPrice = 27.95
const paidSeats = 8

/** A figure about seats or money, with what it's out of and a bar when it fills up. */
function Meter({
  label,
  value,
  of,
  filled,
  children
}: {
  label: string
  value: string
  of?: string
  filled?: number
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {of && <span className="text-sm text-muted-foreground">{of}</span>}
      </span>
      {filled !== undefined && (
        <span className="h-1.5 rounded-full bg-muted">
          <span className="block h-full rounded-full bg-[oklch(0.7_0.16_275)]" style={{ width: `${filled * 100}%` }} />
        </span>
      )}
      {children}
    </div>
  )
}

/** A value that opens a menu, drawn shut. */
function Picker({ children }: { children: ReactNode }) {
  return (
    <span className="flex w-fit items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs whitespace-nowrap">
      {children} <ChevronDown className="size-3 text-muted-foreground" />
    </span>
  )
}

type Role = "Admin" | "Billing admin" | "Member" | "Guest"

/**
 * What each role can do. Admins can do everything, billing included; billing admins look after the plan, invoices and
 * seats; members work on their teams' projects and what's shared with them; guests only on what they're invited to.
 * A team's reviewers approve its designs once the designer asks, never their own or their own agent's.
 */
const can: { what: string; roles: Record<Role, boolean | string> }[] = [
  {
    what: "Open, view and comment",
    roles: {
      Admin: true,
      "Billing admin": true,
      Member: "Their teams' projects, and what's shared with them",
      Guest: "Projects they're invited to"
    }
  },
  {
    what: "Edit, with an editor seat",
    roles: {
      Admin: true,
      "Billing admin": true,
      Member: "Their teams' projects, and what's shared with them",
      Guest: "Projects they're invited to"
    }
  },
  {
    what: "Approve a design, with an editor seat",
    roles: {
      Admin: "As a team's reviewer, not their own",
      "Billing admin": "As a team's reviewer, not their own",
      Member: "As a team's reviewer, not their own",
      Guest: false
    }
  },
  {
    what: "Invite people",
    roles: { Admin: true, "Billing admin": true, Member: "Viewers; editors once approved", Guest: false }
  },
  { what: "Approve editor seats", roles: { Admin: true, "Billing admin": true, Member: false, Guest: false } },
  { what: "Plan, invoices and payment", roles: { Admin: true, "Billing admin": true, Member: false, Guest: false } },
  {
    what: "Teams, security and the audit log",
    roles: { Admin: true, "Billing admin": false, Member: false, Guest: false }
  }
]

interface Member {
  person: Person
  email: string
  role: Role
  seat: "Editor" | "Viewer"
  teams: (keyof typeof teams)[]
  active: string
  /** Asked an admin for an editor seat. */
  asked?: boolean
}

const members: Member[] = [
  {
    person: me,
    email: "andrew@kestrel.dev",
    role: "Admin",
    seat: "Editor",
    teams: ["apps", "web"],
    active: "Now"
  },
  { person: sam, email: "sam@kestrel.dev", role: "Billing admin", seat: "Editor", teams: ["apps"], active: "Now" },
  { person: maya, email: "maya@kestrel.dev", role: "Member", seat: "Editor", teams: ["web", "system"], active: "Now" },
  { person: jonas, email: "jonas@kestrel.dev", role: "Member", seat: "Editor", teams: ["apps"], active: "Now" },
  { person: priya, email: "priya@kestrel.dev", role: "Member", seat: "Editor", teams: ["web"], active: "2 h ago" },
  {
    person: lena,
    email: "lena@kestrel.dev",
    role: "Member",
    seat: "Editor",
    teams: ["apps", "system"],
    active: "Yesterday"
  },
  {
    person: noah,
    email: "noah@kestrel.dev",
    role: "Member",
    seat: "Viewer",
    teams: ["web"],
    active: "Today",
    asked: true
  },
  { person: ivy, email: "ivy@studio-north.com", role: "Guest", seat: "Viewer", teams: [], active: "Today" }
]

const editors = members.filter((member) => member.seat === "Editor").length
const openSeats = paidSeats - editors

function MemberRow({ member }: { member: Member }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2.5 pr-4">
        <span className="flex items-center gap-3">
          <Avatar person={member.person} size={28} />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">
              {member.person.name}
              {member.person === me && <span className="font-normal text-muted-foreground"> (you)</span>}
            </span>
            <span className="text-xs text-muted-foreground">{member.email}</span>
          </span>
        </span>
      </td>
      <td className="py-2.5 pr-4">
        <Picker>{member.role}</Picker>
      </td>
      <td className="py-2.5 pr-4">
        {member.asked ? (
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Asked for an editor seat</span>
            <Button size="sm" className="h-7 px-2.5 text-xs">
              Approve
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
              Deny
            </Button>
          </span>
        ) : (
          <Picker>{member.seat === "Editor" ? "Editor seat" : "Viewer, free"}</Picker>
        )}
      </td>
      <td className="py-2.5 pr-4">
        <span className="flex gap-1">
          {member.teams.map((id) => (
            <span key={id} title={teams[id].org.name}>
              <OrgBadge org={teams[id].org} size={18} />
            </span>
          ))}
          {member.teams.length === 0 && <span className="text-xs text-muted-foreground">Invited to 1 project</span>}
        </span>
      </td>
      <td className="py-2.5 text-xs text-muted-foreground">{member.active}</td>
    </tr>
  )
}

export function MembersPage({ overlay }: { overlay?: ReactNode }) {
  return (
    <SettingsPage tab="Members">
      <div className="grid grid-cols-2 gap-4">
        <Meter
          label="Editor seats"
          value={`${editors}`}
          of={`of ${paidSeats} paid, ${openSeats} open`}
          filled={editors / paidSeats}
        >
          <span className="text-xs text-muted-foreground">
            Enough for Noah's request and the invite for ren@kestrel.dev. No editor has been idle for 60 days.
          </span>
        </Meter>
        <Meter label="Viewers and commenters" value="2" of="free">
          <span className="text-xs text-muted-foreground">
            Only editors pay. Viewing, commenting and inspecting are free, so developers who build from designs don't
            need a seat.
          </span>
        </Meter>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-64 items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground">
          <Search className="size-3.5" /> Search members
        </div>
        <Pills options={["Everyone", "Editors", "Viewers", "Guests", "Requests"]} />
        <Picker>All teams</Picker>
        <span className="ml-auto flex gap-2">
          <Button variant="ghost" className="gap-1.5">
            <Download /> Export
          </Button>
          <Button className="gap-1.5">
            <UserPlus /> Invite
          </Button>
        </span>
      </div>
      <div className="rounded-xl border px-4">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2.5 font-medium">Name</th>
              <th className="py-2.5 font-medium">Role</th>
              <th className="py-2.5 font-medium">Seat</th>
              <th className="py-2.5 font-medium">Teams</th>
              <th className="py-2.5 font-medium">Last active</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <MemberRow key={member.email} member={member} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm">
        <span className="grid size-7 place-items-center rounded-full bg-muted text-xs">R</span>
        <span className="flex flex-col">
          <span>ren@kestrel.dev</span>
          <span className="text-xs text-muted-foreground">
            Priya Raman invited them as an editor 2 days ago. Members can invite; an admin or billing admin approves the
            seat.
          </span>
        </span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost">
            Deny
          </Button>
          <Button size="sm">Approve and send</Button>
        </span>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">What each role can do</h2>
        <div className="rounded-xl border px-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="w-[30%] py-2.5 font-medium">
                  <span className="sr-only">What they can do</span>
                </th>
                {(["Admin", "Billing admin", "Member", "Guest"] as const).map((role) => (
                  <th key={role} className="py-2.5 font-medium">
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {can.map((row) => (
                <tr key={row.what} className="border-b last:border-0">
                  <td className="py-2.5 pr-4">{row.what}</td>
                  {(["Admin", "Billing admin", "Member", "Guest"] as const).map((role) => {
                    const value = row.roles[role]
                    return (
                      <td key={role} className="py-2.5 pr-4 text-xs text-muted-foreground">
                        {value === true ? (
                          <Check className="size-4 text-foreground" aria-label="Yes" />
                        ) : value === false ? (
                          <Minus className="size-4 opacity-40" aria-label="No" />
                        ) : (
                          value
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {overlay}
    </SettingsPage>
  )
}

const invoices = [
  {
    number: "KST-2026-002",
    date: "Oct 1, 2026",
    detail: "Quarterly: 2 seats added Sep 18, to the end of 2026",
    amount: "$192.97"
  },
  { number: "KST-2026-001", date: "Jan 1, 2026", detail: "Organization, 6 editor seats for 2026", amount: "$2,012.40" }
]

/** A section of the billing page: a title, then a card. */
function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      <div className="rounded-xl border bg-card p-4">{children}</div>
    </section>
  )
}

/** A line of a money summary: what, and how much. */
function Sum({ label, amount, strong }: { label: string; amount: string; strong?: boolean }) {
  return (
    <span className={`flex justify-between gap-4 ${strong ? "font-medium" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{amount}</span>
    </span>
  )
}

function BillingBody() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-8">
      <div className="flex flex-col gap-7">
        <div className="flex items-center gap-5 rounded-xl border bg-card p-5">
          <span className="grid size-12 place-items-center rounded-xl bg-[oklch(0.7_0.16_275)]/15 text-[oklch(0.7_0.16_275)]">
            <Sparkles className="size-6" />
          </span>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-lg font-semibold">Organization plan</span>
            <span className="text-sm text-muted-foreground">
              ${seatPrice} per editor seat a month, billed yearly. Viewers and commenters are free.
            </span>
          </span>
          <Button variant="outline">Change plan</Button>
          <Button variant="outline" className="gap-1.5">
            <Plus /> Add seats
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Meter label="Editor seats" value={`${editors}`} of={`of ${paidSeats} used`} filled={editors / paidSeats} />
          <Meter label="Open seats" value={`${openSeats}`} of="enough for 2 waiting" />
          <Meter label="Renews" value="$2,683.20" of="on Jan 1, 2027" />
        </div>
        <Panel title="Next invoice" action={<span className="text-xs text-muted-foreground">January 1, 2027</span>}>
          <div className="flex flex-col gap-2 text-sm">
            <Sum
              label={`Organization, ${paidSeats} editor seats for 2027, at $${seatPrice} a month`}
              amount="$2,683.20"
            />
            <Sum label="Tax, worked out when it's issued" amount="Varies" />
            <span className="my-1 border-t" />
            <Sum label="Before tax" amount="$2,683.20" strong />
          </div>
        </Panel>
        <Panel
          title="Invoices"
          action={<span className="text-xs text-muted-foreground">Sent to billing@kestrel.dev</span>}
        >
          <table className="w-full text-left text-sm">
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.number} className="border-b last:border-0">
                  <td className="py-2.5 whitespace-nowrap">{invoice.date}</td>
                  <td className="py-2.5 pl-4 font-mono text-xs text-muted-foreground">{invoice.number}</td>
                  <td className="py-2.5 pl-4 text-muted-foreground">{invoice.detail}</td>
                  <td className="py-2.5 text-right tabular-nums">{invoice.amount}</td>
                  <td className="py-2.5 pl-4 text-right">
                    <span className="rounded-full bg-[oklch(0.75_0.17_162)]/15 px-2 py-0.5 text-xs text-[oklch(0.75_0.17_162)]">
                      Paid
                    </span>
                  </td>
                  <td className="w-8 py-2.5 text-right text-muted-foreground">
                    <Download className="ml-auto size-3.5" aria-label="Download" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
      <div className="flex flex-col gap-7">
        <Panel title="Payment" action={<span className="text-xs text-muted-foreground">Change</span>}>
          <div className="flex flex-col gap-3 text-sm">
            <span className="flex items-center gap-3">
              <CreditCard className="size-5 text-muted-foreground" />
              <span className="flex flex-col">
                <span>Mastercard ending 0417</span>
                <span className="text-xs text-muted-foreground">Expires 03/29</span>
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              Or pay by invoice, with a purchase order, on yearly plans.
            </span>
          </div>
        </Panel>
        <Panel title="Billing details" action={<span className="text-xs text-muted-foreground">Edit</span>}>
          <div className="flex flex-col gap-1 text-sm">
            <span>Kestrel Labs, Inc.</span>
            <span className="text-muted-foreground">410 Townsend Street, San Francisco, CA 94107, United States</span>
            <span className="text-muted-foreground">Tax ID: add one to show it on invoices</span>
          </div>
        </Panel>
        <Panel
          title="Who manages billing"
          action={<span className="text-xs text-muted-foreground">Manage in Members</span>}
        >
          <div className="flex flex-col gap-3">
            {(
              [
                [me, "Admin"],
                [sam, "Billing admin"]
              ] as const
            ).map(([person, role]) => (
              <span key={person.name} className="flex items-center gap-2.5 text-sm">
                <Avatar person={person} size={24} />
                <span className="flex-1">{person.name}</span>
                <span className="text-xs text-muted-foreground">{role}</span>
              </span>
            ))}
            <span className="text-xs text-muted-foreground">
              Admins and billing admins see invoices, change seats and approve seat requests.
            </span>
          </div>
        </Panel>
      </div>
    </div>
  )
}

export function BillingPage() {
  return (
    <SettingsPage tab="Billing">
      <BillingBody />
    </SettingsPage>
  )
}

/**
 * Adding seats past the open ones, for people who aren't waiting yet: the seats after, what the rest of the year
 * costs on the next quarterly invoice, the renewal, and the card it goes on.
 */
export function AddSeatsPage() {
  const adding = 2
  return (
    <SettingsPage tab="Billing">
      <BillingBody />
      <div className="absolute inset-0 z-30 grid place-items-center bg-black/50">
        <div className="flex w-[460px] flex-col gap-5 rounded-2xl border bg-popover p-6 text-popover-foreground shadow-2xl">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Add editor seats</h2>
            <span className="text-sm text-muted-foreground">
              Kestrel's {openSeats} open seats will go to Noah Park and ren@kestrel.dev. Add seats for editors joining
              after them.
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <span className="flex flex-col">
              <span className="text-sm">Seats to add</span>
              <span className="text-xs text-muted-foreground">
                {paidSeats} now, {paidSeats + adding} after
              </span>
            </span>
            <span className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-md border">
                <Minus className="size-4" />
              </span>
              <span className="w-6 text-center text-lg font-semibold tabular-nums">{adding}</span>
              <span className="grid size-8 place-items-center rounded-md border">
                <Plus className="size-4" />
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <Sum label="The rest of 2026, 64 days of 2 seats" amount="$117.62" />
            <Sum label={`2027, ${paidSeats + adding} seats at $${seatPrice} a month`} amount="$3,354.00" />
            <span className="my-1 border-t" />
            <Sum label="On the January 1 invoice, before tax" amount="$3,471.62" strong />
            <span className="text-xs text-muted-foreground">
              Nothing is charged today. It goes on Mastercard ending 0417 when the invoice is issued.
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost">Cancel</Button>
            <Button>Add 2 seats</Button>
          </div>
        </div>
      </div>
    </SettingsPage>
  )
}

/**
 * Parity's plans: Figma's, at half the price per editor seat, rounded up to the next .95. Each builds on the last, and
 * moving down says what Kestrel would lose.
 */
const plans: {
  name: string
  price: string
  billing: string
  features: string[]
  warning?: string
  current?: boolean
}[] = [
  {
    name: "Starter",
    price: "Free",
    billing: "For trying Parity",
    features: ["3 projects", "Every component and token from your code", "Comments and sharing", "30 days of versions"],
    warning:
      "Kestrel has 7 projects; Starter keeps 3 and the rest become read only. Teams, shared libraries, single sign-on, the audit log and billing admins turn off, and only 30 days of versions are kept."
  },
  {
    name: "Professional",
    price: "$8.95",
    billing: "A seat a month, billed yearly, or $10.95 monthly",
    features: ["Everything in Starter, and", "Unlimited projects", "Teams and shared libraries", "Every version, kept"],
    warning:
      "Single sign-on, the audit log, libraries across the org and seat requests turn off, and Sam Okafor stops being a billing admin. Kestrel requires single sign-on today."
  },
  {
    name: "Organization",
    price: `$${seatPrice}`,
    billing: "A seat a month, billed yearly. Seats added mid-year are billed quarterly.",
    features: [
      "Everything in Professional, and",
      "Libraries across the org",
      "Seat requests and billing admins",
      "Single sign-on",
      "An audit log you can export, kept for a year"
    ],
    current: true
  },
  {
    name: "Enterprise",
    price: "$45.95",
    billing: "A seat a month, billed yearly. Seats added mid-year are billed quarterly.",
    features: [
      "Everything in Organization, and",
      "SCIM, to add and remove people from your identity provider",
      "The audit log, kept as long as you need",
      "Several workspaces",
      "Dedicated support"
    ]
  }
]

/** Changing plan: the four plans side by side, with the one Kestrel is on marked, and what a downgrade would cost. */
export function PlansPage() {
  return (
    <SettingsPage tab="Billing">
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold">Plans</h2>
        <span className="text-sm text-muted-foreground">
          Only editors pay. Viewing, commenting and inspecting are free on every plan.
        </span>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`flex flex-col gap-4 rounded-xl border bg-card p-5 ${plan.current ? "ring-2 ring-[oklch(0.7_0.16_275)]" : ""}`}
          >
            <span className="flex items-center justify-between">
              <span className="font-semibold">{plan.name}</span>
              {plan.current && (
                <span className="rounded-full bg-[oklch(0.7_0.16_275)]/15 px-2 py-0.5 text-xs text-[oklch(0.7_0.16_275)]">
                  Your plan
                </span>
              )}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">{plan.price}</span>
              <span className="text-xs text-muted-foreground">{plan.billing}</span>
            </span>
            <ul className="flex flex-1 flex-col gap-2 text-sm">
              {plan.features.map((feature, index) =>
                index === 0 && feature.startsWith("Everything") ? (
                  <li key={feature} className="text-xs text-muted-foreground">
                    {feature}
                  </li>
                ) : (
                  <li key={feature} className="flex gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    {feature}
                  </li>
                )
              )}
            </ul>
            {plan.warning && (
              <span className="flex gap-2 rounded-lg bg-[oklch(0.8_0.15_80)]/10 p-2.5 text-xs text-[oklch(0.8_0.15_80)]">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                {plan.warning}
              </span>
            )}
            {plan.current ? (
              <Button variant="outline" disabled>
                Current plan
              </Button>
            ) : plan.name === "Enterprise" ? (
              <Button>Talk to us</Button>
            ) : (
              <Button variant="ghost">Move to {plan.name}</Button>
            )}
          </div>
        ))}
      </div>
    </SettingsPage>
  )
}

/** A setting: what it is, what it means, and its value or control. */
function Setting({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-6 border-b py-3.5 last:border-0">
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
      {children}
    </div>
  )
}

/** A status that's on, in green. */
function On({ children }: { children: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-[oklch(0.75_0.17_162)]">
      <ShieldCheck className="size-3.5" />
      {children}
    </span>
  )
}

/** What happens when someone leaves, a line each, so an admin knows before confirming. */
function Consequence({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">{children}</span>
    </span>
  )
}

/**
 * Removing someone from Kestrel: what happens to their seat, the projects they own, the agents they connected and
 * their work, before anyone confirms. Kestrel signs in with Okta and has no SCIM, so it says to remove them there too.
 */
export function RemoveMemberPage() {
  return (
    <MembersPage
      overlay={
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/50">
          <div className="flex w-[480px] flex-col gap-5 rounded-2xl border bg-popover p-6 text-popover-foreground shadow-2xl">
            <div className="flex items-center gap-3">
              <Avatar person={jonas} size={36} />
              <span className="flex flex-col">
                <span className="text-base font-semibold">Remove Jonas Weber from Kestrel?</span>
                <span className="text-xs text-muted-foreground">
                  jonas@kestrel.dev, a member with an editor seat, on the Apps team
                </span>
              </span>
            </div>
            <div className="flex flex-col gap-4">
              <Consequence icon={<Armchair />}>
                Jonas's editor seat opens today. Kestrel pays for it until the renewal on Jan 1, 2027, and it goes to
                whoever asks next.
              </Consequence>
              <Consequence icon={<FolderOpen />}>
                <span>Jonas owns Ember Caves. Hand it to</span>
                <Picker>Sam Okafor</Picker>
                <span className="text-xs text-muted-foreground">Requests for access go to the new owner.</span>
              </Consequence>
              <Consequence icon={<Bot />}>
                Cursor, which Jonas connected, loses access now. What it made stays, under Jonas's name.
              </Consequence>
              <Consequence icon={<History />}>
                Jonas's versions, comments and approvals stay as they are, and in the audit log.
              </Consequence>
              <Consequence icon={<KeyRound />}>
                Jonas is signed out everywhere now. Kestrel has no SCIM, so remove Jonas in Okta too, or the next
                sign-in works again.
              </Consequence>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost">Cancel</Button>
              <Button variant="destructive">Remove Jonas</Button>
            </div>
          </div>
        </div>
      }
    />
  )
}

/** Who changed what, newest first. The seats Sam added on Sep 18 are the 2 on that quarter's invoice. */
const audit = [
  { who: priya, what: "added", target: "Noah Park to Kestrel, as a viewer", when: "Yesterday, 4:20 PM" },
  { who: priya, what: "invited", target: "ren@kestrel.dev as an editor", when: "Oct 27, 10:12 AM" },
  { who: jonas, what: "connected the agent", target: "Cursor", when: "Oct 27, 9:40 AM" },
  { who: sam, what: "changed the payment card to", target: "Mastercard ending 0417", when: "Oct 21, 4:55 PM" },
  { who: me, what: "turned on", target: "Required single sign-on", when: "Oct 2, 11:30 AM" },
  { who: sam, what: "added", target: "2 editor seats", when: "Sep 18, 2:04 PM" }
]

/** The agents people in Kestrel have connected, and which the org allows. */
const agents = [
  { agent: claude, by: "Andrew Craswell and Sam Okafor", used: "Now", allowed: true },
  { agent: cursor, by: "Jonas Weber and Andrew Craswell", used: "Now", allowed: true },
  { agent: { name: "Codex", hue: 150, agent: true }, by: "Nobody yet", used: "Never", allowed: false }
]

/** Security: sign-in, provisioning, sharing, agents, and the audit log of who changed what. */
export function SecurityPage() {
  return (
    <SettingsPage tab="Security">
      <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-8">
        <div className="flex flex-col gap-7">
          <Panel title="Sign in">
            <Setting title="Single sign-on" detail="SAML through Okta, for everyone with a kestrel.dev address">
              <On>Required</On>
            </Setting>
            <Setting title="Verified domains" detail="People who sign up with these join Kestrel as viewers">
              <span className="font-mono text-xs">kestrel.dev</span>
            </Setting>
            <Setting title="Two-step sign-in" detail="For guests, who sign in without single sign-on">
              <On>Required</On>
            </Setting>
            <Setting title="Signing in without Okta" detail="So someone can still get in if Okta is down">
              <span className="text-xs whitespace-nowrap">Andrew Craswell only</span>
            </Setting>
            <Setting title="Sessions" detail="How long until people sign in again">
              <Picker>After 12 hours idle</Picker>
            </Setting>
          </Panel>
          <Panel title="People and sharing">
            <Setting
              title="Who can invite editors"
              detail="Members can invite; an admin or billing admin approves each editor seat"
            >
              <Picker>Members, with approval</Picker>
            </Setting>
            <Setting
              title="Who approves a design"
              detail="Each team's reviewers, once the designer marks a version ready. Never their own. Apps: Andrew, Lena and Jonas. Web: Andrew and Priya. Design system: Maya and Lena"
            >
              <Picker>Team reviewers</Picker>
            </Setting>
            <Setting title="Guests" detail="People outside kestrel.dev, on the projects they're invited to">
              <Picker>Allowed, for 90 days</Picker>
            </Setting>
            <Setting title="Public links" detail="Links anyone can open without signing in">
              <Picker>Off</Picker>
            </Setting>
            <Setting title="Provisioning with SCIM" detail="Add and remove people from your identity provider">
              <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                <Lock className="size-3.5" /> Enterprise
              </span>
            </Setting>
          </Panel>
          <Panel title="Code and repositories">
            <Setting
              title="Connected repositories"
              detail="Through Parity's GitHub app, which reads code and opens pull requests"
            >
              <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                <GitHubMark /> 7 in kestrel
              </span>
            </Setting>
            <Setting title="Who can connect a repository" detail="And so which code Parity can draw boards from">
              <Picker>Admins</Picker>
            </Setting>
          </Panel>
          <Panel title="Agents">
            <Setting
              title="What an agent can do"
              detail="Through Parity's MCP server, never more than the person who runs it: a viewer's agent only comments"
            >
              <Picker>Same as its person</Picker>
            </Setting>
            {agents.map((row) => (
              <div key={row.agent.name} className="flex items-center gap-3 border-b py-3 last:border-0">
                <Avatar person={row.agent} size={24} />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{row.agent.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.allowed ? `Connected by ${row.by}, last used ${row.used.toLowerCase()}` : "Not allowed"}
                  </span>
                </span>
                <Button size="sm" variant="ghost">
                  {row.allowed ? "Turn off" : "Allow"}
                </Button>
              </div>
            ))}
          </Panel>
        </div>
        <Panel
          title="Audit log"
          action={
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Download className="size-3" /> Export
            </span>
          }
        >
          <div className="flex flex-col gap-3.5">
            {audit.map((entry) => (
              <span key={entry.when} className="flex gap-2.5 text-sm">
                <Avatar person={entry.who} size={22} />
                <span className="flex flex-col gap-0.5">
                  <span>
                    <span className="font-medium">{entry.who === me ? "You" : entry.who.name}</span>{" "}
                    <span className="text-muted-foreground">{entry.what}</span> {entry.target}
                  </span>
                  <span className="text-xs text-muted-foreground">{entry.when}</span>
                </span>
              </span>
            ))}
            <span className="text-xs text-muted-foreground">
              Roles, seats, sharing, repositories, agents, sign-in and billing, kept for a year on Organization.
            </span>
          </div>
        </Panel>
      </div>
    </SettingsPage>
  )
}
