import { posix, win32 } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { insideProject } from "./inside-project.ts"

describe("insideProject", () => {
  const shop = "C:\\work\\shop"
  const images = "C:\\work\\shop\\public\\images"

  it.each([
    { name: "a file in the root", root: shop, path: "shop.par", inside: "C:\\work\\shop\\shop.par" },
    { name: "a file in a folder", root: shop, path: "src/app.css", inside: "C:\\work\\shop\\src\\app.css" },
    { name: "an absolute path inside", root: shop, path: "C:\\work\\shop\\a.par", inside: "C:\\work\\shop\\a.par" },
    {
      name: "the root in another case",
      root: "C:\\Work\\Shop",
      path: "c:\\work\\shop\\a.par",
      inside: "c:\\work\\shop\\a.par"
    },
    {
      name: "a name that starts with two dots",
      root: shop,
      path: "..notes.par",
      inside: "C:\\work\\shop\\..notes.par"
    },
    { name: "a `..` that comes back in", root: shop, path: "src/../a.par", inside: "C:\\work\\shop\\a.par" },
    { name: "a sibling folder sharing the prefix", root: shop, path: "C:\\work\\shop-old\\a.par" },
    { name: "the same, by `..`", root: shop, path: "../shop-old/a.par" },
    { name: "the parent", root: shop, path: ".." },
    { name: "a file in the parent", root: shop, path: "..\\a.par" },
    { name: "the root itself", root: shop, path: "." },
    { name: "another drive", root: shop, path: "D:\\work\\shop\\a.par" },
    { name: "a share", root: shop, path: "\\\\server\\work\\shop\\a.par" },
    { name: "a subfolder root, a file in it", root: images, path: `${images}\\a.png`, inside: `${images}\\a.png` },
    { name: "a subfolder root, a file beside it", root: images, path: "C:\\work\\shop\\public\\a.png" }
  ])("on Windows, $name", ({ root, path, inside }) => {
    expect(insideProject(root, path, win32)).toBe(inside)
  })

  it.each([
    { name: "a file in a folder", path: "src/app.css", inside: "/work/shop/src/app.css" },
    { name: "a sibling folder sharing the prefix", path: "/work/shop-old/a.par" },
    { name: "a file in the parent", path: "../a.par" },
    { name: "the root in another case, which is another folder", path: "/Work/Shop/a.par" },
    { name: "the root itself", path: "/work/shop" }
  ])("on macOS and Linux, $name", ({ path, inside }) => {
    expect(insideProject("/work/shop", path, posix)).toBe(inside)
  })
})
