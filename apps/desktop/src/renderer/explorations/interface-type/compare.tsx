import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

/** The type a part of the page is drawn in: the app's now, or the proposed (PAR-709, see proposed-type.css). */
export type InterfaceType = "current" | "proposed"

const sides: { type: InterfaceType; label: string }[] = [
  { type: "current", label: "Current" },
  { type: "proposed", label: "Proposed" }
]

/**
 * The same UI twice, the app's type beside the proposed type, each side its own live copy over the same project, so
 * selecting or editing in one shows in both. `stacked` puts them one above the other, each as tall as what it holds,
 * for a strip as wide as the window. Menus, popovers and tooltips open over the whole page, outside both sides, so they
 * follow the toolbar's Type control.
 */
export function TypeCompare({ children, stacked = false }: { children: ReactNode; stacked?: boolean }) {
  return (
    <div className={`flex h-screen min-h-0 bg-background text-foreground ${stacked ? "flex-col" : ""}`}>
      {sides.map(({ type, label }) => (
        <section
          key={type}
          aria-label={label}
          className={`flex min-h-0 min-w-0 flex-col ${stacked ? "border-b" : "flex-1 not-last:border-r"}`}
        >
          <h2 className="flex h-8 shrink-0 items-center border-b px-3 text-xs font-medium text-muted-foreground">
            {label}
          </h2>
          <div data-interface-type={type} className="flex min-h-0 flex-1 justify-center overflow-hidden">
            {children}
          </div>
        </section>
      ))}
    </div>
  )
}

/** What `element` is drawn in, as "12/16 450": its size and line height in pixels, and its weight. */
function measure(element: Element): string {
  const style = getComputedStyle(element)
  const px = (value: string) => (value === "normal" ? "normal" : String(Math.round(Number.parseFloat(value) * 10) / 10))
  const tracking = style.letterSpacing === "normal" || style.letterSpacing === "0px" ? "" : ` ${style.letterSpacing}`
  return `${px(style.fontSize)}/${px(style.lineHeight)} ${style.fontWeight}${tracking}`
}

/** The typeface the interface is set in: Geist, as now, or Inter, to compare (see proposed-type.css). */
export type InterfaceFont = "geist" | "inter"

/**
 * A sample drawn in one type and typeface, with the size, line height and weight it comes out at underneath, measured
 * from the page rather than written down, so the numbers can't drift from what's shown.
 */
export function Specimen({
  type,
  font = "geist",
  children
}: {
  type: InterfaceType
  font?: InterfaceFont
  children: ReactNode
}) {
  const sample = useRef<HTMLDivElement>(null)
  const [spec, setSpec] = useState("")
  useLayoutEffect(() => {
    const text = sample.current?.querySelector("[data-sample]")
    if (text) setSpec(measure(text))
  }, [])
  return (
    <div className="flex flex-col gap-1.5">
      <div ref={sample} data-interface-type={type} data-interface-font={font}>
        {children}
      </div>
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{spec}</span>
    </div>
  )
}
