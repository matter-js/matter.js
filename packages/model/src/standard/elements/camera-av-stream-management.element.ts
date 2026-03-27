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

export const CameraAvStreamManagement = Cluster(
    { name: "CameraAvStreamManagement", id: 0x551, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "ADO", conformance: "O.a+", constraint: "0", title: "Audio" }),
        Field({ name: "VDO", conformance: "O.a+", constraint: "1", title: "Video" }),
        Field({ name: "SNP", conformance: "O.a+", constraint: "2", title: "Snapshot" }),
        Field({ name: "PRIV", conformance: "O", constraint: "3", title: "Privacy" }),
        Field({ name: "SPKR", conformance: "[ADO]", constraint: "4", title: "Speaker" }),
        Field({ name: "ICTL", conformance: "[VDO | SNP]", constraint: "5", title: "ImageControl" }),
        Field({ name: "WMARK", conformance: "[VDO | SNP]", constraint: "6", title: "Watermark" }),
        Field({ name: "OSD", conformance: "[VDO | SNP]", constraint: "7", title: "OnScreenDisplay" }),
        Field({ name: "STOR", conformance: "O", constraint: "8", title: "LocalStorage" }),
        Field({ name: "HDR", conformance: "[VDO | SNP]", constraint: "9", title: "HighDynamicRange" }),
        Field({ name: "NV", conformance: "[VDO | SNP]", constraint: "10", title: "NightVision" })
    ),

    Attribute({ name: "MaxConcurrentEncoders", id: 0x0, type: "uint8", access: "R V", conformance: "VDO | SNP", quality: "F" }),
    Attribute(
        { name: "MaxEncodedPixelRate", id: 0x1, type: "uint32", access: "R V", conformance: "VDO | SNP", quality: "F" }
    ),
    Attribute({
        name: "VideoSensorParams", id: 0x2, type: "VideoSensorParamsStruct", access: "R V",
        conformance: "VDO", quality: "F"
    }),
    Attribute({ name: "NightVisionUsesInfrared", id: 0x3, type: "bool", access: "R V", conformance: "NV", quality: "F" }),
    Attribute({
        name: "MinViewportResolution", id: 0x4, type: "VideoResolutionStruct", access: "R V",
        conformance: "VDO", quality: "F"
    }),

    Attribute(
        {
            name: "RateDistortionTradeOffPoints", id: 0x5, type: "list", access: "R V", conformance: "VDO",
            quality: "F"
        },
        Field({ name: "entry", type: "RateDistortionTradeOffPointsStruct" })
    ),

    Attribute({ name: "MaxContentBufferSize", id: 0x6, type: "uint32", access: "R V", conformance: "M", quality: "F" }),
    Attribute({
        name: "MicrophoneCapabilities", id: 0x7, type: "AudioCapabilitiesStruct", access: "R V",
        conformance: "ADO", quality: "F"
    }),
    Attribute({
        name: "SpeakerCapabilities", id: 0x8, type: "AudioCapabilitiesStruct", access: "R V",
        conformance: "SPKR", quality: "F"
    }),
    Attribute({
        name: "TwoWayTalkSupport", id: 0x9, type: "TwoWayTalkSupportTypeEnum", access: "R V",
        conformance: "SPKR", quality: "F"
    }),
    Attribute(
        { name: "SnapshotCapabilities", id: 0xa, type: "list", access: "R V", conformance: "SNP", quality: "F" },
        Field({ name: "entry", type: "SnapshotCapabilitiesStruct" })
    ),
    Attribute({ name: "MaxNetworkBandwidth", id: 0xb, type: "uint32", access: "R V", conformance: "M", quality: "F" }),
    Attribute({ name: "CurrentFrameRate", id: 0xc, type: "uint16", access: "R V", conformance: "VDO" }),
    Attribute({ name: "HdrModeEnabled", id: 0xd, type: "bool", access: "RW M", conformance: "HDR", quality: "N" }),
    Attribute(
        { name: "SupportedStreamUsages", id: 0xe, type: "list", access: "R V", conformance: "M", quality: "F" },
        Field({ name: "entry", type: "StreamUsageEnum" })
    ),
    Attribute(
        { name: "AllocatedVideoStreams", id: 0xf, type: "list", access: "R V", conformance: "VDO", quality: "N" },
        Field({ name: "entry", type: "VideoStreamStruct" })
    ),
    Attribute(
        { name: "AllocatedAudioStreams", id: 0x10, type: "list", access: "R V", conformance: "ADO", quality: "N" },
        Field({ name: "entry", type: "AudioStreamStruct" })
    ),
    Attribute(
        { name: "AllocatedSnapshotStreams", id: 0x11, type: "list", access: "R V", conformance: "SNP", quality: "N" },
        Field({ name: "entry", type: "SnapshotStreamStruct" })
    ),
    Attribute(
        { name: "StreamUsagePriorities", id: 0x12, type: "list", access: "R V", conformance: "M", quality: "N" },
        Field({ name: "entry", type: "StreamUsageEnum" })
    ),
    Attribute({
        name: "SoftRecordingPrivacyModeEnabled", id: 0x13, type: "bool", access: "RW VO",
        conformance: "PRIV", quality: "N"
    }),
    Attribute({
        name: "SoftLivestreamPrivacyModeEnabled", id: 0x14, type: "bool", access: "RW VO",
        conformance: "PRIV", quality: "N"
    }),
    Attribute({ name: "HardPrivacyModeOn", id: 0x15, type: "bool", access: "R V", conformance: "O", default: true }),
    Attribute({ name: "NightVision", id: 0x16, type: "TriStateAutoEnum", access: "RW M", conformance: "NV", quality: "N" }),
    Attribute({ name: "NightVisionIllum", id: 0x17, type: "TriStateAutoEnum", access: "RW M", conformance: "[NV]", quality: "N" }),
    Attribute({ name: "Viewport", id: 0x18, type: "ViewportStruct", access: "RW M", conformance: "VDO", quality: "N" }),
    Attribute({ name: "SpeakerMuted", id: 0x19, type: "bool", access: "RW M", conformance: "SPKR", quality: "N" }),
    Attribute({
        name: "SpeakerVolumeLevel", id: 0x1a, type: "uint8", access: "RW M", conformance: "SPKR",
        constraint: "speakerMinLevel to speakerMaxLevel", quality: "N"
    }),
    Attribute({
        name: "SpeakerMaxLevel", id: 0x1b, type: "uint8", access: "R M", conformance: "SPKR",
        constraint: "speakerMinLevel to 254"
    }),
    Attribute({
        name: "SpeakerMinLevel", id: 0x1c, type: "uint8", access: "R M", conformance: "SPKR",
        constraint: "max speakerMaxLevel"
    }),
    Attribute({ name: "MicrophoneMuted", id: 0x1d, type: "bool", access: "RW M", conformance: "ADO", quality: "N" }),
    Attribute({
        name: "MicrophoneVolumeLevel", id: 0x1e, type: "uint8", access: "RW M", conformance: "ADO",
        constraint: "microphoneMinLevel to microphoneMaxLevel", quality: "N"
    }),
    Attribute({
        name: "MicrophoneMaxLevel", id: 0x1f, type: "uint8", access: "R M", conformance: "ADO",
        constraint: "microphoneMinLevel to 254"
    }),
    Attribute({
        name: "MicrophoneMinLevel", id: 0x20, type: "uint8", access: "R M", conformance: "ADO",
        constraint: "max microphoneMaxLevel"
    }),
    Attribute({
        name: "MicrophoneAgcEnabled", id: 0x21, type: "bool", access: "RW M", conformance: "[ADO]",
        default: true, quality: "N"
    }),
    Attribute({
        name: "ImageRotation", id: 0x22, type: "uint16", access: "RW M", conformance: "[ICTL].b+",
        constraint: "max 359", quality: "N"
    }),
    Attribute({
        name: "ImageFlipHorizontal", id: 0x23, type: "bool", access: "RW M", conformance: "[ICTL].b+",
        default: true, quality: "N"
    }),
    Attribute({
        name: "ImageFlipVertical", id: 0x24, type: "bool", access: "RW M", conformance: "[ICTL].b+",
        default: true, quality: "N"
    }),
    Attribute({
        name: "LocalVideoRecordingEnabled", id: 0x25, type: "bool", access: "RW M",
        conformance: "VDO & STOR", quality: "N"
    }),
    Attribute({
        name: "LocalSnapshotRecordingEnabled", id: 0x26, type: "bool", access: "RW M",
        conformance: "SNP & STOR", quality: "N"
    }),
    Attribute({
        name: "StatusLightEnabled", id: 0x27, type: "bool", access: "RW M", conformance: "O", default: true,
        quality: "N"
    }),
    Attribute({
        name: "StatusLightBrightness", id: 0x28, type: "ThreeLevelAutoEnum", access: "RW M",
        conformance: "O", quality: "N"
    }),

    Command(
        {
            name: "AudioStreamAllocate", id: 0x0, access: "M", conformance: "ADO", direction: "request",
            response: "AudioStreamAllocateResponse"
        },
        Field({
            name: "StreamUsage", id: 0x0, type: "StreamUsageEnum", conformance: "M",
            constraint: "recording, analysis, liveView"
        }),
        Field({ name: "AudioCodec", id: 0x1, type: "AudioCodecEnum", conformance: "M" }),
        Field({ name: "ChannelCount", id: 0x2, type: "uint8", conformance: "M", constraint: "1 to 8" }),
        Field({ name: "SampleRate", id: 0x3, type: "uint32", conformance: "M", constraint: "min 1" }),
        Field({ name: "BitRate", id: 0x4, type: "uint32", conformance: "M", constraint: "min 1" }),
        Field({ name: "BitDepth", id: 0x5, type: "uint8", conformance: "M", constraint: "8, 16, 24, 32" })
    ),

    Command(
        { name: "AudioStreamAllocateResponse", id: 0x1, conformance: "ADO", direction: "response" },
        Field({ name: "AudioStreamId", id: 0x0, type: "AudioStreamID", conformance: "M" })
    ),

    Command(
        {
            name: "AudioStreamDeallocate", id: 0x2, access: "M", conformance: "ADO", direction: "request",
            response: "status"
        },
        Field({ name: "AudioStreamId", id: 0x0, type: "AudioStreamID", conformance: "M" })
    ),

    Command(
        {
            name: "VideoStreamAllocate", id: 0x3, access: "M", conformance: "VDO", direction: "request",
            response: "VideoStreamAllocateResponse"
        },
        Field({
            name: "StreamUsage", id: 0x0, type: "StreamUsageEnum", conformance: "M",
            constraint: "recording, analysis, liveView"
        }),
        Field({ name: "VideoCodec", id: 0x1, type: "VideoCodecEnum", conformance: "M" }),
        Field({ name: "MinFrameRate", id: 0x2, type: "uint16", conformance: "M", constraint: "1 to maxFrameRate" }),
        Field({ name: "MaxFrameRate", id: 0x3, type: "uint16", conformance: "M", constraint: "min 1" }),
        Field({ name: "MinResolution", id: 0x4, type: "VideoResolutionStruct", conformance: "M" }),
        Field({ name: "MaxResolution", id: 0x5, type: "VideoResolutionStruct", conformance: "M" }),
        Field({ name: "MinBitRate", id: 0x6, type: "uint32", conformance: "M", constraint: "1 to maxBitRate" }),
        Field({ name: "MaxBitRate", id: 0x7, type: "uint32", conformance: "M", constraint: "min 1" }),
        Field({ name: "KeyFrameInterval", id: 0x8, type: "uint16", conformance: "M", constraint: "0 to 65500" }),
        Field({ name: "WatermarkEnabled", id: 0x9, type: "bool", conformance: "WMARK" }),
        Field({ name: "OsdEnabled", id: 0xa, type: "bool", conformance: "OSD" })
    ),

    Command(
        { name: "VideoStreamAllocateResponse", id: 0x4, conformance: "VDO", direction: "response" },
        Field({ name: "VideoStreamId", id: 0x0, type: "VideoStreamID", conformance: "M" })
    ),

    Command(
        {
            name: "VideoStreamModify", id: 0x5, access: "M", conformance: "VDO & (WMARK | OSD)",
            direction: "request", response: "status"
        },
        Field({ name: "VideoStreamId", id: 0x0, type: "VideoStreamID", conformance: "M" }),
        Field({ name: "WatermarkEnabled", id: 0x1, type: "bool", conformance: "[WMARK].d+" }),
        Field({ name: "OsdEnabled", id: 0x2, type: "bool", conformance: "[OSD].d+" })
    ),

    Command(
        {
            name: "VideoStreamDeallocate", id: 0x6, access: "M", conformance: "VDO", direction: "request",
            response: "status"
        },
        Field({ name: "VideoStreamId", id: 0x0, type: "VideoStreamID", conformance: "M" })
    ),

    Command(
        {
            name: "SnapshotStreamAllocate", id: 0x7, access: "M", conformance: "SNP", direction: "request",
            response: "SnapshotStreamAllocateResponse"
        },
        Field({ name: "ImageCodec", id: 0x0, type: "ImageCodecEnum", conformance: "M" }),
        Field({ name: "MaxFrameRate", id: 0x1, type: "uint16", conformance: "M", constraint: "min 1" }),
        Field({ name: "MinResolution", id: 0x2, type: "VideoResolutionStruct", conformance: "M" }),
        Field({ name: "MaxResolution", id: 0x3, type: "VideoResolutionStruct", conformance: "M" }),
        Field({ name: "Quality", id: 0x4, type: "uint8", conformance: "M", constraint: "1 to 100" }),
        Field({ name: "WatermarkEnabled", id: 0x5, type: "bool", conformance: "WMARK" }),
        Field({ name: "OsdEnabled", id: 0x6, type: "bool", conformance: "OSD" })
    ),

    Command(
        { name: "SnapshotStreamAllocateResponse", id: 0x8, conformance: "SNP", direction: "response" },
        Field({ name: "SnapshotStreamId", id: 0x0, type: "SnapshotStreamID", conformance: "M" })
    ),

    Command(
        {
            name: "SnapshotStreamModify", id: 0x9, access: "M", conformance: "SNP & (WMARK | OSD)",
            direction: "request", response: "status"
        },
        Field({ name: "SnapshotStreamId", id: 0x0, type: "SnapshotStreamID", conformance: "M" }),
        Field({ name: "WatermarkEnabled", id: 0x1, type: "bool", conformance: "[WMARK].d+" }),
        Field({ name: "OsdEnabled", id: 0x2, type: "bool", conformance: "[OSD].d+" })
    ),

    Command(
        {
            name: "SnapshotStreamDeallocate", id: 0xa, access: "M", conformance: "SNP", direction: "request",
            response: "status"
        },
        Field({ name: "SnapshotStreamId", id: 0x0, type: "SnapshotStreamID", conformance: "M" })
    ),

    Command(
        {
            name: "SetStreamPriorities", id: 0xb, access: "A", conformance: "M", direction: "request",
            response: "status"
        },
        Field(
            { name: "StreamPriorities", id: 0x0, type: "list", conformance: "M", constraint: "desc" },
            Field({ name: "entry", type: "StreamUsageEnum" })
        )
    ),

    Command(
        {
            name: "CaptureSnapshot", id: 0xc, access: "O", conformance: "SNP", direction: "request",
            quality: "L", response: "CaptureSnapshotResponse"
        },
        Field({ name: "SnapshotStreamId", id: 0x0, type: "SnapshotStreamID", conformance: "M", quality: "X" }),
        Field({ name: "RequestedResolution", id: 0x1, type: "VideoResolutionStruct", conformance: "M" })
    ),

    Command(
        { name: "CaptureSnapshotResponse", id: 0xd, conformance: "SNP", direction: "response", quality: "L" },
        Field({ name: "Data", id: 0x0, type: "octstr", conformance: "M" }),
        Field({ name: "ImageCodec", id: 0x1, type: "ImageCodecEnum", conformance: "M" }),
        Field({ name: "Resolution", id: 0x2, type: "VideoResolutionStruct", conformance: "M" })
    ),

    Datatype(
        { name: "VideoCodecEnum", type: "enum8" },
        Field({ name: "H264", id: 0x0, conformance: "M" }),
        Field({ name: "Hevc", id: 0x1, conformance: "O" }),
        Field({ name: "Vvc", id: 0x2, conformance: "O" }),
        Field({ name: "Av1", id: 0x3, conformance: "O" })
    ),

    Datatype(
        { name: "AudioCodecEnum", type: "enum8" },
        Field({ name: "Opus", id: 0x0, conformance: "M" }),
        Field({ name: "AacLc", id: 0x1, conformance: "O" })
    ),
    Datatype({ name: "ImageCodecEnum", type: "enum8" }, Field({ name: "Jpeg", id: 0x0, conformance: "M" })),

    Datatype(
        { name: "TwoWayTalkSupportTypeEnum", type: "enum8" },
        Field({ name: "NotSupported", id: 0x0, conformance: "M" }),
        Field({ name: "HalfDuplex", id: 0x1, conformance: "M" }),
        Field({ name: "FullDuplex", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "TriStateAutoEnum", type: "enum8" },
        Field({ name: "Off", id: 0x0, conformance: "M" }),
        Field({ name: "On", id: 0x1, conformance: "M" }),
        Field({ name: "Auto", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "VideoSensorParamsStruct", type: "struct" },
        Field({ name: "SensorWidth", id: 0x0, type: "uint16", conformance: "M", constraint: "min 64" }),
        Field({ name: "SensorHeight", id: 0x1, type: "uint16", conformance: "M", constraint: "min 64" }),
        Field({ name: "MaxFps", id: 0x2, type: "uint16", conformance: "M", constraint: "min 1" }),
        Field({ name: "MaxHdrfps", id: 0x3, type: "uint16", conformance: "HDR", constraint: "1 to maxFps" })
    ),

    Datatype(
        { name: "VideoResolutionStruct", type: "struct" },
        Field({ name: "Width", id: 0x0, type: "uint16", conformance: "M", constraint: "min 1" }),
        Field({ name: "Height", id: 0x1, type: "uint16", conformance: "M", constraint: "min 1" })
    ),

    Datatype(
        { name: "RateDistortionTradeOffPointsStruct", type: "struct" },
        Field({ name: "Codec", id: 0x0, type: "VideoCodecEnum", conformance: "M" }),
        Field({ name: "Resolution", id: 0x1, type: "VideoResolutionStruct", conformance: "M" }),
        Field({ name: "MinBitRate", id: 0x2, type: "uint32", conformance: "M", constraint: "min 1" })
    ),

    Datatype(
        { name: "SnapshotCapabilitiesStruct", type: "struct" },
        Field({ name: "Resolution", id: 0x0, type: "VideoResolutionStruct", conformance: "M" }),
        Field({ name: "MaxFrameRate", id: 0x1, type: "uint16", conformance: "M", constraint: "min 1" }),
        Field({ name: "ImageCodec", id: 0x2, type: "ImageCodecEnum", conformance: "M" }),
        Field({ name: "RequiresEncodedPixels", id: 0x3, type: "bool", conformance: "M" }),
        Field({ name: "RequiresHardwareEncoder", id: 0x4, type: "bool", conformance: "RequiresEncodedPixels == true" })
    ),

    Datatype(
        { name: "AudioCapabilitiesStruct", type: "struct" },
        Field({ name: "MaxNumberOfChannels", id: 0x0, type: "uint8", conformance: "M", constraint: "min 1" }),
        Field(
            { name: "SupportedCodecs", id: 0x1, type: "list", conformance: "M", constraint: "min 1" },
            Field({ name: "entry", type: "AudioCodecEnum" })
        ),
        Field(
            { name: "SupportedSampleRates", id: 0x2, type: "list", conformance: "M", constraint: "min 1" },
            Field({ name: "entry", type: "uint32" })
        ),
        Field(
            { name: "SupportedBitDepths", id: 0x3, type: "list", conformance: "M", constraint: "min 1" },
            Field({ name: "entry", type: "uint8" })
        )
    ),

    Datatype(
        { name: "VideoStreamStruct", type: "struct" },
        Field({ name: "VideoStreamId", id: 0x0, type: "VideoStreamID", conformance: "M" }),
        Field({ name: "StreamUsage", id: 0x1, type: "StreamUsageEnum", conformance: "M" }),
        Field({ name: "VideoCodec", id: 0x2, type: "VideoCodecEnum", conformance: "M" }),
        Field({ name: "MinFrameRate", id: 0x3, type: "uint16", conformance: "M", constraint: "1 to maxFrameRate" }),
        Field({ name: "MaxFrameRate", id: 0x4, type: "uint16", conformance: "M", constraint: "min 1" }),
        Field({ name: "MinResolution", id: 0x5, type: "VideoResolutionStruct", conformance: "M" }),
        Field({ name: "MaxResolution", id: 0x6, type: "VideoResolutionStruct", conformance: "M" }),
        Field({ name: "MinBitRate", id: 0x7, type: "uint32", conformance: "M", constraint: "1 to maxBitRate" }),
        Field({ name: "MaxBitRate", id: 0x8, type: "uint32", conformance: "M", constraint: "min 1" }),
        Field({ name: "KeyFrameInterval", id: 0x9, type: "uint16", conformance: "M", constraint: "0 to 65500" }),
        Field({ name: "WatermarkEnabled", id: 0xa, type: "bool", conformance: "WMARK", default: true }),
        Field({ name: "OsdEnabled", id: 0xb, type: "bool", conformance: "OSD", default: true }),
        Field({ name: "ReferenceCount", id: 0xc, type: "uint8", conformance: "M", default: 0 })
    ),

    Datatype(
        { name: "AudioStreamStruct", type: "struct" },
        Field({ name: "AudioStreamId", id: 0x0, type: "AudioStreamID", conformance: "M" }),
        Field({ name: "StreamUsage", id: 0x1, type: "StreamUsageEnum", conformance: "M" }),
        Field({ name: "AudioCodec", id: 0x2, type: "AudioCodecEnum", conformance: "M" }),
        Field({ name: "ChannelCount", id: 0x3, type: "uint8", conformance: "M", constraint: "1 to 8" }),
        Field({ name: "SampleRate", id: 0x4, type: "uint32", conformance: "M", constraint: "min 1" }),
        Field({ name: "BitRate", id: 0x5, type: "uint32", conformance: "M", constraint: "min 1" }),
        Field({ name: "BitDepth", id: 0x6, type: "uint8", conformance: "M", constraint: "8, 16, 24, 32" }),
        Field({ name: "ReferenceCount", id: 0x7, type: "uint8", conformance: "M" })
    ),

    Datatype(
        { name: "SnapshotStreamStruct", type: "struct" },
        Field({ name: "SnapshotStreamId", id: 0x0, type: "SnapshotStreamID", conformance: "M" }),
        Field({ name: "ImageCodec", id: 0x1, type: "ImageCodecEnum", conformance: "M" }),
        Field({ name: "FrameRate", id: 0x2, type: "uint16", conformance: "M", constraint: "min 1" }),
        Field({ name: "MinResolution", id: 0x3, type: "VideoResolutionStruct", conformance: "M" }),
        Field({ name: "MaxResolution", id: 0x4, type: "VideoResolutionStruct", conformance: "M" }),
        Field({ name: "Quality", id: 0x5, type: "uint8", conformance: "M", constraint: "1 to 100" }),
        Field({ name: "ReferenceCount", id: 0x6, type: "uint8", conformance: "M" }),
        Field({ name: "EncodedPixels", id: 0x7, type: "bool", conformance: "M" }),
        Field({ name: "HardwareEncoder", id: 0x8, type: "bool", conformance: "M" }),
        Field({ name: "WatermarkEnabled", id: 0x9, type: "bool", conformance: "WMARK" }),
        Field({ name: "OsdEnabled", id: 0xa, type: "bool", conformance: "OSD" })
    ),

    Datatype(
        { name: "AVMetadataStruct", type: "struct" },
        Field({ name: "UtcTime", id: 0x1, type: "epoch-us", conformance: "M", quality: "X" }),
        Field(
            { name: "MotionZonesActive", id: 0x2, type: "list", conformance: "O", constraint: "min 1" },
            Field({ name: "entry", type: "ZoneManagement.ZoneID" })
        ),
        Field({ name: "BlackAndWhiteActive", id: 0x3, type: "bool", conformance: "O" }),
        Field({ name: "UserDefined", id: 0x4, type: "octstr", conformance: "O", constraint: "max 256" })
    ),

    Datatype({ name: "VideoStreamID", type: "uint16" }),
    Datatype({ name: "AudioStreamID", type: "uint16" }),
    Datatype({ name: "SnapshotStreamID", type: "uint16" })
);

MatterDefinition.children.push(CameraAvStreamManagement);
