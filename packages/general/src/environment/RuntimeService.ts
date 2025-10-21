/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { asError } from "#util/Error.js";
import { Diagnostic } from "../log/Diagnostic.js";
import { DiagnosticSource } from "../log/DiagnosticSource.js";
import { Logger } from "../log/Logger.js";
import { Construction, type Constructable } from "../util/Construction.js";
import { Cancellable, Destructable, Lifecycle } from "../util/Lifecycle.js";
import { Multiplex } from "../util/Multiplex.js";
import { Observable } from "../util/Observable.js";
import type { Environment } from "./Environment.js";
import { Environmental } from "./Environmental.js";

const logger = Logger.get("Runtime");

/**
 * Handles lifecycle management of other components.
 */
export class RuntimeService implements Multiplex {
    #env: Environment;
    #workers = new Set<RuntimeService.Worker>();
    #cancelled = new Set<RuntimeService.Worker>();
    #workerDeleted = Observable<[]>();
    #canceled = false;
    #started = Observable<[]>();
    #stopped = Observable<[]>();
    #crashed = Observable<[cause: any]>();

    constructor(environment: Environment) {
        this.#env = environment;
        environment.set(RuntimeService, this);
        DiagnosticSource.add(this);
    }

    /**
     * Add a {@link Worker}, either directly or by invoking an {@link Initiator}.
     *
     * The runtime considers itself "active" if there are one or more workers installed.
     *
     * A worker must either be {@link PromiseLike} or {@link Constructable} for the runtime to detect completion. On
     * completion the worker is removed and destroyed if the worker is {@link Destructable}.
     *
     * Once added, the {@link worker} is owned by the RuntimeService until closed, resolved or removed via
     * {@link delete}.
     */
    add(worker: RuntimeService.NewWorker) {
        if (!worker) {
            return;
        }

        if (typeof worker === "function") {
            try {
                this.add(worker(this.#env));
            } catch (e) {
                this.#crash(asError(e));
            }
            return;
        }

        if (this.#workers.has(worker)) {
            return;
        }

        this.#workers.add(worker);
        if (this.#workers.size === 1) {
            this.#started.emit();
        }

        // For PromiseLike just track until resolution
        if (worker.then) {
            Promise.resolve(worker)
                .catch(error => this.#crash(error))
                .finally(() => this.delete(worker));
            return;
        }

        if (worker.construction?.change) {
            // Constructable
            worker.construction.change.on(status => {
                switch (status) {
                    case Lifecycle.Status.Crashed:
                        this.#crash();
                        break;

                    case Lifecycle.Status.Destroyed:
                        this.delete(worker);
                        break;
                }
            });
        }
    }

    /**
     * Remove a worker.
     */
    delete(worker: RuntimeService.Worker) {
        if (!this.#workers.has(worker)) {
            return;
        }

        // Remove the worker
        this.#workers.delete(worker);
        this.#cancelled.delete(worker);
        this.#workerDeleted.emit();

        // If there are still non-helper workers, remain in active state
        if (this.#workers.size) {
            return;
        }

        // No workers except helpers; cancel helpers and exit
        this.cancel();

        // Emit stopped event when all activity stops.  Safe to ignore rejection because this promise can't reject
        void this.inactive.finally(() => this.#stopped.emit());
    }

    /**
     * Emits when a worker is added when previously there were none.
     */
    get started() {
        return this.#started;
    }

    /**
     * Emits when the last worker departs.
     */
    get stopped() {
        return this.#stopped;
    }

    /**
     * Emits when a worker experiences an unhandled error.
     */
    get crashed() {
        return this.#crashed;
    }

    static [Environmental.create](environment: Environment) {
        return new this(environment);
    }

    /**
     * Cancel execution.
     *
     * On cancel the runtime destroys all workers.
     */
    cancel() {
        if (this.#canceled) {
            return;
        }
        this.#canceled = true;
        logger.notice("Shutting down");

        for (const worker of this.#workers) {
            const disposal = this.#cancelWorker(worker);
            if (disposal) {
                this.add(disposal);
            }
        }
    }

    /**
     * Interrupt handler.  Triggered by e.g. SIGINT on unixish systems.
     *
     * The default implementation cancels the runtime.
     */
    interrupt() {
        this.cancel();

        if (typeof MatterHooks !== "undefined") {
            MatterHooks.interrupt();
        }
    }

    /**
     * Resolves when no workers are active.
     */
    get inactive() {
        if (!this.#workers.size) {
            return Promise.resolve();
        }

        return new Promise<void>(resolve => {
            const listener = () => {
                if (!this.#workers.size) {
                    this.#workerDeleted.off(listener);
                    resolve();
                }
            };
            this.#workerDeleted.on(listener);
        });
    }

    async close() {
        this.cancel();
        await this.inactive;
        this.#env.delete(RuntimeService, this);
        DiagnosticSource.delete(this);
    }

    [Symbol.asyncDispose]() {
        return this.close();
    }

    get [Diagnostic.value]() {
        return Diagnostic.node("🛠", "Workers", {
            children: [...this.#workers].map(worker => {
                let diagnostic: unknown = worker[RuntimeService.label];

                if (diagnostic === undefined) {
                    diagnostic = Diagnostic.valueOf(worker);

                    if (diagnostic === undefined) {
                        diagnostic = worker.toString();
                    }
                }

                return diagnostic;
            }),
        });
    }

    #cancelWorker(worker: RuntimeService.Worker) {
        if (this.#cancelled.has(worker)) {
            return;
        }

        const cancel = () => {
            this.#cancelled.add(worker);

            try {
                if (worker.close) {
                    return Promise.resolve(worker.close())
                        .catch(unhandled)
                        .finally(() => this.delete(worker));
                }

                if (worker[Symbol.asyncDispose]) {
                    return Promise.resolve(worker[Symbol.asyncDispose]?.())
                        .catch(unhandled)
                        .finally(() => this.delete(worker));
                }

                if (worker[Symbol.dispose]) {
                    worker[Symbol.dispose]?.();
                    this.delete(worker);
                    return;
                }
            } catch (e) {
                unhandled(e);
                this.delete(worker);
            }

            // No means of cancellation so we just need to wait for the worker to exit
        };

        if (worker.construction) {
            worker.construction.onSuccess(cancel);
            return;
        }

        return cancel();

        function unhandled(e: unknown) {
            logger.error(`Unhandled error closing worker:`, e);
        }
    }

    #crash(cause?: Error) {
        if (cause) {
            logger.error(cause);
        }
        this.crashed.emit(cause);
        this.cancel();
    }
}

export namespace RuntimeService {
    export const label = Symbol("label");

