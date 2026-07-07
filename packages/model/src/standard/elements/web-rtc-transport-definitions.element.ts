/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { ClusterElement as Cluster, DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const WebRtcTransportDefinitions = Cluster(
    { name: "WebRtcTransportDefinitions" },
    Datatype({ name: "WebRTCSessionID", type: "uint16" }),

    Datatype(
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
    ),

    Datatype(
        { name: "ICEServerStruct", type: "struct" },
        Field(
            { name: "UrLs", id: 0x0, type: "list", conformance: "M", constraint: "max 10[max 2000]" },
            Field({ name: "entry", type: "string" })
        ),
        Field({ name: "Username", id: 0x1, type: "string", conformance: "O", constraint: "max 508" }),
        Field({ name: "Credential", id: 0x2, type: "string", conformance: "O", constraint: "max 512" }),
        Field({ name: "Caid", id: 0x3, type: "TlsCertificateManagement.TLSCAID", conformance: "O", constraint: "0 to 65534" })
    ),

    Datatype(
        { name: "ICECandidateStruct", type: "struct" },
        Field({ name: "Candidate", id: 0x0, type: "string", conformance: "M" }),
        Field({ name: "SdpMid", id: 0x1, type: "string", conformance: "M", constraint: "min 1", quality: "X" }),
        Field({ name: "SdpmLineIndex", id: 0x2, type: "uint16", conformance: "M", quality: "X" })
    ),

    Datatype(
        { name: "WebRTCSessionStruct", type: "struct" },
        Field({ name: "Id", id: 0x0, type: "WebRTCSessionID", access: "F", conformance: "M" }),
        Field({ name: "PeerNodeId", id: 0x1, type: "node-id", access: "F", conformance: "M" }),
        Field({ name: "PeerEndpointId", id: 0x2, type: "endpoint-no", access: "F", conformance: "M" }),
        Field({ name: "StreamUsage", id: 0x3, type: "StreamUsageEnum", access: "F", conformance: "M" }),
        Field({
            name: "VideoStreamId", id: 0x4, type: "CameraAvStreamManagement.VideoStreamID", access: "F",
            conformance: "O, D", quality: "X"
        }),
        Field({
            name: "AudioStreamId", id: 0x5, type: "CameraAvStreamManagement.AudioStreamID", access: "F",
            conformance: "O, D", quality: "X"
        }),
        Field({ name: "MetadataEnabled", id: 0x6, type: "bool", access: "F", conformance: "M" }),
        Field(
            { name: "VideoStreams", id: 0x7, type: "list", access: "F", conformance: "O.a+", constraint: "1 to 16" },
            Field({ name: "entry", type: "CameraAvStreamManagement.VideoStreamID" })
        ),
        Field(
            { name: "AudioStreams", id: 0x8, type: "list", access: "F", conformance: "O.a+", constraint: "1 to 16" },
            Field({ name: "entry", type: "CameraAvStreamManagement.AudioStreamID" })
        ),
        Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
    )
);

MatterDefinition.children.push(WebRtcTransportDefinitions);
