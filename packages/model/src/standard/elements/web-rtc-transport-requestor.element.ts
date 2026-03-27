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
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const WebRtcTransportRequestor = Cluster(
    { name: "WebRtcTransportRequestor", id: 0x554, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "CurrentSessions", id: 0x0, type: "list", access: "R S A", conformance: "M" },
        Field({ name: "entry", type: "WebRTCSessionStruct" })
    ),

    Command(
        {
            name: "Offer", id: 0x0, access: "O", conformance: "M", direction: "request", quality: "L",
            response: "status"
        },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRTCSessionID", conformance: "M" }),
        Field({ name: "Sdp", id: 0x1, type: "string", conformance: "M" }),
        Field(
            { name: "IceServers", id: 0x2, type: "list", conformance: "O", constraint: "max 10" },
            Field({ name: "entry", type: "ICEServerStruct" })
        ),
        Field({ name: "IceTransportPolicy", id: 0x3, type: "string", conformance: "O", constraint: "max 16" })
    ),

    Command(
        {
            name: "Answer", id: 0x1, access: "O", conformance: "M", direction: "request", quality: "L",
            response: "status"
        },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRTCSessionID", conformance: "M" }),
        Field({ name: "Sdp", id: 0x1, type: "string", conformance: "M" })
    ),

    Command(
        {
            name: "IceCandidates", id: 0x2, access: "O", conformance: "M", direction: "request", quality: "L",
            response: "status"
        },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRTCSessionID", conformance: "M" }),
        Field(
            { name: "IceCandidates", id: 0x1, type: "list", conformance: "M", constraint: "min 1" },
            Field({ name: "entry", type: "ICECandidateStruct" })
        )
    ),

    Command(
        { name: "End", id: 0x3, access: "O", conformance: "M", direction: "request", quality: "L", response: "status" },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRTCSessionID", conformance: "M" }),
        Field({ name: "Reason", id: 0x1, type: "WebRTCEndReasonEnum", conformance: "M" })
    ),
    Datatype({ name: "WebRTCSessionID", type: "uint16" }),

    Datatype(
        { name: "WebRTCEndReasonEnum", type: "enum8" },
        Field({ name: "IceFailed", id: 0x0 }),
        Field({ name: "IceTimeout", id: 0x1 }),
        Field({ name: "UserHangup", id: 0x2 }),
        Field({ name: "PeerHangup", id: 0x3 }),
        Field({ name: "Busy", id: 0x4 }),
        Field({ name: "TimedOut", id: 0x5 }),
        Field({ name: "InternalError", id: 0x6 })
    ),

    Datatype(
        { name: "ICECandidateStruct", type: "struct" },
        Field({ name: "Candidate", id: 0x0, type: "string" }),
        Field({ name: "SdpMid", id: 0x1, type: "string", quality: "X" }),
        Field({ name: "SdpMLineIndex", id: 0x2, type: "uint16", quality: "X" })
    ),

    Datatype(
        { name: "WebRTCSessionStruct", type: "struct" },
        Field({ name: "VideoStreamId", id: 0x4, type: "CameraAvStreamManagement.VideoStreamID" }),
        Field({ name: "AudioStreamId", id: 0x5, type: "CameraAvStreamManagement.AudioStreamID" })
    ),
    Datatype(
        { name: "ICEServerStruct", type: "struct" },
        Field({ name: "Caid", id: 0x3, type: "TlsCertificateManagement.TLSCAID" })
    )
);

MatterDefinition.children.push(WebRtcTransportRequestor);
