/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const IceServerStruct = Datatype(
    { name: "ICEServerStruct", type: "struct" },
    Field(
        { name: "UrLs", id: 0x0, type: "list", conformance: "M", constraint: "max 10[max 2000]" },
        Field({ name: "entry", type: "string" })
    ),
    Field({ name: "Username", id: 0x1, type: "string", conformance: "O", constraint: "max 508" }),
    Field({ name: "Credential", id: 0x2, type: "string", conformance: "O", constraint: "max 512" }),
    Field({ name: "Caid", id: 0x3, type: "TlsCertificateManagement.TLSCAID", conformance: "O", constraint: "0 to 65534" })
);

MatterDefinition.children.push(IceServerStruct);
