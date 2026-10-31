import { type UpdateEvent, type UpdateState, updateState } from "@parity-app/core"

export interface UpdateDriver {
  check: (beta: boolean) => Promise<string | undefined>
  download: (progress: (transferred: number, total: number) => void) => Promise<void>
  install: () => void
}

/** The platform adapter does the IO; this session serializes checks and publishes state to the app's own windows. */
export class UpdateSession {
  private state: UpdateState
  private pending: Promise<void> | undefined
  private installationFailed: (() => void) | undefined

  constructor(
    private readonly options: {
      enabled: boolean
      manual: boolean
      beta: boolean
      driver: UpdateDriver
      changed: (state: UpdateState) => void
      saveBeta: (beta: boolean) => void
    }
  ) {
    this.state = { phase: options.enabled ? "idle" : "disabled", beta: options.beta }
  }

  get(): UpdateState {
    return this.state
  }

  private send(event: UpdateEvent): void {
    const next = updateState(this.state, event)
    if (next === this.state) return
    this.state = next
    this.options.changed(next)
  }

  check(): Promise<void> {
    if (this.pending) return this.pending
    const before = this.state
    this.send({ type: "check" })
    if (this.state === before) return Promise.resolve()
    this.pending = this.run().finally(() => {
      this.pending = undefined
    })
    return this.pending
  }

  private async run(): Promise<void> {
    try {
      const version = await this.options.driver.check(this.state.beta)
      if (!version) {
        this.send({ type: "current" })
        return
      }
      this.send({ type: "available", version, manual: this.options.manual })
      if (this.options.manual) return
      await this.options.driver.download((transferred, total) => this.send({ type: "progress", transferred, total }))
      this.send({ type: "downloaded" })
    } catch (error) {
      this.fail(error)
    }
  }

  setBeta(beta: boolean): void {
    if (this.state.phase === "disabled") return
    if (["checking", "downloading", "installing"].includes(this.state.phase)) {
      throw new Error("Wait for the current update to finish before changing channels.")
    }
    // Persist before publishing the setting, so a failed write cannot silently change the active channel.
    this.options.saveBeta(beta)
    this.send({ type: "beta", beta })
    void this.check()
  }

  /** Only called after the window's existing close flow acknowledges that unsaved work was handled. */
  install(onFailure?: () => void): boolean {
    if (this.state.phase !== "ready" || this.options.manual) return false
    this.installationFailed = onFailure
    this.send({ type: "install" })
    try {
      this.options.driver.install()
      return this.get().phase === "installing"
    } catch (error) {
      this.fail(error)
      return false
    }
  }

  fail(error: unknown): void {
    const failed = this.state.phase === "installing" ? this.installationFailed : undefined
    this.installationFailed = undefined
    this.send({ type: "error", message: error instanceof Error ? error.message : String(error) })
    failed?.()
  }
}
