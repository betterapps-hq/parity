import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { serviceCall } from "./service-call.ts"

const notifications = vi.hoisted(() => ({
  loading: vi.fn<(title: string, options?: { id?: string }) => string>(() => "progress"),
  success: vi.fn<(title: string, options: { id: string }) => void>(),
  error: vi.fn<(title: string, options: { id: string; description?: string }) => void>(),
  dismiss: vi.fn<(id: string) => void>()
}))

vi.mock("sonner", () => ({ toast: notifications }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("a service call", () => {
  it("shows its progress, then turns it into the success its answer makes", async () => {
    const answer = await serviceCall({
      progress: "Exporting 2 files…",
      run: () => Promise.resolve({ files: ["a.png", "b.png"] }),
      done: ({ files }) => ({ success: `Exported ${files.length} files`, description: "D:/out" })
    })

    expect(answer).toEqual({ files: ["a.png", "b.png"] })
    expect(notifications.loading).toHaveBeenCalledWith("Exporting 2 files…", undefined)
    expect(notifications.success).toHaveBeenCalledWith("Exported 2 files", { description: "D:/out", id: "progress" })
  })

  it("reports a failure the answer carries in the progress notification's place", async () => {
    await serviceCall({
      progress: "Copying as PNG…",
      run: () => Promise.resolve({ png: undefined }),
      done: () => ({ failure: new Error("Nothing was drawn"), operation: "layers.picture", title: "Couldn't copy" })
    })

    expect(notifications.error).toHaveBeenCalledWith("Couldn't copy", { id: "progress" })
  })

  it("takes the notification away, or leaves it for the caller, as its outcome says", async () => {
    await serviceCall({ progress: "Adding the image…", run: () => Promise.resolve(1), done: () => "dismiss" })
    expect(notifications.dismiss).toHaveBeenCalledWith("progress")

    notifications.dismiss.mockClear()
    await serviceCall({ progress: "Putting back app.tsx…", run: () => Promise.resolve(1), done: () => "keep" })
    expect(notifications.dismiss).not.toHaveBeenCalled()
    expect(notifications.success).not.toHaveBeenCalled()
  })

  it("reports a call that throws, with its message, and records it its own way", async () => {
    const recorded = vi.fn<(cause: unknown) => void>()

    const answer = await serviceCall({
      progress: "Installing Nova…",
      run: () => Promise.reject(new Error("pnpm failed")),
      done: () => ({ success: "Nova is ready" }),
      failed: { operation: "library.add", title: "Couldn't install Nova", track: recorded }
    })

    expect(answer).toBeUndefined()
    expect(recorded).toHaveBeenCalledWith(new Error("pnpm failed"), expect.any(Number))
    expect(notifications.error).toHaveBeenCalledWith("Couldn't install Nova", {
      id: "progress",
      description: "pnpm failed"
    })
  })

  it("fails as a whole when what follows a success fails", async () => {
    await serviceCall({
      progress: "Installing Nova…",
      run: () => Promise.resolve(),
      done: () => ({ success: "Nova is ready" }),
      after: () => Promise.reject(new Error("The project didn't reopen")),
      failed: { operation: "library.add", title: "Couldn't install Nova" }
    })

    expect(notifications.success).toHaveBeenCalled()
    expect(notifications.error).toHaveBeenCalledWith("Couldn't install Nova", {
      id: "progress",
      description: "The project didn't reopen"
    })
  })

  it("takes its notification away and throws on when it has no failure of its own to report", async () => {
    await expect(
      serviceCall({ progress: "Adding 2 images…", run: () => Promise.reject(new Error("gone")), done: () => "dismiss" })
    ).rejects.toThrow("gone")
    expect(notifications.dismiss).toHaveBeenCalledWith("progress")
    expect(notifications.error).not.toHaveBeenCalled()
  })
})
