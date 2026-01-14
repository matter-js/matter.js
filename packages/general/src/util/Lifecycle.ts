/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, MatterAggregateError } from "../MatterError.js";
import { MaybePromise } from "../util/Promises.js";

export namespace Lifecycle {
    /**
     * Standard statuses in an object's lifecycle.
     */
    export enum Status {
        Unknown = "unknown",
        Inactive = "inactive",
        Initializing = "initializing",
        Active = "active",
        Crashed = "crashed",
        Destroying = "destroying",
        Destroyed = "destroyed",
    }

    /**
     * Lifecycle status for multiple items.
     */
    export type Map<T extends keyof any> = Record<T, Status>;

    /**
     * Assert subject is active.
     */
    export function assertActive(status: Status, description?: string) {
        if (!description) {
            description = "dependency";
        }

        switch (status) {
            case Status.Active:
                return;

            case Status.Inactive:
                throw new UninitializedDependencyError(description, "is not initialized");

            case Status.Initializing:
                throw new UninitializedDependencyError(description, "is still initializing");

            case Status.Crashed:
                throw new CrashedDependencyError(description, "initialization failed");

            case Status.Destroying:
                throw new DestroyedDependencyError(description, "is closing");

            case Status.Destroyed:
                throw new DestroyedDependencyError(description, "is closed");
        }

        throw new DependencyLifecycleError(description, `status "${status}" is unknown`);
    }
}

/**
 * Base class for errors related to the lifecycle of a dependency.
 */
export class DependencyLifecycleError extends ImplementationError {
    constructor(what: string, why: string) {
        super(`${what} ${why}`);
    }
}

/**
 * Standard interface for objects that have a primary task that may initiate after construction.
 */
export interface Startable {
    /**
     * Commence with the object's primary activity.
     *
     * Start should have no effect if the object is already started.
     */
    start(): void;
}

/**
 * Standard interface for objects supporting a task that may be aborted or stopped prior to destruction.
 */
export interface Cancellable {
    /**
     * Stop the object's primary activity.  This should result in termination as quickly as possible.
     *
     * Cancellation have no effect if the object is cancelled or otherwise in a state where cancellation is irrelevant.
     */
    cancel(): void;
}

/**
 * Standard interface for disposing of object resources.
 */
export interface Destructable {
    close(): void | Promise<void>;

    [Symbol.dispose]?: () => void;

    [Symbol.asyncDispose]?: () => MaybePromise<void>;
}

/**
 * Thrown when a dependency is in an unsupported state.
 */
export class UnsupportedDependencyStatusError extends DependencyLifecycleError {}

/**
 * Thrown for actions that cannot be performed until further initialization occurs.
 */
export class UninitializedDependencyError extends DependencyLifecycleError {}

/**
 * Thrown for actions that cannot be performed because dependency crashed.
 */
export class CrashedDependencyError extends DependencyLifecycleError {
    subject?: object;
}

/**
 * Thrown for actions that cannot be performed because a dependency has been destroyed.
 */
export class DestroyedDependencyError extends DependencyLifecycleError {}

/**
 * Thrown for actions that cannot be performed because a dependency is not supported.
 */
export class UnsupportedDependencyError extends DependencyLifecycleError {}

/**
 * Thrown if multiple dependencies crash.
 */
export class CrashedDependenciesError extends MatterAggregateError {}
