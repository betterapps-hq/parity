import { me, people, type Person } from "../explore-data.ts"

/** Made-up comment threads for the collaboration explorations. */

export interface Reaction {
  emoji: string
  by: Person[]
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
