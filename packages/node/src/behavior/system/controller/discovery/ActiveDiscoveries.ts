/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, Environmental } from "#general";
import { MdnsClient, MdnsScannerTargetCriteria, Scanner, ScannerSet } from "#protocol";
import type { Discovery } from "./Discovery.js";

/**
 * Ongoing node discoveries registered with the environment.
 */
export class ActiveDiscoveries extends Set<Discovery<any>> {
    #env: Environment;
    #mdnsTargetCriteria?: MdnsScannerTargetCriteria;

    constructor(env: Environment) {
        super();

        this.#env = env;

        this.#activateCommissionableScanning();
        env.get(ScannerSet).added.on(this.#activateCommissionableScanningFor.bind(this));
    }

    static [Environmental.create](env: Environment) {
        const instance = new ActiveDiscoveries(env);
        env.set(ActiveDiscoveries, instance);
        return instance;
    }

    async close() {
        this.#env.delete(ActiveDiscoveries, this);

        this.#deactivateCommissionableScanning();
    }

    #activateCommissionableScanning() {
        const scanners = this.#env.get(ScannerSet);
        for (const scanner of scanners) {
            this.#activateCommissionableScanningFor(scanner);
        }
    }

    #activateCommissionableScanningFor(scanner: Scanner) {
        if (!(scanner instanceof MdnsClient)) {
            return;
        }

        if (this.#mdnsTargetCriteria === undefined) {
            this.#mdnsTargetCriteria = { commissionable: true, operationalTargets: [] };
        }
        scanner.targetCriteriaProviders.add(this.#mdnsTargetCriteria);
    }

    #deactivateCommissionableScanning() {
        if (!this.#mdnsTargetCriteria) {
            return;
        }
        const scanners = this.#env.get(ScannerSet);
        for (const scanner of scanners) {
            if (scanner instanceof MdnsClient) {
                scanner.targetCriteriaProviders.delete(this.#mdnsTargetCriteria);
            }
        }
    }
}
