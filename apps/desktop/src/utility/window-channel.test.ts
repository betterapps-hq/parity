import { createChannel, type Handlers, memoryPorts, type Method, plainErrors } from "@parity-app/channel"
import { CodedError, unknownReference } from "@parity-app/core"
import { describe, expect, it, vi } from "vite-plus/test"
import { settled } from "../renderer/service.ts"
import type { ServiceMethods, WindowMethods } from "../shared/protocol.ts"
import { windowChannel } from "./window-channel.ts"

/**
 * A window asking the service, the whole way: the page asks the preload script, which asks the service over its port
 * and hands back a failure as data, and the page throws it again, as `renderer/service.ts` does.
 */
function connected(handlers: Partial<Handlers<ServiceMethods>>) {
  const [servicePort, windowPort] = memoryPorts()
  // SAFETY: the checks refuse a request before it reaches a handler the test left out.
  windowChannel(handlers as Handlers<ServiceMethods>, servicePort)
  // Typed by any map, so a test can ask for what the service's own map forbids: params that don't match, or a method
  // it doesn't have.
  const preload = createChannel<WindowMethods, Record<string, Method>>()
  preload.connect(windowPort)

  return async <Params>(method: string, params: Params): Promise<void> => {
    settled(
      await preload.request(method, params).then(
        (result) => ({ result }),
        (cause: unknown) => plainErrors.encode(cause)
      )
    )
  }
}

describe("the window's requests to the project service", () => {
  it("answers a request whose params match", async () => {
    const close = vi.fn<(params: { projectId: string }) => undefined>(() => undefined)
    const request = connected({ "project.close": close })
    expect(await request("project.close", { projectId: "D:/shop" })).toBeUndefined()
    expect(close).toHaveBeenCalledExactlyOnceWith({ projectId: "D:/shop" })
  })

  it("refuses params that don't match before the handler runs, naming the field", async () => {
    const save = vi.fn<() => undefined>()
    const request = connected({ "document.save": save })
    const refused = request("document.save", { projectId: "D:/shop", path: "shop.par", document: { version: 2 } })
    await expect(refused).rejects.toBeInstanceOf(CodedError)
    await expect(refused).rejects.toMatchObject({
      message: "/document/version: expected 4",
      details: { code: "invalid_input", field: "document/version" }
    })
    expect(save).not.toHaveBeenCalled()
  })

  it("refuses a method the service doesn't have", async () => {
    const request = connected({})
    const refused = request("files.delete", { path: "C:/" })
    await expect(refused).rejects.toMatchObject({
      message: 'The project service has no method "files.delete"',
      details: { code: "invalid_input", field: "method" }
    })
  })

  it("never calls what an object inherits as though it were a method", async () => {
    const request = connected({})
    await expect(request("constructor", {})).rejects.toMatchObject({
      details: { code: "invalid_input", field: "method" }
    })
  })

  it("gives the window a coded error's details", async () => {
    const request = connected({
      "accessibility.check": () => {
        throw unknownReference("unknown_design", "No design named Pricng", "Pricng", ["Pricing", "Home"], "design")
      }
    })

    const failed = request("accessibility.check", { projectId: "D:/shop", design: "Pricng" })
    await expect(failed).rejects.toBeInstanceOf(CodedError)
    await expect(failed).rejects.toMatchObject({
      message: "No design named Pricng",
      details: { code: "unknown_design", field: "design", alternatives: ["Pricing", "Home"], retryable: false }
    })
  })

  it("gives the window a plain failure as an Error with its message", async () => {
    const request = connected({
      "extensions.run": () => Promise.reject(new Error("Storybook didn't start"))
    })

    const failed = request("extensions.run", { projectId: "D:/shop", command: "storybook.open" })
    await expect(failed).rejects.toThrow("Storybook didn't start")
    await expect(failed).rejects.not.toBeInstanceOf(CodedError)
  })
})
