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

export const WebRtcTransportProvider = Cluster(
    { name: "WebRtcTransportProvider", id: 0x553, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),
    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "METADATA", conformance: "P, O", constraint: "0", title: "Metadata" })
    ),
    Attribute(
        { name: "CurrentSessions", id: 0x0, type: "list", access: "R S M", conformance: "M" },
        Field({ name: "entry", type: "WebRTCSessionStruct" })
    ),

    Command(
        {
            name: "SolicitOffer", id: 0x0, access: "F O", conformance: "M", direction: "request", quality: "L",
            response: "SolicitOfferResponse"
        },
        Field({ name: "StreamUsage", id: 0x0, type: "StreamUsageEnum", conformance: "M" }),
        Field({ name: "OriginatingEndpointId", id: 0x1, type: "endpoint-no", conformance: "M" }),
        Field({
            name: "VideoStreamId", id: 0x2, type: "CameraAvStreamManagement.VideoStreamID", conformance: "O.a+",
            quality: "X"
        }),
        Field({
            name: "AudioStreamId", id: 0x3, type: "CameraAvStreamManagement.AudioStreamID", conformance: "O.a+",
            quality: "X"
        }),
        Field(
            { name: "IceServers", id: 0x4, type: "list", conformance: "O", constraint: "max 10" },
            Field({ name: "entry", type: "ICEServerStruct" })
        ),
        Field({ name: "IceTransportPolicy", id: 0x5, type: "string", conformance: "O", constraint: "max 16" }),
        Field({ name: "MetadataEnabled", id: 0x6, type: "bool", conformance: "METADATA" }),
        Field({ name: "SFrameConfig", id: 0x7, type: "SFrameStruct", conformance: "P, O" })
    ),

    Command(
        { name: "SolicitOfferResponse", id: 0x1, conformance: "M", direction: "response", quality: "L" },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRTCSessionID", conformance: "M" }),
        Field({ name: "DeferredOffer", id: 0x1, type: "bool", conformance: "M" }),
        Field({
            name: "VideoStreamId", id: 0x2, type: "CameraAvStreamManagement.VideoStreamID",
            conformance: "SolicitOffer.VideoStreamID", quality: "X"
        }),
        Field({
            name: "AudioStreamId", id: 0x3, type: "CameraAvStreamManagement.AudioStreamID",
            conformance: "SolicitOffer.AudioStreamID", quality: "X"
        })
    ),

    Command(
        {
            name: "ProvideOffer", id: 0x2, access: "F O", conformance: "M", direction: "request", quality: "L",
            response: "ProvideOfferResponse"
        },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRTCSessionID", conformance: "M", quality: "X" }),
        Field({ name: "Sdp", id: 0x1, type: "string", conformance: "M" }),
        Field({ name: "StreamUsage", id: 0x2, type: "StreamUsageEnum", conformance: "M" }),
        Field({ name: "OriginatingEndpointId", id: 0x3, type: "endpoint-no", conformance: "M" }),
        Field({
            name: "VideoStreamId", id: 0x4, type: "CameraAvStreamManagement.VideoStreamID", conformance: "O.c+",
            quality: "X"
        }),
        Field({
            name: "AudioStreamId", id: 0x5, type: "CameraAvStreamManagement.AudioStreamID", conformance: "O.c+",
            quality: "X"
        }),
        Field(
            { name: "IceServers", id: 0x6, type: "list", conformance: "O", constraint: "max 10" },
            Field({ name: "entry", type: "ICEServerStruct" })
        ),
        Field({ name: "IceTransportPolicy", id: 0x7, type: "string", conformance: "O", constraint: "max 16" }),
        Field({ name: "MetadataEnabled", id: 0x8, type: "bool", conformance: "METADATA" }),
        Field({ name: "SFrameConfig", id: 0x9, type: "SFrameStruct", conformance: "P, O" })
    ),

    Command(
        { name: "ProvideOfferResponse", id: 0x3, conformance: "M", direction: "response", quality: "L" },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRTCSessionID", conformance: "M" }),
        Field({
            name: "VideoStreamId", id: 0x1, type: "CameraAvStreamManagement.VideoStreamID",
            conformance: "ProvideOffer.VideoStreamID", quality: "X"
        }),
        Field({
            name: "AudioStreamId", id: 0x2, type: "CameraAvStreamManagement.AudioStreamID",
            conformance: "ProvideOffer.AudioStreamID", quality: "X"
        })
    ),

    Command(
        {
            name: "ProvideAnswer", id: 0x4, access: "F O", conformance: "M", direction: "request", quality: "L",
            response: "status"
        },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRTCSessionID", conformance: "M" }),
        Field({ name: "Sdp", id: 0x1, type: "string", conformance: "M" })
    ),

    Command(
        {
            name: "ProvideIceCandidates", id: 0x5, access: "F O", conformance: "M", direction: "request",
            quality: "L", response: "status"
        },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRTCSessionID", conformance: "M" }),
        Field(
            { name: "IceCandidates", id: 0x1, type: "list", conformance: "M", constraint: "min 1" },
            Field({ name: "entry", type: "ICECandidateStruct" })
        )
    ),

    Command(
        {
            name: "EndSession", id: 0x6, access: "F O", conformance: "M", direction: "request", quality: "L",
            response: "status"
        },
        Field({ name: "WebRtcSessionId", id: 0x0, type: "WebRTCSessionID", conformance: "M" }),
        Field({ name: "Reason", id: 0x1, type: "WebRTCEndReasonEnum", conformance: "M" })
    ),

    Datatype(
        { name: "SFrameStruct", type: "struct" },
        Field({ name: "CipherSuite", id: 0x0, type: "uint16", conformance: "M", constraint: "min 1" }),
        Field({ name: "BaseKey", id: 0x1, type: "octstr", conformance: "M", constraint: "max 128" }),
        Field({ name: "Kid", id: 0x2, type: "octstr", conformance: "M", constraint: "2 to 8" })
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

MatterDefinition.children.push(WebRtcTransportProvider);
