/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "./Environment.js";
import { Environmental } from "./Environmental.js";
import { SharedEnvironmentServices } from "./SharedEnvironmentServices.js";

/**
 * Centralized manager for shared service lifecycle tracking.
 *
 * This internal service is automatically created at the root environment when the first
 * shared service instance is requested. It tracks all shared service instances created
 * anywhere in the environment hierarchy and provides type-based lookup to determine if
 * any consumer is using a particular service.
 */
export class SharedServicesManager {
    #dependents = new Array<SharedEnvironmentServices>();

    /** Installs the manager at the root environment. */
    static [Environmental.create](environment: Environment) {
        const dependents = new SharedServicesManager();
        environment.root.set(SharedServicesManager, dependents);
        return dependents;
    }

    /**
     * Register a shared service instance for lifecycle tracking.
     *
     * Called automatically when a shared service instance is created via {@link Environment.asDependent}.
     */
    add(dependent: SharedEnvironmentServices) {
        this.#dependents.push(dependent);
    }

    /**
     * Unregister a shared service instance from lifecycle tracking. Called when the instance is closed.
     */
    delete(dependent: SharedEnvironmentServices) {
        const index = this.#dependents.indexOf(dependent);
        if (index !== -1) {
            this.#dependents.splice(index, 1);
        }
    }

    /**
     * Check if any consumer is currently using a specific service type.
     *
     * Used by the environment's delete and close operations to determine if a service
     * can be safely removed. Returns true if at least one consumer has accessed the
     * service and has not yet released it.
     */
    has(type: Environmental.ServiceType): boolean {
        return this.#dependents.some(dependent => dependent.has(type));
    }
}
