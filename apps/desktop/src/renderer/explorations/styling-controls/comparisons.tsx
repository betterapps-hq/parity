import { GroupLabel } from "../../chrome/PanelSection.tsx"

/*
 * How other design tools draw the same control, beside a story's control, for review: each a screenshot from the
 * tool's own help pages, loaded from there rather than kept in the repository, with a link to the page it's from.
 */

/** A screenshot of another tool's control, from its own help pages. */
export interface Comparison {
  tool: string
  /** The screenshot's address, on the tool's site. */
  image: string
  /** The help page it's from. */
  source: string
  /** What it shows, for its alt text and caption. */
  shows: string
}

/** The other tools' screenshots, each captioned with what it shows and linked to its page. */
export function Comparisons({ items }: { items: readonly Comparison[] }) {
  return (
    <section aria-labelledby="comparisons" className="flex w-full flex-col gap-3">
      <GroupLabel as="h2" className="block">
        <span id="comparisons">How other tools do it</span>
      </GroupLabel>
      <ul className="flex flex-wrap items-start gap-4">
        {items.map((item) => (
          <li key={item.image} className="flex w-80 flex-col gap-1.5">
            <a
              href={item.source}
              target="_blank"
              rel="noreferrer"
              className="overflow-hidden rounded-lg border bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img src={item.image} alt={`${item.tool}: ${item.shows}`} loading="lazy" className="block w-full" />
            </a>
            <p className="text-xs">
              <span className="font-medium">{item.tool}</span>{" "}
              <span className="text-muted-foreground">{item.shows}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

const figmaGrid = "https://help.figma.com/hc/en-us/articles/31289469907863"
const figmaAlign = "https://help.figma.com/hc/en-us/articles/31289464393751"
const webflowFlex = "https://help.webflow.com/hc/en-us/articles/33961260795155-Flexbox"
const webflowGrid = "https://help.webflow.com/hc/en-us/articles/33961365794451-Grid"
const penpot = "https://help.penpot.app/user-guide/designing/flexible-layouts/"
const figmaShot = (id: string) => `https://help.figma.com/hc/article_attachments/${id}`
const webflowShot = (id: string) => `https://help.webflow.com/hc/article_attachments/${id}`

/** Layout's direction, alignment, gap and wrap, in Figma, Webflow and Penpot. Framer's help is video only. */
export const layoutComparisons: Comparison[] = [
  {
    tool: "Figma",
    image: figmaShot("31837633116311"),
    source: figmaAlign,
    shows: "The alignment box in auto layout, clicked through its spots"
  },
  {
    tool: "Figma",
    image: figmaShot("31837633117079"),
    source: figmaAlign,
    shows: "The alignment box once gap is Auto, spreading the children"
  },
  {
    tool: "Figma",
    image: figmaShot("42896719340311"),
    source: figmaAlign,
    shows: "Auto gap's Between, Evenly and Around"
  },
  { tool: "Figma", image: figmaShot("43760026902295"), source: figmaAlign, shows: "Wrap" },
  {
    tool: "Webflow",
    image: webflowShot("42118051175827"),
    source: webflowFlex,
    shows: "Layout with Display set to Flex"
  },
  { tool: "Webflow", image: webflowShot("42118051179411"), source: webflowFlex, shows: "Direction's wrap menu" },
  {
    tool: "Webflow",
    image: webflowShot("42118089705235"),
    source: webflowFlex,
    shows: "The align box's X axis menu, with Space between and Space around"
  },
  {
    tool: "Webflow",
    image: webflowShot("42118089708179"),
    source: webflowFlex,
    shows: "The Y axis menu, with Stretch and Baseline"
  },
  {
    tool: "Penpot",
    image: "https://help.penpot.app/img/flexible-layouts/flex-properties.webp",
    source: penpot,
    shows: "Flex layout: direction, wrap, align, justify, gap and padding"
  }
]

/** A grid's columns and rows, in Figma, Webflow and Penpot. */
export const gridTrackComparisons: Comparison[] = [
  {
    tool: "Figma",
    image: figmaShot("31880057373975"),
    source: figmaGrid,
    shows: "The grid picker, changing the columns and rows"
  },
  { tool: "Figma", image: figmaShot("36755123855639"), source: figmaGrid, shows: "Setting each track to Fill" },
  { tool: "Figma", image: figmaShot("40414326822423"), source: figmaGrid, shows: "Reordering tracks" },
  {
    tool: "Webflow",
    image: webflowShot("42118669360275"),
    source: webflowGrid,
    shows: "Display set to Grid, with Columns and Rows"
  },
  { tool: "Webflow", image: webflowShot("42118691088787"), source: webflowGrid, shows: "Adding columns and rows" },
  {
    tool: "Webflow",
    image: webflowShot("42118669366931"),
    source: webflowGrid,
    shows: "A column's and a row's size, with min and max"
  },
  {
    tool: "Penpot",
    image: "https://help.penpot.app/img/flexible-layouts/grid-properties-container.webp",
    source: penpot,
    shows: "Grid layout: columns and rows as FR, Auto or px tracks, and gap"
  }
]

/** A grid child's place, in Figma, Webflow and Penpot. */
export const gridPlacementComparisons: Comparison[] = [
  {
    tool: "Figma",
    image: figmaShot("40414359336087"),
    source: figmaGrid,
    shows: "Placing items automatically or by hand"
  },
  {
    tool: "Figma",
    image: figmaShot("31880558249495"),
    source: figmaGrid,
    shows: "Spanning cells by dragging the item's handles on the canvas"
  },
  {
    tool: "Figma",
    image: figmaShot("31880558250007"),
    source: figmaGrid,
    shows: "An item's alignment in its cell, in the right sidebar"
  },
  {
    tool: "Webflow",
    image: webflowShot("42118669368083"),
    source: webflowGrid,
    shows: "Grid child, with Position set to Manual"
  },
  {
    tool: "Webflow",
    image: webflowShot("42118691093267"),
    source: webflowGrid,
    shows: "The grid's direction, which way children flow"
  },
  {
    tool: "Penpot",
    image: "https://help.penpot.app/img/flexible-layouts/grid-properties-cell.webp",
    source: penpot,
    shows: "A grid cell: Auto, Manual or Area, and its alignment"
  }
]
