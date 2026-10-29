import { useSyncExternalStore } from "react"

export type UnsavedChoice = "save" | "discard" | "cancel"

interface Question {
  /** The projects with unsaved changes. */
  names: string[]
  /** What's about to happen, like closing the tab or quitting. */
  action: "close" | "quit"
  answer(choice: UnsavedChoice): void
}

let question: Question | undefined
const listeners = new Set<() => void>()

/**
 * Asks whether to save changes before they'd be lost, and waits for the answer. The dialog that asks is mounted once,
 * in the app; asking again while it's open answers the earlier question with cancel.
 */
export function askAboutUnsaved(names: string[], action: Question["action"]): Promise<UnsavedChoice> {
  question?.answer("cancel")
  return new Promise((resolve) => {
    question = {
      names,
      action,
      answer: (choice) => {
        question = undefined
        notify()
        resolve(choice)
      }
    }
    notify()
  })
}

export function useUnsavedQuestion(): Question | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => question
  )
}

function notify(): void {
  for (const listener of listeners) listener()
}
