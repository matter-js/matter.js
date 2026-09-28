/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One departure of an endpoint from a device type requirement that applies to it. It names no endpoint: each
 * result that holds violations is for one endpoint.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export interface DeviceTypeViolation {
    /**
     * The name of the device type whose requirement the endpoint violates: a device type the endpoint lists, or Base,
     * which applies once the endpoint lists a device type the model defines. For `singletonMisplaced` it is the device
     * type in the node scope that declares the singleton, which the endpoint need not list. For `unknownCondition` it
     * is the first device type the endpoint lists that the model defines, empty when there is none.
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
     * - a component requirement's count, on the composing endpoint: `device:` and the component device type's name
     *   (`device:TemperatureControlledCabinet`)
     * - one instance of a component requirement, on the composing endpoint: the count's path, `#` and the instance
     *   number (`device:ElectricalSensor#2`), or `#1` for a requirement that states no instance number
     *   (`device:TemperatureControlledCabinet#1`)
     * - component requirements that share a choice: `device:` and their component device types' names joined by `|`
     *   (`device:ElectricalEnergyTariff|ElectricalMeter`)
     * - a component requirement, on the component endpoint: `device:`, the composing device type's name, a slash and
     *   the component device type's name (`device:BatteryStorage/ElectricalSensor`)
     * - the count of a `Descendant` condition: `condition:` and the condition requirement's name (`condition:Cooler`)
     */
    requirement: string;

    kind: DeviceTypeViolation.Kind;

    /**
     * A description of the departure for a developer.
     */
    detail: string;
}

export namespace DeviceTypeViolation {
    /**
     * - `missing`: a mandatory cluster or element is absent
     * - `disallowed`: a cluster, element or component device type is present that its conformance forbids whatever
     *   conditions hold, by an `X` or through its feature terms; a false condition never makes one disallowed
     * - `instanceCount`: a component requirement, a choice of component requirements or a `Descendant` condition
     *   matches too few or too many endpoints, or an instance of a component requirement is filled by none
     * - `singletonMisplaced`: a server cluster that a device type in the node scope declares a singleton appears on
     *   an endpoint other than the declaring one
     * - `unknownCondition`: {@link DeviceTypeFacts.statedConditionsOf} names no condition in the endpoint's scope
     *
     * A component endpoint that satisfies no instance of the component requirement it fills takes the kind of its
     * first departure from the closest instance.
     */
    export type Kind = "missing" | "disallowed" | "instanceCount" | "singletonMisplaced" | "unknownCondition";

    /**
     * The key that identifies {@link violation} on its endpoint: its kind and requirement path. Two violations with
     * the same key report the same departure, so a caller deduplicating a violation list keys it by this.
     */
    export function keyOf({ kind, requirement }: Pick<DeviceTypeViolation, "kind" | "requirement">): string {
        return `${kind} ${requirement}`;
    }
}
