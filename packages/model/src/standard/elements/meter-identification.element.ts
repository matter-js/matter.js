/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    ClusterElement as Cluster,
    AttributeElement as Attribute,
    FieldElement as Field,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const MeterIdentification = Cluster(
    { name: "MeterIdentification", id: 0xb06, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "PWRTHLD", conformance: "O", constraint: "0", title: "PowerThreshold" })
    ),
    Attribute({ name: "MeterType", id: 0x0, type: "MeterTypeEnum", access: "R V", conformance: "M", quality: "X" }),
    Attribute({
        name: "PointOfDelivery", id: 0x1, type: "string", access: "R V", conformance: "M",
        constraint: "max 64", quality: "X"
    }),
    Attribute({
        name: "MeterSerialNumber", id: 0x2, type: "string", access: "R V", conformance: "M",
        constraint: "max 64", quality: "X"
    }),
    Attribute({
        name: "ProtocolVersion", id: 0x3, type: "string", access: "R V", conformance: "O",
        constraint: "max 64", quality: "X"
    }),
    Attribute({
        name: "PowerThreshold", id: 0x4, type: "PowerThresholdStruct", access: "R V",
        conformance: "PWRTHLD", quality: "X"
    }),

    Datatype(
        { name: "MeterTypeEnum", type: "enum8" },
        Field({ name: "Utility", id: 0x0, conformance: "M" }),
        Field({ name: "Private", id: 0x1, conformance: "M" }),
        Field({ name: "Generic", id: 0x2, conformance: "M" })
    )
);

MatterDefinition.children.push(MeterIdentification);
