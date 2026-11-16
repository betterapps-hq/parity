import {
  Button,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input
} from "@buildkitgg/shadcn-baseui-kit"
import { useState } from "react"
import { type ExtensionQuestion as Question, useExtensionQuestion } from "../extension-ui.ts"

/**
 * What an extension asks the person through `parity.ui` (PAR-1089): a confirmation, a field or a list to pick from, one
 * at a time, each naming the extension that asks. Escape and clicking away cancel, which the extension hears as no
 * answer.
 */
export function ExtensionQuestion() {
  const question = useExtensionQuestion()

  return (
    <Dialog open={!!question} onOpenChange={(open) => !open && question && cancel(question)}>
      {question && (
        <DialogContent className="sm:max-w-md" key={question.id}>
          <Asked question={question} />
        </DialogContent>
      )}
    </Dialog>
  )
}

/** Answers a question as cancelling it does. */
function cancel(question: Question): void {
  if (question.kind === "confirm") {
    question.answer(false)
  } else {
    question.answer(undefined)
  }
}

/** The question's own part: its buttons, its field, or its list. The first control in it takes focus as it opens. */
function Asked({ question }: { question: Question }) {
  switch (question.kind) {
    case "confirm":
      return (
        <>
          <DialogHeader>
            <DialogTitle>{question.message}</DialogTitle>
            <DialogDescription>{question.detail ?? `From ${question.extension}`}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => question.answer(false)}>
              Cancel
            </Button>
            <Button onClick={() => question.answer(true)}>{question.confirm ?? "OK"}</Button>
          </DialogFooter>
        </>
      )
    case "input":
      return <Field question={question} />
    case "pick":
      return (
        <>
          <DialogHeader>
            <DialogTitle>{question.title ?? "Choose one"}</DialogTitle>
            <DialogDescription>From {question.extension}</DialogDescription>
          </DialogHeader>
          <Command className="rounded-md border">
            <CommandInput placeholder={question.placeholder ?? "Search"} />
            <CommandList>
              <CommandEmpty>Nothing matches.</CommandEmpty>
              {question.items.map((item, index) => (
                <CommandItem key={index} value={`${index} ${item.label}`} onSelect={() => question.answer(index)}>
                  <span className="truncate">{item.label}</span>
                  {item.detail && <span className="ml-auto truncate text-xs text-muted-foreground">{item.detail}</span>}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </>
      )
  }
}

function Field({ question }: { question: Extract<Question, { kind: "input" }> }) {
  const [value, setValue] = useState(question.value ?? "")

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        question.answer(value)
      }}
    >
      <DialogHeader>
        <DialogTitle>{question.title}</DialogTitle>
        <DialogDescription>From {question.extension}</DialogDescription>
      </DialogHeader>
      <Input
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        placeholder={question.placeholder}
        aria-label={question.title}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => question.answer(undefined)}>
          Cancel
        </Button>
        <Button type="submit">OK</Button>
      </DialogFooter>
    </form>
  )
}
