/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "../util/Promises.js";
import { CloneableStorage, StorageDriver } from "./StorageDriver.js";
import { SupportedStorageTypes } from "./StringifyTools.js";

/**
 * A lightweight handle that delegates all operations to an underlying {@link StorageDriver}.
 *
 * {@link StorageService} returns these instead of raw drivers so that multiple callers can share the same underlying
 * driver instance.  {@link close} calls a release callback (to decrement a reference count) rather than closing the
 * real driver.
 */
export class StorageDriverHandle extends StorageDriver {
    #driver: StorageDriver;
    #release: () => MaybePromise<void>;
    clone?: () => MaybePromise<StorageDriver>;

    constructor(driver: StorageDriver, release: () => MaybePromise<void>) {
        super();
        this.#driver = driver;
        this.#release = release;

        // If the underlying driver supports cloning, expose clone() so CloneableStorage.is() detects this handle
        if (CloneableStorage.is(driver)) {
            this.clone = () => driver.clone();
        }
    }

    override get id() {
        return this.#driver.id;
    }

    override get initialized() {
        return this.#driver.initialized;
    }

    override initialize(): MaybePromise<void> {
        // No-op — the underlying driver is already initialized
    }

    override close(): MaybePromise<void> {
        return this.#release();
    }

    override get(contexts: string[], key: string): MaybePromise<SupportedStorageTypes | undefined> {
        return this.#driver.get(contexts, key);
    }

    override set(contexts: string[], values: Record<string, SupportedStorageTypes>): MaybePromise<void>;
    override set(contexts: string[], key: string, value: SupportedStorageTypes): MaybePromise<void>;
    override set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ): MaybePromise<void> {
        if (typeof keyOrValues === "string") {
            return this.#driver.set(contexts, keyOrValues, value!);
        }
        return this.#driver.set(contexts, keyOrValues);
    }

    override delete(contexts: string[], key: string): MaybePromise<void> {
        return this.#driver.delete(contexts, key);
    }

    override keys(contexts: string[]): MaybePromise<string[]> {
        return this.#driver.keys(contexts);
    }

    override values(contexts: string[]): MaybePromise<Record<string, SupportedStorageTypes>> {
        return this.#driver.values(contexts);
    }

    override contexts(contexts: string[]): MaybePromise<string[]> {
        return this.#driver.contexts(contexts);
    }

    override clearAll(contexts: string[]): MaybePromise<void> {
        return this.#driver.clearAll(contexts);
    }

    override has(contexts: string[], key: string): MaybePromise<boolean> {
        return this.#driver.has(contexts, key);
    }

    override begin(): MaybePromise<StorageDriver.Transaction> {
        return this.#driver.begin();
    }
}
