/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import type { Observable, Observer, Transaction } from "#general";
import { asError, ImplementationError, InternalError, Logger, MatterAggregateError, MaybePromise } from "#general";
import { hasRemoteActor } from "#protocol";
import type { Reactor } from "../Reactor.js";
import { ActionContext } from "../context/ActionContext.js";
import { Contextual } from "../context/Contextual.js";
import { NodeActivity } from "../context/NodeActivity.js";
import { LocalActorContext } from "../context/server/LocalActorContext.js";
import type { BehaviorBacking } from "./BehaviorBacking.js";

const logger = Logger.get("Reactors");

/**
 * Used by BehaviorBacking to manage reactors and reactions.
 */
export class Reactors {
    #backing: BehaviorBacking;
    #backings = new Set<ReactorBacking<any, any>>();
    #destructionComplete?: () => void;

    constructor(backing: BehaviorBacking) {
        this.#backing = backing;
    }

    get backing() {
        return this.#backing;
    }

    async close() {
        for (const reactor of this.#backings) {
            await reactor.close();
        }

        if (this.#backings.size) {
            return new Promise<void>(resolve => (this.#destructionComplete = resolve));
        }
    }

    add<O extends Observable<any[], any>>(
        observable: O,
        reactor: Reactor<Parameters<O["emit"]>, ReturnType<O["emit"]>>,
        options?: Reactor.Options,
    ) {
        // Deduplicate reactors
        for (const backing of this.#backings) {
            if (backing.is(observable, reactor)) {
                return;
            }
        }

        // Install
        this.#backings.add(new ReactorBacking(this, observable, reactor, options ?? {}));
    }

    remove(selector: Reactor.Selector) {
        const toRemove = Array<ReactorBacking<any, any>>();
        for (const backing of this.#backings) {
            if (backing.is(selector.observable, selector.reactor)) {
                toRemove.push(backing);
            }
        }
        return MatterAggregateError.allSettled(
            toRemove.map(backing => backing.close()),
            "Error removing reactors",
        );
    }

    deleteClosedBacking(backing: ReactorBacking<any, any>) {
        this.#backings.delete(backing);
        if (!this.#backings.size) {
            this.#destructionComplete?.();
        }
    }

    get resource() {
        return this.#backing.datasource;
    }
}

/**
 * Implementation of a single reactor.
 */
class ReactorBacking<T extends any[], R> {
    #owner: Reactors;
    #endpoint: Endpoint;
    #listener: Observer<T, R>;
    #reactor: Reactor<T, Awaited<R>>;
    #observable: Observable<T, R>;
    #offline?: boolean;
    #closing?: boolean;
    #lock?: Iterable<Transaction.Resource>;
    #deferred = Array<() => Promise<void>>();
    #trampoline?: Promise<void>;
    #resolveTrampoline?: () => void;
    #nodeActivity?: NodeActivity;
    #activity?: NodeActivity.Activity;

    constructor(
        reactors: Reactors,
        observable: Observable<T, R>,
        reactor: Reactor,
        { offline, once, lock }: Reactor.Options,
    ) {
        this.#owner = reactors;
        this.#endpoint = reactors.backing.endpoint;
        this.#observable = observable;
        this.#offline = offline;
        this.#reactor = reactor;

        if (lock) {
            if (lock === true) {
                lock = [reactors.resource];
            } else if (!Array.isArray(lock)) {
                lock = [lock];
            }
            this.#lock = lock as Transaction.Resource[];
        }

        const reactorListener = ((...args: T) => {
            let resolution: MaybePromise<unknown>;
            let rejection: any;

            let alreadyReacting = true;

            try {
                if (!this.#trampoline) {
                    alreadyReacting = false;

                    if (!this.#nodeActivity) {
                        this.#nodeActivity = this.#endpoint.env.get(NodeActivity);
                    }

                    this.#activity = this.#nodeActivity.begin(this.toString());

                    this.#trampoline = new Promise<void>(resolve => {
                        this.#resolveTrampoline = () => {
                            resolve();
                            this.#trampoline = undefined;
                        };
                    });
                }

                if (once) {
                    // In "once" mode we stop listening immediately and destroy ourselves once the reaction completes
                    resolution = this.#reactOnce(args);
                } else if (alreadyReacting) {
                    // An ongoing reaction means we must wait our turn
                    resolution = this.#reactDeferred(args);
                } else {
                    // No ongoing reaction so react immediately
                    resolution = this.#react(args);
                }
            } catch (e) {
                // An error here means a synchronous reactor that was not trampolined crashed.  We cannot just throw
                // because there may have been additional reactions triggered by the synchronous reactor so we still
                // need the trampoline
                const error = this.#augmentError(e);
                if (this.#observable.isAsync) {
                    // Async observable with sync reactor
                    resolution = Promise.reject(error);
                } else {
                    // Sync observable with sync reactor
                    rejection = error;
                }
            }

            if (!alreadyReacting) {
                if (MaybePromise.is(resolution)) {
                    // Do not catch resolution errors, they are passed to the emitter.  Do initiate the trampoline once
                    // they complete
                    void Promise.resolve(resolution)
                        .finally(this.#afterReaction.bind(this))

                        // If resolution rejects, the error will pass through our finally and crash the process unless
                        // we catch it here.  #afterReaction cannot throw (see comments there)
                        .catch(() => {});
                } else {
                    this.#afterReaction();
                }
            }

            if (rejection) {
                throw rejection;
            }

            // Ensure resolution is a promise (or not) based on expectation of emitter
            if (this.#observable.isAsync) {
                // Async observable - convert to promise
                resolution = Promise.resolve(resolution);
            } else if (MaybePromise.is(resolution)) {
                // Sync observable with async reactor - reactor cannot return a value to emitter
                resolution.then(undefined, this.#unhandledError.bind(this));
                resolution = undefined;
            }

            return resolution;
        }) as Observer<T, R>;

        observable.on((this.#listener = reactorListener));
    }

    is(observable?: Observable<unknown[], unknown>, reactor?: Reactor) {
        return (
            (observable === undefined || this.#observable === observable) &&
            (reactor === undefined || this.#reactor === reactor) &&
            !this.#closing
        );
    }

    close() {
        if (!this.#closing) {
            this.#close();
        }

        return this.#trampoline;
    }

    toString() {
        const reactorName = this.#reactor.name ? `.${this.#reactor.name}` : "";
        return `reactor<${this.#owner.backing}${reactorName}>`;
    }

    #unhandledError(error: unknown) {
        logger.error("Unhandled", this.#augmentError(error));
    }

    #close() {
        this.#observable.off(this.#listener);
        this.#closing = true;
        if (this.#trampoline) {
            this.#trampoline = this.#trampoline.finally(() => this.#owner.deleteClosedBacking(this));
        } else {
            this.#owner.deleteClosedBacking(this);
        }
    }

    /**
     * Trampoline the next reaction or resolve the trampoline promise.
     *
     * Note - this method *cannot* throw because we invoke it within a finally that may be on a rejected promise.
     * Errors on that promise must be caught by the emitter.  But the finally also creates a promise and *that* promise
     * will throw if the original promise is rejected, which requires us to have a catch() on the finally promise or
     * the promise will crash with an unhandled error.
     */
    #afterReaction() {
        try {
            if (this.#deferred.length) {
                const next = this.#deferred.shift() as () => Promise<void>;

                void next()
                    .catch(e => {
                        // Reactors should not throw because they have error handling.  So any error here is internal
                        logger.error("Internal error invoking next reactor", e);
                    })
                    .finally(this.#afterReaction.bind(this));

                return;
            }

            this.#resolveTrampoline?.();
            this.#activity?.[Symbol.dispose]();
            this.#activity = undefined;
        } catch (e) {
            logger.error("Internal error after final reaction", e);
        }
    }

    /**
     * Invoke a single reactor when no other reactor is active.
     *
     * If the reaction is asynchronous it is tracked via {@link #reactAsync}.
     */
    #react(args: T): MaybePromise<Awaited<R> | undefined> {
        const originalContext = Contextual.contextOf(args[args.length - 1]);

        let context: undefined | ActionContext;
        if (!this.#offline) {
            context = originalContext;
        }

        // If the emitter's context is available, execute in that
        //
        // TODO - if emitter doesn't await promise, things will probably go wrong so async reactors need to use the
        // offline option.  Can probably enforce that with types but right now we just throw an error at runtime
        if (context) {
            const result = this.#reactWithContext(context, this.#owner.backing, args);

            if (MaybePromise.is(result) && !this.#observable.isAsync) {
                throw new ImplementationError(
                    `${this} returned a Promise but the observable is synchronous; you must set the "offline" option so this reactor runs with a dedicated transaction`,
                );
            }

            return result;
        }

        // Otherwise run in independent context and errors do not interfere with emitter
        const command = hasRemoteActor(originalContext) && originalContext.command;
        try {
            const reactor = (context: ActionContext) => {
                return this.#reactWithContext(context, this.#owner.backing, args);
            };

            // We use OfflineContext directly rather than via this.#endpoint.act because act() is unavailable during
            // construction and destruction
            //
            // Also, do not inject activity here.  No reason to have both the reactor and the context registered
            let result: MaybePromise<Awaited<R> | undefined> = LocalActorContext.act(this.toString(), reactor, {
                command,
            });

            if (MaybePromise.is(result)) {
                result = result.then(undefined, this.#unhandledError.bind(this)) as PromiseLike<undefined>;
            }
            return result;
        } catch (e) {
            this.#unhandledError(e);
        }
    }

    /**
     * Invoked by the listener when there are already ongoing reactions.
     *
     * Installs a trampoline function and returns a placeholder promise.  The trampolined functions are always async
     * regardless of the emitter and listener because by necessity they do not act immediately.
     */
    #reactDeferred(args: T): MaybePromise<unknown> {
        return new Promise((resolve, reject) => {
            const deferredReaction = async () => {
                try {
                    const result = await this.#react(args);
                    resolve(result);
                } catch (e) {
                    reject(asError(e));
                }
            };

            this.#deferred.push(deferredReaction);
        });
    }

    /**
     * React in "once" mode -- react then close.
     */
    #reactOnce(args: T): MaybePromise<R | undefined> {
        this.#observable.off(this.#listener);

        let isAsync = false;
        try {
            const result = this.#react(args);

            // If reaction is async, wait until it completes to close
            if (MaybePromise.is(result)) {
                isAsync = true;

                // Do not use this.close() here because it will result in cyclical promises since close() waits on the
                // reaction.  this.#close() does not return a promise so is safe
                return Promise.resolve(result).finally(() => this.#close()) as PromiseLike<undefined>;
            }

            return result;
        } finally {
            // If reaction is not async, close immediately
            if (!isAsync) {
                // Close should not be async
                void this.close();
            }
        }
    }

    /**
     * Invoked by #react once it obtains a context.
     */
    #reactWithContext(context: ActionContext, backing: BehaviorBacking, args: T): MaybePromise<Awaited<R> | undefined> {
        if (this.#lock) {
            return this.#lockThenReact(context, backing, args);
        }

        const reactor = this.#bindReactor(context, backing);
        return reactor(...args);
    }

    /**
     * Grab locks if so configured before performing reaction.
     */
    async #lockThenReact(context: ActionContext, backing: BehaviorBacking, args: T): Promise<Awaited<R> | undefined> {
        if (!this.#lock) {
            throw new InternalError("No locks to acquire");
        }

        await context.transaction.addResources(...this.#lock);
        await context.transaction.begin();

        for (const resource of context.transaction.resources) {
            if (resource.lockedBy !== context.transaction) {
                throw new InternalError(`Lock of ${resource} should be held by ${this} but is not`);
            }
        }

        const reactor = this.#bindReactor(context, backing);
        return await reactor(...args);
    }

    /**
     * Bind the reactor to a behavior instance once locks are held.
     */
    #bindReactor(context: ActionContext, backing: BehaviorBacking): Reactor<T, Awaited<R>> {
        const agent = this.#endpoint.agentFor(context);

        // Do not use Agent.get because it will throw during initialization
        const behavior = backing.createBehavior(agent, backing.type);

        return this.#reactor.bind(behavior);
    }

    /**
     * Detail the reactor in error messages for errors triggered during reaction.
     */
    #augmentError(cause: unknown): Error {
        const error = asError(cause);

        error.message = `Error in ${this}: ${error.message}`;

        return error;
    }
}
