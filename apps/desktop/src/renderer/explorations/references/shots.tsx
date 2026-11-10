import type { ReactNode } from "react"
import { accent, MiniScreen } from "../parts.tsx"
import type { PhoneKind, Shot } from "./data.ts"

/** A sample reference's drawing, filling its box: a web page in the explorations' blocks, or a phone screen. */
export function ShotDrawing({ shot, hue, dark = false }: { shot: Shot; hue: number; dark?: boolean }) {
  if (shot.platform === "web") {
    return <MiniScreen kind={shot.kind} hue={hue} dark={dark} />
  }

  return <PhoneScreen kind={shot.kind} hue={hue} dark={dark} />
}

function phoneColors(hue: number, dark: boolean) {
  return {
    page: dark ? "#141417" : "#ffffff",
    panel: dark ? "#1d1d22" : "#f4f4f5",
    ink: dark ? "#3a3a42" : "#d4d4d8",
    faint: dark ? "#2a2a30" : "#e7e7ea",
    accent: accent(hue, dark ? 0.72 : 0.62, 0.16),
    tint: `color-mix(in oklch, ${accent(hue, 0.7, 0.16)} ${dark ? 22 : 16}%, ${dark ? "#141417" : "#ffffff"})`
  }
}

type Colors = ReturnType<typeof phoneColors>

function Line({ w, h = 5, c, r = 999 }: { w: string; h?: number; c: string; r?: number }) {
  return <div className="shrink-0" style={{ width: w, height: h, background: c, borderRadius: r }} />
}

function Block({ h, c, r = 8 }: { h: string; c: string; r?: number }) {
  return <div className="w-full shrink-0" style={{ height: h, background: c, borderRadius: r }} />
}

/** A phone screen of the given kind, in plain blocks, with the status bar's notch. */
function PhoneScreen({ kind, hue, dark }: { kind: PhoneKind; hue: number; dark: boolean }) {
  const c = phoneColors(hue, dark)

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ background: c.page }}>
      <div className="flex h-[6%] shrink-0 items-center justify-center">
        <div className="h-[40%] w-[30%] rounded-full" style={{ background: c.ink }} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[3%] px-[7%] pt-[3%] pb-[6%]">{phones[kind](c)}</div>
    </div>
  )
}

