/**
 * The org's admin pages that charging per seat needs: members and their seats, billing and plans. Only editors pay;
 * viewing and commenting are free, and agents are the customer's own. The plans are Figma's at half the price.
 */
import { Check, ChevronDown, CreditCard, Download, Minus, Plus, Search, Sparkles, UserPlus } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { me, type Person, people } from "../explore-data.ts"
import { Avatar } from "../parts.tsx"
import { OrgBadge } from "../start-page-parts.tsx"
import { teams } from "./data.ts"
import { Pills, SettingsPage } from "./parts.tsx"

const { maya, jonas, priya, sam, lena, claude, cursor } = people
const noah = { name: "Noah Park", hue: 210 }
const ivy = { name: "Ivy Lopez", hue: 20 }
const seatPrice = 27.95

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
    <span className="flex w-fit items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs">
      {children} <ChevronDown className="size-3 text-muted-foreground" />
    </span>
  )
}

type Seat = "Editor" | "Viewer"

interface Member {
  person: Person
  email: string
  role: "Admin" | "Member" | "Guest"
  seat: Seat
  teams: (keyof typeof teams)[]
  active: string
  /** Asked an admin for an editor seat. */
  asked?: boolean
}

const members: Member[] = [
  { person: me, email: "andrew@kestrel.dev", role: "Admin", seat: "Editor", teams: ["apps", "web"], active: "Now" },
  { person: sam, email: "sam@kestrel.dev", role: "Admin", seat: "Editor", teams: ["apps"], active: "Now" },
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
  { person: ivy, email: "ivy@studio-north.com", role: "Guest", seat: "Viewer", teams: [], active: "Last week" }
]

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
          {member.teams.length === 0 && <span className="text-xs text-muted-foreground">No teams</span>}
        </span>
      </td>
      <td className="py-2.5 text-xs text-muted-foreground">{member.active}</td>
    </tr>
  )
}

export function MembersPage() {
  const editors = members.filter((member) => member.seat === "Editor").length
  return (
    <SettingsPage tab="Members">
      <div className="flex flex-col">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-3 gap-4">
            <Meter label="Editor seats" value={`${editors}`} of={`of 8 paid`} filled={editors / 8}>
              <span className="text-xs text-muted-foreground">1 asked for, 1 invited. Add seats in Billing.</span>
            </Meter>
            <Meter label="Viewers and commenters" value="2" of="free">
              <span className="text-xs text-muted-foreground">
                Only editors pay. Everyone else can open every design, comment and follow along.
              </span>
            </Meter>
            <Meter label="Your agents" value="2" of="connected">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Avatar person={claude} size={18} />
                <Avatar person={cursor} size={18} />
                Your own, and free
              </span>
            </Meter>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-64 items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground">
              <Search className="size-3.5" /> Search members
            </div>
            <Pills options={["Everyone", "Editors", "Viewers", "Guests"]} />
            <Button className="ml-auto gap-1.5">
              <UserPlus /> Invite
            </Button>
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
              <span className="text-xs text-muted-foreground">Invited by Priya Raman as an editor, 2 days ago</span>
            </span>
            <span className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost">
                Revoke
              </Button>
              <Button size="sm" variant="outline">
                Resend
              </Button>
            </span>
          </div>
        </div>
      </div>
    </SettingsPage>
  )
}

