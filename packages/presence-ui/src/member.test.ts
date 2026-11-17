import { agentPalette, palette } from "@parity-app/presence-colors"
import { describe, expect, it } from "vite-plus/test"
import {
  arrange,
  gradient,
  initials,
  keyOf,
  listed,
  type Member,
  type Presence,
  shortName,
  shownCount,
  statusOf,
  whoseAgent
} from "./member.ts"

const mia: Member = { name: "Mia Rossi", palette: palette(0) }
const jonas: Member = { name: "Jonas Weber", palette: palette(1) }
const priya: Member = { name: "Priya Raman", palette: palette(2) }
const claude: Member = { name: "Claude Code", palette: agentPalette(0), agent: true, runBy: mia }
const codex: Member = { name: "Codex", palette: agentPalette(1), agent: true, runBy: jonas }

describe("names", () => {
  it("calls a person by their first name and an agent by its whole name", () => {
    expect(shortName(mia)).toBe("Mia")
    expect(shortName(claude)).toBe("Claude Code")
    expect(shortName({ name: "  Mia  Rossi" })).toBe("Mia")
  })

  it("says whose an agent is", () => {
    expect(whoseAgent(claude)).toBe("Mia's agent")
    expect(whoseAgent(mia)).toBeUndefined()
  })

  it("lists names as a sentence", () => {
    expect(listed([])).toBeUndefined()
    expect(listed(["Mia"])).toBe("Mia")
    expect(listed(["Mia", "Claude Code"])).toBe("Mia and Claude Code")
    expect(listed(["Mia", "Jonas", "Claude Code"])).toBe("Mia, Jonas and Claude Code")
  })

  it("takes two initials on a face big enough, else one", () => {
    expect(initials("Mia Rossi", 28)).toBe("MR")
    expect(initials("Mia Rossi", 16)).toBe("M")
    expect(initials("ana", 28)).toBe("A")
  })

  it("tells two people with the same name apart by their id", () => {
    expect(keyOf({ ...mia, id: "peer-1" })).toBe("peer-1")
    expect(keyOf(mia)).toBe("Mia Rossi")
  })
})

describe("statusOf", () => {
  it("says how long someone's been away, before what an agent says it's doing", () => {
    expect(statusOf({ member: mia })).toBeUndefined()
    expect(statusOf({ member: claude, doing: "Checking prices" })).toBe("Checking prices")
    expect(statusOf({ member: claude, doing: "Checking prices", away: "3 min" })).toBe("Away for 3 min")
  })
})

describe("gradient", () => {
  it("runs through a palette's three stops", () => {
    expect(gradient({ stops: ["#111", "#222", "#333"], color: "#222", ink: "#000" }, 135)).toBe(
      "linear-gradient(135deg, #111, #222, #333)"
    )
  })
})

describe("arrange", () => {
  const here: Presence[] = [
    { member: codex },
    { member: mia },
    { member: jonas, away: "12 min" },
    { member: claude },
    { member: priya }
  ]

  it("puts each person's agents just after them, and anyone away last", () => {
    expect(arrange(here).map(({ member }) => member.name)).toEqual([
      "Mia Rossi",
      "Claude Code",
      "Codex",
      "Priya Raman",
      "Jonas Weber"
    ])
  })

  it("puts whoever you're following first", () => {
    expect(arrange(here, priya)[0]?.member).toBe(priya)
  })

  it("keeps an agent whose runner isn't here", () => {
    expect(arrange([{ member: claude }]).map(({ member }) => member)).toEqual([claude])
  })
})

describe("shownCount", () => {
  it("shows every face up to the most, and one fewer past it to leave room for the count", () => {
    expect(shownCount(3, 4)).toBe(3)
    expect(shownCount(4, 4)).toBe(4)
    expect(shownCount(5, 4)).toBe(3)
    expect(shownCount(5, 0)).toBe(0)
  })
})
