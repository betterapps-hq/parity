import { useEffect, useId, useRef, useState } from "react"

/** How long the pointer rests on an item before its card opens, and how long the card waits after it leaves. */
const rest = 500
const linger = 150

/** What can take the keyboard in a card, the first of which gets it when a key opens the card. */
const focusable = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Opens a card beside an element once the pointer has rested on it, and closes it shortly after the pointer leaves
 * both, so moving down a list doesn't open one per row, and moving onto the card keeps it. Once something in the card
 * has focus, as when a value in it is being edited, it stays until a click elsewhere or Escape closes it. Give
 * `setOpen` to the popover's `onOpenChange`, `enter` and `leave` to the item, and `id`, `stay`, `leave` and `hold` to
 * the card; the item's `aria-controls` takes the `id` too.
 *
 * `openWithKeyboard` is for a key on the item: it opens the card, or, when hovering already opened it, moves the
 * keyboard into it. Give `takesFocus` to the card's `onOpenAutoFocus`, so only a key moves focus into it and a hover
 * never takes focus from what has it, and `returnFocus` to its `onCloseAutoFocus`, which gives focus back to the item
 * a key opened it from, unless something else took it.
 */
export function useHoverCard(initial = false) {
  const [open, setOpen] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const held = useRef(false)
  const keyed = useRef(false)
  const cameFrom = useRef<HTMLElement>(undefined)
  const id = useId()
  const content = () => document.getElementById(id)
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
    if (!next) {
      held.current = false
      keyed.current = false
    }
    setOpen(next)
  }
  const openWithKeyboard = () => {
    if (document.activeElement instanceof HTMLElement) cameFrom.current = document.activeElement
    hold()
    // Already open from a hover, the card won't mount again to take the keyboard, so it's given it here.
    const card = content()
    if (open && card) {
      card.querySelector<HTMLElement>(focusable)?.focus()
      return
    }
    keyed.current = true
    setOpen(true)
  }
  const takesFocus = (event: Event) => {
    if (!keyed.current) event.preventDefault()
    keyed.current = false
  }
  const returnFocus = (event: Event) => {
    event.preventDefault()
    const item = cameFrom.current
    cameFrom.current = undefined
    // Focus that went somewhere else, as with a click on another field, stays there.
    const lost = !document.activeElement || document.activeElement === document.body
    if (item?.isConnected && (lost || content()?.contains(document.activeElement))) item.focus()
  }
  return { open, setOpen: change, enter, leave, stay, hold, id, openWithKeyboard, takesFocus, returnFocus }
}
