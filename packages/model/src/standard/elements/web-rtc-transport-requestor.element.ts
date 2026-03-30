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
    CommandElement as Command
} from "../../elements/index.js";

export const WebRtcTransportRequestor = Cluster(
    { name: "WebRtcTransportRequestor", id: 0x554, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),
    Attribute(
        { name: "CurrentSessions", id: 0x0, type: "list", access: "R S A", conformance: "M" },
        Field({ name: "entry", type: "WebRtcTransportDefinitions.WebRTCSessionStruct" })
    ),

    Command(
        {
            name: "Offer", id: 0x0, access: "O", conformance: "M", direction: "request", quality: "L",
            response: "status"
        },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRtcTransportDefinitions.WebRTCSessionID", conformance: "M" }),
        Field({ name: "Sdp", id: 0x1, type: "string", conformance: "M" }),
        Field(
            { name: "IceServers", id: 0x2, type: "list", conformance: "O", constraint: "max 10" },
            Field({ name: "entry", type: "WebRtcTransportDefinitions.ICEServerStruct" })
        ),
        Field({ name: "IceTransportPolicy", id: 0x3, type: "string", conformance: "O", constraint: "max 16" })
    ),

    Command(
        {
            name: "Answer", id: 0x1, access: "O", conformance: "M", direction: "request", quality: "L",
            response: "status"
        },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRtcTransportDefinitions.WebRTCSessionID", conformance: "M" }),
        Field({ name: "Sdp", id: 0x1, type: "string", conformance: "M" })
    ),

    Command(
        {
            name: "IceCandidates", id: 0x2, access: "O", conformance: "M", direction: "request", quality: "L",
            response: "status"
        },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRtcTransportDefinitions.WebRTCSessionID", conformance: "M" }),
        Field(
            { name: "IceCandidates", id: 0x1, type: "list", conformance: "M", constraint: "min 1" },
            Field({ name: "entry", type: "WebRtcTransportDefinitions.ICECandidateStruct" })
        )
    ),

    Command(
        { name: "End", id: 0x3, access: "O", conformance: "M", direction: "request", quality: "L", response: "status" },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRtcTransportDefinitions.WebRTCSessionID", conformance: "M" }),
        Field({ name: "Reason", id: 0x1, type: "WebRtcTransportDefinitions.WebRTCEndReasonEnum", conformance: "M" })
    )
);

MatterDefinition.children.push(WebRtcTransportRequestor);
