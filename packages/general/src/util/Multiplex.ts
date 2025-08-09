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

/**
 * A basic multiplex that tracks all promises given to it.
 */
export class BasicMultiplex implements PromiseLike<void> {
    #workers = new BasicSet<Promise<unknown> & { description?: string }>();

    add(worker: MaybePromise<unknown>, description?: string) {
        if (!MaybePromise.is(worker)) {
            return;
        }

        const promise = Promise.resolve(worker)
            .catch(e => {
                let message = "Unhandled error";
                if (description) {
                    message = `${message} in ${description}`;
                }
                logger.error(message, e);
            })
            .finally(() => this.#workers.delete(promise)) as Promise<unknown> & { description?: string };

        if (description !== undefined) {
            promise.description = description;
        }

        this.#workers.add(promise);
    }

    async close() {
        while (this.#workers.size) {
            await MatterAggregateError.allSettled(this.#workers);
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
