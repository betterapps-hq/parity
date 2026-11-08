import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vite-plus/test"

/**
 * The kit's own type classes, each one either brought onto the app's roles by a rule in styles.css, left as it is on
 * purpose, or in a part the app doesn't use (docs/typography.md: What holds it). A kit upgrade that adds, changes or
 * removes one fails here, so 12.8px, 14px or a medium tab can't quietly come back. When it fails, decide what the new
 * class should come to, add a rule to styles.css if it needs one, and update this list.
 */
const known: Record<string, Record<string, string>> = {
  "accordion.js": { "font-medium": "unused" },
  "alert-dialog.js": {
    "font-medium": "dialog title: styles.css repoints it to semibold",
    "md:text-pretty": "description: wraps as the Description role does"
  },
  "alert.js": {
    "font-medium": "alert title: an Item title",
    "md:text-pretty": "description: styles.css sets it to the Description role"
  },
  "attachment.js": { "font-medium": "unused", "leading-tight": "unused" },
  "badge.js": { "font-medium": "styles.css repoints it to regular: a chip" },
  "bubble.js": { "leading-relaxed": "unused" },
  "button-group.js": { "font-medium": "a group's text: unused" },
  "button.js": {
    "font-medium": "buttons act, so they stay medium",
    "text-[0.8rem]": "the small button: styles.css sets it to 12px"
  },
  "calendar.js": {
    "font-medium×2": "unused",
    "leading-none": "unused",
    "text-[0.8rem]×2": "styles.css sets it to 12px"
  },
  "card.js": { "font-medium": "unused", "leading-snug": "unused" },
  "chart.js": { "font-medium×3": "unused", "leading-none": "unused" },
  "code-block.js": {
    "font-medium": "its title: a medium in code reads 400",
    "leading-relaxed": "its content: styles.css sets it to 18px"
  },
  "combobox.js": { "font-medium": "unused" },
  "command.js": {
    "font-medium": "a group's heading: already a Group label, 12px medium gray",
    "tracking-widest": "its shortcut: styles.css sets it to 0"
  },
  "context-menu.js": {
    "font-medium": "its label: already a Group label",
    "tracking-widest": "its shortcut: styles.css sets it to 0"
  },
  "dialog.js": {
    "font-medium": "its title: styles.css repoints it to semibold",
    "leading-none": "its title: styles.css sets a 20px line"
  },
  "drawer.js": { "font-medium": "unused", "md:text-start": "unused" },
  "dropdown-menu.js": {
    "font-medium": "its label: already a Group label",
    "tracking-widest": "its shortcut: styles.css sets it to 0"
  },
  "empty.js": { "font-medium": "its title: an Item title", "tracking-tight": "its title: styles.css sets it to 0" },
  "field.js": {
    "font-medium×2": "its label and legend: styles.css repoints the label to regular",
    "leading-normal": "its description: styles.css sets it to 18px",
    "leading-snug×2": "its content and title: wrap around a control's 13px label"
  },
  "input-group.js": { "font-medium": "its addon: unused as text" },
  "input.js": {
    "font-medium": "a file input's button: unused",
    "md:text-sm": "styles.css lets a caller's text-xs win"
  },
  "item.js": {
    "font-medium": "its title: an Item title",
    "leading-normal": "its description: styles.css sets it to 18px",
    "leading-snug": "its title: in code, styles.css puts it on code's line"
  },
  "kbd.js": { "font-medium": "styles.css repoints it to regular: a key chip" },
  "label.js": { "font-medium": "styles.css repoints it to regular", "leading-none": "a label on one line" },
  "menubar.js": {
    "font-medium×2": "its trigger and label: the app sets font-normal on both",
    "tracking-widest": "its shortcut: styles.css sets it to 0"
  },
  "message.js": { "font-medium×2": "unused" },
  "native-select.js": { "text-[CanvasText]×2": "a color, not a size: unused" },
  "navigation-menu.js": { "font-medium": "unused" },
  "popover.js": { "font-medium": "its title: an Item title" },
  "progress.js": { "font-medium": "unused" },
  "questionnaire.js": {
    "font-medium×3": "unused",
    "leading-none": "unused",
    "leading-snug×2": "unused",
    "md:text-sm": "unused",
    "text-[0.625rem]": "unused"
  },
  "sheet.js": { "font-medium": "unused" },
  "sidebar.js": { "font-medium×3": "unused" },
  "table.js": { "font-medium×2": "its head and footer: medium, as a table's head is" },
  "tabs.js": { "font-medium": "its trigger: styles.css repoints it to regular" },
  "textarea.js": { "md:text-sm": "styles.css lets a caller's text-xs win" },
  "toast.js": { "font-medium": "its title: an Item title" },
  "toggle.js": {
    "font-medium": "styles.css repoints it to regular: a control",
    "text-[0.8rem]": "the small toggle: styles.css sets it to 12px"
  },
  "trace.js": { "leading-relaxed": "unused" }
}

const typeClass =
  /(?:^|[\s"'`:])(font-medium|text-\[[^\]]+\]|md:text-[a-z0-9]+|leading-[a-z0-9]+|tracking-[a-z]+)(?=[\s"'`]|$)/g

/** Every type class in each of the kit's components, as "class" or "class×count". */
function scanKit(): Record<string, string[]> {
  const folder = fileURLToPath(new URL("../../node_modules/@buildkitgg/shadcn-baseui-kit/dist/ui/", import.meta.url))
  const found: Record<string, string[]> = {}
  for (const file of readdirSync(folder)
    .filter((name) => name.endsWith(".js"))
    .sort()) {
    const counts = new Map<string, number>()
    for (const [, name] of readFileSync(folder + file, "utf8").matchAll(typeClass)) {
      counts.set(name!, (counts.get(name!) ?? 0) + 1)
    }
    if (counts.size > 0) {
      found[file] = [...counts].map(([name, count]) => (count === 1 ? name : `${name}×${count}`)).sort()
    }
  }
  return found
}

describe("the kit's type classes", () => {
  it("are each brought onto a role, kept on purpose or unused", () => {
    const expected = Object.fromEntries(Object.entries(known).map(([file, names]) => [file, Object.keys(names).sort()]))
    expect(scanKit()).toEqual(expected)
  })
})
