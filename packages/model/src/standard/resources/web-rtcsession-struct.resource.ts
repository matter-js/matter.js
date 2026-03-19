/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "WebRTCSessionStruct", xref: "cluster§11.4.5.5",
    details: "This type stores all the relevant values associated with an active WebRTC session." +
        "\n" +
        "This values of PeerNodeID and FabricIndex are used to validate the source of, or select the correct " +
        "remote target, for WebRTC session related commands. The implicit field FabricIndex exists since this " +
        "structure is defined as Fabric Scoped.",

    children: [
        {
            tag: "field", name: "Id", xref: "cluster§11.4.5.5.1",
            details: "This field contains the WebRTC Session ID for this session."
        },
        {
            tag: "field", name: "PeerNodeId", xref: "cluster§11.4.5.5.2",
            details: "This field contains the NodeId for the peer entity involved in this session."
        },
        {
            tag: "field", name: "PeerEndpointId", xref: "cluster§11.4.5.5.3",
            details: "This field contains the EndpointId for the peer entity involved in this session."
        },
        {
            tag: "field", name: "StreamUsage", xref: "cluster§11.4.5.5.4",
            details: "This field contains the StreamUsageEnum of this session."
        },
        {
            tag: "field", name: "VideoStreamId", xref: "cluster§11.4.5.5.5",
            details: "This field contains the VideoStreamIDType that is used by this session. A null value means no video " +
                "stream is currently associated with this session."
        },
        {
            tag: "field", name: "AudioStreamId", xref: "cluster§11.4.5.5.6",
            details: "This field contains the AudioStreamIDType that is used by this session. A null value means no audio " +
                "stream is currently associated with this session."
        },
        {
            tag: "field", name: "MetadataEnabled", xref: "cluster§11.4.5.5.7",
            details: "This field indicates if metadata is active in this session."
        }
    ]
});
