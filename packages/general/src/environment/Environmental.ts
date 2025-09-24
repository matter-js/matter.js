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
     * A factory for a {@link Service}.
     *
     * A "factory" is just a class with a static {@link create} method that performs instantiation.
     */
    export interface Factory<T extends object> {
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
    export interface ServiceEvents<T extends abstract new (...args: any[]) => T> {
        added: Observable<[instance: InstanceType<T>]>;
        deleted: Observable<[instance: InstanceType<T>]>;
    }
}
