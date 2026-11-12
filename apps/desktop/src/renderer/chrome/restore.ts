import { useSyncExternalStore } from "react"

export type RestoreChoice = "restore" | "discard"

export interface RestoreQuestion {
  /** When the copy was last kept, in ISO 8601: about when the last change was made. */
  keptAt: string
  answer(choice: RestoreChoice): void
}

/** The questions waiting, first shown first: projects open one after another as the app starts. */
let questions: RestoreQuestion[] = []
const listeners = new Set<() => void>()

/**
 * Asks whether to restore a project's unsaved changes, kept when Parity closed before they were saved (PAR-905), and
 * waits for the answer. The dialog is mounted once, in the app; a project that opens while it's asking waits its turn.
 */
export function askToRestore(question: Omit<RestoreQuestion, "answer">): Promise<RestoreChoice> {
  return new Promise((resolve) => {
    const asked: RestoreQuestion = {
      ...question,
      answer: (choice) => {
        questions = questions.filter((each) => each !== asked)
        notify()
        resolve(choice)
      }
    }

    questions = [...questions, asked]
    notify()
  })
}

/**
 * Restores what the open question asked about, as when its dialog failed and was closed (PAR-667): the changes come
 * back unsaved, where Undo or closing without saving drops them, so nothing is lost either way.
 */
export function restoreAsked(): void {
  questions[0]?.answer("restore")
}

/** The question showing now, if there is one. */
export function useRestoreQuestion(): RestoreQuestion | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    () => questions[0]
  )
}

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}
