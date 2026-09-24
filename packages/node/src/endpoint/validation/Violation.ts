/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { Diagnostic, ImplementationError, MatterAggregateError } from "@matter/general";

/**
 * One departure of an endpoint from a device type it declares.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export interface Violation {
    /**
     * The endpoint that departs from the device type.
     */
    endpoint: Endpoint;

    /**
     * The name of the device type whose requirement the endpoint violates.
     */
    deviceType: string;

    /**
     * The path of the violated requirement, which identifies it on the endpoint:
     *
     * - a server cluster: its name (`Identify`)
     * - a client cluster: `client:` and its name (`client:Identify`)
     * - a feature: the cluster path, a dot and the feature code (`OnOff.LT`)
     * - an attribute, command or event: the cluster path, a dot and the element name (`Identify.TriggerEffect`)
     * - an unknown condition: the name as stated
     */
    requirement: string;

    kind: Violation.Kind;

    /**
     * A description of the departure for a developer.
     */
    detail: string;
}

export namespace Violation {
    /**
     * - `missing`: a mandatory cluster or element is absent
     * - `disallowed`: a disallowed cluster or element is present
     * - `instanceCount`: a component requirement matches too few or too many endpoints
     * - `singletonMisplaced`: a server cluster that a device type in the node scope declares a singleton appears on
     *   an endpoint other than the declaring one
     * - `unknownCondition`: {@link Endpoint.deviceConditions} names no condition in the endpoint's scope
     */
    export type Kind = "missing" | "disallowed" | "instanceCount" | "singletonMisplaced" | "unknownCondition";
}

/**
 * Thrown when an endpoint's structure departs from a device type it declares and validation is strict.
 */
export class DeviceTypeConformanceError extends MatterAggregateError {
    constructor(endpoint: string, errors: DeviceTypeViolationError[]) {
        super(
            errors,
            Diagnostic.upgrade(
                `Endpoint ${endpoint} does not conform to its device types`,
                Diagnostic.squash("Endpoint ", Diagnostic.strong(endpoint), " does not conform to its device types"),
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
