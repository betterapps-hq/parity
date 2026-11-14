import type { PickItem } from "@parity-app/extension-api"
import { type ExternalToast, toast } from "sonner"
import type { ExtensionUiAnswer, ExtensionUiRequest } from "../shared/protocol.ts"
import { request } from "./service.ts"
import { resetWithWindow, useStore, windowStore } from "./store.ts"

/*
 * What extensions show the person and ask them through `parity.ui` (PAR-1089), drawn in Parity's own look: toasts for
 * notices and progress, and one dialog at a time for a confirmation, a field or a list to pick from. Each dialog names
 * the extension asking.
 */

/** A question an extension is waiting on, answered once. */
export type ExtensionQuestion = { id: number; extension: string } & (
  | { kind: "confirm"; message: string; detail?: string; confirm?: string; answer(confirmed: boolean): void }
  | { kind: "input"; title: string; value?: string; placeholder?: string; answer(value: string | undefined): void }
  | { kind: "pick"; title?: string; placeholder?: string; items: PickItem[]; answer(index: number | undefined): void }
)

/** The questions waiting, oldest first; the dialog shows the first. */
const questions = windowStore<readonly ExtensionQuestion[]>(() => [])

let nextQuestion = 1

/** The question the dialog shows now, if any. */
export function useExtensionQuestion(): ExtensionQuestion | undefined {
  return useStore(questions)[0]
}

/** Asks the person, and waits for their answer. */
function ask<T>(make: (id: number, settle: (answer: T) => void) => ExtensionQuestion): Promise<T> {
  return new Promise((resolve) => {
    const id = nextQuestion++

    const settle = (answer: T) => {
      questions.update((now) => now.filter((question) => question.id !== id))
      resolve(answer)
    }

    questions.update((now) => [...now, make(id, settle)])
  })
}

/** Each extension's tasks under `parity.ui.progress`, by toast id, with the title their updates keep. */
const progress = new Map<string, string>()

resetWithWindow(() => progress.clear())

/** Shows what an extension asks for, and gives back the person's answer. `name` is the extension's display name. */
export async function answerExtension(name: string, asked: ExtensionUiRequest): Promise<ExtensionUiAnswer> {
  const { projectId, extension } = asked

  switch (asked.method) {
    case "ui.notify": {
      const { message, detail, tone = "info", actions = [] } = asked.params
      const [first, second] = actions

      return new Promise((resolve) => {
        let settled = false

        const done = (action?: string) => {
          if (!settled) {
            settled = true
            resolve(action === undefined ? {} : { action })
          }
        }

        const options: ExternalToast = { description: detail, onDismiss: () => done(), onAutoClose: () => done() }

        if (first) {
          options.action = { label: first, onClick: () => done(first) }
        }

        if (second) {
          options.cancel = { label: second, onClick: () => done(second) }
        }

        if (tone === "success") {
          toast.success(message, options)
        } else if (tone === "info") {
          toast.info(message, options)
        } else {
          toast.warning(message, options)
        }
      })
    }

    case "ui.progress": {
      const { id, title, detail, done } = asked.params
      const key = `extension-progress:${projectId}:${extension}:${id}`

      if (done) {
        progress.delete(key)
        toast.dismiss(key)

        return undefined
      }

      const shown = title ?? progress.get(key) ?? name
      progress.set(key, shown)
      toast.loading(shown, {
        id: key,
        description: detail,
        duration: Number.POSITIVE_INFINITY,
        cancel: {
          label: "Cancel",
          onClick: () =>
            void request("extensions.cancel", { projectId, extension, progress: id }).catch(() => undefined)
        }
      })

      return undefined
    }

    case "ui.open":
      window.open(asked.params.url, "_blank")

      return undefined
    case "ui.confirm": {
      const params = asked.params

      const confirmed = await ask<boolean>((id, answer) => ({
        id,
        extension: name,
        kind: "confirm",
        ...params,
        answer
      }))

      return { confirmed }
    }

    case "ui.input": {
      const params = asked.params

      const value = await ask<string | undefined>((id, answer) => ({
        id,
        extension: name,
        kind: "input",
        ...params,
        answer
      }))

      return value === undefined ? {} : { value }
    }

    case "ui.pick": {
      const params = asked.params

      const index = await ask<number | undefined>((id, answer) => ({
        id,
        extension: name,
        kind: "pick",
        ...params,
        answer
      }))

      return index === undefined ? {} : { index }
    }
  }
}
