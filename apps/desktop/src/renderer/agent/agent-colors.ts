/** An agent's colors: three stops its glow drifts between, the solid one its cursor wears, and text that reads on it. */
export interface AgentPalette {
  name: string
  stops: [string, string, string]
  color: string
  ink: string
}

/** Twelve palettes, each centred about 30° round the hue wheel from the next, in that order. */
export const agentPalettes: AgentPalette[] = [
  { name: "Ember", stops: ["#FFB347", "#FF5A5F", "#FF4FA3"], color: "#FF6A5A", ink: "#3D0D05" },
  { name: "Sunset", stops: ["#FFE08A", "#FF9B4A", "#FF6B6B"], color: "#FF9B4A", ink: "#3A1A05" },
  { name: "Gold", stops: ["#FFF3A0", "#FFD54A", "#FFA94D"], color: "#FFD54A", ink: "#3A2A05" },
  { name: "Citrus", stops: ["#F4FF7A", "#B6F25A", "#5FE08A"], color: "#B6F25A", ink: "#1F3A08" },
  { name: "Mint", stops: ["#B8FFB0", "#5EE89A", "#2FCFB5"], color: "#5EE89A", ink: "#0A3A1E" },
  { name: "Lagoon", stops: ["#7CFFE4", "#34D8D0", "#3AA8FF"], color: "#34D8D0", ink: "#053A38" },
  { name: "Sky", stops: ["#8FF3FF", "#4CC4FF", "#6B8CFF"], color: "#4CC4FF", ink: "#04304A" },
  { name: "Aurora", stops: ["#5CE1FF", "#5B7CFF", "#9D6BFF"], color: "#6C8BFF", ink: "#0B1640" },
  { name: "Indigo", stops: ["#8FA8FF", "#7A6EFF", "#B36BFF"], color: "#7A6EFF", ink: "#120C40" },
  { name: "Orchid", stops: ["#9D8CFF", "#B57CFF", "#FF8AD8"], color: "#B57CFF", ink: "#2A0B40" },
  { name: "Magenta", stops: ["#FF8AF0", "#E66AEB", "#9B6BFF"], color: "#E66AEB", ink: "#3A0A3D" },
  { name: "Rose", stops: ["#FFB3C8", "#FF6FA0", "#FF8A6B"], color: "#FF6FA0", ink: "#40081F" }
]

/** How far apart two palettes are round the wheel, in steps of 30°. */
function apart(a: number, b: number): number {
  const steps = Math.abs(a - b) % agentPalettes.length
  return Math.min(steps, agentPalettes.length - steps)
}

/**
 * Hands out palettes to agents at work. An agent's name picks the palette it prefers, so it tends to look the same
 * from one session to the next. Agents working at the same time never share one: when the preferred palette is taken,
 * or too close in hue to one in use, the agent gets the free palette furthest from every palette in use.
 */
class AgentColors {
  private readonly claimed = new Map<string, number>()

  claim(agentId: string, name: string): AgentPalette {
    const held = this.claimed.get(agentId)
    if (held !== undefined) return agentPalettes[held]!
    const taken = [...this.claimed.values()]
    const preferred = hash(name) % agentPalettes.length
    const distance = (index: number) => Math.min(Infinity, ...taken.map((other) => apart(index, other)))
    const free = agentPalettes.map((_, index) => index).filter((index) => !taken.includes(index))
    const index =
      free.length === 0
        ? preferred
        : distance(preferred) >= 3
          ? preferred
          : free.reduce((best, candidate) =>
              distance(candidate) > distance(best) ||
              (distance(candidate) === distance(best) && apart(candidate, preferred) < apart(best, preferred))
                ? candidate
                : best
            )
    this.claimed.set(agentId, index)
    return agentPalettes[index]!
  }

  release(agentId: string): void {
    this.claimed.delete(agentId)
  }
}

function hash(text: string): number {
  let value = 2166136261
  for (const char of text) value = Math.imul(value ^ char.codePointAt(0)!, 16777619)
  return value >>> 0
}

export const agentColors = new AgentColors()
