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
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const EcosystemInformation = Cluster(
    { name: "EcosystemInformation", id: 0x750 },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "DeviceDirectory", id: 0x0, type: "list", access: "R F M", conformance: "M", quality: "N" },
        Field({ name: "entry", type: "EcosystemDeviceStruct" })
    ),
    Attribute(
        { name: "LocationDirectory", id: 0x1, type: "list", access: "R F M", conformance: "M", quality: "N" },
        Field({ name: "entry", type: "EcosystemLocationStruct" })
    ),
    Datatype(
        { name: "DeviceTypeStruct", type: "struct" },
        Field({ name: "DeviceType", id: 0x0, type: "devtype-id", conformance: "M" }),
        Field({ name: "Revision", id: 0x1, type: "uint16", conformance: "M", constraint: "min 1" })
    ),

    Datatype(
        { name: "EcosystemDeviceStruct", type: "struct" },
        Field({ name: "DeviceName", id: 0x0, type: "string", access: "S", conformance: "O", constraint: "max 64" }),
        Field({ name: "DeviceNameLastEdit", id: 0x1, type: "epoch-us", access: "S", conformance: "DeviceName", default: 0 }),
        Field({ name: "BridgedEndpoint", id: 0x2, type: "endpoint-no", access: "S", conformance: "desc", constraint: "desc" }),
        Field({
            name: "OriginalEndpoint", id: 0x3, type: "endpoint-no", access: "S", conformance: "desc",
            constraint: "desc"
        }),
        Field(
            { name: "DeviceTypes", id: 0x4, type: "list", access: "S", conformance: "M", constraint: "desc" },
            Field({ name: "entry", type: "DeviceTypeStruct" })
        ),

        Field(
            {
                name: "UniqueLocationIDs", id: 0x5, type: "list", access: "S", conformance: "M",
                constraint: "max 64[max 64]"
            },
            Field({ name: "entry", type: "string" })
        ),

        Field({ name: "UniqueLocationIDsLastEdit", id: 0x6, type: "epoch-us", access: "S", conformance: "M", default: 0 }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    ),

    Datatype(
        { name: "EcosystemLocationStruct", type: "struct" },
        Field({ name: "UniqueLocationId", id: 0x0, type: "string", access: "S", conformance: "M", constraint: "max 64" }),
        Field({ name: "LocationDescriptor", id: 0x1, type: "locationdesc", access: "S", conformance: "M" }),
        Field({ name: "LocationDescriptorLastEdit", id: 0x2, type: "epoch-us", access: "S", conformance: "M", default: 0 }),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    )
);

MatterDefinition.children.push(EcosystemInformation);
