/** A lens's own window takes the main window's theme, which the app sets on its root, and is named for what it holds. */
export function dress(opened: Window, title: string): void {
  const root = document.documentElement
  const theirs = opened.document.documentElement
  theirs.className = root.className

  for (const attribute of root.getAttributeNames().filter((each) => each.startsWith("data-"))) {
    theirs.setAttribute(attribute, root.getAttribute(attribute) ?? "")
  }

  theirs.style.colorScheme = root.style.colorScheme
  opened.document.title = title
}

/** Whether a drag ended outside the window it came from, as far as the browser says where it ended. */
export function outsideWindow(event: DragEvent): boolean {
  // The window the drag came from, the main one or a lens's own.
  const from = event.view ?? window

  const outsideView =
    event.clientX < 0 || event.clientY < 0 || event.clientX > from.innerWidth || event.clientY > from.innerHeight

  const outsideScreen =
    event.screenX < from.screenX ||
    event.screenY < from.screenY ||
    event.screenX > from.screenX + from.outerWidth ||
    event.screenY > from.screenY + from.outerHeight

  return outsideView || outsideScreen
}
