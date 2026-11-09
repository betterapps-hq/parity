import type { Organization, SignInProvider } from "../../../shared/account.ts"
import type { PictureFrame, PictureScreen, ProjectPicture } from "../../../shared/protocol.ts"
import dashboardDesktop from "../../start/example-pictures/dashboard-desktop.webp?inline"
import dashboardMobile from "../../start/example-pictures/dashboard-mobile.webp?inline"
import pricingDesktop from "../../start/example-pictures/pricing-desktop.webp?inline"
import pricingMobile from "../../start/example-pictures/pricing-mobile.webp?inline"
import settingsDesktop from "../../start/example-pictures/settings-desktop.webp?inline"
import settingsMobile from "../../start/example-pictures/settings-mobile.webp?inline"
import signInDesktop from "../../start/example-pictures/sign-in-desktop.webp?inline"
import signInMobile from "../../start/example-pictures/sign-in-mobile.webp?inline"
import teamMembersDesktop from "../../start/example-pictures/team-members-desktop.webp?inline"
import teamMembersMobile from "../../start/example-pictures/team-members-mobile.webp?inline"
import type { ProjectNote } from "../../start/projects.ts"

/*
 * The prototype's people, organizations and projects. The projects and their pictures are the start page stories' own:
 * the example project's real screens.
 */

const minutes = (count: number) => Date.now() - count * 60_000
const days = (count: number) => minutes(60 * 24 * count)

export interface Person {
  name: string
  email: string
}

export type Role = "Admin" | "Member"

export interface Member extends Person {
  role: Role
}

/** An invitation an organization sent that nobody has taken up yet. */
export interface SentInvitation {
  email: string
  sent: number
  expired?: boolean
}

/** An organization, with your role in it, its people and what needs you there. */
export interface Team extends Organization {
  role: Role
  /**
   * The directory that adds and removes its people, as a company that provisions through WorkOS Directory Sync does;
   * none where people join by invitation.
   */
  directory?: string
  members: Member[]
  invitations: SentInvitation[]
  notes: Note[]
}

/** Something in For you: a mention, a review asked for, a reply. */
export interface Note {
  id: string
  from: Person
  /** What they did, after their name. */
  did: string
  quote?: string
  project: string
  at: number
}

/** An invitation to you, from an organization you're not in. */
export interface ReceivedInvitation {
  organization: Organization
  from: Person
  sent: number
  expired?: boolean
}

/** Someone signed in: who they are there, and their organizations. Each account has its own Personal too. */
export interface Account {
  person: Person
  teams: Team[]
  /** How they signed in, to sign in the same way again. */
  provider?: SignInProvider
  /** WorkOS ended the session, as a company's policy does; the account stays until you sign in again. */
  ended?: boolean
}

/** You, in the account you sign in with first. */
export const you: Person = { name: "Andrew Craswell", email: "andrew@kestrel.dev" }

/** You again, in your company's account, which signs in through Microsoft Entra ID. */
export const work: Person = { name: "Andrew Craswell", email: "andrew.craswell@contoso.com" }

/** You once more, with a Google or GitHub account that's in no organization. */
export const gmail: Person = { name: "Andrew Craswell", email: "andrew.craswell@gmail.com" }

const maya = { name: "Maya Chen", email: "maya.chen@kestrel.dev" }
const sam = { name: "Sam Ortiz", email: "sortiz@kestrel.dev" }
const lena = { name: "Lena Fischer", email: "lena@kestrel.dev" }
const noor = { name: "Noor Haddad", email: "noor@halcyonlabs.com" }

export const kestrel: Team = {
  id: "org_01KESTREL",
  name: "Kestrel",
  role: "Admin",
  members: [
    { ...you, role: "Admin" },
    { ...maya, role: "Admin" },
    { ...sam, role: "Member" },
    { ...lena, role: "Member" },
    { name: "Tomás Rivera", email: "tomas@kestrel.dev", role: "Member" },
    { name: "Aiko Tanaka", email: "aiko@kestrel.dev", role: "Member" }
  ],
  invitations: [
    { email: "jordan@kestrel.dev", sent: days(2) },
    { email: "ravi@kestrel.dev", sent: days(9), expired: true }
  ],
  notes: [
    {
      id: "maya",
      from: maya,
      did: "mentioned you",
      quote: "Can you check the header spacing on Pricing before Friday?",
      project: "kestrel-website",
      at: minutes(12)
    },
    { id: "sam", from: sam, did: "asked you to review Settings", project: "cloud-console", at: minutes(180) },
    {
      id: "lena",
      from: lena,
      did: "replied to your comment",
      quote: "Moved the button. Take another look?",
      project: "walkies",
      at: minutes(60 * 22)
    }
  ]
}

export const halcyon: Team = {
  id: "org_01HALCYON",
  name: "Halcyon Labs",
  role: "Member",
  members: [
    { ...noor, role: "Admin" },
    { ...you, role: "Member" },
    { name: "Ben Clarke", email: "ben@halcyonlabs.com", role: "Member" },
    { name: "Chloé Martin", email: "chloe@halcyonlabs.com", role: "Member" }
  ],
  invitations: [],
  notes: [
    {
      id: "noor",
      from: noor,
      did: "mentioned you",
      quote: "Is the new navigation ready to try?",
      project: "help-center",
      at: days(2)
    }
  ]
}

