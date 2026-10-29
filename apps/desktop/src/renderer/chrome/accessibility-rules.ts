/**
 * axe-core's rules in plain words: a short title for the list, and a sentence on who it affects and what to do. Rules
 * that aren't here use axe-core's own summary.
 */
export const ruleWords: Record<string, { title: string; why: string }> = {
  "color-contrast": {
    title: "Text contrast is too low",
    why: "People with low vision can't read it easily. Text needs 4.5:1 against what's behind it, or 3:1 when it's large."
  },
  "link-in-text-block": {
    title: "Link looks like the text around it",
    why: "Colour alone doesn't set it apart for everyone. Underline it, or make it stand out some other way."
  },
  "target-size": {
    title: "Target is too small",
    why: "Small targets are hard to hit. Make it at least 24 by 24px, or leave room so a 24px circle on it touches no other target."
  },
  "button-name": {
    title: "Button has no name",
    why: "Screen readers announce it as just a button. Give it text, or an aria-label when it's only an icon."
  },
  "link-name": {
    title: "Link has no name",
    why: "Screen readers can't say where it goes. Give it text, or an aria-label when it's only an icon."
  },
  "image-alt": {
    title: "Image has no alt text",
    why: "Screen readers can't describe it. Say what it shows in alt, or leave alt empty when it's only decoration."
  },
  "svg-img-alt": {
    title: "Image has no name",
    why: "Screen readers can't describe it. Give it a title or an aria-label."
  },
  "role-img-alt": {
    title: "Image has no name",
    why: "Screen readers can't describe it. Give it an aria-label or aria-labelledby."
  },
  "input-image-alt": {
    title: "Image button has no alt text",
    why: "Screen readers can't say what it does. Describe the action in alt."
  },
  label: {
    title: "Form field has no label",
    why: "Screen readers can't say what to enter. Connect a label to it, or give it an aria-label."
  },
  "select-name": {
    title: "Select has no label",
    why: "Screen readers can't say what it's choosing. Connect a label to it, or give it an aria-label."
  },
  "form-field-multiple-labels": {
    title: "Form field has more than one label",
    why: "Screen readers may read only one of them. Keep one label and move the rest into a description."
  },
  "label-title-only": {
    title: "Form field is labelled only by its title",
    why: "A title shows only on hover and isn't always read. Give it a visible label."
  },
  "aria-valid-attr-value": {
    title: "ARIA attribute has a value it can't take",
    why: "Screen readers rely on it. References must point at elements that exist, and values must be ones the attribute allows."
  },
  "aria-valid-attr": {
    title: "ARIA attribute doesn't exist",
    why: "Screen readers ignore attributes they don't know. Check its spelling."
  },
  "aria-allowed-attr": {
    title: "ARIA attribute isn't allowed on this role",
    why: "Screen readers may ignore it or announce it oddly. Remove it, or change the role."
  },
  "aria-prohibited-attr": {
    title: "ARIA attribute isn't allowed here",
    why: "This element can't be named or described this way. Use visible text instead."
  },
  "aria-required-attr": {
    title: "Role is missing an ARIA attribute it needs",
    why: "Screen readers can't describe its state without it, such as aria-checked on a checkbox."
  },
  "aria-required-children": {
    title: "Role is missing the roles it must contain",
    why: "Screen readers expect them, such as options inside a listbox or tabs inside a tablist."
  },
  "aria-required-parent": {
    title: "Role is outside the role it belongs in",
    why: "Screen readers expect it inside another, such as a tab inside a tablist."
  },
  "aria-roles": {
    title: "ARIA role doesn't exist",
    why: "Screen readers ignore roles they don't know. Check its spelling."
  },
  "aria-allowed-role": {
    title: "Role doesn't suit this element",
    why: "Use an element that already has the role, or a role this element allows."
  },
  "aria-deprecated-role": {
    title: "ARIA role is deprecated",
    why: "Screen readers may stop supporting it. Use the role that replaced it."
  },
  "aria-hidden-focus": {
    title: "Hidden from screen readers but focusable",
    why: "Keyboard users can reach something screen readers can't describe. Make it unfocusable, or stop hiding it."
  },
  "aria-command-name": {
    title: "Control has no name",
    why: "Screen readers can't say what it does. Give it text, or an aria-label."
  },
  "aria-input-field-name": {
    title: "Input has no name",
    why: "Screen readers can't say what to enter. Give it an aria-label or aria-labelledby."
  },
  "aria-toggle-field-name": {
    title: "Toggle has no name",
    why: "Screen readers can't say what it switches. Give it text, or an aria-label."
  },
  "aria-meter-name": {
    title: "Meter has no name",
    why: "Screen readers can't say what it measures. Give it an aria-label or aria-labelledby."
  },
  "aria-progressbar-name": {
    title: "Progress bar has no name",
    why: "Screen readers can't say what's loading. Give it an aria-label or aria-labelledby."
  },
  "aria-tooltip-name": {
    title: "Tooltip has no text",
    why: "Screen readers have nothing to read. Give it text, or an aria-label."
  },
  "aria-treeitem-name": {
    title: "Tree item has no name",
    why: "Screen readers can't say what it is. Give it text, or an aria-label."
  },
  "aria-dialog-name": {
    title: "Dialog has no name",
    why: "Screen readers can't say what opened. Point aria-labelledby at its title."
  },
  "nested-interactive": {
    title: "Control inside another control",
    why: "Screen readers may skip the inner one, and focus gets confusing. Put them side by side."
  },
  "scrollable-region-focusable": {
    title: "Scrolling area can't be reached by keyboard",
    why: "Keyboard users can't scroll it. Make it focusable, or put something focusable inside."
  },
  tabindex: {
    title: "Positive tabindex",
    why: "It changes the order Tab moves in, which rarely matches the layout. Use 0, or reorder the elements."
  },
  "presentation-role-conflict": {
    title: "Decorative element is still announced",
    why: "Something marked as decoration is focusable or labelled, so screen readers read it anyway."
  },
  list: {
    title: "List holds more than list items",
    why: "Screen readers count the items wrongly. Put only li elements directly inside ul and ol."
  },
  listitem: {
    title: "List item is outside a list",
    why: "Screen readers don't announce it as part of a list. Put it directly inside a ul or ol."
  },
  "definition-list": {
    title: "Definition list holds the wrong elements",
    why: "Put only dt and dd groups directly inside a dl."
  },
  dlitem: {
    title: "Term or definition is outside a list",
    why: "Put dt and dd directly inside a dl."
  },
  "heading-order": {
    title: "Heading level skipped",
    why: "Screen reader users move by headings. Go down one level at a time."
  },
  "empty-heading": {
    title: "Heading is empty",
    why: "Screen readers announce a heading with nothing in it. Give it text, or remove it."
  },
  "empty-table-header": {
    title: "Table header is empty",
    why: "Screen readers can't say what the column holds. Give it text, even if it's visually hidden."
  },
  "th-has-data-cells": {
    title: "Table header has no cells",
    why: "Screen readers can't connect it to any data."
  },
  "td-headers-attr": {
    title: "Table cell points at the wrong headers",
    why: "Its headers attribute must name header cells in the same table."
  },
  "autocomplete-valid": {
    title: "Autocomplete value isn't recognised",
    why: "Browsers and assistive tools can't fill it in. Use a standard autocomplete token."
  },
  "avoid-inline-spacing": {
    title: "Text spacing is locked",
    why: "People who need more space between lines or letters can't change it. Don't set spacing with !important inline."
  },
  "landmark-unique": {
    title: "Landmarks share a name",
    why: "Screen reader users can't tell them apart. Give each one a different label."
  },
  "duplicate-id-aria": {
    title: "ARIA points at a duplicate id",
    why: "Screen readers use only the first element with that id. Make the id unique."
  },
  "summary-name": {
    title: "Summary has no name",
    why: "Screen readers can't say what it expands. Give it text."
  },
  "frame-title": {
    title: "Frame has no title",
    why: "Screen readers can't say what's inside. Give it a title."
  },
  "video-caption": {
    title: "Video has no captions",
    why: "People who can't hear it miss what's said. Add a captions track."
  }
}
