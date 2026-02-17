/**
 * Promise-based blocking queue.
 *
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Minutes } from "#time/TimeUnit.js";
import { AbortedError, ClosedError, InternalError } from "../MatterError.js";
import { Abort } from "./Abort.js";
import { createPromise } from "./Promises.js";
import { EndOfStreamError } from "./Streams.js";

export class DataReadQueue<T> {
    readonly #queue = new Array<T>();
    #pendingRead?: { resolver: (data: T) => void; rejecter: (reason: any) => void };
    #closeCause?: Error;

    async read(abort?: AbortSignal): Promise<T> {
        const { promise, resolver } = createPromise<T>();
        if (this.#closeCause) {
            throw new ClosedError("Channel is closed", { cause: this.#closeCause });
        }

        const data = this.#queue.shift();
        if (data !== undefined) {
            return data;
        }

        if (this.#pendingRead !== undefined) throw new InternalError("Only one pending read is supported");

        using localAbort = new Abort({
            timeout: abort ? undefined : Minutes.one,
            abort,
        });

        this.#pendingRead = {
            resolver,
            rejecter(cause) {
                localAbort.abort(cause);
            },
        };

        try {
            return await localAbort.attempt(promise);
        } catch (e) {
            if (e instanceof AbortedError) {
                // Stack trace is already correct
                throw e;
            }

            // Above is the only expected errors
            throw e;
        } finally {
            this.#pendingRead = undefined;
        }
    }

    write(data: T) {
        if (this.#closeCause) {
            throw new ClosedError("Channel is closed", { cause: this.#closeCause });
        }

        const pendingRead = this.#pendingRead;
        this.#pendingRead = undefined;
        if (pendingRead) {
            pendingRead.resolver(data);
            return;
        }

        this.#queue.push(data);
    }

    get size() {
        return this.#queue.length;
    }

    close(cause: Error = new EndOfStreamError()) {
        if (this.#closeCause) {
            return;
        }

        this.#closeCause = cause;

        const pendingRead = this.#pendingRead;
        this.#pendingRead = undefined;

        if (pendingRead) {
            pendingRead.rejecter(cause);
        }
    }
}
