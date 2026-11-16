import { describe, expect, it } from "vite-plus/test"
import { readCallback } from "./index.ts"

const pending = { state: "state-1", verifier: "verifier", redirectUri: "parity://auth/callback" }

describe("readCallback", () => {
  it("reads the code", () => {
    expect(readCallback("parity://auth/callback?code=01CODE&state=state-1", pending)).toEqual({
      kind: "code",
      code: "01CODE"
    })
  })

  it("reads the code on a loopback address", () => {
    const loopback = { ...pending, redirectUri: "http://127.0.0.1:53682/auth/callback" }
    expect(readCallback("http://127.0.0.1:53682/auth/callback?code=01CODE&state=state-1", loopback)).toEqual({
      kind: "code",
      code: "01CODE"
    })
  })

  it("refuses a link whose state is missing or another sign-in's", () => {
    expect(readCallback("parity://auth/callback?code=01CODE", pending)).toEqual({ kind: "refused", reason: "state" })
    expect(readCallback("parity://auth/callback?code=01CODE&state=state-2", pending)).toEqual({
      kind: "refused",
      reason: "state"
    })
  })

  it("refuses a link that isn't the redirect URI", () => {
    for (const link of [
      "parity://auth/other?code=01CODE&state=state-1",
      "http://127.0.0.1:53682/auth/callback?code=01CODE&state=state-1",
      "not a link"
    ]) {
      expect(readCallback(link, pending)).toEqual({ kind: "refused", reason: "link" })
    }
  })

  it("tells a sign-in turned down from one that failed", () => {
    expect(readCallback("parity://auth/callback?error=access_denied&state=state-1", pending)).toEqual({
      kind: "declined"
    })
    const failed = "parity://auth/callback?error=organization_invalid&error_description=No%20connection&state=state-1"
    expect(readCallback(failed, pending)).toEqual({
      kind: "failed",
      error: "organization_invalid",
      description: "No connection"
    })
    expect(readCallback("parity://auth/callback?error=server_error&state=state-1", pending)).toEqual({
      kind: "failed",
      error: "server_error"
    })
  })

  it("refuses an error for another sign-in", () => {
    expect(readCallback("parity://auth/callback?error=access_denied&state=state-2", pending)).toEqual({
      kind: "refused",
      reason: "state"
    })
  })

  it("fails a link with neither a code nor an error", () => {
    expect(readCallback("parity://auth/callback?state=state-1", pending)).toEqual({
      kind: "failed",
      error: "missing_code"
    })
  })
})
