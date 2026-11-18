import type { BackendChange, DesignKey, FileField, LayerAddress } from "./types.ts"

/** What applying operations touched, gathered as they apply, to say what a change changed. */
export class Recorder {
  readonly files = new Set<string>()
  readonly filesAdded = new Set<string>()
  readonly filesRemoved = new Set<string>()
  readonly designsAdded = new Set<DesignKey>()
  readonly designsRemoved = new Set<DesignKey>()
  readonly renamed: { from: DesignKey; to: DesignKey }[] = []
  readonly designFields = new Map<DesignKey, Set<string>>()
  readonly layersAdded = new Map<string, LayerAddress>()
  readonly layersRemoved = new Map<string, LayerAddress>()
  readonly layersMoved = new Map<string, LayerAddress>()
  readonly layerFields = new Map<string, { address: LayerAddress; fields: Set<string> }>()
  /** Every design whose value changed in any way, by its key before and after a move. */
  readonly designs = new Set<DesignKey>()
  /** Notes and references touched, as `notes:app.par#id`. */
  readonly items = new Set<string>()
  readonly fileFields = new Map<string, { file: string; field: FileField }>()
  notes = false
  references = false
  modes = false
  tokens = false

  layerAdded(address: LayerAddress, path: string): void {
    this.layer(path, address)
    // A layer removed and inserted again with its id, as a change of type is, stays in both.
    this.layersAdded.set(layerKey(address), address)
  }

  layerRemoved(address: LayerAddress, path: string): void {
    this.layer(path, address)
    const key = layerKey(address)

    if (!this.layersAdded.delete(key)) {
      this.layersRemoved.set(key, address)
    }
  }

  layerMoved(address: LayerAddress, path: string): void {
    this.layer(path, address)
    this.layersMoved.set(layerKey(address), address)
  }

  layerField(address: LayerAddress, path: string, field: string): void {
    this.layer(path, address)
    const key = layerKey(address)
    const entry = this.layerFields.get(key) ?? { address, fields: new Set<string>() }
    entry.fields.add(field)
    this.layerFields.set(key, entry)
  }

  designField(key: DesignKey, path: string, field: string): void {
    this.design(key, path)
    const fields = this.designFields.get(key) ?? new Set<string>()
    fields.add(field)
    this.designFields.set(key, fields)
  }

  designAdded(key: DesignKey, path: string): void {
    this.design(key, path)

    if (!this.designsRemoved.delete(key)) {
      this.designsAdded.add(key)
    }
  }

  designRemoved(key: DesignKey, path: string): void {
    this.design(key, path)

    if (!this.designsAdded.delete(key)) {
      this.designsRemoved.add(key)
    }
  }

  designRenamed(from: DesignKey, to: DesignKey, fromPath: string, toPath: string): void {
    this.design(from, fromPath)
    this.design(to, toPath)
    this.renamed.push({ from, to })
  }

  fileAdded(path: string): void {
    this.files.add(path)

    if (!this.filesRemoved.delete(path)) {
      this.filesAdded.add(path)
    }
  }

  fileRemoved(path: string): void {
    this.files.add(path)

    if (!this.filesAdded.delete(path)) {
      this.filesRemoved.add(path)
    }
  }

  fileField(path: string, field: FileField): void {
    this.files.add(path)
    this.fileFields.set(`${path}\u0000${field}`, { file: path, field })
  }

  item(list: "notes" | "references", path: string, id: string): void {
    this.files.add(path)
    this[list] = true
    this.items.add(`${list}:${path}#${id}`)
  }

  modesChanged(main: string): void {
    this.files.add(main)
    this.modes = true
  }

  /** Whether anything at all was touched. */
  touched(): boolean {
    return this.files.size > 0 || this.tokens
  }

  /** What it touched, as a change says it, without the version. */
  change(): Omit<BackendChange, "version"> {
    return {
      files: [...this.files],
      filesAdded: [...this.filesAdded],
      filesRemoved: [...this.filesRemoved],
      designs: {
        added: [...this.designsAdded],
        removed: [...this.designsRemoved],
        renamed: [...this.renamed],
        changed: [...this.designFields].map(([design, fields]) => ({ design, fields: [...fields] }))
      },
      layers: {
        added: [...this.layersAdded.values()],
        removed: [...this.layersRemoved.values()],
        moved: [...this.layersMoved.values()].filter((address) => !this.layersRemoved.has(layerKey(address))),
        changed: [...this.layerFields.values()].map(({ address, fields }) => ({ address, fields: [...fields] }))
      },
      notes: this.notes,
      references: this.references,
      items: { notes: this.itemKeys("notes"), references: this.itemKeys("references") },
      fileFields: [...this.fileFields.values()],
      modes: this.modes,
      tokens: this.tokens
    }
  }

  private itemKeys(list: "notes" | "references"): string[] {
    const prefix = `${list}:`

    return [...this.items].flatMap((item) => (item.startsWith(prefix) ? [item.slice(prefix.length)] : []))
  }

  private layer(path: string, address: LayerAddress): void {
    this.design(address.design, path)
  }

  private design(key: DesignKey, path: string): void {
    this.files.add(path)
    this.designs.add(key)
  }
}

function layerKey(address: LayerAddress): string {
  return `${address.design}\u0000${address.node}`
}
