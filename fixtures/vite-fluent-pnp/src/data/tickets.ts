export type Priority = "urgent" | "high" | "normal" | "low"

export type TicketStatus = "open" | "waiting" | "solved"

export interface Ticket {
  id: string
  subject: string
  requester: string
  priority: Priority
  status: TicketStatus
  updated: string
}

export const tickets: Ticket[] = [
  {
    id: "4182",
    subject: "Invoices download as blank PDFs",
    requester: "Mira Okafor",
    priority: "urgent",
    status: "open",
    updated: "10 min ago"
  },
  {
    id: "4179",
    subject: "Add a second admin to our workspace",
    requester: "Jonas Weber",
    priority: "normal",
    status: "waiting",
    updated: "1 hr ago"
  },
  {
    id: "4171",
    subject: "SSO sign-in loops back to the sign-in page",
    requester: "Priya Raman",
    priority: "high",
    status: "open",
    updated: "3 hr ago"
  },
  {
    id: "4160",
    subject: "Export to CSV drops the notes column",
    requester: "Leo Martins",
    priority: "low",
    status: "solved",
    updated: "Yesterday"
  }
]
