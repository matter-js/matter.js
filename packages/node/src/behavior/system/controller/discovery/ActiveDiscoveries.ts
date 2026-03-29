/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, Environmental } from "@matter/general";
import type { Discovery } from "./Discovery.js";

/**
 * Ongoing node discoveries registered with the environment.
 */
export class ActiveDiscoveries extends Set<Discovery<any>> {
    #env: Environment;

    constructor(env: Environment) {
        super();

        this.#env = env;
    }

    static [Environmental.create](env: Environment) {
        const instance = new ActiveDiscoveries(env);
        env.set(ActiveDiscoveries, instance);
        return instance;
    }

    async close() {
        this.#env.delete(ActiveDiscoveries, this);
    }
}
