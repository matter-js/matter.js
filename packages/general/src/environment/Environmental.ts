/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Observable } from "../util/Observable.js";
import type { Environment } from "./Environment.js";

export namespace Environmental {
    export const create = Symbol("create");

    /**
     * An "environmental service" is an object available via {@link Environment.get}.
     *
     * Any object may be an environmental service.  The methods in this interface are optional.
     */
    export interface Service {
        /**
         * Asynchronous construction, respected by {@link Environment.load}.
         */
        construction?: Promise<any>;
    }

    /**
     * An object used for service identification.
     *
     * We use classes as the key for service registration.  Classes serve as ideal keys because they are trivial to
     * manage and allow us to manage services in a type-safe manner.
     *
     * Any class may be used as the service identifier; the only requirement is that a registered instance is a subclass
     * of the {@link ServiceType}.
     *
     * Note that {@link Environment} only considers service available for the exact class under which they are
     * registered.  You cannot retrieve a service registered for a subclass of a {@link ServiceType} using the base
     * class.  You can however register the under both the base and derived {@link ServiceType}s.
     */
    export type ServiceType<T extends object = object> = abstract new (...args: any[]) => T;

    /**
     * A factory for a {@link Service}.
     *
     * A "factory" is a concrete {@link ServiceType} with a static {@link create} method that performs instantiation.
     */
    export interface Factory<T extends object = object> {
        new (...args: any[]): T;

        /**
         * Method the environment uses to instantiate the service.
         *
         * We use this rather than invoking the constructor directly so the service can perform configuration via
         * {@link Environment} regardless of the arguments its constructor takes.
         */
        [create]: (environment: Environment) => T;
    }

    /**
     * Events related to service lifecycle.
     */
    export interface ServiceEvents<T extends Environmental.ServiceType> {
        added: Observable<[instance: InstanceType<T>]>;
        deleted: Observable<[instance: InstanceType<T>]>;
    }
}