const firstNames = [
  "Aaliyah",
  "Ana",
  "Ben",
  "Bilal",
  "Carmen",
  "Chloe",
  "Dev",
  "Diego",
  "Elena",
  "Esther",
  "Farid",
  "Femi",
  "Gia",
  "Grace",
  "Hana",
  "Hiro",
  "Isla",
  "Ivan",
  "Jia",
  "Jonas",
  "Kemi",
  "Kofi",
  "Liam",
  "Lucia",
  "Mateo",
  "Mei",
  "Nadia",
  "Noa",
  "Omar",
  "Priya",
  "Quinn",
  "Rosa",
  "Sven",
  "Tara",
  "Umar",
  "Vera",
  "Wei",
  "Ximena",
  "Yusuf",
  "Zara"
]

const lastNames = [
  "Abbott",
  "Adams",
  "Bose",
  "Brennan",
  "Chen",
  "Costa",
  "Diaz",
  "Dube",
  "Eriksen",
  "Fofana",
  "Garcia",
  "Haddad",
  "Ito",
  "Jensen",
  "Kim",
  "Lopez",
  "Mensah",
  "Novak",
  "Okafor",
  "Patel",
  "Quist",
  "Rossi",
  "Sato",
  "Tan",
  "Usman",
  "Varga",
  "Wong",
  "Xu",
  "Yilmaz",
  "Zhou"
]

/**
 * Contoso, a company the size of Microsoft's own sample one: 1,201 people, added and removed by Microsoft Entra ID
 * rather than invited, with a handful of admins. You're in it with your work account.
 */
export const contoso: Team = {
  id: "org_01CONTOSO_LTD",
  name: "Contoso",
  role: "Admin",
  directory: "Microsoft Entra ID",
  members: [
    { ...work, role: "Admin" },
    ...lastNames.flatMap((last, row) =>
      firstNames.map((first, column) => ({
        name: `${first} ${last}`,
        email: `${first}.${last}@contoso.com`.toLowerCase(),
        role: (row * firstNames.length + column) % 150 === 7 ? ("Admin" as const) : ("Member" as const)
      }))
    )
  ],
  invitations: [],
  notes: [
    {
      id: "wei",
      from: { name: "Wei Zhou", email: "wei.zhou@contoso.com" },
      did: "asked you to review Dashboard",
      project: "market-square",
      at: minutes(45)
    }
  ]
}

export const northwindInvitation: ReceivedInvitation = {
  organization: { id: "org_01NORTHWIND", name: "Northwind Studio" },
  from: { name: "Priya Shah", email: "priya@northwind.studio" },
  sent: minutes(60 * 20)
}

export const sampleRecent = [
  "D:\\apps\\kestrel-website",
  "D:\\apps\\cloud-console",
  "D:\\apps\\walkies",
  "D:\\apps\\ember-caves",
  "D:\\apps\\help-center",
  "D:\\apps\\pocket-vet",
  "D:\\apps\\market-square",
  "D:\\apps\\design-system",
  "D:\\apps\\team-chat",
  "D:\\apps\\notebook"
]

export const sampleNotes: Record<string, ProjectNote> = {
  "D:\\apps\\kestrel-website": { opened: minutes(12) },
  "D:\\apps\\cloud-console": { opened: minutes(180), starred: true },
  "D:\\apps\\walkies": { opened: minutes(60 * 22) },
  "D:\\apps\\ember-caves": { opened: days(3) },
  "D:\\apps\\help-center": { opened: days(9), starred: true },
  "D:\\apps\\pocket-vet": { opened: days(30) },
  "D:\\apps\\market-square": { opened: days(60) },
  "D:\\apps\\design-system": {},
  "D:\\apps\\team-chat": { opened: days(400) },
  "D:\\apps\\notebook": { opened: days(420) },
  "D:\\archive\\old-portal": { opened: days(500), starred: true }
}

const desktop = (src: string, width = 1280): PictureFrame => ({ src, mode: "Desktop Light", width, height: 800 })
const mobile = (src: string): PictureFrame => ({ src, mode: "Mobile Light", width: 390, height: 844 })

const teamMembers = { name: "Team members", main: desktop(teamMembersDesktop, 1243), phone: mobile(teamMembersMobile) }
const dashboard = { name: "Dashboard", main: desktop(dashboardDesktop), phone: mobile(dashboardMobile) }
const signIn = { name: "Sign in", main: desktop(signInDesktop), phone: mobile(signInMobile) }
const settings = { name: "Settings", main: desktop(settingsDesktop), phone: mobile(settingsMobile) }
const pricing = { name: "Pricing", main: desktop(pricingDesktop), phone: mobile(pricingMobile) }

const picture = (...screens: PictureScreen[]): ProjectPicture => ({ taken: minutes(12), screens })

/** The example project's screens, as each project's picture keeps them; the rest show the placeholder. */
export const samplePictures: Record<string, ProjectPicture> = {
  "D:\\apps\\kestrel-website": picture(teamMembers, dashboard, signIn, settings, pricing),
  "D:\\apps\\cloud-console": picture(dashboard, settings, pricing),
  "D:\\apps\\walkies": picture(signIn, settings),
  "D:\\apps\\ember-caves": picture(pricing),
  "D:\\apps\\help-center": picture(settings, dashboard),
  "D:\\apps\\pocket-vet": picture({ name: "Settings", main: settings.main }),
  "D:\\apps\\market-square": picture(pricing, signIn),
  "D:\\apps\\team-chat": picture({ name: "Sign in", main: signIn.phone }),
  "D:\\apps\\notebook": picture(teamMembers)
}
