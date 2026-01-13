/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#MatterError.js";
import { Abort } from "./Abort.js";
import { Observable } from "./Observable.js";

/**
 * A heap, useful as a priority queue.
 *
 * Features:
 *
 * * Configurable as min-heap or max-heap using comparator
 *
 * * O(1) lookup of first item
 *
 * * O(log(n)) enqueue and dequeue
 *
 * * O(1) deletion of arbitrary position, but will add expense of maintaining index of positions
 *
 * * {@link added}, {@link deleted} and {@link firstChanged} events
 */
export class Heap<T> {
    // We encode the heap as an array for efficiency.  See #leftChildOf and #rightChildOf for how to navigate the tree
    // when encoded this way
    readonly #buffer = Array<T>();

    readonly #compare: (a: T, b: T) => number;
    readonly #normalize?: (a: T) => T;
    #firstChanged?: Observable<[T | undefined]>;
    #deleted?: Observable<[T]>;
    #added?: Observable<[T]>;
    #positions?: Map<T, number>;

    /**
     * Create new heap.
     *
     * @param comparator performs ordering of items in the heap
     * @param normalizer optionally converts items to normal form on insert
     */
    constructor(comparator: (a: T, b: T) => number, normalizer?: (entry: T) => T) {
        this.#compare = comparator;
        this.#normalize = normalizer;
    }

    /**
     * Return lowest-ranked item.
     */
    shift() {
        if (!this.#buffer?.length) {
            return undefined;
        }
        const result = this.first;

        this.#deleteAt(0);

        return result;
    }

    /**
     * The lowest-ranked item.
     */
    get first(): T | undefined {
        return this.#buffer?.[0];
    }

    /**
     * The queue length.
     */
    get size() {
        return this.#buffer.length;
    }

    /**
     * Is the heap empty?
     */
    get isEmpty() {
        return !!this.#buffer.length;
    }

    /**
     * Emits when the head of the queue changes.
     */
    get firstChanged() {
        if (!this.#firstChanged) {
            this.#firstChanged = new Observable();
        }
        return this.#firstChanged;
    }

    /**
     * Emits when an item is added to the heap.
     */
    get added() {
        if (!this.#added) {
            this.#added = new Observable();
        }
        return this.#added;
    }

    /**
     * Emits when an item is deleted.
     */
    get deleted() {
        if (!this.#deleted) {
            this.#deleted = new Observable();
        }
        return this.#deleted;
    }

    /**
     * Add an item.
     */
    add(...items: T[]) {
        for (let item of items) {
            if (this.#normalize) {
                item = this.#normalize(item);
            }

            this.#buffer.push(item);
            this.#bubbleUp(this.#buffer.length - 1);

            this.#added?.emit(item);
        }
    }

    /**
     * Delete an item.
     *
     * The first delete is O(n); subsequent deletes are O(1) but insertions and deletions will have additional cost
     * associated.
     */
    delete(item: T) {
        if (this.#buffer === undefined) {
            return false;
        }

        if (!this.#positions) {
            this.#positions = new Map();
            for (let i = 0; i < this.#buffer.length; i++) {
                this.#positions.set(this.#buffer[i], i);
            }
        }

        if (this.#normalize) {
            item = this.#normalize(item);
        }

        const pos = this.#positions.get(item);
        if (pos === undefined) {
            return false;
        }

        this.#deleteAt(pos);
        return true;
    }

