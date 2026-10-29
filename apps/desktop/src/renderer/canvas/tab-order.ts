import { useSyncExternalStore } from "react"

/** Whether the canvas shows the keyboard tab order of the selected design. It's off until asked for. */
let shown = false
const listeners = new Set<() => void>()

export function getTabOrderShown(): boolean {
  return shown
}

export function setTabOrderShown(next: boolean): void {
  if (next === shown) return
  shown = next
  for (const listener of listeners) listener()
}

export function useTabOrderShown(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, getTabOrderShown)
}

const focusableSelector = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "iframe",
  "summary",
  "audio[controls]",
  "video[controls]",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[tabindex]"
].join(", ")

/**
 * The elements Tab moves through in a frame, in the order it visits them: positive `tabindex` first, by value, then
 * the rest in document order. Hidden, disabled and inert elements are skipped, as is every radio button in a group but
 * the one Tab lands on.
 */
export function tabOrder(host: Element): HTMLElement[] {
  const root = host.shadowRoot
  if (!root) return []
  const radios = new Map<string, HTMLInputElement>()
  const candidates = [...root.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => {
    if (element.tabIndex < 0 || element.matches(":disabled") || element.closest("[inert], [hidden]")) return false
    if (element instanceof HTMLInputElement && element.type === "hidden") return false
    const style = getComputedStyle(element)
    if (style.visibility === "hidden" || style.display === "none") return false
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return false
    if (element instanceof HTMLInputElement && element.type === "radio" && element.name) {
      const group = `${element.form?.id ?? ""}\n${element.name}`
      const chosen = radios.get(group)
      if (!chosen || (element.checked && !chosen.checked)) radios.set(group, element)
    }
    return true
  })
  const tabbable = candidates.filter(
    (element) =>
      !(element instanceof HTMLInputElement && element.type === "radio" && element.name) ||
      [...radios.values()].includes(element)
  )
  const positive = tabbable.filter((element) => element.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex)
  return [...positive, ...tabbable.filter((element) => element.tabIndex === 0)]
}
