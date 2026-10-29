/**
 * Ember Caves' In game board, as v5 was designed and as main draws it now. #139 moved the hearts from a bar at the
 * bottom to the top left after v5 was built, so the code no longer matches the design. The code side is the start
 * page's own render; the design side covers its hearts and score and draws them where v5 had them. Elements carry
 * `data-mark`, so the comparison's outlines can be measured from the render.
 */
import { Heart } from "lucide-react"
import type { Look } from "../start/data.ts"
import { desktop, Scaled } from "../start/render-kit.tsx"
import { DesignRender } from "../start/renders.tsx"

const pixel = "font-mono font-bold tracking-[0.18em] uppercase"

function Hearts() {
  return (
    <span className="flex gap-1.5">
      {[0, 1, 2].map((heart) => (
        <Heart
          key={heart}
          className={`size-8 ${heart < 2 ? "fill-[oklch(0.68_0.22_25)] text-[oklch(0.68_0.22_25)]" : "text-white/40"}`}
        />
      ))}
    </span>
  )
}

/** In game, as the design or as the code draws it. */
export function InGameAt({ look, as }: { look: Look; as: "design" | "code" }) {
  const h = look.hue
  return (
    <div className="relative">
      <DesignRender kind="play" look={look} />
      {as === "design" && (
        <Scaled width={desktop.width} height={desktop.height} style={{ position: "absolute", inset: 0 }}>
          {/* The same sky as the render, over the hearts and score where the code puts them. */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, oklch(0.22 0.07 ${h + 260}) 0%, oklch(0.3 0.1 ${h + 310}) 60%, oklch(0.42 0.14 ${h}) 100%)`,
              clipPath: "inset(16px 1040px 700px 24px)"
            }}
          />
          <span data-mark="score" className={`absolute top-6 left-8 text-[18px] text-white ${pixel}`}>
            Score 004210
          </span>
          <span
            data-mark="hearts"
            className="absolute bottom-6 left-8 rounded-xl bg-black/45 p-2 ring-1 ring-white/10 backdrop-blur"
          >
            <Hearts />
          </span>
        </Scaled>
      )}
    </div>
  )
}
