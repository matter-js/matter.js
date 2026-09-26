/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LossKind } from "#util/model-digest.js";

/**
 * Removals from the generated model that we have looked at and accepted.
 *
 * Regenerating against a newer specification drops whatever that specification dropped, silently. An entry here is the
 * record that a particular loss was intended, and it is the only place the reason survives — the markdown the model is
 * generated from does not carry it.
 *
 * A `key` matches the path {@link digestOf} builds, which identifies an element by the identifier the specification
 * reserves for it — `datatype:status/field#140`, not its name, because a rename keeps the reservation. An element
 * with no identifier is keyed by name. A `revision` names the specification revision that removed it, so an entry
 * can be retired once we no longer generate that revision.
 *
 * Do not add an entry to make a build pass. An unexplained removal is the case this guard exists to catch.
 */
export interface AcknowledgedRemoval {
    key: string;

    /** What was lost. An entry excuses only the kind it names */
    kind: LossKind;

    /** The specification revision that removed it. An entry applies only while generating that revision */
    revision: string;

    reason: string;
}

export const AcknowledgedRemovals: AcknowledgedRemoval[] = [
    {
        key: "datatype:status/field#140",
        kind: "element",
        revision: "1.6.1",
        reason:
            "UnreportableAttribute. Matter 1.6.1 deletes status code 0x8c from the interaction model status " +
            "table. It remains in the 1.6.0 model because 1.6.0 defines it.",
    },
    {
        key: "datatype:status/field#197",
        kind: "element",
        revision: "1.6.1",
        reason:
            "NoUpstreamSubscription. Matter 1.6.1 deletes status code 0xc5 from the interaction model status " +
            "table. It remains in the 1.6.0 model because 1.6.0 defines it.",
    },
    {
        key: "deviceType#11/serverCluster#29/attribute:DeviceTypeList",
        kind: "default",
        revision: "1.6.1",
        reason:
            "Door Lock Controller revision 3 -> 4. Matter 1.6.1 adds revision 4 (Added Groupcast condition " +
            "requirement), so the Descriptor DeviceTypeList default names the new revision.",
    },
    {
        key: "deviceType#22/serverCluster#29/attribute:DeviceTypeList",
        kind: "default",
        revision: "1.6.1",
        reason:
            "Root Node revision 4 -> 5. Matter 1.6.1 adds revision 5 (Added conditions and cluster requirements " +
            "for the Groupcast cluster), so the Descriptor DeviceTypeList default names the new revision.",
    },
    {
        key: "cluster#513/attribute#65532/field:MSCH",
        kind: "conformance",
        revision: "1.6.1",
        reason:
            "Thermostat MatterScheduleConfiguration feature: the ThermostatOverrides mark it provisional (P, O), " +
            "because the feature is provisional in fact.",
    },
    {
        key: "cluster#513/attribute#73",
        kind: "conformance",
        revision: "1.6.1",
        reason:
            "Thermostat ScheduleTypes: the ThermostatOverrides mark the MatterScheduleConfiguration feature and the attributes " +
            "it makes mandatory as provisional (P, MSCH), because the feature is provisional in fact.",
    },
    {
        key: "cluster#513/attribute#75",
        kind: "conformance",
        revision: "1.6.1",
        reason:
            "Thermostat NumberOfSchedules: the ThermostatOverrides mark the MatterScheduleConfiguration feature and the attributes " +
            "it makes mandatory as provisional (P, MSCH), because the feature is provisional in fact.",
    },
    {
        key: "cluster#513/attribute#76",
        kind: "conformance",
        revision: "1.6.1",
        reason:
            "Thermostat NumberOfScheduleTransitions: the ThermostatOverrides mark the MatterScheduleConfiguration feature and the attributes " +
            "it makes mandatory as provisional (P, MSCH), because the feature is provisional in fact.",
    },
    {
        key: "cluster#513/attribute#77",
        kind: "conformance",
        revision: "1.6.1",
        reason:
            "Thermostat NumberOfScheduleTransitionPerDay: the ThermostatOverrides mark the MatterScheduleConfiguration feature and the attributes " +
            "it makes mandatory as provisional (P, MSCH), because the feature is provisional in fact.",
    },
    {
        key: "cluster#513/attribute#79",
        kind: "conformance",
        revision: "1.6.1",
        reason:
            "Thermostat ActiveScheduleHandle: the ThermostatOverrides mark the MatterScheduleConfiguration feature and the attributes " +
            "it makes mandatory as provisional (P, MSCH), because the feature is provisional in fact.",
    },
    {
        key: "cluster#513/attribute#81",
        kind: "conformance",
        revision: "1.6.1",
        reason:
            "Thermostat Schedules: the ThermostatOverrides mark the MatterScheduleConfiguration feature and the attributes " +
            "it makes mandatory as provisional (P, MSCH), because the feature is provisional in fact.",
    },
];
