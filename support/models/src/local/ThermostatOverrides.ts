/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "@matter/model";
import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "Thermostat",
    asOf: "1.3",

    children: [
        // See comments in ChannelClusterOverrides.ts...  Another example of clusters illegally referencing structures
        // in other clusters
        {
            tag: "datatype",
            name: "OccupancyBitmap",
            type: "OccupancySensing.OccupancyBitmap",
            until: "1.3",
        },
        {
            tag: "attribute",
            id: 0x1b,
            name: "ControlSequenceOfOperation",
            default: FieldValue.None,
        },

        // TODO This is temporary and should be in a new "Global Commands" section later because in fact it is generically
        //  defined in the Matter Spec. Right now this is only used by Thermostat so we place it here for now.
        {
            tag: "command",
            name: "AtomicRequest",
            id: 0xfe,
            access: "O",
            conformance: "PRES | MSCH",
            direction: "request",
            response: "AtomicResponse",
            children: [
                {
                    tag: "field",
                    id: 0,
                    name: "RequestType",
                    type: "enum8",
                    conformance: "M",
                    children: [
                        { tag: "field", name: "BeginWrite", id: 0 },
                        { tag: "field", name: "CommitWrite", id: 1 },
                        { tag: "field", name: "RollbackWrite", id: 2 },
                    ],
                },
                {
                    tag: "field",
                    id: 1,
                    name: "AttributeRequests",
                    type: "list",
                    conformance: "M",
                    children: [{ tag: "field", name: "entry", type: "attrib-id" }],
                },
                { tag: "field", id: 2, name: "Timeout", type: "uint16", conformance: "O" },
            ],
        },
        {
            tag: "command",
            name: "AtomicResponse",
            id: 0xfd,
            direction: "response",
            children: [
                {
                    tag: "field",
                    id: 0,
                    name: "StatusCode",
                    type: "status",
                    conformance: "M",
                },
                {
                    tag: "field",
                    id: 1,
                    name: "AttributeStatus",
                    type: "list",
                    conformance: "M",
                    children: [
                        {
                            tag: "field",
                            name: "entry",
                            type: "struct",
                            children: [
                                {
                                    tag: "field",
                                    id: 0,
                                    name: "AttributeId",
                                    type: "attrib-id",
                                    conformance: "M",
                                },
                                {
                                    tag: "field",
                                    id: 1,
                                    name: "StatusCode",
                                    type: "status",
                                    conformance: "M",
                                },
                            ],
                        },
                    ],
                },
                { tag: "field", id: 2, name: "Timeout", type: "uint16", conformance: "O" },
            ],
        },

        // The specification lists these deprecated elements without their definitions from 1.5.1 until 1.7 restores them
        // as obsolete.  A client needs the types to read them from devices of earlier revisions.
        {
            tag: "attribute",
            id: 0x7,
            name: "PiCoolingDemand",
            type: "uint8",
            access: "R V",
            constraint: "0 to 100",
            asOf: "1.5.1",
            until: "1.7",
        },
        {
            tag: "attribute",
            id: 0x8,
            name: "PiHeatingDemand",
            type: "uint8",
            access: "R V",
            constraint: "0 to 100",
            asOf: "1.5.1",
            until: "1.7",
        },
        {
            tag: "attribute",
            id: 0x9,
            name: "HvacSystemTypeConfiguration",
            type: "HVACSystemTypeBitmap",
            access: "R[W] VM",
            asOf: "1.5.1",
            until: "1.7",
        },
        {
            tag: "attribute",
            id: 0x25,
            name: "ThermostatProgrammingOperationMode",
            type: "ProgrammingOperationModeBitmap",
            access: "RW VM",
            constraint: "desc",
            asOf: "1.5.1",
            until: "1.7",
        },
        {
            tag: "attribute",
            id: 0x34,
            name: "OccupiedSetback",
            type: "UnsignedTemperature",
            access: "RW VM",
            constraint: "occupiedSetbackMin to occupiedSetbackMax",
            quality: "X N",
            asOf: "1.5.1",
            until: "1.7",
        },
        {
            tag: "attribute",
            id: 0x35,
            name: "OccupiedSetbackMin",
            type: "UnsignedTemperature",
            access: "R V",
            constraint: "max occupiedSetbackMax",
            quality: "X F",
            asOf: "1.5.1",
            until: "1.7",
        },
        {
            tag: "attribute",
            id: 0x36,
            name: "OccupiedSetbackMax",
            type: "UnsignedTemperature",
            access: "R V",
            constraint: "occupiedSetbackMin to 254",
            quality: "X F",
            asOf: "1.5.1",
            until: "1.7",
        },
        {
            tag: "attribute",
            id: 0x37,
            name: "UnoccupiedSetback",
            type: "UnsignedTemperature",
            access: "RW VM",
            constraint: "unoccupiedSetbackMin to unoccupiedSetbackMax",
            quality: "X N",
            asOf: "1.5.1",
            until: "1.7",
        },
        {
            tag: "attribute",
            id: 0x38,
            name: "UnoccupiedSetbackMin",
            type: "UnsignedTemperature",
            access: "R V",
            constraint: "max unoccupiedSetbackMax",
            quality: "X F",
            asOf: "1.5.1",
            until: "1.7",
        },
        {
            tag: "attribute",
            id: 0x39,
            name: "UnoccupiedSetbackMax",
            type: "UnsignedTemperature",
            access: "R V",
            constraint: "unoccupiedSetbackMin to 254",
            quality: "X F",
            asOf: "1.5.1",
            until: "1.7",
        },
        {
            tag: "datatype",
            name: "HVACSystemTypeBitmap",
            type: "map8",
            asOf: "1.5.1",
            until: "1.7",
            children: [
                { tag: "field", name: "CoolingStage", constraint: "0 to 1" },
                { tag: "field", name: "HeatingStage", constraint: "2 to 3" },
                { tag: "field", name: "HeatingIsHeatPump", constraint: "4" },
                { tag: "field", name: "HeatingUsesFuel", constraint: "5" },
            ],
        },
        {
            tag: "datatype",
            name: "ProgrammingOperationModeBitmap",
            type: "map8",
            asOf: "1.5.1",
            until: "1.7",
            children: [
                { tag: "field", name: "ScheduleActive", constraint: "0" },
                { tag: "field", name: "AutoRecovery", constraint: "1" },
                { tag: "field", name: "Economy", constraint: "2" },
            ],
        },
    ],
});
