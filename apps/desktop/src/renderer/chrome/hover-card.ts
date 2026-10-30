import { useEffect, useRef, useState } from "react"

/** How long the pointer rests on an item before its card opens, and how long the card waits after it leaves. */
const rest = 500
const linger = 150

/**
 * Opens a card beside an element once the pointer has rested on it, and closes it shortly after the pointer leaves
 * both, so moving down a list doesn't open one per row, and moving onto the card keeps it. Once something in the card
 * has focus, as when a value in it is being edited, it stays until a click elsewhere or Escape closes it. Give
 * `setOpen` to the popover's `onOpenChange`, `enter` and `leave` to the item, and `stay`, `leave` and `hold` to the
 * card. `openWithKeyboard` opens it at once for a key on the item, and `takesFocus` says, as it opens, whether the
 * keyboard should go into it: only when a key opened it, so a hover never takes focus from what has it.
 */
export function useHoverCard(initial = false) {
  const [open, setOpen] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const held = useRef(false)
  const keyed = useRef(false)
  useEffect(() => () => clearTimeout(timer.current), [])
  const enter = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), rest)
  }
  const leave = () => {
    clearTimeout(timer.current)
    if (!held.current) timer.current = setTimeout(() => setOpen(false), linger)
  }
  const stay = () => clearTimeout(timer.current)
  const hold = () => {
    clearTimeout(timer.current)
    held.current = true
  }
  const change = (next: boolean) => {
    clearTimeout(timer.current)
    if (!next) held.current = false
    setOpen(next)
  }
  const openWithKeyboard = () => {
    keyed.current = true
    hold()
    setOpen(true)
  }
  const takesFocus = () => {
    const was = keyed.current
    keyed.current = false
    return was
  }
  return { open, setOpen: change, enter, leave, stay, hold, openWithKeyboard, takesFocus }
}
