import { agentPalette, palette } from "@parity-app/presence-colors"
import type { Member, Presence } from "./member.ts"

/* The people and agents in the multiplayer stories' room. */

/** A made-up picture of someone, head and shoulders, for a face that has one. */
function portrait({
  background,
  skin,
  hair,
  shirt,
  long
}: {
  background: string
  skin: string
  hair: string
  shirt: string
  long?: boolean
}): string {
  const hairPath = long
    ? "M19 29c-1-11 5-18 13-18s14 7 13 18c0 6-1 11-3 15l-2-14c-3-3-6-6-8-10-3 5-8 8-12 10l-1 14c-2-4-2-9 0-15z"
    : "M20 25c0-8 5-14 12-14s12 6 12 14c-3-4-7-6-12-6s-9 2-12 6z"

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `<rect width="64" height="64" fill="${background}"/>`,
    `<path d="M8 64c2-13 12-20 24-20s22 7 24 20z" fill="${shirt}"/>`,
    `<rect x="27" y="34" width="10" height="11" rx="4" fill="${skin}"/>`,
    `<circle cx="32" cy="26" r="12" fill="${skin}"/>`,
    `<path d="${hairPath}" fill="${hair}"/>`,
    `</svg>`
  ].join("")

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** The room: people and agents, each with the palette the room handed them, in the order they joined. */
export const members = {
  mia: {
    name: "Mia Rossi",
    palette: palette(0),
    photo: portrait({ background: "#e9d8c8", skin: "#e2b08e", hair: "#3b2418", shirt: "#2f4858", long: true })
  },
  jonas: { name: "Jonas Weber", palette: palette(1) },
  priya: {
    name: "Priya Raman",
    palette: palette(2),
    photo: portrait({ background: "#cfd8e3", skin: "#a8714f", hair: "#1c1210", shirt: "#b8475a", long: true })
  },
  claude: { name: "Claude Code", palette: agentPalette(3), agent: true },
  codex: { name: "Codex", palette: agentPalette(4), agent: true },
  sam: {
    name: "Sam Okafor",
    palette: palette(3),
    photo: portrait({ background: "#d9e4d0", skin: "#6e4632", hair: "#16110f", shirt: "#e0a43c" })
  },
  lena: { name: "Lena Fischer", palette: palette(4) },
  theo: { name: "Theo Martin", palette: palette(5) }
} satisfies Record<string, Member>

/** What everyone in the room is doing. */
export const presences = {
  mia: { member: members.mia, activity: "Viewing Dashboard in dark mode" },
  jonas: { member: members.jonas, activity: "Editing Pricing on mobile" },
  priya: { member: members.priya, activity: "Viewing Dashboard in light mode" },
  claude: { member: members.claude, activity: "Tightening the dashboard's spacing" },
  codex: { member: members.codex, activity: "Checking Pricing" },
  sam: { member: members.sam, activity: "Viewing Settings" },
  lena: { member: members.lena, activity: "Viewing Sign in", away: "12 min" },
  theo: { member: members.theo, activity: "Viewing Dashboard on mobile" }
} satisfies Record<string, Presence>
