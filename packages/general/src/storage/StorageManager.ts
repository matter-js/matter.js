/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "../util/Promises.js";
import { StorageContext, StorageContextFactory } from "./StorageContext.js";
import { StorageDriver, StorageError } from "./StorageDriver.js";

export class StorageManager implements StorageContextFactory {
    private initialized = false;

    constructor(private storage: StorageDriver) {}

    initialize(): MaybePromise<void> {
        if (!this.storage.initialized) {
            const init = this.storage.initialize();
            if (MaybePromise.is(init)) {
                return init.then(() => {
                    this.initialized = true;
                });
            }
        }
        this.initialized = true;
    }

    close() {
        this.initialized = false;
        return this.storage.close();
    }

    createContext(context: string): StorageContext {
        if (!this.initialized) throw new StorageError("The storage needs to be initialized first!");
        if (!context.length) throw new StorageError("Context must not be an empty string!");
        if (context.includes(".")) throw new StorageError("Context must not contain dots!");
        return new StorageContext(this.storage, [context]);
    }
}
