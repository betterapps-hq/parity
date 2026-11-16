import {
  type ContainerSpec,
  type ContainerViewSettings,
  type ModeSettings,
  type ResolvedMode,
  shownModes
} from "@parity-app/core"

export interface ContainerModes {
  /** The main frame's mode. */
  primary: ResolvedMode
  /** Modes this design shows next to its main frame, in its order. */
  companions: ResolvedMode[]
  /** Every mode, in project order: the primary mode first. */
  all: ResolvedMode[]
  /** Every mode in the design's order: the main frame's first. */
  ordered: ResolvedMode[]
}

export function containerModes(settings: ModeSettings, container: ContainerSpec): ContainerModes {
  const { main, beside, all, ordered } = shownModes(settings, container)

  return { primary: main, companions: beside, all, ordered }
}

/**
 * Shows these modes in this order (PAR-1071): the first shown is drawn at full size and the others beside it, in order.
 * Any mode can be off while another shows. The project's primary mode as the main one, and the project's own order,
 * aren't written down.
 */
export function withModes(
  view: ContainerViewSettings,
  order: readonly string[],
  shown: readonly string[],
  all: readonly ResolvedMode[]
): ContainerViewSettings {
  const main = order.find((id) => shown.includes(id))

  if (main === undefined) {
    return view
  }

  const next: ContainerViewSettings = { ...view, modes: order.filter((id) => id !== main && shown.includes(id)) }

  if (main === all[0]?.id) {
    delete next.mode
  } else {
    next.mode = main
  }

  // Without an order of its own, a design lists its main mode first, so the order's kept where that would move it.
  if (order[0] === main && order.every((id, index) => id === all[index]?.id)) {
    delete next.order
  } else {
    next.order = [...order]
  }

  return next
}

/**
 * Switches the main frame to another mode, without showing more: the mode stops being shown beside it, and the
 * project's primary mode is the default rather than written down.
 */
export function withMainMode(view: ContainerViewSettings, mode: string, all: ResolvedMode[]): ContainerViewSettings {
  const next: ContainerViewSettings = { ...view, modes: (view.modes ?? []).filter((id) => id !== mode) }

  if (mode === all[0]?.id) {
    delete next.mode
  } else {
    next.mode = mode
  }

  return next
}

/** The modes with these ids, named in project order for a label: "Desktop Light and Mobile Light". */
export function modeNames(all: readonly ResolvedMode[], ids: readonly string[]): string {
  const names = all.flatMap((mode) => (ids.includes(mode.id) ? [mode.name] : []))

  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}
