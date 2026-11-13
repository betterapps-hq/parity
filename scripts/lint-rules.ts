/**
 * Parity's own lint rules, which `vite.config.ts` loads as the `parity` JS plugin. Oxlint runs them through ESLint's
 * rule interface, so each takes the context and returns what it visits.
 */

interface Node {
  type: string
}

interface Identifier extends Node {
  type: "Identifier"
  name: string
}

interface CallExpression extends Node {
  callee: Node
  arguments: Node[]
}

interface TemplateLiteral extends Node {
  type: "TemplateLiteral"
  expressions: Node[]
}

interface Literal extends Node {
  type: "Literal"
  /** The literal as written, quotes and all. */
  raw: string
}

interface RuleContext {
  report(problem: { node: Node; messageId: string }): void
}

function isIdentifier(node: Node): node is Identifier {
  return node.type === "Identifier"
}

function isTemplate(node: Node): node is TemplateLiteral {
  return node.type === "TemplateLiteral"
}

function isLiteral(node: Node): node is Literal {
  return node.type === "Literal"
}

/** Keys written out, as `"Ctrl T"` or a template with nothing in it, rather than read from somewhere. */
function isWrittenOut(node: Node): boolean {
  return (isLiteral(node) && /^["']/.test(node.raw)) || (isTemplate(node) && node.expressions.length === 0)
}

/**
 * Keys shown in the app come from the keymap through `shortcutOf` (PAR-1041), so a changed binding shows everywhere at
 * once. Keys written out for `formatKeys` drift from the keys that work.
 */
const shortcutFromKeymap = {
  meta: {
    type: "problem",
    docs: { description: "Show keys through shortcutOf, not keys written out for formatKeys." },
    messages: {
      writtenOut:
        "Show a command's keys with shortcutOf(command) from chrome/keymap.ts, so they follow the keymap. Add keys a control answers to on its own to fixedKeys there."
    },
    schema: []
  },
  create(context: RuleContext) {
    return {
      CallExpression(node: CallExpression) {
        const [keys] = node.arguments

        if (isIdentifier(node.callee) && node.callee.name === "formatKeys" && keys && isWrittenOut(keys)) {
          context.report({ node, messageId: "writtenOut" })
        }
      }
    }
  }
}

export default {
  meta: { name: "parity" },
  rules: { "shortcut-from-keymap": shortcutFromKeymap }
}
