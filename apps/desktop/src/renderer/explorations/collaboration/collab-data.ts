import { me, people, type Person, type ScreenKind } from "../explore-data.ts"
import type { Pinned } from "./live-board.tsx"

/** Made-up comment threads for the collaboration explorations. */

export interface Reaction {
  emoji: string
  by: Person[]
}

/** A file or picture attached to a comment. */
export interface Attachment {
  id: string
  name: string
  /** In bytes. */
  size: number
  kind: "image" | "file"
  /** A picture attached from your computer. */
  url?: string
  /** A made-up picture, for the explorations' own examples. */
  screen?: { kind: ScreenKind; hue: number; dark?: boolean }
  /** Still uploading: how far it's got, from 0 to 1. */
  progress?: number
  /** Why it couldn't be attached. */
  error?: string
}

/**
 * A change someone set to propose changes (usually an agent) says it will make, for an editor to approve or decline
 * with a click instead of a reply.
 */
export interface Proposal {
  /** What it will do, in a few words: what the agent shows while it works. */
  summary: string
  /** Each change, with `{Layer}` links as in a comment. */
  changes: string[]
  status: "waiting" | "approved" | "declined"
  by?: Person
  when?: string
  /** Why it was declined, when someone said. */
  reason?: string
}

export interface CommentData {
  id: string
  author: Person
  when: string
  /** The text, with `@Full Name` for a mention and `{Layer name}` for a link to a layer. */
  text: string
  reactions?: Reaction[]
  edited?: boolean
  /** A snapshot of the frame, taken when the comment was left. */
  snapshot?: string
  attachments?: Attachment[]
  proposal?: Proposal
}

/**
 * When a thread isn't simply where it was left: its layer was deleted or moved to another design, it's seen from a frame
 * other than the one it was left in, or it's on a component and seen from one of its uses.
 */
export type Place =
  | { kind: "deleted"; by: Person; when: string }
  | { kind: "moved"; from: string; by: Person }
  | { kind: "frame"; seen: string }
  | { kind: "component"; component: string; uses: number }

export type TrackerId = "github" | "linear" | "azure"

/** The issue a thread became, in one of the org's trackers, with its status as the tracker words it. */
export interface LinkedIssue {
  tracker: TrackerId
  /** As the tracker writes it: #482, WEB-142. */
  key: string
  title: string
  /** The repository, team or project it's in. */
  place: string
  status: { label: string; active?: boolean; done?: boolean }
}

export interface ThreadData {
  id: string
  /** The design it's on, and the layer when it's pinned to one. */
  design: string
  layer?: string
  /** The frame it was left in: a mode and a state. */
  frame?: string
  comments: CommentData[]
  resolved?: { by: Person; when: string }
  unread?: boolean
  /** An agent was mentioned and is working on what the thread asks. */
  working?: { agent: Person; label: string }
  place?: Place
  issue?: LinkedIssue
}

export const threads: ThreadData[] = [
  {
    id: "toggle",
    design: "Pricing",
    layer: "Billing toggle",
    frame: "Desktop, Dark",
    unread: true,
    comments: [
      {
        id: "toggle-1",
        author: people.maya,
        when: "8 min ago",
        text: "@Andrew Craswell can we drop the annual toggle here? It fights with the {Plan cards}.",
        reactions: [{ emoji: "👍", by: [people.jonas, people.priya] }]
      },
      {
        id: "toggle-2",
        author: people.claude,
        when: "6 min ago",
        text: "I can move it above the cards as a segmented control. Want me to try it in a new state?"
      },
      {
        id: "toggle-3",
        author: people.jonas,
        when: "2 min ago",
        text: "+1, and keep the savings badge.",
        reactions: [{ emoji: "🎯", by: [me] }]
      }
    ]
  },
  {
    id: "wrap",
    design: "Pricing",
    layer: "Plan name",
    frame: "Mobile",
    working: { agent: people.claude, label: "Try shorter plan names at 360" },
    comments: [
      {
        id: "wrap-1",
        author: people.priya,
        when: "1 h ago",
        text: "The plan names wrap on small phones.",
        snapshot: "Mobile, 360"
      },
      {
        id: "wrap-2",
        author: me,
        when: "40 min ago",
        text: "Good catch. @Claude Code can you try shorter labels at 360 and keep the {Plan name} on one line?"
      }
    ]
  },
  {
    id: "coupon",
    design: "Checkout",
    layer: "Coupon field",
    resolved: { by: me, when: "Yesterday" },
    comments: [
      {
        id: "coupon-1",
        author: people.lena,
        when: "2 days ago",
        text: "The coupon field should sit below the total, not above it."
      },
      { id: "coupon-2", author: me, when: "Yesterday", text: "Moved it. @Lena Fischer have a look?" },
      {
        id: "coupon-3",
        author: people.lena,
        when: "Yesterday",
        text: "Perfect.",
        reactions: [{ emoji: "🙌", by: [me] }]
      }
    ]
  },
  {
    id: "empty",
    design: "Dashboard",
    frame: "Desktop, Empty",
    unread: true,
    comments: [
      {
        id: "empty-1",
        author: people.sam,
        when: "3 h ago",
        text: "This whole area needs an empty state, with a way to import a spreadsheet."
      }
    ]
  }
]

