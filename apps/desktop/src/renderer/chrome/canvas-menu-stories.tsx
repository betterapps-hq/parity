import { within } from "storybook/test"

/** What the Canvas menu's stories share: reading what an open menu lists. */

export const body = () => within(document.body)

/** What a menu lists: each item's name, `(unavailable)` after one that is, and `---` between sections. */
export function items(menu: HTMLElement): string[] {
  return [...menu.querySelectorAll(":scope > [role=menuitem], :scope > [role=separator]")].map((item) => {
    if (item.getAttribute("role") === "separator") {
      return "---"
    }

    const name = nameOf(item)

    return item.hasAttribute("data-disabled") ? `${name} (unavailable)` : name
  })
}

/** An item's name: its text, without its shortcut or icon. */
function nameOf(item: Element): string {
  return [...item.childNodes]
    .flatMap((child) =>
      child instanceof Element && child.matches("[data-slot=context-menu-shortcut], svg") ? [] : [child.textContent]
    )
    .join("")
    .trim()
}

/** The keys an item of a menu shows. */
export function keysOf(menu: HTMLElement, name: string): string | undefined {
  const item = within(menu)
    .getAllByRole("menuitem")
    .find((candidate) => nameOf(candidate) === name)

  return item?.querySelector("[data-slot=context-menu-shortcut]")?.textContent ?? undefined
}
