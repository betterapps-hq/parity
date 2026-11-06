import { expect, it } from "vite-plus/test"
import { isErrorEvent } from "./index.ts"

it("counts error.* events and error and fatal levels as failures", () => {
  expect(isErrorEvent({ name: "error.caught", level: "warn" })).toBe(true)
  expect(isErrorEvent({ name: "frame.failed", level: "error" })).toBe(true)
  expect(isErrorEvent({ name: "app.crashed", level: "fatal" })).toBe(true)
  expect(isErrorEvent({ name: "project.opened", level: "info" })).toBe(false)
  expect(isErrorEvent({ name: "errors.counted", level: "info" })).toBe(false)
})
