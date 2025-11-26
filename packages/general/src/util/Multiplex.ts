/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { MatterAggregateError } from "#MatterError.js";
import { MaybePromise } from "./Promises.js";
import { BasicSet } from "./Set.js";

const logger = Logger.get("Multiplex");

/**
 * A "multiplex" tracks an extensible set of promises.
 */
export interface Multiplex {
    add(worker: Promise<unknown>, description?: string): void;
    close(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
}

interface WorkerEntry {
    done: Promise<unknown>;
    description?: string;
}

/**
 * A basic multiplex that tracks all promises given to it.
 */
export class BasicMultiplex implements PromiseLike<void> {
    #workers = new BasicSet<WorkerEntry>();

    add(worker: MaybePromise<unknown>, description?: string) {
        if (!MaybePromise.is(worker)) {
            return;
        }

        const entry = {
            done: Promise.resolve(worker)
                .catch(e => {
                    let message = "Error";
                    if (description) {
                        message = `${message} ${description}`;
                    }
                    logger.error(`${message}:`, e);
                })
                .finally(() => this.#workers.delete(entry)),
            description,
        };

        this.#workers.add(entry);
    }

    async close() {
        while (this.#workers.size) {
            await MatterAggregateError.allSettled([...this.#workers].map(entry => entry.done));
        }
    }

    then<TResult1 = void, TResult2 = never>(
        onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
        return this.close().then(onfulfilled, onrejected);
    }

    [Symbol.asyncDispose] = this.close.bind(this);
}
