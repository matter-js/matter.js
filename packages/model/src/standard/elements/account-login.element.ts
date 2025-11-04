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
    EventElement as Event,
    FieldElement as Field,
    CommandElement as Command
} from "../../elements/index.js";

export const AccountLogin = Cluster(
    { name: "AccountLogin", id: 0x50e, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Event(
        { name: "LoggedOut", id: 0x0, access: "S A", conformance: "O", priority: "critical" },
        Field({ name: "Node", id: 0x0, type: "node-id", conformance: "O" })
    ),

    Command(
        {
            name: "GetSetupPin", id: 0x0, access: "F A T", conformance: "M", direction: "request",
            response: "GetSetupPinResponse"
        },
        Field({ name: "TempAccountIdentifier", id: 0x0, type: "string", conformance: "M", constraint: "16 to 100" })
    ),

    Command(
        { name: "GetSetupPinResponse", id: 0x1, access: "F", conformance: "M", direction: "response" },
        Field({ name: "SetupPin", id: 0x0, type: "string", conformance: "M", constraint: "desc" })
    ),

    Command(
        { name: "Login", id: 0x2, access: "F A T", conformance: "M", direction: "request", response: "status" },
        Field({ name: "TempAccountIdentifier", id: 0x0, type: "string", conformance: "M", constraint: "16 to 100" }),
        Field({ name: "SetupPin", id: 0x1, type: "string", conformance: "M", constraint: "min 8" }),
        Field({ name: "Node", id: 0x2, type: "node-id", conformance: "O" })
    ),

    Command(
        { name: "Logout", id: 0x3, access: "F O T", conformance: "M", direction: "request", response: "status" },
        Field({ name: "Node", id: 0x0, type: "node-id", conformance: "O" })
    )
);

MatterDefinition.children.push(AccountLogin);
