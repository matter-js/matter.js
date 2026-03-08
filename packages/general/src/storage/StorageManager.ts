/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "../util/Promises.js";
import { StorageContext, StorageContextFactory } from "./StorageContext.js";
import { StorageDriver, StorageError } from "./StorageDriver.js";

export class StorageManager implements StorageContextFactory {
    #driver: StorageDriver;
    #isInitialized = false;

    constructor(driver: StorageDriver) {
        this.#driver = driver;
    }

    get driver() {
        return this.#driver;
    }

    get driverId() {
        return this.#driver.id;
    }

    initialize(): MaybePromise<void> {
        if (!this.#driver.initialized) {
            const init = this.#driver.initialize();
            if (MaybePromise.is(init)) {
                return init.then(() => {
                    this.#isInitialized = true;
                });
            }
        }
        this.#isInitialized = true;
    }

    close() {
        this.#isInitialized = false;
        return this.#driver.close();
    }

    createContext(context: string): StorageContext {
        if (!this.#isInitialized) {
            throw new StorageError("The storage needs to be initialized first!");
        }
        if (!context.length) {
            throw new StorageError("Context must not be an empty string!");
        }
        if (context.includes(".")) {
            throw new StorageError("Context must not contain dots!");
        }
        return new StorageContext(this.#driver, [context]);
    }
}
