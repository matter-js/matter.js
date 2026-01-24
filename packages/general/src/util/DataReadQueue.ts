/**
 * Promise-based blocking queue.
 *
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration } from "#time/Duration.js";
import { Minutes } from "#time/TimeUnit.js";
import { AbortedError, MatterFlowError } from "../MatterError.js";
import { Time, Timer } from "../time/Time.js";
import { Abort } from "./Abort.js";
import { asError } from "./Error.js";
import { createPromise } from "./Promises.js";
import { EndOfStreamError, NoResponseTimeoutError } from "./Streams.js";

export class DataReadQueue<T> {
    readonly #queue = new Array<T>();
    #pendingRead?: { resolver: (data: T) => void; rejecter: (reason: any) => void; timeoutTimer?: Timer };
    #closed = false;

    async read({ timeout = Minutes.one, abort }: { timeout?: Duration; abort?: AbortSignal } = {}): Promise<T> {
        const { promise, resolver, rejecter } = createPromise<T>();
        if (this.#closed) throw new EndOfStreamError();
        const data = this.#queue.shift();
        if (data !== undefined) {
            return data;
        }
        if (this.#pendingRead !== undefined) throw new MatterFlowError("Only one pending read is supported");
        this.#pendingRead = {
            resolver,
            rejecter,
            timeoutTimer: Time.getTimer("Queue timeout", timeout, () =>
                rejecter(
                    new NoResponseTimeoutError(
                        `Expected response data missing within timeout of ${Duration.format(timeout)}`,
                    ),
                ),
            ).start(),
        };

        let localAbort: Abort | undefined;
        try {
            if (abort) {
                localAbort = new Abort({
                    abort,

                    handler: reason => {
                        this.#clearPendingRead();
                        rejecter(reason);
                    },
                });
            }

            return await promise;
        } catch (e) {
            if (e instanceof AbortedError) {
                throw e;
            }

            // The stack trace where we created the error is useless (either a timer or close()) so replace here
            const error = asError(e);
            error.stack = new Error().stack;
            throw error;
        } finally {
            localAbort?.close();
        }
    }

    write(data: T) {
        if (this.#closed) throw new EndOfStreamError();
        const pendingRead = this.#pendingRead;
        this.#clearPendingRead();
        if (pendingRead) {
            pendingRead.resolver(data);
            return;
        }
        this.#queue.push(data);
    }

    get size() {
        return this.#queue.length;
    }

    close() {
        if (this.#closed) return;
        this.#closed = true;
        if (this.#pendingRead === undefined) return;
        this.#pendingRead.timeoutTimer?.stop();
        this.#pendingRead.rejecter(new EndOfStreamError());
    }

    #clearPendingRead() {
        if (this.#pendingRead === undefined) {
            return;
        }

        this.#pendingRead.timeoutTimer?.stop();
        this.#pendingRead = undefined;
    }
}
