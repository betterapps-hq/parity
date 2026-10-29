import type { ComponentType, CSSProperties } from "react"
import type { Look, RenderKind } from "./data.ts"
import { desktop, lookVars, phone, Scaled } from "./render-kit.tsx"
import { Arena, Board, Components, Levels, Listings, MobileListings, Play, Walker } from "./renders-apps.tsx"
import {
  Billing,
  Docs,
  Inbox,
  Landing,
  MobileBilling,
  MobileLanding,
  MobileOverview,
  MobilePricing,
  Overview,
  Pricing,
  SignIn
} from "./renders-web.tsx"

type Screen = ComponentType<{ look: Look }>

const screens: Record<RenderKind, Screen> = {
  landing: Landing,
  pricing: Pricing,
  overview: Overview,
  billing: Billing,
  signin: SignIn,
  docs: Docs,
  inbox: Inbox,
  levels: Levels,
  play: Play,
  arena: Arena,
  components: Components,
  listings: Listings,
  walker: Walker,
  board: Board
}

const phoneScreens: Partial<Record<RenderKind, Screen>> = {
  landing: MobileLanding,
  pricing: MobilePricing,
  overview: MobileOverview,
  billing: MobileBilling,
  listings: MobileListings
}

/** A design, drawn at its real size in its app's look and scaled to fit. */
export function DesignRender({
  kind,
  look,
  mobile,
  className,
  style
}: {
  kind: RenderKind
  look: Look
  /** The phone mode of the design, where it has one. */
  mobile?: boolean
  className?: string
  style?: CSSProperties
}) {
  const onPhone = mobile ? phoneScreens[kind] : undefined
  const Screen = onPhone ?? screens[kind]
  const size = onPhone ? phone : desktop
  return (
    <Scaled width={size.width} height={size.height} className={className} style={style}>
      <div className="size-full overflow-hidden bg-(--r-bg) text-(--r-fg) antialiased" style={lookVars(look)}>
        <Screen look={look} />
      </div>
    </Scaled>
  )
}
