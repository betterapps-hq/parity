import { Button, Kbd } from "@buildkitgg/shadcn-baseui-kit"
import { FileJson, RotateCcw } from "lucide-react"
import { type KeyboardEvent, useId, useState } from "react"
import { groups, keymap } from "../keymap.ts"
import { formatKeys, keysFromEvent } from "../keys.ts"
import { type Found, Group, Highlight, Row, RowAction } from "./rows.tsx"
import type { Store } from "./store.ts"

type Command = keyof typeof keymap

export function isCommand(command: string): command is Command {
  return command in keymap
}

/**
 * Every shortcut, to change here, in the keymap's groups: pick one and press the new keys. Entries keybindings.json has
 * that Parity skipped come first, with the file to fix them in. Once any has changed, they can all go back at once.
 */
export function ShortcutsPage({ store }: { store: Store }) {
  return (
    <>
      <ResetAll store={store} />
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
      {/* Extensions' keys come from their manifests, so they show here without being changed here. */}
      {store.extensionShortcuts?.map(({ extension, shortcuts }) => (
        <Group key={extension} title={extension}>
          {shortcuts.map((shortcut) => (
            <Row key={`${shortcut.command} ${shortcut.keys}`} label={shortcut.title} problem={shortcut.clash}>
              <Kbd>{formatKeys(shortcut.keys)}</Kbd>
            </Row>
          ))}
        </Group>
      ))}
    </>
  )
}

/** Resets every shortcut, once one has changed, after asking (PAR-1042). */
function ResetAll({ store }: { store: Store }) {
  const [asking, setAsking] = useState(false)
  const count = store.changedKeys.length

  if (count === 0 && !store.failed.keys) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {store.failed.keys && (
        <p role="alert" className="type-message text-destructive">
          {store.failed.keys}
        </p>
      )}
      {asking ? (
        <>
          <span className="text-sm">{count === 1 ? "Reset 1 shortcut?" : `Reset ${count} shortcuts?`}</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setAsking(false)
              void store.resetAll()
            }}
          >
            Reset
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </>
      ) : (
        count > 0 && (
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => setAsking(true)}>
            <RotateCcw aria-hidden /> Reset all shortcuts
          </Button>
        )
      )}
    </div>
  )
}

/**
 * A command's row, with its keys as a button: press it, then the new keys. Escape stops without changing them;
 * Backspace removes them. Keys another command has ask first: swap them, so that command gets this one's keys, or
 * cancel (PAR-1042). A changed command can go back to the keymap's keys.
 */
export function ShortcutRow({ command, store, found }: { command: string; store: Store; found?: Found }) {
  const id = useId()
  const [listening, setListening] = useState(false)
  const [clash, setClash] = useState<{ keys: string; holder: Command }>()

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

    setListening(false)

    const holder = next ? store.holderOf(command, next) : undefined

    if (holder && isCommand(holder)) {
      setClash({ keys: next, holder })

      return
    }

    void store.bind(command, next)
  }

  const defaultKeys = formatKeys(binding.keys[0] ?? "", false)
  const changed = store.changedKeys.includes(command)

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
      detail={
        clash ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground">
            {`${keymap[clash.holder].label} uses ${formatKeys(clash.keys, false)}.`}
            <Button
              variant="outline"
              size="xs"
              aria-label={`Swap with ${keymap[clash.holder].label}`}
              onClick={() => {
                setClash(undefined)
                void store.swap(command, clash.keys)
              }}
            >
              Swap
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setClash(undefined)}>
              Cancel
            </Button>
          </span>
        ) : (
          lostTo && `Its keys went to ${lostTo}.`
        )
      }
      problem={store.failed[`key:${command}`]}
      marked={store.marked === `key:${command}`}
      action={
        changed && (
          <RowAction
            hint="Reset to default"
            label={`Reset ${binding.label} to ${defaultKeys}`}
            icon={<RotateCcw />}
            onClick={() => void store.reset(command)}
          />
        )
      }
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
