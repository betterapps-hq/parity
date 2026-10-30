import { boardTarget, type ContainerSpec, editsDesign, isBaseState, type StateSpec } from "@parity-app/core"

/**
 * What the inspector says above controls that always change the design itself, when the state or variant being edited
 * would otherwise take edits: that `what` changes the design in every state, or every variant, not only the one being
 * edited. Undefined when edits change the design anyway, so there's nothing to warn about.
 */
export function baseDesignNote(container: ContainerSpec, state: StateSpec, what: string): string | undefined {
  const target = boardTarget(container, state.id)
  if (editsDesign(container, target)) return undefined
  if (!isBaseState(container, state.id) || !target.variant) {
    return `${what} change the design in every state, not only ${state.name}.`
  }
  const { param, option } = target.variant
  const name = container.params?.[param]?.options?.find((candidate) => candidate.id === option)?.name ?? option
  return `${what} change the design in every variant, not only ${name}.`
}
