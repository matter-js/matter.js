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
    CommandElement as Command
} from "../../elements/index.js";

export const TemperatureControl = Cluster(
    { name: "TemperatureControl", id: 0x56 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "TN", conformance: "O.a", constraint: "0", title: "TemperatureNumber" }),
        Field({ name: "TL", conformance: "O.a", constraint: "1", title: "TemperatureLevel" }),
        Field({ name: "STEP", conformance: "[TN]", constraint: "2", title: "TemperatureStep" })
    ),

    Attribute({
        name: "TemperatureSetpoint", id: 0x0, type: "temperature", access: "R V", conformance: "TN",
        constraint: "minTemperature to maxTemperature"
    }),
    Attribute({
        name: "MinTemperature", id: 0x1, type: "temperature", access: "R V", conformance: "TN",
        constraint: "max maxTemperature - 1", quality: "F"
    }),
    Attribute({
        name: "MaxTemperature", id: 0x2, type: "temperature", access: "R V", conformance: "TN",
        constraint: "desc", quality: "F"
    }),
    Attribute({
        name: "Step", id: 0x3, type: "temperature", access: "R V", conformance: "STEP",
        constraint: "1 to maxTemperature - minTemperature", quality: "F"
    }),
    Attribute({
        name: "SelectedTemperatureLevel", id: 0x4, type: "uint8", access: "R V", conformance: "TL",
        constraint: "max 31"
    }),

    Attribute(
        {
            name: "SupportedTemperatureLevels", id: 0x5, type: "list", access: "R V", conformance: "TL",
            constraint: "max 32[max 16]"
        },
        Field({ name: "entry", type: "string" })
    ),

    Command(
        { name: "SetTemperature", id: 0x0, access: "O", conformance: "M", direction: "request", response: "status" },
        Field({ name: "TargetTemperature", id: 0x0, type: "temperature", conformance: "TN", constraint: "desc" }),
        Field({ name: "TargetTemperatureLevel", id: 0x1, type: "uint8", conformance: "TL", constraint: "desc" })
    )
);

MatterDefinition.children.push(TemperatureControl);
