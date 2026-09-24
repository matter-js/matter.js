/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { Diagnostic, ImplementationError, MatterAggregateError } from "@matter/general";

/**
 * One departure of an endpoint from a device type requirement that applies to it.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export interface Violation {
    /**
     * The endpoint that departs from the requirement.
     */
    endpoint: Endpoint;

    /**
     * The name of the device type whose requirement the endpoint violates: a device type the endpoint lists, or Base.
     * For `singletonMisplaced` it is the device type in the node scope that declares the singleton, which the endpoint
     * need not list. For `unknownCondition` it is the endpoint's first listed device type, empty when it lists none.
     * For a component endpoint that satisfies no instance of the component requirement it fills, it is the composing
     * device type, which the endpoint need not list. For a `Descendant` condition's count it is the asserting device
     * type.
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
     * - a component requirement, on the composing endpoint: `device:` and the component device type's name
     *   (`device:TemperatureControlledCabinet`), with `#` and the instance number for one instance
     *   (`device:ElectricalSensor#2`)
     * - component requirements that share a choice: `device:` and their component device types' names joined by `|`
     *   (`device:ElectricalEnergyTariff|ElectricalMeter`)
     * - a component requirement, on the component endpoint: `device:`, the composing device type's name, a slash and
     *   the component device type's name (`device:BatteryStorage/ElectricalSensor`)
     * - the count of a `Descendant` condition: `condition:` and the condition requirement's name (`condition:Cooler`)
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
     * - `disallowed`: a disallowed cluster, element or component device type is present
     * - `instanceCount`: a component requirement, a choice of component requirements or a `Descendant` condition
     *   matches too few or too many endpoints, or an instance of a component requirement is filled by none
     * - `singletonMisplaced`: a server cluster that a device type in the node scope declares a singleton appears on
     *   an endpoint other than the declaring one
     * - `unknownCondition`: {@link Endpoint.deviceConditions} names no condition in the endpoint's scope
     *
     * A component endpoint that satisfies no instance of the component requirement it fills takes the kind of its
     * first departure from the closest instance.
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