const phones: Record<PhoneKind, (c: Colors) => ReactNode> = {
  onboarding: (c) => (
    <>
      <div className="mt-[8%] aspect-square w-full rounded-[20px]" style={{ background: c.tint }} />
      <div className="mt-[6%] flex flex-col items-center gap-[10px]">
        <Line w="70%" h={9} c={c.ink} />
        <Line w="50%" h={9} c={c.ink} />
        <Line w="60%" c={c.faint} />
      </div>
      <div className="mt-[4%] flex justify-center gap-1.5">
        <Line w="8%" c={c.accent} />
        <Line w="3%" c={c.ink} />
        <Line w="3%" c={c.ink} />
      </div>
      <div className="mt-auto">
        <Block h="34px" c={c.accent} r={12} />
      </div>
    </>
  ),
  paywall: (c) => (
    <>
      <div className="mt-[6%] flex flex-col items-center gap-[10px]">
        <div className="aspect-square w-[22%] rounded-[14px]" style={{ background: c.accent }} />
        <Line w="66%" h={9} c={c.ink} />
        <Line w="48%" c={c.faint} />
      </div>
      <div className="mt-[6%] flex flex-col gap-[10px]">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="size-2.5 rounded-full" style={{ background: c.accent }} />
            <Line w={`${60 - index * 10}%`} c={c.ink} />
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-[8px]">
        <div className="rounded-[12px] border-2 p-[6%]" style={{ borderColor: c.accent, background: c.tint }}>
          <Line w="40%" h={6} c={c.ink} />
        </div>
        <div className="rounded-[12px] p-[6%]" style={{ background: c.panel }}>
          <Line w="34%" h={6} c={c.ink} />
        </div>
        <Block h="34px" c={c.accent} r={12} />
      </div>
    </>
  ),
  settings: (c) => (
    <>
      <Line w="45%" h={11} c={c.ink} />
      {[4, 3, 2].map((rows, group) => (
        <div key={group} className="mt-[4%] flex flex-col rounded-[12px] px-[5%]" style={{ background: c.panel }}>
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-2 py-[8%]">
              <div className="size-3 rounded-[4px]" style={{ background: index === 0 ? c.accent : c.ink }} />
              <Line w={`${40 + ((index * 17) % 30)}%`} c={c.ink} />
              <div className="ml-auto h-2 w-3 rounded-full" style={{ background: c.faint }} />
            </div>
          ))}
        </div>
      ))}
    </>
  ),
  signup: (c) => (
    <>
      <div className="mt-[10%] flex flex-col gap-[10px]">
        <Line w="60%" h={11} c={c.ink} />
        <Line w="80%" c={c.faint} />
      </div>
      <div className="mt-[8%] flex flex-col gap-[10px]">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-[10px] border p-[5%]" style={{ borderColor: c.ink }}>
            <Line w={`${30 + index * 12}%`} c={c.faint} />
          </div>
        ))}
        <Block h="34px" c={c.accent} r={10} />
      </div>
      <div className="mt-auto flex flex-col gap-[8px]">
        <Block h="30px" c={c.panel} r={10} />
        <Block h="30px" c={c.panel} r={10} />
      </div>
    </>
  ),
  empty: (c) => (
    <>
      <Line w="40%" h={11} c={c.ink} />
      <div className="my-auto flex flex-col items-center gap-[10px]">
        <div className="aspect-square w-[34%] rounded-full" style={{ background: c.tint }} />
        <Line w="60%" h={8} c={c.ink} />
        <Line w="72%" c={c.faint} />
        <div className="mt-2 w-[46%]">
          <Block h="28px" c={c.accent} r={10} />
        </div>
      </div>
    </>
  ),
  checkout: (c) => (
    <>
      <Line w="40%" h={11} c={c.ink} />
      <div className="mt-[4%] flex flex-col gap-[8px]">
        {[0, 1].map((index) => (
          <div key={index} className="flex items-center gap-2 rounded-[10px] p-[4%]" style={{ background: c.panel }}>
            <div className="aspect-square w-[18%] rounded-[6px]" style={{ background: c.tint }} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Line w="70%" c={c.ink} />
              <Line w="40%" c={c.faint} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-[6%] rounded-[12px] p-[6%]" style={{ background: c.tint }}>
        <div className="flex flex-col gap-2">
          <Line w="50%" c={c.ink} />
          <Line w="70%" c={c.ink} />
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-[8px]">
        <div className="flex justify-between">
          <Line w="20%" h={8} c={c.ink} />
          <Line w="24%" h={8} c={c.ink} />
        </div>
        <Block h="36px" c={c.accent} r={12} />
      </div>
    </>
  ),
  home: (c) => (
    <>
      <div className="flex items-center justify-between">
        <Line w="44%" h={11} c={c.ink} />
        <div className="size-5 rounded-full" style={{ background: c.tint }} />
      </div>
      <div className="mt-[4%] rounded-[16px] p-[7%]" style={{ background: c.accent }}>
        <div className="flex flex-col gap-2 opacity-70">
          <Line w="40%" c={c.page} />
          <Line w="64%" h={10} c={c.page} />
        </div>
      </div>
      <div className="mt-[4%] grid grid-cols-2 gap-[8px]">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="aspect-[4/3] rounded-[12px]" style={{ background: c.panel }} />
        ))}
      </div>
      <div className="mt-auto flex justify-around">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="size-3.5 rounded-[5px]" style={{ background: index === 0 ? c.accent : c.ink }} />
        ))}
      </div>
    </>
  )
}