const invoices = [
  { date: "Oct 1, 2026", detail: "Quarterly: 2 seats added Sep 18, for the rest of the year", amount: "$192.97" },
  { date: "Jan 1, 2026", detail: "Organization, 6 editor seats for 2026", amount: "$2,012.40" }
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
              ${seatPrice} per editor seat a month, billed yearly. Viewers and commenters are free, and your own agents
              connect at no charge.
            </span>
          </span>
          <Button variant="outline">Change plan</Button>
          <Button className="gap-1.5">
            <Plus /> Add seats
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Meter label="Editor seats" value="6" of="of 8 used" filled={6 / 8} />
          <Meter label="Renews" value="$2,683.20" of="on Jan 1, 2027" />
          <Meter label="Waiting for a seat" value="2" of="asked or invited" />
        </div>
        <Panel
          title="Invoices"
          action={<span className="text-xs text-muted-foreground">Sent to billing@kestrel.dev</span>}
        >
          <table className="w-full text-left text-sm">
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.date} className="border-b last:border-0">
                  <td className="py-2.5 whitespace-nowrap">{invoice.date}</td>
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
        <Panel title="Payment method" action={<span className="text-xs text-muted-foreground">Change</span>}>
          <span className="flex items-center gap-3 text-sm">
            <CreditCard className="size-5 text-muted-foreground" />
            <span className="flex flex-col">
              <span>Visa ending 4242</span>
              <span className="text-xs text-muted-foreground">Expires 08/28</span>
            </span>
          </span>
        </Panel>
        <Panel title="Billing admins" action={<span className="text-xs text-muted-foreground">Manage</span>}>
          <div className="flex flex-col gap-3">
            {[me, sam].map((person) => (
              <span key={person.name} className="flex items-center gap-2.5 text-sm">
                <Avatar person={person} size={24} />
                {person.name}
              </span>
            ))}
            <span className="text-xs text-muted-foreground">
              They see invoices and change seats. Other admins can't.
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

/** Adding seats mid-year: how many, what the rest of the year costs on the next quarterly invoice, and the renewal. */
export function AddSeatsPage() {
  const adding = 2
  return (
    <SettingsPage tab="Billing">
      <BillingBody />
      <div className="absolute inset-0 z-30 grid place-items-center bg-black/50">
        <div className="flex w-[440px] flex-col gap-5 rounded-2xl border bg-popover p-6 text-popover-foreground shadow-2xl">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Add editor seats</h2>
            <span className="text-sm text-muted-foreground">
              Kestrel has 8. Noah Park and ren@kestrel.dev are waiting for one.
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <span className="text-sm">Seats to add</span>
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
            <span className="flex justify-between gap-4">
              <span className="text-muted-foreground">The rest of 2026, on the January 1 quarterly invoice</span>
              <span className="tabular-nums">$117.62</span>
            </span>
            <span className="flex justify-between gap-4">
              <span className="text-muted-foreground">From January 1, 2027, for 10 seats</span>
              <span className="tabular-nums">$3,354.00 a year</span>
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

/** Parity's plans: Figma's, at half the price per editor seat, rounded up to the next .95. */
const plans = [
  {
    name: "Starter",
    price: "Free",
    billing: "For trying Parity",
    features: ["3 projects", "Every component and token from your code", "Comments and sharing"]
  },
  {
    name: "Professional",
    price: "$8.95",
    billing: "A seat a month, billed yearly, or $10.95 monthly",
    features: ["Unlimited projects", "Teams and shared libraries", "Version history"]
  },
  {
    name: "Organization",
    price: `$${seatPrice}`,
    billing: "A seat a month, billed yearly",
    features: [
      "Libraries across the org",
      "Admins, billing admins and seat requests",
      "Single sign-on",
      "Seats added mid-year billed quarterly"
    ],
    current: true
  },
  {
    name: "Enterprise",
    price: "$45.95",
    billing: "A seat a month, billed yearly",
    features: ["Several workspaces", "SCIM and an audit log", "Dedicated support"]
  }
]

/** Changing plan: the four plans side by side, with the one Kestrel is on marked. */
export function PlansPage() {
  return (
    <SettingsPage tab="Billing">
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold">Plans</h2>
        <span className="text-sm text-muted-foreground">
          Only editors pay. Viewers, commenters and your own agents are free on every plan.
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
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  {feature}
                </li>
              ))}
            </ul>
            {plan.current ? (
              <Button variant="outline" disabled>
                Current plan
              </Button>
            ) : plan.name === "Enterprise" ? (
              <Button>Talk to us</Button>
            ) : (
              <Button variant="outline">Switch to {plan.name}</Button>
            )}
          </div>
        ))}
      </div>
    </SettingsPage>
  )
}
