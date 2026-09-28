/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { Diagnostic, ImplementationError, MatterAggregateError } from "@matter/general";
import type { DeviceTypeViolation } from "@matter/model";
import type { DeviceTypeValidation } from "./DeviceTypeValidation.js";

/**
 * Thrown when a pass refuses one or more endpoints: for a new misplaced singleton, and for any other new violation in
 * mode `"strict"`.
 *
 * Its {@link errors} are the new violations of every refused endpoint, in the order the pass judged them. A refused
 * endpoint need not be the one being constructed, such as a sibling the new endpoint makes a duplicate. The message
 * names the refused endpoints, the first refused first. The singleton check before an endpoint's behaviors initialize
 * stops at the first misplacing endpoint in tree order and names only that one.
 */
export class DeviceTypeConformanceError extends MatterAggregateError {
    declare readonly errors: DeviceTypeViolationError[];

    constructor(errors: [DeviceTypeViolationError, ...DeviceTypeViolationError[]]) {
        const endpoints = [...new Set(errors.map(({ endpoint }) => endpoint.toString()))];
        const subject = endpoints.length === 1 ? "Endpoint" : "Endpoints";
        const verb = endpoints.length === 1 ? "violates" : "violate";
        super(
            errors,
            Diagnostic.upgrade(
                `${subject} ${endpoints.join(", ")} ${verb} device type requirements`,
                Diagnostic.squash(
                    `${subject} `,
                    ...endpoints.flatMap((endpoint, index) =>
                        index ? [", ", Diagnostic.strong(endpoint)] : [Diagnostic.strong(endpoint)],
                    ),
                    ` ${verb} device type requirements`,
                ),
            ),
        );
    }
}

/**
 * One violation of a refused endpoint, as {@link DeviceTypeConformanceError} reports it.
 *
 * An {@link ImplementationError} because what is refused is the application's own endpoint structure: an endpoint it
 * constructs, or one it asks {@link DeviceTypeValidation.validate} to judge.
 */
export class DeviceTypeViolationError extends ImplementationError {
    readonly endpoint: Endpoint;
    readonly violation: DeviceTypeViolation;

    constructor(endpoint: Endpoint, violation: DeviceTypeViolation) {
        const { deviceType, requirement, detail } = violation;
        super(
            Diagnostic.upgrade(
                `${deviceType} ${requirement}: ${detail}`,
                Diagnostic.squash(deviceType, " ", Diagnostic.strong(requirement), ": ", detail),
            ),
        );
        this.endpoint = endpoint;
        this.violation = violation;
    }
}
