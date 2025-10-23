/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const status = Datatype(
    { name: "status", type: "enum8", isSeed: true, metatype: "enum" },
    Field({ name: "Success", id: 0x0 }),
    Field({ name: "Failure", id: 0x1 }),
    Field({ name: "InvalidSubscription", id: 0x7d }),
    Field({ name: "UnsupportedAccess", id: 0x7e }),
    Field({ name: "UnsupportedEndpoint", id: 0x7f }),
    Field({ name: "InvalidAction", id: 0x80 }),
    Field({ name: "UnsupportedCommand", id: 0x81 }),
    Field({ name: "InvalidCommand", id: 0x85 }),
    Field({ name: "UnsupportedAttribute", id: 0x86 }),
    Field({ name: "ConstraintError", id: 0x87 }),
    Field({ name: "UnsupportedWrite", id: 0x88 }),
    Field({ name: "ResourceExhausted", id: 0x89 }),
    Field({ name: "NotFound", id: 0x8b }),
    Field({ name: "UnreportableAttribute", id: 0x8c }),
    Field({ name: "InvalidDataType", id: 0x8d }),
    Field({ name: "UnsupportedRead", id: 0x8f }),
    Field({ name: "DataVersionMismatch", id: 0x92 }),
    Field({ name: "Timeout", id: 0x94 }),
    Field({ name: "UnsupportedNode", id: 0x9b }),
    Field({ name: "Busy", id: 0x9c }),
    Field({ name: "AccessRestricted", id: 0x9d }),
    Field({ name: "UnsupportedCluster", id: 0xc3 }),
    Field({ name: "NoUpstreamSubscription", id: 0xc5 }),
    Field({ name: "NeedsTimedInteraction", id: 0xc6 }),
    Field({ name: "UnsupportedEvent", id: 0xc7 }),
    Field({ name: "PathsExhausted", id: 0xc8 }),
    Field({ name: "TimedRequestMismatch", id: 0xc9 }),
    Field({ name: "FailsafeRequired", id: 0xca }),
    Field({ name: "InvalidInState", id: 0xcb }),
    Field({ name: "NoCommandResponse", id: 0xcc }),
    Field({ name: "TermsAndConditionsChanged", id: 0xcd }),
    Field({ name: "MaintenanceRequired", id: 0xce }),
    Field({ name: "DynamicConstraintError", id: 0xcf }),
    Field({ name: "AlreadyExists", id: 0xd0 }),
    Field({ name: "InvalidTransportType", id: 0xd1 })
);

MatterDefinition.children.push(status);
