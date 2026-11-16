import { describe, expect, it } from "vite-plus/test"
import { plainReason } from "./reasons.ts"

describe("plainReason", () => {
  it("puts a system failure in plain words, by its code or the code in its message", () => {
    expect(plainReason(Object.assign(new Error("open 'D:\\a.par'"), { code: "EPERM" }))).toBe(
      "Parity doesn't have permission."
    )
    expect(plainReason(new Error("ENOSPC: no space left on device, write"))).toBe("The disk is full.")
    expect(plainReason("kill EPERM")).toBe("Parity doesn't have permission.")
    expect(plainReason(new TypeError("fetch failed"))).toBe("Parity couldn't connect.")
  })

  it("keeps any other message as a sentence, without Electron's prefix", () => {
    expect(
      plainReason(new Error("Error invoking remote method 'project.open': Error: the project's builder stopped"))
    ).toBe("The project's builder stopped.")
    expect(plainReason("Port 5173 is in use.")).toBe("Port 5173 is in use.")
  })

  it("says nothing when there's nothing to say", () => {
    expect(plainReason(undefined)).toBeUndefined()
    expect(plainReason(new Error(""))).toBeUndefined()
    expect(plainReason({})).toBeUndefined()
  })
})
