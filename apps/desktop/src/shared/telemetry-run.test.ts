import { expect, it } from "vite-plus/test"
import { readTelemetryRun, writeTelemetryRun } from "./telemetry-run.ts"

it("reads the run main wrote", () => {
  const run = { installId: "install", sessionId: "session", check: true }
  expect(readTelemetryRun(writeTelemetryRun(run))).toEqual(run)
})

it("names neither when main passed nothing, or something else", () => {
  const unknown = { installId: "unknown", sessionId: "unknown", check: false }
  expect(readTelemetryRun(undefined)).toEqual(unknown)
  expect(readTelemetryRun("%7B")).toEqual(unknown)
  expect(readTelemetryRun(encodeURIComponent('{"installId":1}'))).toEqual(unknown)
})
