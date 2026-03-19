/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DatatypeElement as Datatype, FieldElement as Field } from "../../elements/index.js";

export const WebRtcSessionStruct = Datatype(
    { name: "WebRTCSessionStruct", type: "struct" },
    Field({ name: "Id", id: 0x0, type: "WebRTCSessionID", access: "F", conformance: "M" }),
    Field({ name: "PeerNodeId", id: 0x1, type: "node-id", access: "F", conformance: "M" }),
    Field({ name: "PeerEndpointId", id: 0x2, type: "endpoint-no", access: "F", conformance: "M" }),
    Field({ name: "StreamUsage", id: 0x3, type: "StreamUsageEnum", access: "F", conformance: "M" }),
    Field({
        name: "VideoStreamId", id: 0x4, type: "CameraAvStreamManagement.VideoStreamID", access: "F",
        conformance: "M", quality: "X"
    }),
    Field({
        name: "AudioStreamId", id: 0x5, type: "CameraAvStreamManagement.AudioStreamID", access: "F",
        conformance: "M", quality: "X"
    }),
    Field({ name: "MetadataEnabled", id: 0x6, type: "bool", access: "F", conformance: "M" }),
    Field({ name: "FabricIndex", id: 0xfe, type: "FabricIndex" })
);

MatterDefinition.children.push(WebRtcSessionStruct);
