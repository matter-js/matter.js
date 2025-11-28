/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { Environmental } from "#environment/Environmental.js";
import { ServiceProvider } from "#environment/ServiceProvider.js";
import { SharedServicesManager } from "#environment/SharedServicesManager.js";
import { ImplementationError } from "#MatterError.js";
import { MaybePromise } from "#util/Promises.js";

/**
 * Provides reference-counted access to shared environmental services.
 *
 * Tracks which services are in use and ensures services are only closed when all
 * consumers have released them. This enables safe sharing of services across multiple
 * consumers without premature cleanup.
 *
 * Created via {@link Environment.asDependent} and automatically registered at the root
 * environment for centralized lifecycle management. All shared services are accessed
 * at the root level regardless of which environment creates the instance.
 */
export class SharedEnvironmentServices implements ServiceProvider {
    #env: Environment;
    #serviceTypes = new Set<Environmental.ServiceType>();
    #closed = false;

    constructor(env: Environment) {
        this.#env = env;
    }

    #assertClosed() {
        if (this.#closed) {
            throw new ImplementationError("Dependent environment is closed");
        }
    }

    /** Check if this instance is currently tracking a specific service type. */
    has(type: Environmental.ServiceType) {
        return this.#serviceTypes.has(type);
    }

    /**
     * Access an environmental service and register this instance as a consumer.
     *
     * The service will be tracked and protected from closure until this instance
     * explicitly releases it via {@link delete} or {@link close}.
     */
    get<T extends object>(type: Environmental.ServiceType<T>): T {
        this.#assertClosed();
        const instance = this.#env.get(type);
        this.#serviceTypes.add(type);
        return instance;
    }

    /**
     * Access an optional environmental service and register this instance as a consumer.
     *
     * Returns undefined if the service is not available, otherwise behaves like {@link get}.
     */
    maybeGet<T extends object>(type: Environmental.ServiceType<T>): T | undefined {
        this.#assertClosed();
        if (this.#env.has(type)) {
            return this.get(type);
        }
    }

    /**
     * Unregister this instance from a service and remove the service from the environment.
     *
     * If other consumers are still using the service, it remains available for them.
     * Only affects services this instance has accessed via {@link get} or {@link load}.
     */
    delete(type: Environmental.ServiceType, instance?: any) {
        this.#assertClosed();
        if (!this.#serviceTypes.has(type)) {
            return; // Don't affect services this dependent didn't use
        }
        this.#serviceTypes.delete(type);
        this.#env.delete(type, instance);
    }

    /**
     * Load an environmental service asynchronously and register this instance as a consumer.
     *
     * Waits for the service's construction promise to resolve if present, then tracks
     * the service for lifecycle management.
     */
    async load<T extends Environmental.Service>(type: Environmental.Factory<T>): Promise<T> {
        this.#assertClosed();
        const instance = await this.#env.load(type);
        this.#serviceTypes.add(type);
        return instance;
    }

    /**
     * Unregister from and close one or all services used by this instance.
     *
     * When called with a specific type:
     * - Unregisters this instance from that service
     * - Calls service.close() and removes the service if no other consumers are using it
     *
     * When called without arguments:
     * - Closes all services this instance has accessed
     * - Marks this instance as permanently closed
     * - Subsequent operations will throw ImplementationError
     *
     * Only affects services this instance has accessed via {@link get} or {@link load}.
     */
    close<T extends object>(
        type: Environmental.ServiceType<T>,
    ): T extends { close: () => MaybePromise<void> } ? MaybePromise<void> : void;
    close(): MaybePromise<void>;

    close(type?: Environmental.ServiceType): MaybePromise<void> {
        this.#assertClosed();
        if (type === undefined) {
            this.#closed = true;
            const types = Array.from(this.#serviceTypes);
            this.#serviceTypes.clear();
            const closePromises = new Array<MaybePromise<void>>();
            for (const type of types) {
                const closer = this.#env.close(type);
                if (MaybePromise.is(closer)) {
                    closePromises.push(closer);
                }
            }
            this.#env.root.get(SharedServicesManager).delete(this);
            if (closePromises.length > 0) {
                return Promise.all(closePromises).then(() => undefined);
            }
        } else {
            if (!this.#serviceTypes.has(type)) {
                return; // Don't affect services this dependent didn't use
            }
            this.#serviceTypes.delete(type);
            return this.#env.close(type);
        }
    }

    async [Symbol.asyncDispose]() {
        await this.close();
    }
}
