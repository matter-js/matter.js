/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import type { Observable, Observer, Transaction } from "#general";
import { MaybePromise } from "#general";
import type { Behavior } from "./Behavior.js";

/**
 * A reactor is an {@link Observer} managed by a {@link Behavior}.  You install reactors using {@link Behavior.reactTo}
 * on the behavior that receives the event.
 *
 * A reactor is similar to a normal handler installed with {@link Observable.on}.  It provides several benefits over
 * installing an observer directly:
 *
 *   - The behavior uninstalls {@link reactor} when the {@link Endpoint} is destroyed
 *
 *   - If {@link reactor} is asynchronous, the behavior tracks the resulting promise.  It provides error handling and
 *     ensures the promise completes before {@link Endpoint} destruction
 *
 *   - The behavior ensures reactors run serially even if they are asynchronous
 *
 *   - Matter.js manages the context in which the reactor runs automatically, either joining the emitter's context or
 *     creating a dedicated offline context
 *
 *   - Matter.js ensures that {@link reactor} only registers with {@link Observable} once for a given {@link Endpoint}
 *
 *   - You may optionally designate resources (including {@link Behavior}s) for locking prior to reaction
 *
 * You should not use arrow functions for reactors as this will prevent you from accessing the Behavior in the correct
 * context.
 *
 * If {@link observable} is a high-volume emitter, it would be better to implement synchronous or very fast asynchronous
 * reactors to avoid accumulating too many deferred reactions.
 */
export type Reactor<T extends any[] = any[], R = any> = (...args: T) => MaybePromise<R>;

export namespace Reactor {
    /**
     * Configurable settings for {@link Behavior.reactTo}.
     */
    export interface Options {
        /**
         * Controls the context in which reaction Matter.js invokes a reactor.
         *
         *   - If false (the default), the reactor runs in the same context as the emitter, or a dedicated offline
         *     context if the emitter's context is unavailable.  Errors thrown by the reactor interrupt the emitter.
         *
         *   - If true, the reactor runs in a dedicated, offline context.  Errors thrown by the reactor are logged and
         *     won't affect the emitter
         */
        offline?: boolean;

        /**
         * Designate resources for which this reaction requires exclusive write access.
         *
         * You may specify lock as a resource (e.g. a {@link Behavior}) or an array of resources.  Or specify "true" to
         * lock the reacting behavior.
         *
         * If set:
         *
         *   - The transaction of {@link Behavior.context} for the reacting {@link Behavior} will be exclusive during
         *     reaction
         *
         *   - The transaction will own locks on the designated resources
         *
         *   - The reaction will defer until the resource locks become available
         */
        lock?: true | Transaction.Resource | Transaction.Resource[];

        /**
         * Only react the next time the event emits.
         */
        once?: boolean;
    }

    /**
     * Filter for selecting reactors.
     */
    export interface Selector {
        observable?: Observable;
        reactor?: Reactor;
    }
}
