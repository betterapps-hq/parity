import { z } from "zod"
import { checkModel } from "./check.ts"

// The data lens's model: what a database's catalog says about its tables, read the same way from a live database or
// from migrations replayed into an in-memory one.

const name = z.string().min(1)
const columnList = z.array(name).min(1)

export const ReferentialAction = z.enum(["no action", "restrict", "cascade", "set null", "set default"])

export const Column = z.strictObject({
  name,
  /** The type as the database names it, such as `integer` or `character varying(255)`. */
  type: z.string(),
  nullable: z.boolean(),
  /** The default as SQL, such as `now()` or `'draft'`. */
  default: z.string().optional(),
  comment: z.string().optional()
})

export const Index = z.strictObject({
  name,
  /** Columns in index order. An expression the database can't name as a column is left out. */
  columns: columnList,
  unique: z.boolean()
})

export const ForeignKey = z.strictObject({
  /** The constraint's name. SQLite's are often unnamed. */
  name: name.optional(),
  columns: columnList,
  references: z.strictObject({
    schema: name.optional(),
    table: name,
    /** The referenced columns, one for each of `columns`. */
    columns: columnList
  }),
  onDelete: ReferentialAction.optional(),
  onUpdate: ReferentialAction.optional()
})

export const Table = z
  .strictObject({
    /** The schema or namespace, such as `public`. SQLite has none for the main database. */
    schema: name.optional(),
    name,
    kind: z.enum(["table", "view"]),
    columns: z.array(Column),
    primaryKey: columnList.optional(),
    indexes: z.array(Index),
    foreignKeys: z.array(ForeignKey),
    comment: z.string().optional()
  })
  .superRefine((table, context) => {
    const columns = new Set(table.columns.map((column) => column.name))

    const expectColumns = (names: readonly string[], path: PropertyKey[]) => {
      names.forEach((column, index) => {
        if (!columns.has(column)) {
          context.addIssue({ code: "custom", path: [...path, index], message: `no column named "${column}"` })
        }
      })
    }

    if (table.primaryKey) {
      expectColumns(table.primaryKey, ["primaryKey"])
    }

    table.indexes.forEach((index, at) => expectColumns(index.columns, ["indexes", at, "columns"]))
    table.foreignKeys.forEach((key, at) => {
      expectColumns(key.columns, ["foreignKeys", at, "columns"])

      if (key.references.columns.length !== key.columns.length) {
        context.addIssue({
          code: "custom",
          path: ["foreignKeys", at, "references", "columns"],
          message: `expected ${key.columns.length} columns, one for each of the key's`
        })
      }
    })
  })

export const Enum = z.strictObject({
  schema: name.optional(),
  name,
  values: z.array(z.string())
})

export const Tables = z.strictObject({
  $schema: z.string().optional(),
  version: z.literal(1),
  /** The database family whose catalog was read. */
  dialect: z.enum(["sqlite", "postgres", "mysql", "sqlserver"]),
  tables: z.array(Table),
  /** Named enum types, which Postgres has and SQLite doesn't. */
  enums: z.array(Enum).optional()
})

export type ReferentialAction = z.infer<typeof ReferentialAction>

export type Column = z.infer<typeof Column>

export type Index = z.infer<typeof Index>

export type ForeignKey = z.infer<typeof ForeignKey>

export type Table = z.infer<typeof Table>

export type Enum = z.infer<typeof Enum>

export type Tables = z.infer<typeof Tables>

export function parseTables(value: unknown): Tables {
  return checkModel(Tables, value)
}