    /**
     * The runtime tracks individual discrete tasks as "workers".
     *
     * The state of the runtime is dependent on installed workers.  Any JS object may be a worker but the runtime's
     * interaction with workers varies as documented here.
     *
     * If a worker is a {@link PromiseLike} the runtime will delete and/or destroy it on completion.
     */
    export interface Worker extends Partial<PromiseLike<any>>, Partial<Cancellable>, Partial<Destructable> {
        /**
         * If the worker supports {@link Construction}, the runtime will monitor the worker's lifecycle:
         *
         *   - If the worker crashed (e.g. experiences an error during initialization) the runtime will cancel all
         *     workers and exit
         *
         *   - If the worker is destroyed the runtime deletes it from the set of known workers
         */
        construction?: Construction<any>;

        /**
         * If the worker supports {@link Symbol.asyncDispose} the runtime will invoke when the worker is no longer
         * needed.  This happens if:
         *
         *   - The worker is a {@link PromiseLike} that resolves
         *
         *   - The worker's {@link construction} status changed as noted above
         *
         *   - The runtime is canceled via {@link RuntimeService.cancel}
         */
        [Symbol.asyncDispose]?: () => void | Promise<void>;

        /**
         * Workers may implement {@link Symbol.dispose} to handle disposal.  Works the same as the async equivalent.
         */
        [Symbol.dispose]?: () => void;

        /**
         * If label is present, it will be presented in diagnostics.  This takes precedence over [Diagnostic.value].
         */
        [label]?: unknown;
    }

    /**
     * A function that initiates work.
     */
    export interface Initiator {
        (env: Environment): NewWorker;
    }

    export type NewWorker = Worker | Initiator | void;
}
