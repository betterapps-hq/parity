import { describe, expect, it } from "vite-plus/test"
import { findComponents } from "./index.ts"

const names = (source: string, file = "src/components/card.tsx") =>
  findComponents(source, file).map((found) => (found.as ? `${found.name}:${found.as}` : `${found.name}?`))

describe("findComponents", () => {
  it("finds exported functions that render JSX, under capitalised names", () => {
    const source = `
      function Card() { return <div /> }
      function CardHeader(props) { return <header {...props} /> }
      const buttonVariants = cva()
      export function Standalone() { return <>x</> }
      export const Arrow = () => <svg />
      function helper() { return <span /> }
      export {
        Card,
        CardHeader as Header,
        buttonVariants,
        helper,
      }
      export { Other } from "./other"
    `
    expect(names(source).sort()).toEqual(["Arrow:function", "Card:function", "Header:function", "Standalone:function"])
  })

  it("recognises forwardRef, memo, lazy and class components", () => {
    const source = `
      import * as React from "react"
      export const Input = React.forwardRef((props, ref) => <input ref={ref} {...props} />)
      export const Row = memo(function Row() { return <tr /> })
      export const Page = lazy(() => import("./page"))
      export class Legacy extends React.Component { render() { return <div /> } }
      export class Store extends Base {}
    `
    expect(names(source)).toEqual(["Input:forwardRef", "Row:memo", "Page:lazy", "Legacy:class", "Store?"])
  })

  it("leaves out route objects, API handlers and helpers React wouldn't call", () => {
    const source = `
      export const Route = createFileRoute("/orders")({ component: Orders })
      export async function GET(request: Request) { return Response.json({}) }
      export const Label = "Orders"
      export const Columns = [{ cell: () => <span /> }]
      export function Cell(row, column) { return <td>{row[column]}</td> }
      export function Title(text: string) { return <h1>{text}</h1> }
      function Orders() { return <main /> }
    `
    expect(names(source, "src/routes/orders.tsx")).toEqual(["Route?", "GET?"])
  })

  it("names a default export after its declaration, else its file or folder", () => {
    expect(names("export default function OrdersPage() { return <main /> }", "app/orders/page.tsx")).toEqual([
      "OrdersPage:function"
    ])
    expect(names("export default function () { return <main /> }", "app/orders/order-list.tsx")).toEqual([
      "OrderList:function"
    ])
    expect(names("export default memo(() => <main />)", "src/components/badge/index.tsx")).toEqual(["Badge:memo"])
    expect(names("const Badge = () => <span />\nexport default Badge", "src/badge.tsx")).toEqual(["Badge:function"])
  })

  it("leaves aliases and functions without JSX to the type checker", () => {
    const source = `
      import { Select as SelectPrimitive } from "@base-ui/react/select"
      export const Select = SelectPrimitive.Root
      export function ForAdmins({ children }) { return children }
      export { SelectPrimitive as Primitive }
    `
    expect(names(source)).toEqual(["Select?", "ForAdmins?", "Primitive?"])
  })

  it("lists a declaration file's capitalised exports by name", () => {
    const source = "export const Button: ButtonComponent\nexport { Card, cardVariants }"
    expect(findComponents(source, "dist/index.d.ts")).toEqual([
      { name: "Button", export: "Button" },
      { name: "Card", export: "Card" }
    ])
  })
})
