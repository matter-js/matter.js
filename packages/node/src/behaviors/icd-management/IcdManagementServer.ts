/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeLifecycle } from "#node/NodeLifecycle.js";
import { ImplementationError } from "@matter/general";
import { IcdCounter } from "@matter/protocol";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { IcdManagementBehavior } from "./IcdManagementBehavior.js";

const Base = IcdManagementBehavior.with(IcdManagement.Feature.CheckInProtocolSupport);

/**
 * Default device-side ICD Management behavior. Enables the Check-In Protocol Support (CIP) feature and validates
 * spec constraints on the timing attributes at startup.
 *
 * @see {@link MatterSpecification.v151.Core} § 9.16
 */
export class IcdManagementServer extends Base {
    declare internal: IcdManagementServer.Internal;

    override initialize() {
        // IdleModeDuration is in seconds; ActiveModeDuration is in milliseconds — unit conversion required.
        // @see {@link MatterSpecification.v151.Core} § 9.16.6.1
        if (this.state.idleModeDuration * 1000 < this.state.activeModeDuration) {
            throw new ImplementationError(
                `idleModeDuration (${this.state.idleModeDuration}s) * 1000 must be >= activeModeDuration (${this.state.activeModeDuration}ms)`,
            );
        }
        // @see {@link MatterSpecification.v151.Core} § 9.16.6.10
        if (this.state.maximumCheckInBackoff < this.state.idleModeDuration) {
            throw new ImplementationError(
                `maximumCheckInBackoff (${this.state.maximumCheckInBackoff}s) must be >= idleModeDuration (${this.state.idleModeDuration}s)`,
            );
        }

        this.reactTo((this.endpoint.lifecycle as NodeLifecycle).online, this.#online);
    }

    async #online() {
        const prev = this.internal.icdCounter;
        if (prev !== undefined) {
            // Node restarted — drop the old counter's reactor so it doesn't accumulate dead backings.
            await this.stopReacting({ observable: prev.changed });
        }
        const counter = new IcdCounter(this.state.icdCounter);
        this.internal.icdCounter = counter;
        // Persist the boot-bump immediately; later increments go through the reactor so state writes stay transactional.
        // @see {@link MatterSpecification.v151.Core} § 4.6.3
        this.state.icdCounter = counter.value;
        this.reactTo(counter.changed, this.#persistCounter);
    }

    #persistCounter(value: number) {
        this.state.icdCounter = value;
    }
}

export namespace IcdManagementServer {
    export class Internal {
        icdCounter?: IcdCounter;
    }
}
