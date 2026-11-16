import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { serviceCall } from "./service-call.ts"
import type { FailureOptions, ToastOptions } from "./toasts.tsx"

const toasts = vi.hoisted(() => ({
  progress: vi.fn<(title: string, options?: ToastOptions) => string>(() => "progress"),
  done: vi.fn<(title: string, options?: ToastOptions) => string>(),
  failed: vi.fn<(title: string, options?: FailureOptions) => string>(),
  close: vi.fn<(id?: string) => void>()
}))

vi.mock("./toasts.tsx", () => ({ notify: toasts }))

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
    expect(toasts.progress).toHaveBeenCalledWith("Exporting 2 files…", undefined)
    expect(toasts.done).toHaveBeenCalledWith("Exported 2 files", { description: "D:/out", id: "progress" })
  })

  it("reports a failure the answer carries in the progress notification's place", async () => {
    const failure = new Error("Nothing was drawn")

    await serviceCall({
      progress: "Copying as PNG…",
      run: () => Promise.resolve({ png: undefined }),
      done: () => ({ failure, operation: "layers.picture", title: "Couldn't copy" })
    })

    expect(toasts.failed).toHaveBeenCalledWith("Couldn't copy", { id: "progress", error: failure })
  })

  it("takes the notification away, or leaves it for the caller, as its outcome says", async () => {
    await serviceCall({ progress: "Adding the image…", run: () => Promise.resolve(1), done: () => "dismiss" })
    expect(toasts.close).toHaveBeenCalledWith("progress")

    toasts.close.mockClear()
    await serviceCall({ progress: "Putting back app.tsx…", run: () => Promise.resolve(1), done: () => "keep" })
    expect(toasts.close).not.toHaveBeenCalled()
    expect(toasts.done).not.toHaveBeenCalled()
  })

  it("reports a call that throws, with its plain reason, and records it its own way", async () => {
    const recorded = vi.fn<(cause: unknown) => void>()

    const answer = await serviceCall({
      progress: "Installing Nova…",
      run: () => Promise.reject(new Error("pnpm failed")),
      done: () => ({ success: "Nova is ready" }),
      failed: { operation: "library.add", title: "Couldn't install Nova", track: recorded }
    })

    expect(answer).toBeUndefined()
    expect(recorded).toHaveBeenCalledWith(new Error("pnpm failed"), expect.any(Number))
    expect(toasts.failed).toHaveBeenCalledWith("Couldn't install Nova", {
      id: "progress",
      description: undefined,
      error: new Error("pnpm failed")
    })
  })

  it("gives a call that throws the description and details it makes of the failure", async () => {
    await serviceCall({
      progress: "Saving a copy…",
      run: () => Promise.reject(new Error("EACCES")),
      done: () => "dismiss",
      failed: {
        operation: "document.saveCopy",
        title: "Couldn't save the copy",
        description: () => "Try another folder.",
        details: (cause) => `log: ${String(cause)}`
      }
    })

    expect(toasts.failed).toHaveBeenCalledWith("Couldn't save the copy", {
      id: "progress",
      description: "Try another folder.",
      details: "log: Error: EACCES",
      error: new Error("EACCES")
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

    expect(toasts.done).toHaveBeenCalled()
    expect(toasts.failed).toHaveBeenCalledWith("Couldn't install Nova", {
      id: "progress",
      description: undefined,
      error: new Error("The project didn't reopen")
    })
  })

  it("takes its notification away and throws on when it has no failure of its own to report", async () => {
    await expect(
      serviceCall({ progress: "Adding 2 images…", run: () => Promise.reject(new Error("gone")), done: () => "dismiss" })
    ).rejects.toThrow("gone")
    expect(toasts.close).toHaveBeenCalledWith("progress")
    expect(toasts.failed).not.toHaveBeenCalled()
  })
})
