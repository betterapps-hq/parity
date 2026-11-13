import { useStore, windowStore } from "../store.ts"

export type UnsavedChoice = "save" | "discard" | "cancel"

interface Question {
  /** The projects with unsaved changes. */
  names: string[]
  /** What's about to happen, like closing the tab or quitting. */
  action: "close" | "quit"
  answer(choice: UnsavedChoice): void
}

const question = windowStore<Question | undefined>(() => undefined)

/**
 * Asks whether to save changes before they'd be lost, and waits for the answer. The dialog that asks is mounted once,
 * in the app; asking again while it's open answers the earlier question with cancel.
 */
export function askAboutUnsaved(names: string[], action: Question["action"]): Promise<UnsavedChoice> {
  question.get()?.answer("cancel")

  return new Promise((resolve) => {
    question.set({
      names,
      action,
      answer: (choice) => {
        question.set(undefined)
        resolve(choice)
      }
    })
  })
}

/** Answers the open question with cancel, as when its dialog failed and was closed (PAR-667). */
export function cancelUnsaved(): void {
  question.get()?.answer("cancel")
}

export function useUnsavedQuestion(): Question | undefined {
  return useStore(question)
}
