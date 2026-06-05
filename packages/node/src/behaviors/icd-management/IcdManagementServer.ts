/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
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
    }
}
