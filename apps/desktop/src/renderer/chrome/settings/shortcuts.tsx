import { Button, Kbd } from "@buildkitgg/shadcn-baseui-kit"
import { FileJson } from "lucide-react"
import { type KeyboardEvent, useId, useState } from "react"
import { groups, keymap } from "../keymap.ts"
import { formatKeys, keysFromEvent } from "../keys.ts"
import { type Found, Group, Highlight, Row } from "./rows.tsx"
import type { Store } from "./store.ts"

type Command = keyof typeof keymap

export function isCommand(command: string): command is Command {
  return command in keymap
}

/**
 * Every shortcut, to change here, in the keymap's groups: pick one and press the new keys. Entries keybindings.json has
 * that Parity skipped come first, with the file to fix them in.
 */
export function ShortcutsPage({ store }: { store: Store }) {
  return (
    <>
      {store.skipped.length > 0 && (
        <Group title="Skipped in keybindings.json">
          {store.skipped.map((entry) => (
            <Row
              key={`${entry.command} ${entry.keys}`}
              label={<code className="font-mono text-xs font-normal">{entry.command}</code>}
              detail={isCommand(entry.command) ? "Parity can't read these keys." : "There's no command by this name."}
            >
              <Kbd>{entry.keys}</Kbd>
            </Row>
          ))}
          {store.openKeybindings && (
            <div className="px-2 py-1.5">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={store.openKeybindings}>
                <FileJson aria-hidden /> Open keybindings.json
              </Button>
            </div>
          )}
        </Group>
      )}
      {groups.map((group) => (
        <Group key={group} title={group}>
          {Object.keys(keymap).flatMap((command) =>
            isCommand(command) && keymap[command].group === group
              ? [<ShortcutRow key={command} command={command} store={store} />]
              : []
          )}
        </Group>
      ))}
    </>
  )
}

/**
 * A command's row, with its keys as a button: press it, then the new keys. Escape stops without changing them;
 * Backspace removes them. Keys another command had move to this one, and that command's row says where they went.
 */
export function ShortcutRow({ command, store, found }: { command: string; store: Store; found?: Found }) {
  const id = useId()
  const [listening, setListening] = useState(false)

  if (!isCommand(command)) {
    return null
  }

  const binding = keymap[command]
  const keys = store.keysOf(command)
  const lostTo = store.lost[command]

  const record = (event: KeyboardEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      setListening(false)

      return
    }

    const next = event.key === "Backspace" ? "" : keysFromEvent(event.nativeEvent)

    if (next === undefined) {
      return
    }

    void store.bind(command, next)
    setListening(false)
  }

  return (
    <Row
      id={`key:${command}`}
      controlId={found ? undefined : id}
      label={
        found ? (
          <button
            type="button"
            data-result
            onClick={() => store.go("shortcuts", `key:${command}`)}
            className="-mx-1 rounded-sm px-1 text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <Highlight text={binding.label} query={found.query} />
          </button>
        ) : (
          binding.label
        )
      }
      detail={lostTo && `Its keys went to ${lostTo}.`}
      problem={store.failed[`key:${command}`]}
      marked={store.marked === `key:${command}`}
    >
      <Button
        id={id}
        variant="outline"
        size="sm"
        aria-label={`Change ${binding.label}, now ${keys ? formatKeys(keys, false) : "none"}`}
        aria-pressed={listening}
        onClick={() => setListening(!listening)}
        onKeyDown={(event) => {
          if (listening) {
            record(event)
          }
        }}
        onBlur={() => setListening(false)}
        className={`min-w-28 justify-center ${listening ? "ring-2 ring-ring" : ""}`}
      >
        {listening && <span className="font-normal text-muted-foreground">Press keys</span>}
        {!listening && keys && <Kbd>{formatKeys(keys, false)}</Kbd>}
        {!listening && !keys && <span className="font-normal text-muted-foreground">None</span>}
      </Button>
    </Row>
  )
}
