/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    ClusterElement as Cluster,
    AttributeElement as Attribute,
    FieldElement as Field,
    EventElement as Event
} from "../../elements/index.js";

export const Switch = Cluster(
    { name: "Switch", id: 0x3b },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "LS", conformance: "O.a", constraint: "0", title: "LatchingSwitch" }),
        Field({ name: "MS", conformance: "O.a", constraint: "1", title: "MomentarySwitch" }),
        Field({ name: "MSR", conformance: "[MS & !AS]", constraint: "2", title: "MomentarySwitchRelease" }),
        Field({ name: "MSL", conformance: "[MS & (MSR | AS)]", constraint: "3", title: "MomentarySwitchLongPress" }),
        Field({ name: "MSM", conformance: "AS, [MS & MSR]", constraint: "4", title: "MomentarySwitchMultiPress" }),
        Field({ name: "AS", conformance: "[MS]", constraint: "5", title: "ActionSwitch" })
    ),

    Attribute({
        name: "NumberOfPositions", id: 0x0, type: "uint8", access: "R V", conformance: "M",
        constraint: "min 2", quality: "F"
    }),
    Attribute({
        name: "CurrentPosition", id: 0x1, type: "uint8", access: "R V", conformance: "M",
        constraint: "max numberOfPositions - 1", quality: "N"
    }),
    Attribute({
        name: "MultiPressMax", id: 0x2, type: "uint8", access: "R V", conformance: "MSM",
        constraint: "min 2", quality: "F"
    }),
    Event(
        { name: "SwitchLatched", id: 0x0, access: "V", conformance: "LS", priority: "info" },
        Field({ name: "NewPosition", id: 0x0, type: "uint8", conformance: "M", constraint: "0 to numberOfPositions - 1" })
    ),
    Event(
        { name: "InitialPress", id: 0x1, access: "V", conformance: "MS", priority: "info" },
        Field({ name: "NewPosition", id: 0x0, type: "uint8", conformance: "M", constraint: "0 to numberOfPositions - 1" })
    ),
    Event(
        { name: "LongPress", id: 0x2, access: "V", conformance: "MSL", priority: "info" },
        Field({ name: "NewPosition", id: 0x0, type: "uint8", conformance: "M", constraint: "0 to numberOfPositions - 1" })
    ),

    Event(
        { name: "ShortRelease", id: 0x3, access: "V", conformance: "MSR", priority: "info" },
        Field({
            name: "PreviousPosition", id: 0x0, type: "uint8", conformance: "M",
            constraint: "0 to numberOfPositions - 1"
        })
    ),

    Event(
        { name: "LongRelease", id: 0x4, access: "V", conformance: "MSL", priority: "info" },
        Field({
            name: "PreviousPosition", id: 0x0, type: "uint8", conformance: "M",
            constraint: "0 to numberOfPositions - 1"
        })
    ),

    Event(
        { name: "MultiPressOngoing", id: 0x5, access: "V", conformance: "MSM & !AS", priority: "info" },
        Field({ name: "NewPosition", id: 0x0, type: "uint8", conformance: "M", constraint: "0 to numberOfPositions - 1" }),
        Field({
            name: "CurrentNumberOfPressesCounted", id: 0x1, type: "uint8", conformance: "M",
            constraint: "2 to multiPressMax"
        })
    ),

    Event(
        { name: "MultiPressComplete", id: 0x6, access: "V", conformance: "MSM", priority: "info" },
        Field({
            name: "PreviousPosition", id: 0x0, type: "uint8", conformance: "M",
            constraint: "0 to numberOfPositions - 1"
        }),
        Field({
            name: "TotalNumberOfPressesCounted", id: 0x1, type: "uint8", conformance: "M",
            constraint: "max multiPressMax"
        })
    )
);

MatterDefinition.children.push(Switch);