/** Maya's question, and Claude Code proposing what it would do about it, waiting for someone to approve. */
export const proposalThread: ThreadData = {
  id: "proposal",
  design: "Pricing",
  layer: "Billing toggle",
  frame: "Desktop, Dark",
  comments: [
    {
      id: "proposal-1",
      author: people.maya,
      when: "8 min ago",
      text: "@Claude Code can we drop the annual toggle here? It fights with the {Plan cards}."
    },
    {
      id: "proposal-2",
      author: people.claude,
      when: "6 min ago",
      text: "I'd keep it, but move it out of the way:",
      proposal: {
        summary: "Move the billing toggle above the plan cards",
        changes: [
          "Move the {Billing toggle} above the {Plan cards}, centered",
          "Make it a segmented control, Monthly and Yearly, with the savings badge on Yearly",
          "Do it in a new state, Toggle above, so Default stays as it is"
        ],
        status: "waiting"
      }
    }
  ]
}

/** A thread with pictures and files attached. */
export const heroThread: ThreadData = {
  id: "hero",
  design: "Pricing",
  layer: "Hero",
  frame: "Desktop, Dark",
  comments: [
    {
      id: "hero-1",
      author: people.maya,
      when: "1 h ago",
      text: "Two directions for the hero, from yesterday's crit. I lean toward the second.",
      attachments: [
        {
          id: "hero-a",
          name: "hero-a.png",
          size: 1_240_000,
          kind: "image",
          screen: { kind: "marketing", hue: 250, dark: true }
        },
        {
          id: "hero-b",
          name: "hero-b.png",
          size: 1_410_000,
          kind: "image",
          screen: { kind: "marketing", hue: 160, dark: true }
        }
      ]
    },
    {
      id: "hero-2",
      author: people.sam,
      when: "40 min ago",
      text: "Here's the copy deck, and last month's pricing numbers to go with it.",
      attachments: [
        { id: "hero-deck", name: "Pricing copy, v3.pdf", size: 2_400_000, kind: "file" },
        { id: "hero-numbers", name: "pricing-experiments.csv", size: 86_000, kind: "file" }
      ]
    },
    { id: "hero-3", author: me, when: "12 min ago", text: "The second one. I'll swap it in after lunch." }
  ]
}

export function thread(id: string): ThreadData {
  return threads.find((candidate) => candidate.id === id)!
}

/** Who can be mentioned: people in the project, someone who can't see it yet, and agents. */
export const mentionable: { person: Person; detail: string; outside?: boolean }[] = [
  { person: people.maya, detail: "Editor" },
  { person: people.jonas, detail: "Editor" },
  { person: people.priya, detail: "Can comment" },
  { person: people.sam, detail: "Editor" },
  { person: people.lena, detail: "Can't see this project yet", outside: true },
  { person: people.claude, detail: "Starts work on the thread" },
  { person: people.cursor, detail: "Starts work on the thread" }
]

/** Everyone a comment's text can mention by name. */
export const everyone: Person[] = [me, ...Object.values(people)]

/** Threads pinned on the Pricing board: on layers, on an area, and one resolved. Points are in the board's pixels. */
export const pricingPins: Pinned[] = [
  { id: "toggle", thread: thread("toggle"), x: 470, y: 161, layer: { id: "toggle", name: "Billing toggle" } },
  {
    id: "wrap",
    thread: { ...thread("wrap"), frame: "Desktop, Dark" },
    x: 322,
    y: 245,
    layer: { id: "plan-team-name", name: "Plan name" }
  },
  {
    id: "signin",
    x: 694,
    y: 20,
    layer: { id: "signin", name: "Sign in" },
    thread: {
      id: "signin",
      design: "Pricing",
      layer: "Sign in",
      frame: "Desktop, Dark",
      unread: true,
      comments: [
        {
          id: "signin-1",
          author: people.lena,
          when: "20 min ago",
          text: "Should Sign in be a button here, like the plans?"
        }
      ]
    }
  },
  {
    id: "features",
    x: 692,
    y: 322,
    area: { x: 28, y: 318, width: 664, height: 66 },
    thread: {
      id: "features",
      design: "Pricing",
      frame: "Desktop, Dark",
      unread: true,
      comments: [
        {
          id: "features-1",
          author: people.sam,
          when: "3 h ago",
          text: "Each plan needs a third feature, so the cards line up."
        }
      ]
    }
  },
  {
    id: "currency",
    x: 692,
    y: 476,
    thread: {
      id: "currency",
      design: "Pricing",
      layer: "Footer",
      frame: "Desktop, Dark",
      resolved: { by: people.jonas, when: "Yesterday" },
      comments: [
        { id: "currency-1", author: people.priya, when: "2 days ago", text: "Do we need to say which currency?" },
        { id: "currency-2", author: people.jonas, when: "Yesterday", text: "Added it to the footer." }
      ]
    }
  }
]
