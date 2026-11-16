import type { ReactNode } from "react"
import type { Theme } from "./canvas-kit.tsx"
import { CanvasPane } from "./CanvasPane.tsx"

interface ThemesProps {
  width?: number
  height?: number
  children: (theme: Theme) => ReactNode
}

/**
 * The same piece of canvas in the light theme and the dark, side by side, wrapping onto two rows when there isn't room.
 * Each is its own theme, whatever the toolbar says; menus and popovers opened from it follow the toolbar. Each pane is
 * `width` wide at most and narrows with the window, so the toolbar's viewport menu shows the canvas narrow.
 */
export function Themes({ width = 560, height = 360, children }: ThemesProps) {
  return (
    <div className="flex min-h-screen flex-wrap content-start gap-6 bg-background p-6 text-foreground">
      {(["light", "dark"] as const).map((theme) => (
        <section key={theme} className="flex flex-col gap-2" style={{ width, maxWidth: "100%" }}>
          <h2 className="text-xs font-medium text-muted-foreground">{theme === "light" ? "Light" : "Dark"}</h2>
          <CanvasPane theme={theme} width={width} height={height}>
            {children(theme)}
          </CanvasPane>
        </section>
      ))}
    </div>
  )
}
