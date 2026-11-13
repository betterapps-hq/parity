import ts from "typescript"
import { argsOf, type ArgValue, objectOf, type StoryArgs, unwrap, valueOf } from "./csf.ts"

/** A change to a file's text: what's between `start` and `end` becomes `text`. */
interface TextEdit {
  start: number
  end: number
  text: string
}

/**
 * A CSF file with one story's args set to `args`, as far as its own code can hold them: the story keeps only the args
 * that differ from its meta's, and code in its args, such as a function, stays as it's written. A story that's a
 * function, or whose args are a constant another story might share, is left as it is, as is an arg the meta gives
 * that `args` leaves out, which the story can't take away.
 */
export function writeStoryArgs(source: string, exportName: string, args: StoryArgs, path = "story.tsx"): string {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const constants = new Map<string, ts.Expression>()
  let meta: ts.Expression | undefined
  let story: ts.Expression | undefined

  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          constants.set(declaration.name.text, declaration.initializer)

          if (declaration.name.text === exportName) {
            story = declaration.initializer
          }
        }
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      meta = statement.expression
    }
  }

  const storyObject = story && unwrap(story)

  if (!storyObject || !ts.isObjectLiteralExpression(storyObject)) {
    return source
  }

  const metaArgs = argsOf(propertyOf(objectOf(meta, constants), "args")?.initializer, constants)
  const own = new Map(Object.entries(args).filter(([name, value]) => !sameValue(metaArgs[name], value)))
  const edits = argsEdits(storyObject, own)

  return edits
    .toSorted((a, b) => b.start - a.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source)
}

/** The edits that give a story object `own` as its args. */
function argsEdits(story: ts.ObjectLiteralExpression, own: ReadonlyMap<string, ArgValue>): TextEdit[] {
  const existing = propertyOf(story, "args")

  if (!existing) {
    if (own.size === 0) {
      return []
    }

    const written = `args: ${objectText(own)}`
    const first = story.properties[0]

    return first
      ? [{ start: first.getStart(), end: first.getStart(), text: `${written}, ` }]
      : [{ start: story.getStart(), end: story.end, text: `{ ${written} }` }]
  }

  const argsObject = unwrap(existing.initializer)

  // Args a constant gives may be another story's too, so they're not the story's own to change.
  if (!ts.isObjectLiteralExpression(argsObject)) {
    return []
  }

  const kept = new Map(own)

  const parts = argsObject.properties.flatMap((element) => {
    const name =
      element.name && (ts.isIdentifier(element.name) || ts.isStringLiteral(element.name)) && element.name.text
    const value = ts.isPropertyAssignment(element) ? valueOf(element.initializer) : undefined

    // Code, and what isn't an arg's JSON value, stays as it's written.
    if (!name || value === undefined) {
      return [element.getText()]
    }

    const wanted = kept.get(name)

    kept.delete(name)

    if (wanted === undefined) {
      return []
    }

    return [sameValue(value, wanted) ? element.getText() : `${keyText(name)}: ${valueText(wanted)}`]
  })

  parts.push(...[...kept].map(([name, value]) => `${keyText(name)}: ${valueText(value)}`))

  return [
    { start: argsObject.getStart(), end: argsObject.end, text: parts.length > 0 ? `{ ${parts.join(", ")} }` : "{}" }
  ]
}

/** An object's property assignment by name. */
function propertyOf(object: ts.ObjectLiteralExpression | undefined, name: string): ts.PropertyAssignment | undefined {
  return object?.properties.find(
    (element): element is ts.PropertyAssignment =>
      ts.isPropertyAssignment(element) &&
      (ts.isIdentifier(element.name) || ts.isStringLiteral(element.name)) &&
      element.name.text === name
  )
}

function sameValue(a: ArgValue | undefined, b: ArgValue | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function objectText(values: ReadonlyMap<string, ArgValue>): string {
  return values.size === 0
    ? "{}"
    : `{ ${[...values].map(([name, value]) => `${keyText(name)}: ${valueText(value)}`).join(", ")} }`
}

function keyText(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name)
}

/** A JSON value as a story file writes it: objects with bare keys, the rest as JSON. */
function valueText(value: ArgValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(valueText).join(", ")}]`
  }

  const json = JSON.stringify(value)

  // An object is written with bare keys; a string, number, boolean or null as its JSON.
  return json.startsWith("{") ? objectText(new Map(Object.entries(value ?? {}))) : json
}
