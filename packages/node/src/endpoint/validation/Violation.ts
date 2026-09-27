/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { Diagnostic, ImplementationError, MatterAggregateError } from "@matter/general";
import type { DeviceTypeViolation } from "@matter/model";

/**
 * A {@link DeviceTypeViolation} of an {@link Endpoint}.
 */
export type Violation = DeviceTypeViolation<Endpoint>;

export namespace Violation {
    export type Kind = DeviceTypeViolation.Kind;
}

/**
 * Thrown when an endpoint's structure departs from a device type requirement that applies to it: at construction, for
 * a new misplaced singleton always, and for any other new violation when validation is strict.
 *
 * Its errors are the endpoint's departures, followed by one such error for each other endpoint the same check refuses
 * for a new violation. Such an endpoint need not be the one being constructed, such as a sibling the new endpoint makes
 * a duplicate.
 */
export class DeviceTypeConformanceError extends MatterAggregateError {
    constructor(endpoint: string, errors: (DeviceTypeViolationError | DeviceTypeConformanceError)[]) {
        super(
            errors,
            Diagnostic.upgrade(
                `Endpoint ${endpoint} violates device type requirements`,
                Diagnostic.squash("Endpoint ", Diagnostic.strong(endpoint), " violates device type requirements"),
            ),
        );
    }
}

/**
 * One departure from a device type, as {@link DeviceTypeConformanceError} reports it.
 */
export class DeviceTypeViolationError extends ImplementationError {
    constructor({ deviceType, requirement, detail }: Pick<Violation, "deviceType" | "requirement" | "detail">) {
        super(
            Diagnostic.upgrade(
                `${deviceType} ${requirement}: ${detail}`,
                Diagnostic.squash(deviceType, " ", Diagnostic.strong(requirement), ": ", detail),
            ),
        );
    }
}
