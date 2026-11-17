/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPromise, MemoryStorageDriver, SupportedStorageTypes } from "@matter/general";

/** Holds the first write to a context whose path ends with {@link suffix} once armed, until the test releases it */
export class WriteHold {
    readonly writing = createPromise<void>();
    readonly write = createPromise<void>();
    #armed = false;

    constructor(readonly suffix: string) {}

    arm() {
        this.#armed = true;
    }

    async pass(contexts: string[]) {
        if (this.#armed && contexts.join(".").endsWith(this.suffix)) {
            this.#armed = false;
            this.writing.resolver();
            await this.write.promise;
        }
    }
}

/** A memory driver whose writes pass {@link WriteHold} first */
export class HoldingStorageDriver extends MemoryStorageDriver {
    #hold: WriteHold;

    constructor(store: Record<string, any>, hold: WriteHold) {
        super(store);
        this.#hold = hold;
    }

    override async set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ) {
        await this.#hold.pass(contexts);
        super.set(contexts, keyOrValues, value);
    }
}
