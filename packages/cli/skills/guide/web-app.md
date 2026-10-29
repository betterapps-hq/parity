# Web app screens

A web app is used, not read. People come to a screen to do something: check a number, find a record, change a setting.
Design each screen around that job.

## Before you design

Answer three questions, from the request or by asking:

1. **Who uses this screen, and what do they come to do?** The main task gets the most space and the first look.
2. **What data does it show?** Real fields, typical amounts, and the extremes: none, one, thousands, a very long name.
3. **What can go wrong?** Loading, empty, errors, no permission. Each is a state of the design.

## Layout

- **App shell.** Navigation in a sidebar or top bar, then the page. Make the shell a component design (`app-sidebar`,
  `app-top-bar`) and place it as an instance on every screen, so it stays the same everywhere.
- **Page header.** The page's title, a line saying what it's for when that isn't obvious, and its main actions at the
  end of the same row.
- **Content.** Lead with what the person came for. On a dashboard that's a few key numbers, then what changed, then
  detail. On a list, the list, with search and filters above it.
- **Width.** Forms and reading text work best narrow (a `maxWidth` around 160 steps); tables and dashboards use the
  room.

## Common screens

- **Dashboard.** A row of stat cards (a component design), then a chart or a table of what needs attention. Every number
  says what it is and, where it helps, how it changed.
- **List and table.** A header with the count and the main action, search and filters, the table, and pagination or a
  "load more". Row actions sit at the end of the row. Plan the empty state and the filtered-to-nothing state, which are
  different.
- **Detail.** The record's name and status at the top, its main facts in a card, then related lists in tabs.
- **Settings.** Sections with a title and a line of explanation on one side and the fields on the other, or stacked on
  mobile. Save per section, and show when it saved.
- **Forms.** One column. Labels above fields, help text under them, errors under the field they're about, in
  `destructive`. The primary button at the end; disable it or show progress while it saves.
- **Sign in and onboarding.** One task per screen, centred, narrow, with the product's name or logo above it.

## Behaviour

Designs are static, but they should show behaviour as states: a menu open, a dialog over the page, a toast after saving,
a row being edited. When you're unsure whether something works, ask the person to try it with the Interact tool; it uses
the real components.
