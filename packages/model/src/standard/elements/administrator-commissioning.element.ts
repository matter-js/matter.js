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
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const AdministratorCommissioning = Cluster(
    { name: "AdministratorCommissioning", id: 0x3c, classification: "node" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "BC", constraint: "0", title: "Basic" })
    ),
    Attribute({ name: "WindowStatus", id: 0x0, type: "CommissioningWindowStatusEnum", access: "R V", conformance: "M" }),
    Attribute({ name: "AdminFabricIndex", id: 0x1, type: "fabric-idx", access: "R V", conformance: "M", quality: "X" }),
    Attribute({ name: "AdminVendorId", id: 0x2, type: "vendor-id", access: "R V", conformance: "M", quality: "X" }),

    Command(
        {
            name: "OpenCommissioningWindow", id: 0x0, access: "A T", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "CommissioningTimeout", id: 0x0, type: "uint16", conformance: "M", constraint: "desc" }),
        Field({ name: "PakePasscodeVerifier", id: 0x1, type: "octstr", conformance: "M", constraint: "97" }),
        Field({ name: "Discriminator", id: 0x2, type: "uint16", conformance: "M", constraint: "0 to 4095" }),
        Field({ name: "Iterations", id: 0x3, type: "uint32", conformance: "M", constraint: "1000 to 100000" }),
        Field({ name: "Salt", id: 0x4, type: "octstr", conformance: "M", constraint: "16 to 32" })
    ),

    Command(
        {
            name: "OpenBasicCommissioningWindow", id: 0x1, access: "A T", conformance: "BC",
            direction: "request", response: "status"
        },
        Field({ name: "CommissioningTimeout", id: 0x0, type: "uint16", conformance: "M", constraint: "desc" })
    ),

    Command({ name: "RevokeCommissioning", id: 0x2, access: "A T", conformance: "M", direction: "request", response: "status" }),

    Datatype(
        { name: "CommissioningWindowStatusEnum", type: "enum8" },
        Field({ name: "WindowNotOpen", id: 0x0, conformance: "M" }),
        Field({ name: "EnhancedWindowOpen", id: 0x1, conformance: "M" }),
        Field({ name: "BasicWindowOpen", id: 0x2, conformance: "BC" })
    ),

    Datatype(
        { name: "StatusCodeEnum", type: "enum8" },
        Field({ name: "Busy", id: 0x2, conformance: "M" }),
        Field({ name: "PakeParameterError", id: 0x3, conformance: "M" }),
        Field({ name: "WindowNotOpen", id: 0x4, conformance: "M" })
    )
);

MatterDefinition.children.push(AdministratorCommissioning);
