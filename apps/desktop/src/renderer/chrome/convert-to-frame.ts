import { type ContainerSpec, type ModeSettings, resolveModes } from "@parity-app/core"
import { instanceCount, turnInto } from "@parity-app/editor"

/**
 * What converting a screen or component to a frame drops, for the message that asks first (PAR-545): its other states,
 * the previews beside its main one, its params, and each design's instances of it, which become plain layers.
 */
export interface FrameDrops {
  /** The state whose look the frame keeps: the first. */
  kept: string
  /** The project's primary mode, which the frame is drawn in. */
  primary: string
  states: string[]
  /** The modes of the previews it drops, by name. */
  previews: string[]
  /** Its params, variants among them, by name. */
  params: string[]
  /** The designs that place instances of it, and how many each places. */
  instances: { design: string; count: number }[]
}

/**
 * What `design` would drop in becoming a frame, with `designs` the project's others, which may place it. Read from
 * `turnInto`, which makes the frame, so what's said is what happens.
 */
export function frameDrops(
  design: ContainerSpec,
  designs: readonly ContainerSpec[],
  settings: ModeSettings
): FrameDrops {
  const modes = resolveModes(settings)
  const { dropped } = turnInto(design, "frame", settings)
  const placing = design.kind === "component" ? designs.filter((other) => other.id !== design.id) : []
  return {
    kept: design.states[0]?.name ?? "Default",
    primary: modes[0]?.name ?? "the primary mode",
    states: dropped.states.map((state) => state.name),
    previews: modes.filter((mode) => dropped.modes.includes(mode.id)).map((mode) => mode.name),
    params: [...dropped.params, ...dropped.variants],
    instances: placing.flatMap((other) => {
      const count = instanceCount(other, design.id)
      return count ? [{ design: other.name, count }] : []
    })
  }
}

/** "a", "a and b", "a, b and c". */
function listed(items: readonly string[]): string {
  if (items.length < 2) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

function counted(count: number, one: string): string {
  return `${count} ${count === 1 ? one : `${one}s`}`
}

/** The message's lines, one for each kind of thing that goes, saying what goes. None means nothing goes. */
export function dropLines(drops: FrameDrops): string[] {
  const lines: string[] = []
  if (drops.states.length) lines.push(`${counted(drops.states.length, "state")}: ${listed(drops.states)}`)
  if (drops.previews.length) {
    lines.push(`${counted(drops.previews.length, "preview")} beside it: ${listed(drops.previews)}`)
  }
  if (drops.params.length) {
    const shown = drops.params.slice(0, 3)
    const more = drops.params.length - shown.length
    lines.push(`${counted(drops.params.length, "param")}: ${shown.join(", ")}${more ? ` and ${more} more` : ""}`)
  }
  for (const { design, count } of drops.instances) {
    lines.push(`${counted(count, "instance")} in ${design}, which ${count === 1 ? "becomes" : "become"} plain layers`)
  }
  return lines
}
