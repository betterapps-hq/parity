/** State shared by the installed app and its update controls. Development builds stay disabled. */
export type UpdateState = { beta: boolean } & (
  | { phase: "disabled" | "idle" | "checking" | "current" }
  | { phase: "downloading"; version: string; percent: number; transferred: number; total: number }
  | { phase: "ready" | "manual" | "installing"; version: string }
  | { phase: "error"; message: string }
)

export type UpdateEvent =
  | { type: "check" }
  | { type: "current" }
  | { type: "available"; version: string; manual: boolean }
  | { type: "progress"; transferred: number; total: number }
  | { type: "downloaded" }
  | { type: "install" }
  | { type: "error"; message: string }
  | { type: "beta"; beta: boolean }

/** Late progress and duplicate checks cannot replace a ready update or change its release channel. */
export function updateState(state: UpdateState, event: UpdateEvent): UpdateState {
  const { beta } = state
  if (state.phase === "disabled") return state
  switch (event.type) {
    case "check":
      if (["checking", "downloading", "ready", "installing"].includes(state.phase)) return state
      return { beta, phase: "checking" }
    case "current":
      return state.phase === "checking" ? { beta, phase: "current" } : state
    case "available":
      if (state.phase !== "checking") return state
      if (event.manual) return { beta, phase: "manual", version: event.version }
      return { beta, phase: "downloading", version: event.version, percent: 0, transferred: 0, total: 0 }
    case "progress": {
      if (state.phase !== "downloading") return state
      const total = Number.isFinite(event.total) ? Math.max(0, event.total) : 0
      const transferred = Number.isFinite(event.transferred) ? Math.max(0, event.transferred) : 0
      return { ...state, total, transferred, percent: total > 0 ? Math.min(100, (transferred / total) * 100) : 0 }
    }
    case "downloaded":
      return state.phase === "downloading" ? { beta, phase: "ready", version: state.version } : state
    case "install":
      return state.phase === "ready" ? { beta, phase: "installing", version: state.version } : state
    case "error":
      return { beta, phase: "error", message: event.message }
    case "beta":
      if (["checking", "downloading", "installing"].includes(state.phase) || beta === event.beta) return state
      return { beta: event.beta, phase: "idle" }
  }
}
