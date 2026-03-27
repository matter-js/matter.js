/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

// Shared datatypes from §11.4 (WebRTC Transport common section) are not cluster-scoped in the spec.
// We declare them per-cluster since the spec common section has no cluster ID.
// Also fix cross-cluster type references in WebRTCSessionStruct and ICEServerStruct.
LocalMatter.children.push({
    tag: "cluster",
    name: "WebRtcTransportRequestor",
    asOf: "1.5",

    children: [
        { tag: "datatype", name: "WebRTCSessionID", type: "uint16" },
        {
            tag: "datatype",
            name: "WebRTCEndReasonEnum",
            type: "enum8",
            children: [
                { tag: "field", id: 0x0, name: "IceFailed" },
                { tag: "field", id: 0x1, name: "IceTimeout" },
                { tag: "field", id: 0x2, name: "UserHangup" },
                { tag: "field", id: 0x3, name: "PeerHangup" },
                { tag: "field", id: 0x4, name: "Busy" },
                { tag: "field", id: 0x5, name: "TimedOut" },
                { tag: "field", id: 0x6, name: "InternalError" },
            ],
        },
        {
            tag: "datatype",
            name: "ICECandidateStruct",
            type: "struct",
            children: [
                { tag: "field", id: 0x0, name: "Candidate", type: "string" },
                { tag: "field", id: 0x1, name: "SdpMid", type: "string", quality: "X" },
                { tag: "field", id: 0x2, name: "SdpMLineIndex", type: "uint16", quality: "X" },
            ],
        },
        {
            tag: "datatype",
            name: "WebRTCSessionStruct",
            type: "struct",
            children: [
                { tag: "field", id: 0x4, name: "VideoStreamId", type: "CameraAvStreamManagement.VideoStreamID" },
                { tag: "field", id: 0x5, name: "AudioStreamId", type: "CameraAvStreamManagement.AudioStreamID" },
            ],
        },
        {
            tag: "datatype",
            name: "ICEServerStruct",
            type: "struct",
            children: [{ tag: "field", id: 0x3, name: "Caid", type: "TlsCertificateManagement.TLSCAID" }],
        },
    ],
});
