/** The height of a lens window's title bar, which the system's window buttons sit over the end of, as main sets them. */
const titleBarHeight = 40

/** A lens's own window takes the main window's theme, which the app sets on its root, and is named for what it holds. */
export function dress(opened: Window, title: string): void {
  const root = document.documentElement
  const theirs = opened.document.documentElement
  theirs.className = root.className

  for (const attribute of theirs.getAttributeNames().filter((each) => each.startsWith("data-"))) {
    if (!root.hasAttribute(attribute)) {
      theirs.removeAttribute(attribute)
    }
  }

  for (const attribute of root.getAttributeNames().filter((each) => each.startsWith("data-"))) {
    theirs.setAttribute(attribute, root.getAttribute(attribute) ?? "")
  }

  theirs.style.colorScheme = root.style.colorScheme
  opened.document.title = title
}

/** Calls `changed` each time the main window's theme changes, until the function returned is called. */
export function onThemeChange(changed: () => void): () => void {
  const observer = new MutationObserver(changed)
  observer.observe(document.documentElement, { attributes: true })

  return () => observer.disconnect()
}

/**
 * Makes room at the top of a lens's own window for its title bar, above the tabs Dockview put in it, and returns the
 * element the title bar draws in.
 */
export function makeTitleBar(opened: Window): HTMLElement {
  const page = opened.document
  const bar = page.createElement("div")
  bar.dataset.lensTitleBar = ""
  bar.style.cssText = `position: absolute; top: 0; left: 0; right: 0; height: ${titleBarHeight}px`
  page.body.prepend(bar)

  // Dockview's own element, which holds the group, under it.
  const group = page.querySelector<HTMLElement>(".dv-popout-window")

  if (group) {
    group.style.top = `${titleBarHeight}px`
    group.style.height = `calc(100% - ${titleBarHeight}px)`
  }

  return bar
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
