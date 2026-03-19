/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const WebRtcEndReasonEnum = Datatype(
    { name: "WebRTCEndReasonEnum", type: "enum8" },
    Field({ name: "IceFailed", id: 0x0, conformance: "M" }),
    Field({ name: "IceTimeout", id: 0x1, conformance: "M" }),
    Field({ name: "UserHangup", id: 0x2, conformance: "M" }),
    Field({ name: "UserBusy", id: 0x3, conformance: "M" }),
    Field({ name: "Replaced", id: 0x4, conformance: "M" }),
    Field({ name: "NoUserMedia", id: 0x5, conformance: "M" }),
    Field({ name: "InviteTimeout", id: 0x6, conformance: "M" }),
    Field({ name: "AnsweredElsewhere", id: 0x7, conformance: "M" }),
    Field({ name: "OutOfResources", id: 0x8, conformance: "M" }),
    Field({ name: "MediaTimeout", id: 0x9, conformance: "M" }),
    Field({ name: "LowPower", id: 0xa, conformance: "M" }),
    Field({ name: "PrivacyMode", id: 0xb, conformance: "M" }),
    Field({ name: "UnknownReason", id: 0xc, conformance: "M" })
);

MatterDefinition.children.push(WebRtcEndReasonEnum);
