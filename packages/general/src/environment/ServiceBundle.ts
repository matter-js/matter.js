/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { BasicSet } from "#util/Set.js";
import { Environment } from "./Environment.js";

const logger = new Logger("ServiceBundle");

/**
 * A bundle of services that may be added to an {@link Environment} as a unit.
 *
 * This serves as an extension mechanism for matter.js.  Plugins may register for deployment into environments by adding
 * a factory to {@link default}.
 */
export class ServiceBundle extends BasicSet<ServiceBundle.Factory> {
    static #default = new ServiceBundle();
    #environments = new Set<WeakRef<Environment>>();

    constructor() {
        super();

        this.added.on(factory => {
            let toRemove: undefined | Set<WeakRef<Environment>>;

            for (const ref of this.#environments) {
                const env = ref.deref();

                if (env) {
                    this.#deployFactory(factory, env);
                }

                // Clean up expired ref
                if (env === undefined) {
                    if (toRemove === undefined) {
                        toRemove = new Set();
                    }
                    toRemove.add(ref);
                }
            }

            if (toRemove) {
                for (const expiredRef of toRemove) {
                    this.#environments.delete(expiredRef);
                }
            }
        });
    }

    /**
     * A default bundle for services that should generally deploy in all environments.
     */
    static get default() {
        return this.#default;
    }

    /**
     * Install the bundle into an {@link Environment}.
     *
     * This installs any services that currently comprise the bundle and will install any services added in the future
     * as well.
     */
    deploy(env: Environment) {
        for (const factory of this) {
            this.#deployFactory(factory, env);
        }
        this.#environments.add(new WeakRef(env));
    }

    #deployFactory(factory: ServiceBundle.Factory, env: Environment) {
        try {
            factory(env);
        } catch (e) {
            let name = "factory";
            if (factory.name) {
                name = `${name} ${factory.name}`;
            }
            logger.error(`Error deploying services for ${name}:`, e);
        }
    }
}

export namespace ServiceBundle {
    /**
     * A factory function invoked when a bundle is deployed.
     */
    export interface Factory {
        (env: Environment): void;
    }
}
