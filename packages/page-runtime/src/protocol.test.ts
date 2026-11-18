import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vite-plus/test"
import { pageProtocol, readHello } from "./protocol.ts"

describe("a message from another window", () => {
  it("is read as one from this window, as a hello posted to a lens's own window is", () => {
    // An object made in another realm, as a posted message's data is in the window it arrives at.
    const hello: unknown = runInNewContext(`({ parity: "hello", protocol: ${pageProtocol}, frame: "spare-1" })`)

    expect(hello instanceof Object).toBe(false)
    expect(readHello(hello)).toEqual({ parity: "hello", protocol: pageProtocol, frame: "spare-1" })
  })

  it("isn't an array or nothing", () => {
    expect(readHello(runInNewContext("[]"))).toBeUndefined()
    expect(readHello(null)).toBeUndefined()
  })
})
