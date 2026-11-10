import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { setWindowTelemetry } from "../report-error.ts"
import { accountActions, receiveAccount, startAccount } from "./account.ts"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn<() => void>(), { error: vi.fn<() => void>() }) }))

vi.mock("../chrome/actions.ts", () => ({ actions: {} }))

vi.mock("../workspace.ts", () => ({ workspace: { getProjects: () => [] } }))

vi.mock("./OrganizationBadge.tsx", () => ({ currentOrganization: () => undefined }))

const sink = createTestSink()

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  setWindowTelemetry(
    createTelemetry({
      events: registeredEvents,
      context: { process: "renderer", installId: "install", sessionId: "session" },
      sinks: [sink],
      check: true
    })
  )
})

afterEach(() => {
  setWindowTelemetry(undefined)
  sink.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Lets the promise callbacks that follow a request run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("account telemetry in the window", () => {
  it("records an answer from main it can't read, by where it's wrong but not what it holds", () => {
    receiveAccount({ account: { email: "ada@example.com", untilQuit: "no" }, accounts: [], attempt: null, ended: null })
    const [failed] = sink.named("account.stateFailed")
    expect(failed?.attributes).toMatchObject({ stage: "check", pointer: "/account/untilQuit" })
    expect(JSON.stringify(failed)).not.toContain("ada@example.com")
  })

  it("records failing to ask main who's signed in", async () => {
    vi.stubGlobal("window", {
      canvasHost: {
        initialProject: undefined,
        account: { subscribe: () => undefined, get: () => Promise.reject(new Error("No handler")) }
      }
    })
    startAccount()
    await settle()
    expect(sink.named("account.stateFailed").map((event) => event.attributes)).toEqual([
      { stage: "ask", message: "No handler" }
    ])
  })

  it("shows and records a sign-out that fails", async () => {
    vi.stubGlobal("window", {
      canvasHost: { account: { signOut: () => Promise.reject(new Error("Main went away")) } }
    })
    accountActions.signOut("ada@example.com")
    await settle()
    expect(sink.named("error.caught").map((event) => event.attributes)).toEqual([
      {
        action: "account",
        title: "Parity couldn't sign you out",
        message: "Main went away"
      }
    ])
  })
})
