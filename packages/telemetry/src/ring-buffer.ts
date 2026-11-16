/** How many events each process keeps for breadcrumbs and Report a problem. */
export const recentEvents = 500

/** The last `capacity` items pushed, oldest dropped first. */
export class RingBuffer<T> {
  readonly capacity: number
  readonly #items: T[] = []
  #next = 0

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`A ring buffer holds at least 1 item, not ${capacity}`)
    }

    this.capacity = capacity
  }

  push(item: T): void {
    if (this.#items.length < this.capacity) {
      this.#items.push(item)
    } else {
      this.#items[this.#next] = item
    }

    this.#next = (this.#next + 1) % this.capacity
  }

  /** What it holds, oldest first. */
  toArray(): T[] {
    if (this.#items.length < this.capacity) {
      return [...this.#items]
    }

    return [...this.#items.slice(this.#next), ...this.#items.slice(0, this.#next)]
  }

  get size(): number {
    return this.#items.length
  }
}
