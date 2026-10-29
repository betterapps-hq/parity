/** What a viewport is, for its icon: a phone, a tablet, a laptop or a desktop screen. */
export type DeviceKind = "phone" | "tablet" | "laptop" | "desktop"

export const deviceKinds: readonly DeviceKind[] = ["phone", "tablet", "laptop", "desktop"]

export interface DevicePreset {
  id: string
  name: string
  /** CSS pixels, in portrait for phones and tablets. */
  width: number
  height: number
  device: DeviceKind
}

/**
 * Common screen sizes, in CSS pixels: the devices Chrome DevTools offers for emulation, plus current flagships and the
 * usual laptop and desktop resolutions.
 */
export const devicePresets: readonly DevicePreset[] = [
  { id: "iphone-se", name: "iPhone SE", width: 375, height: 667, device: "phone" },
  { id: "iphone-12-pro", name: "iPhone 12 Pro", width: 390, height: 844, device: "phone" },
  { id: "iphone-16", name: "iPhone 16", width: 393, height: 852, device: "phone" },
  { id: "iphone-xr", name: "iPhone XR", width: 414, height: 896, device: "phone" },
  { id: "iphone-14-pro-max", name: "iPhone 14 Pro Max", width: 430, height: 932, device: "phone" },
  { id: "iphone-16-pro-max", name: "iPhone 16 Pro Max", width: 440, height: 956, device: "phone" },
  { id: "pixel-7", name: "Pixel 7", width: 412, height: 915, device: "phone" },
  { id: "galaxy-s8-plus", name: "Samsung Galaxy S8+", width: 360, height: 740, device: "phone" },
  { id: "galaxy-s20-ultra", name: "Samsung Galaxy S20 Ultra", width: 412, height: 915, device: "phone" },
  { id: "galaxy-a51", name: "Samsung Galaxy A51/71", width: 412, height: 914, device: "phone" },
  { id: "galaxy-z-fold-5", name: "Galaxy Z Fold 5", width: 344, height: 882, device: "phone" },
  { id: "surface-duo", name: "Surface Duo", width: 540, height: 720, device: "phone" },
  { id: "ipad-mini", name: "iPad Mini", width: 768, height: 1024, device: "tablet" },
  { id: "ipad-air", name: "iPad Air", width: 820, height: 1180, device: "tablet" },
  { id: "asus-zenbook-fold", name: "Asus Zenbook Fold", width: 853, height: 1280, device: "tablet" },
  { id: "surface-pro-7", name: "Surface Pro 7", width: 912, height: 1368, device: "tablet" },
  { id: "ipad-pro", name: "iPad Pro", width: 1024, height: 1366, device: "tablet" },
  { id: "laptop", name: "Laptop", width: 1280, height: 800, device: "laptop" },
  { id: "laptop-large", name: "Laptop L", width: 1440, height: 900, device: "laptop" },
  { id: "macbook-air", name: "MacBook Air", width: 1470, height: 956, device: "laptop" },
  { id: "desktop", name: "Desktop", width: 1920, height: 1080, device: "desktop" },
  { id: "desktop-2k", name: "Desktop 2K", width: 2560, height: 1440, device: "desktop" }
]

/** A width's likely device, for viewports that don't say. */
export function deviceForWidth(width: number): DeviceKind {
  if (width < 600) return "phone"
  if (width < 1024) return "tablet"
  if (width < 1600) return "laptop"
  return "desktop"
}

/** A screen height for a width, for viewports that don't say: the device whose width is nearest, the earlier on a tie. */
export function screenHeightForWidth(width: number): number {
  let nearest = devicePresets[0]!
  for (const preset of devicePresets) {
    if (Math.abs(preset.width - width) < Math.abs(nearest.width - width)) nearest = preset
  }
  return nearest.height
}

/**
 * A CSS length in pixels, for breakpoints written in rem or em (16px each, the browser default) or px. Undefined for
 * anything else.
 */
export function lengthToPixels(value: string): number | undefined {
  const match = /^\s*(-?[\d.]+)(px|rem|em)?\s*$/.exec(value)
  if (!match) return undefined
  const number = Number(match[1])
  if (!Number.isFinite(number)) return undefined
  return match[2] === "rem" || match[2] === "em" ? number * 16 : number
}
