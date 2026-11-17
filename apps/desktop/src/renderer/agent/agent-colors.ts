import { type Palette, tunedAgentPalettes } from "@parity-app/presence-colors"

/** The agents' hand-tuned palettes, from `@parity-app/presence-colors`. Agents at work get theirs from `agentColors`. */
export const agentPalettes: readonly Palette[] = tunedAgentPalettes

export { agentColors } from "../canvas/surface/colors.ts"
