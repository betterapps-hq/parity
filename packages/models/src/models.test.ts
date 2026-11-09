import { describe, expect, it } from "vite-plus/test"
import { parseLinks, parseOperations, parseRoutes, parseScenarios, parseTables } from "./index.ts"

const users = {
  schema: "public",
  name: "users",
  kind: "table",
  columns: [
    { name: "id", type: "uuid", nullable: false, default: "gen_random_uuid()" },
    { name: "email", type: "text", nullable: false },
    { name: "team_id", type: "uuid", nullable: true, comment: "Unset until they join one" }
  ],
  primaryKey: ["id"],
  indexes: [{ name: "users_email_key", columns: ["email"], unique: true }],
  foreignKeys: [
    {
      name: "users_team_id_fkey",
      columns: ["team_id"],
      references: { schema: "public", table: "teams", columns: ["id"] },
      onDelete: "set null"
    }
  ]
}

describe("tables", () => {
  it("reads a catalog's tables and enums", () => {
    const model = { version: 1, dialect: "postgres", tables: [users], enums: [{ name: "role", values: ["admin"] }] }
    expect(parseTables(model)).toEqual(model)
  })

  it("points at a key, index or foreign key naming a column the table doesn't have", () => {
    const table = { ...users, indexes: [{ name: "by_name", columns: ["name"], unique: false }] }
    expect(() => parseTables({ version: 1, dialect: "sqlite", tables: [table] })).toThrow(
      new TypeError('/tables/0/indexes/0/columns/0: no column named "name"')
    )
  })

  it("expects a foreign key to reference one column for each of its own", () => {
    const key = { columns: ["team_id"], references: { table: "teams", columns: ["id", "org_id"] } }
    const table = { ...users, foreignKeys: [key] }
    expect(() => parseTables({ version: 1, dialect: "sqlite", tables: [table] })).toThrow(
      "/tables/0/foreignKeys/0/references/columns: expected 1 columns, one for each of the key's"
    )
  })

  it("rejects a field the model doesn't define", () => {
    const table = { ...users, columns: [{ name: "id", type: "uuid", nullable: false, unique: true }] }
    expect(() => parseTables({ version: 1, dialect: "postgres", tables: [table] })).toThrow(
      new TypeError("/tables/0/columns/0/unique: unknown property")
    )
  })

  it("rejects a version it doesn't know", () => {
    expect(() => parseTables({ version: 2, dialect: "postgres", tables: [] })).toThrow(/^\/version: /)
  })
})

describe("operations", () => {
  const getUser = {
    id: "getUser",
    http: { method: "get", path: "/users/{id}" },
    input: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    output: { $ref: "#/components/schemas/User" },
    errors: [{ status: 404, description: "No such user" }]
  }

  it("reads HTTP operations and server functions", () => {
    const createUser = { id: "createUser", input: true, extensions: { "x-parity-server-function": "createUser" } }
    const model = { version: 1, operations: [getUser, createUser] }
    expect(parseOperations(model)).toEqual(model)
  })

  it("points at an id used twice", () => {
    expect(() => parseOperations({ version: 1, operations: [getUser, getUser] })).toThrow(
      new TypeError('/operations/1/id: "getUser" is used twice')
    )
  })

  it("expects extension fields to start with x-", () => {
    const operation = { id: "listUsers", extensions: { server: true } }
    expect(() => parseOperations({ version: 1, operations: [operation] })).toThrow(
      "/operations/0/extensions/server: expected a name starting with x-"
    )
  })
})

describe("routes", () => {
  it("reads a tree of routes", () => {
    const model = {
      version: 1,
      routes: [
        {
          id: "root",
          path: "/",
          file: "src/routes/__root.tsx",
          layout: true,
          children: [{ id: "user", path: "/users/:id", file: "src/routes/users.$id.tsx" }]
        }
      ]
    }

    expect(parseRoutes(model)).toEqual(model)
  })

  it("points at an id used twice anywhere in the tree", () => {
    const model = { version: 1, routes: [{ id: "home", path: "/", children: [{ id: "home", path: "/home" }] }] }
    expect(() => parseRoutes(model)).toThrow(new TypeError('/routes/0/children/0/id: "home" is used twice'))
  })

  it("checks routes however deep they sit", () => {
    const model = { version: 1, routes: [{ id: "a", path: "/", children: [{ id: "b", path: "users" }] }] }
    expect(() => parseRoutes(model)).toThrow(/^\/routes\/0\/children\/0\/path: /)
  })
})

describe("scenarios", () => {
  it("reads each operation's response in a scenario", () => {
    const model = {
      version: 1,
      scenarios: [
        { id: "empty", name: "Empty", state: "state-1", responses: { listUsers: { body: [] } } },
        { id: "error", name: "Server error", responses: { listUsers: { status: 500, body: { message: "Down" } } } }
      ]
    }

    expect(parseScenarios(model)).toEqual(model)
  })

  it("rejects a status that isn't HTTP's", () => {
    const scenario = { id: "x", name: "X", responses: { listUsers: { status: 42, body: null } } }
    expect(() => parseScenarios({ version: 1, scenarios: [scenario] })).toThrow(
      /^\/scenarios\/0\/responses\/listUsers\/status: /
    )
  })
})

describe("links", () => {
  it("reads links between the other models", () => {
    const model = {
      version: 1,
      links: [
        { from: { kind: "screen", id: "design-1" }, to: { kind: "route", id: "user" }, source: "drawn" },
        { from: { kind: "operation", id: "getUser" }, to: { kind: "table", id: "public.users" }, source: "trace" }
      ]
    }

    expect(parseLinks(model)).toEqual(model)
  })

  it("rejects a kind of object it doesn't know", () => {
    const link = { from: { kind: "screen", id: "a" }, to: { kind: "queue", id: "b" }, source: "drawn" }
    expect(() => parseLinks({ version: 1, links: [link] })).toThrow(/^\/links\/0\/to\/kind: /)
  })
})
