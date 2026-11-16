import type { FrameViewport, GuestComponentSource, ThemeVariable } from "@parity-app/core"
import type { ExportSize, RecoveryCopy } from "@parity-app/editor"
import type { CssDeclaration } from "@parity-app/style-schema"
import type { TokenChange, TokenWrite } from "@parity-app/tokens"
import { describe, expectTypeOf, it } from "vite-plus/test"
import type { ServiceMethods } from "./protocol.ts"
import type { RenderJob, ServiceParams } from "./service-params.ts"

// These checks fail the type check, not the run: an optional field a package adds to one of its types, and the schema
// here doesn't have, would be stripped from every request on its way in (PAR-992).
describe("the project service's params", () => {
  it("have a schema for each method, and none for a method the service doesn't have", () => {
    expectTypeOf<keyof ServiceParams>().toEqualTypeOf<keyof ServiceMethods>()
  })

  it("take a render job's parts as the packages that make them have them", () => {
    expectTypeOf<RenderJob["theme"][number]>().toEqualTypeOf<ThemeVariable>()
    // `branded` compares an intersection, as `GuestComponentSource` is, by its fields.
    expectTypeOf<NonNullable<RenderJob["components"]>[string]>().branded.toEqualTypeOf<GuestComponentSource>()
    expectTypeOf<RenderJob["mode"]["viewport"]>().toEqualTypeOf<FrameViewport>()
    expectTypeOf<NonNullable<RenderJob["previews"]>[number]>().toEqualTypeOf<TokenChange>()
  })

  it("take what other methods are sent as the packages that make it have it", () => {
    expectTypeOf<ServiceParams["tokens.save"]["changes"][number]>().toEqualTypeOf<TokenWrite>()
    expectTypeOf<ServiceParams["styles.classes"]["declarations"][number]>().toEqualTypeOf<CssDeclaration>()
    expectTypeOf<ServiceParams["layers.export"]["files"][number]["size"]>().toEqualTypeOf<ExportSize>()
    expectTypeOf<ServiceParams["designs.export"]["sizes"][number]>().toEqualTypeOf<ExportSize>()
    expectTypeOf<NonNullable<ServiceParams["recovery.keep"]["copy"]>>().toEqualTypeOf<RecoveryCopy>()
  })
})
