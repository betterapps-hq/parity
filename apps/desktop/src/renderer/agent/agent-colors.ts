import { type Palette, tunedAgentPalettes } from "@parity-app/presence-colors"

/**
 * An agent's colors: three stops its glow drifts between, the solid one its cursor wears, and text that reads on it, at
 * least 4.5:1 on the solid color and on every stop, since its badge is a gradient of them.
 */
export type AgentPalette = Pick<Palette, "name" | "stops" | "color" | "ink">

/** The agents' hand-tuned palettes, from `@parity-app/presence-colors`. Agents at work get theirs from `agentColors`. */
export const agentPalettes: readonly Palette[] = tunedAgentPalettes

export { agentColors } from "../canvas/surface/colors.ts"
