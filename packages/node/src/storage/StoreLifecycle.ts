/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClosedError, MaybePromise, StorageError } from "@matter/general";

/**
 * Thrown when a store that is erased or closed, or is ending, is asked to write or to hand out a store for a behavior,
 * and when a store that is closed or closing is asked to erase.  Teardown races raise it, such as a commit that lands
 * while the node is erased, so it is a {@link ClosedError}, not an error of the caller.
 */
export class StoreClosedError extends ClosedError {}

/**
 * Run {@link step}, and reject with a {@link StorageError} that names {@link store} and has the failure as its cause if
 * the step fails, so failures of several stores can be told apart.
 */
export async function namingStoreFailure(store: object, action: string, step: () => MaybePromise<void>) {
    try {
        await step();
    } catch (cause) {
        throw new StorageError(`Cannot ${action} ${store}`, { cause });
    }
}

/**
 * The lifecycle of a store: it is active until it is erased or closed, and then never touches storage again.
 *
 * | state     | {@link write}      | {@link erase}                   | {@link close}       |
 * |-----------|--------------------|---------------------------------|---------------------|
 * | active    | runs               | starts erasing                  | starts closing      |
 * | erasing   | `StoreClosedError` | joins the erase                 | waits for the erase |
 * | closing   | `StoreClosedError` | waits, then `StoreClosedError`  | joins the close     |
 * | erased    | `StoreClosedError` | resolves, does nothing          | resolves            |
 * | closed    | `StoreClosedError` | `StoreClosedError`              | resolves            |
 *
 * An erase or close first waits for the writes that are running, so no write lands after its storage is cleared.
 * A failed erase still ends erased; what it left behind is the caller's to discard.  The failure of an erase or close
 * goes to the calls that asked for that work, so an erase that joins an erase rejects with its failure, while a close
 * that waits for an erase resolves once the store ended.
 *
 * Level 8 of the lock order in `LifecycleMutex`.
 *
 * @internal
 */
export class StoreLifecycle {
    #store: { toString(): string };
    #state: StoreLifecycle.State = "active";
    #ending?: Promise<void>;
    #writes = new Set<Promise<unknown>>();

    constructor(store: { toString(): string }) {
        this.#store = store;
    }

    get state() {
        return this.#state;
    }

    get isActive() {
        return this.#state === "active";
    }

    /**
     * Throws {@link StoreClosedError} unless the store is active.
     */
    assertActive(action: string) {
        if (this.#state !== "active") {
            throw new StoreClosedError(`Cannot ${action} ${this.#store} because it is ${this.#state}`);
        }
    }

    /**
     * Run {@link write} if the store is active, else reject with {@link StoreClosedError}.  Returns the promise of
     * {@link write} itself, so a write takes no longer than without the lifecycle.
     */
    write<T>(write: () => Promise<T>): Promise<T> {
        try {
            this.assertActive("write to");
        } catch (error) {
            return Promise.reject(error);
        }
        const writing = write();
        const forget = () => {
            this.#writes.delete(writing);
        };
        this.#writes.add(writing);
        writing.then(forget, forget);
        return writing;
    }

    /**
     * End the store with {@link wipe}, which clears its storage.
     */
    async erase(wipe: () => Promise<void>) {
        switch (this.#state) {
            case "active":
                return this.#end("erasing", "erased", wipe);

            case "erasing":
                return this.#ending;

            case "closing":
                await this.#ended();
                break;

            case "erased":
                return;
        }
        this.assertActive("erase");
    }

    /**
     * End the store without clearing its storage.  {@link finish} runs once the running writes ended.
     */
    async close(finish?: () => Promise<void>) {
        switch (this.#state) {
            case "active":
                return this.#end("closing", "closed", finish);

            case "closing":
                return this.#ending;
        }
        await this.#ended();
    }

    async #ended() {
        await Promise.allSettled([this.#ending]);
    }

    #end(during: StoreLifecycle.State, after: StoreLifecycle.State, work?: () => Promise<void>) {
        this.#state = during;
        this.#ending = (async () => {
            try {
                // A failed write rejects for its own caller
                await Promise.allSettled(this.#writes);
                await work?.();
            } finally {
                this.#state = after;
            }
        })();
        return this.#ending;
    }
}

export namespace StoreLifecycle {
    export type State = "active" | "erasing" | "closing" | "erased" | "closed";
}