    /**
     * Remove all entries.
     */
    clear() {
        if (this.#buffer.length) this.#buffer.length = 0;
    }

    /**
     * Stream the first value from the heap until aborted.
     */
    async *stream(abort?: Abort.Signal) {
        if (Abort.is(abort)) {
            return;
        }

        while (true) {
            // Yield values currently available
            while (this.size) {
                yield this.shift()!;

                if (Abort.is(abort)) {
                    return;
                }
            }

            // Create promise to resolve when a new value is ready
            let resolve!: () => void;
            const ready = new Promise<void>(r => (resolve = r));

            // Wait for new value
            try {
                this.added.once(resolve);

                await Abort.race(abort, ready);

                if (Abort.is(abort)) {
                    return;
                }
            } finally {
                this.added.off(resolve);
            }
        }
    }

    /**
     * Perform internal validation of queue order.
     */
    validate() {
        for (let i = 0; i < this.#buffer.length; i++) {
            const leftChild = this.#leftChildOf(i);
            if (leftChild < this.#buffer.length) {
                if (this.#compare(this.#buffer[i], this.#buffer[leftChild]) > 0) {
                    throw new InternalError(
                        `Heap error: buffer #${i} (${this.#buffer[i]}) is greater than left child #${leftChild} (${this.#buffer[leftChild]})`,
                    );
                }

                const rightChild = this.#rightChildOf(i);
                if (rightChild < this.#buffer.length) {
                    if (this.#compare(this.#buffer[i], this.#buffer[rightChild]) > 0) {
                        throw new InternalError(
                            `Heap error: buffer #${i} (${this.#buffer[i]}) is greater than right child #${rightChild} (${this.#buffer[rightChild]})`,
                        );
                    }

                    if (this.#compare(this.#buffer[leftChild], this.#buffer[rightChild]) > 0) {
                        throw new InternalError(
                            `Heap error: buffer #${leftChild} (${this.#buffer[leftChild]}) is greater than right sibling #${rightChild} (${this.#buffer[rightChild]})`,
                        );
                    }
                }
            }
        }
    }

    #deleteAt(index: number) {
        if (index >= this.#buffer.length) {
            return;
        }

        const item = this.#buffer[index];
        if (this.#buffer.length === 1) {
            this.#buffer.length = 0;
        } else {
            const lastIndex = this.#buffer.length - 1;
            this.#buffer[index] = this.#buffer[lastIndex];
            this.#positions?.set(this.#buffer[index], index);
            this.#buffer.length = lastIndex;
            if (index < this.#buffer.length) {
                if (index) {
                    index = this.#bubbleUp(index);
                }
                this.#sinkDown(index);
            }
        }

        this.#positions?.delete(item);

        this.#deleted?.emit(item);
        if (!index) {
            this.#firstChanged?.emit(this.first);
        }
    }

    #sinkDown(index: number) {
        while (true) {
            let moveTo: number | undefined;

            const leftChild = this.#leftChildOf(index);

            if (leftChild < this.#buffer.length) {
                if (this.#compare(this.#buffer[index], this.#buffer[leftChild]) > 0) {
                    moveTo = leftChild;
                }

                const rightChild = this.#rightChildOf(index);

                if (rightChild < this.#buffer.length) {
                    if (this.#compare(this.#buffer[moveTo ?? index], this.#buffer[rightChild]) > 0) {
                        moveTo = rightChild;
                    }
                }
            }

            if (moveTo === undefined) {
                break;
            }

            this.#swap(index, moveTo);
            index = moveTo;
        }
    }

    #bubbleUp(index: number) {
        while (index) {
            const parent = this.#parentOf(index);

            if (this.#compare(this.#buffer[parent], this.#buffer[index]) <= 0) {
                break;
            }

            this.#swap(index, parent);
            index = parent;
        }

        if (!index) {
            this.#firstChanged?.emit(this.first);
        }

        return index;
    }

    #swap(index1: number, index2: number) {
        [this.#buffer[index1], this.#buffer[index2]] = [this.#buffer[index2], this.#buffer[index1]];
        if (this.#positions) {
            this.#positions.set(this.#buffer[index1], index1);
            this.#positions.set(this.#buffer[index2], index2);
        }
    }

    #leftChildOf(index: number) {
        return 2 * index + 1;
    }

    #rightChildOf(index: number) {
        return 2 * index + 2;
    }

    #parentOf(index: number) {
        return Math.floor((index - 1) / 2);
    }
}
