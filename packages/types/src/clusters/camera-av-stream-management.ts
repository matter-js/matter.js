/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    FixedAttribute,
    Attribute,
    WritableAttribute,
    Command,
    TlvNoResponse,
    OptionalWritableAttribute,
    OptionalAttribute
} from "../cluster/Cluster.js";
import { TlvUInt8, TlvUInt32, TlvUInt16, TlvEnum, TlvEpochUs } from "../tlv/TlvNumber.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { StreamUsage } from "../globals/StreamUsage.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvViewport } from "../globals/Viewport.js";
import { AccessLevel } from "@matter/model";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvByteString } from "../tlv/TlvString.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { ThreeLevelAuto } from "../globals/ThreeLevelAuto.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace CameraAvStreamManagement {
    /**
     * These are optional features supported by CameraAvStreamManagementCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.5
     */
    export enum Feature {
        /**
         * Audio (ADO)
         *
         * The Audio feature indicates the ability of the node to support audio streams.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.1
         */
        Audio = "Audio",

        /**
         * Video (VDO)
         *
         * The Video feature indicates the ability of the node to support video streams. The video streams could be for
         * either live streaming or recording stream transfer, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.2
         */
        Video = "Video",

        /**
         * Snapshot (SNP)
         *
         * The Snapshot feature indicates the ability of the node to support snapshot streams.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.3
         */
        Snapshot = "Snapshot",

        /**
         * Privacy (PRIV)
         *
         * The Privacy feature indicates the ability of the node to support privacy settings.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.4
         */
        Privacy = "Privacy",

        /**
         * Speaker (SPKR)
         *
         * The Speaker feature indicates the ability of the node to support audio playback via a speaker. The Audio
         * feature shall be supported if the Speaker feature is supported. Nodes which support this feature shall have
         * the ability to perform playback audio mixing in software or hardware.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.5
         */
        Speaker = "Speaker",

        /**
         * ImageControl (ICTL)
         *
         * Image control supported
         */
        ImageControl = "ImageControl",

        /**
         * Watermark (WMARK)
         *
         * The Watermark feature indicates the ability of the node to apply a manufacturer watermark logo on a video
         * stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.7
         */
        Watermark = "Watermark",

        /**
         * OnScreenDisplay (OSD)
         *
         * The On Screen Display (OSD) feature indicates the ability of the node to display text such as date, time,
         * timezone, and/or device name, etc. for a video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.8
         */
        OnScreenDisplay = "OnScreenDisplay",

        /**
         * LocalStorage (STOR)
         *
         * The Local Storage feature indicates that this device has the ability to store recordings and/or snapshots on
         * this device itself. While this specification defines the ability to have this feature and enable or disable
         * it only, it does not currently define any way to access or manage this storage.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.9
         */
        LocalStorage = "LocalStorage",

        /**
         * HighDynamicRange (HDR)
         *
         * The High Dynamic Range feature indicates that the sensor on this device supports operating in High Dynamic
         * Range mode, in addition to a normal operating mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.10
         */
        HighDynamicRange = "HighDynamicRange",

        /**
         * NightVision (NV)
         *
         * The Night Vision feature indicates the ability to operate in a low light environment mode, in addition to a
         * normal operating mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.11
         */
        NightVision = "NightVision"
    }

    /**
     * This struct is used to define a video sensor and its characteristics.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.6
     */
    export const TlvVideoSensorParams = TlvObject({
        /**
         * This field shall indicate the practical width of the video sensor in pixels. This value is used for various
         * purposes such as resolution control, boundaries for the Zone Management Cluster and digital Pan/Tilt/Zoom
         * commands in the Camera AV Settings User Level Management.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.6.1
         */
        sensorWidth: TlvField(0, TlvUInt16.bound({ min: 64 })),

        /**
         * This field shall indicate the practical height of the video sensor in pixels. This value is used for various
         * purposes such as resolution control, boundaries for the Zone Management Cluster and digital Pan/Tilt/Zoom
         * commands in the Camera AV Settings User Level Management.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.6.2
         */
        sensorHeight: TlvField(1, TlvUInt16.bound({ min: 64 })),

        /**
         * This field shall indicate the maximum frame rate, in frames per second, that the video sensor is capable of
         * supporting.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.6.3
         */
        maxFps: TlvField(2, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall indicate the maximum frame rate, in frames per second, that the video sensor is capable of
         * supporting when HDR is enabled. The value may be less than or equal to the MaxFPS.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.6.4
         */
        maxHdrfps: TlvOptionalField(3, TlvUInt16.bound({ min: 1 }))
    });

    /**
     * This struct is used to define a video sensor and its characteristics.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.6
     */
    export interface VideoSensorParams extends TypeFromSchema<typeof TlvVideoSensorParams> {}

    /**
     * This object defines the resolution parameters in pixels which can be used for defining the resolutions of
     * different video streams.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.7
     */
    export const TlvVideoResolution = TlvObject({
        /**
         * This field shall indicate the width, in number of pixels, for a frame.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.7.1
         */
        width: TlvField(0, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall indicate the height, in number of pixels, for a frame.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.7.2
         */
        height: TlvField(1, TlvUInt16.bound({ min: 1 }))
    });

    /**
     * This object defines the resolution parameters in pixels which can be used for defining the resolutions of
     * different video streams.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.7
     */
    export interface VideoResolution extends TypeFromSchema<typeof TlvVideoResolution> {}

    /**
     * This data type provides an enumeration of the video codecs supported by the camera.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.1
     */
    export enum VideoCodec {
        /**
         * Advanced Video Coding (H.264) codec.
         *
         * Advanced Video Coding (AVC) standard, also referred to as MPEG-4 Part 10, is a widely used codec offering
         * good balance of compression and quality.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.1.1
         */
        H264 = 0,

        /**
         * High efficiency Video Coding (H.265) codec.
         *
         * High Efficiency Video Coding, also known as H.265, is a successor to H.264. It offers significantly better
         * compression at the same quality level of its predecessors.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.1.2
         */
        Hevc = 1,

        /**
         * Versatile Video Coding (H.266) codec.
         *
         * Versatile Video Coding, also known as H.266, is a successor to H.265. It builds upon the capabilities of its
         * predecessors to achieve even more efficient compression.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.1.3
         */
        Vvc = 2,

        /**
         * AOMedia Video 1 codec.
         *
         * An open-source and royalty-free codec that provides high compression efficiency.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.1.4
         */
        Av1 = 3
    }

    /**
     * This struct is used to define a set of parameters of the hardware video encoder that alter the rate distortion
     * trade-off points. The points are expressed as the minimum bitrate and resolution for each supported codec type.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.8
     */
    export const TlvRateDistortionTradeOffPoints = TlvObject({
        /**
         * This field shall indicate the type of video codec based on the supported VideoCodecEnum types.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.8.1
         */
        codec: TlvField(0, TlvEnum<VideoCodec>()),

        /**
         * This field shall indicate the resolution in pixels for a specific rate distortion trade-off point.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.8.2
         */
        resolution: TlvField(1, TlvVideoResolution),

        /**
         * This field shall indicate the minimum bitrate for a specific rate distortion trade-off point expressed as
         * bits per second.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.8.3
         */
        minBitRate: TlvField(2, TlvUInt32.bound({ min: 1 }))
    });

    /**
     * This struct is used to define a set of parameters of the hardware video encoder that alter the rate distortion
     * trade-off points. The points are expressed as the minimum bitrate and resolution for each supported codec type.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.8
     */
    export interface RateDistortionTradeOffPoints extends TypeFromSchema<typeof TlvRateDistortionTradeOffPoints> {}

    /**
     * This struct is used to capture all constituent parameters of a video stream in order to fully characterize it.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11
     */
    export const TlvVideoStream = TlvObject({
        /**
         * This field shall indicate the uniquely allocated identifier for the video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.1
         */
        videoStreamId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the usage of the stream as described in StreamUsageEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.2
         */
        streamUsage: TlvField(1, TlvEnum<StreamUsage>()),

        /**
         * This field shall indicate the type of video codec being used by the corresponding video stream as described
         * in VideoCodecEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.3
         */
        videoCodec: TlvField(2, TlvEnum<VideoCodec>()),

        /**
         * This field shall indicate the minimum frame rate in frames per second for the corresponding video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.4
         */
        minFrameRate: TlvField(3, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall indicate the maximum frame rate in frames per second for the corresponding video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.5
         */
        maxFrameRate: TlvField(4, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall indicate the minimum resolution for the corresponding video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.6
         */
        minResolution: TlvField(5, TlvVideoResolution),

        /**
         * This field shall indicate the maximum resolution for the corresponding video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.7
         */
        maxResolution: TlvField(6, TlvVideoResolution),

        /**
         * This field shall indicate the minimum bitrate for the corresponding video stream in bits per second.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.8
         */
        minBitRate: TlvField(7, TlvUInt32.bound({ min: 1 })),

        /**
         * This field shall indicate the maximum bitrate for the corresponding video stream in bits per second.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.9
         */
        maxBitRate: TlvField(8, TlvUInt32.bound({ min: 1 })),

        /**
         * This field shall indicate the duration in milliseconds before a regular key-frame shall be generated. A value
         * of 0 shall mean that no regular key-frames are generated. When using push transports with a stream, it is
         * recommended to use a value of 4000 (4 seconds). If the value requested does not exactly align with the
         * framerate, then the next frame after the requested value shall be a regular key-frame.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.10
         */
        keyFrameInterval: TlvField(9, TlvUInt16.bound({ max: 65500 })),

        /**
         * This field indicates the status of an applied watermark for the specific video stream. An Enabled value of
         * TRUE means that watermarking has been enabled for that stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.11
         */
        watermarkEnabled: TlvOptionalField(10, TlvBoolean),

        /**
         * This field indicates the status of the OSD (On-Screen Display) for the specific video stream. An Enabled
         * value of TRUE means that OSD has been enabled for that stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.12
         */
        osdEnabled: TlvOptionalField(11, TlvBoolean),

        /**
         * This field shall indicate the number of entities currently using this video stream. The node shall recompute
         * this field to reflect the correct value at runtime (e.g., when restored from a persisted value after a
         * reboot).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11.13
         */
        referenceCount: TlvField(12, TlvUInt8)
    });

    /**
     * This struct is used to capture all constituent parameters of a video stream in order to fully characterize it.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.11
     */
    export interface VideoStream extends TypeFromSchema<typeof TlvVideoStream> {}

    /**
     * Input to the CameraAvStreamManagement videoStreamAllocate command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4
     */
    export const TlvVideoStreamAllocateRequest = TlvObject({
        /**
         * This field shall indicate the usage of the stream (Recording, LiveView, etc) that this allocation is for.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4.1
         */
        streamUsage: TlvField(0, TlvEnum<StreamUsage>()),

        /**
         * This field shall indicate the type of codec used by the allocated video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4.2
         */
        videoCodec: TlvField(1, TlvEnum<VideoCodec>()),

        /**
         * This field shall indicate the minimum frame rate in frames per second of the allocated video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4.3
         */
        minFrameRate: TlvField(2, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall indicate the maximum frame rate in frames per second of the allocated video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4.4
         */
        maxFrameRate: TlvField(3, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall indicate the minimum resolution of the allocated video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4.5
         */
        minResolution: TlvField(4, TlvVideoResolution),

        /**
         * This field shall indicate the maximum resolution of the allocated video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4.6
         */
        maxResolution: TlvField(5, TlvVideoResolution),

        /**
         * This field shall indicate the minimum bitrate in bits per second of the allocated video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4.7
         */
        minBitRate: TlvField(6, TlvUInt32.bound({ min: 1 })),

        /**
         * This field shall indicate the maximum bitrate in bits per second of the allocated video stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4.8
         */
        maxBitRate: TlvField(7, TlvUInt32.bound({ min: 1 })),

        /**
         * This field shall indicate the duration in milliseconds before a regular key-frame is generated. See
         * KeyFrameInterval for further details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4.9
         */
        keyFrameInterval: TlvField(8, TlvUInt16.bound({ max: 65500 })),

        /**
         * This field shall indicate whether a watermark can be applied on the video stream. A value of TRUE means that
         * watermarking has been enabled for that stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4.10
         */
        watermarkEnabled: TlvOptionalField(9, TlvBoolean),

        /**
         * This field shall indicate whether the OSD (On-Screen Display) can be applied on the video stream. A value of
         * TRUE means that OSD has been enabled for that stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4.11
         */
        osdEnabled: TlvOptionalField(10, TlvBoolean)
    });

    /**
     * Input to the CameraAvStreamManagement videoStreamAllocate command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4
     */
    export interface VideoStreamAllocateRequest extends TypeFromSchema<typeof TlvVideoStreamAllocateRequest> {}

    /**
     * This command shall be sent by the camera in response to the VideoStreamAllocate command, carrying the newly
     * allocated or re-used video stream identifier.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.5
     */
    export const TlvVideoStreamAllocateResponse = TlvObject({
        /**
         * This field shall be a VideoStreamIDType representing the newly created unique video stream identifier.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.5.1
         */
        videoStreamId: TlvField(0, TlvUInt16)
    });

    /**
     * This command shall be sent by the camera in response to the VideoStreamAllocate command, carrying the newly
     * allocated or re-used video stream identifier.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.5
     */
    export interface VideoStreamAllocateResponse extends TypeFromSchema<typeof TlvVideoStreamAllocateResponse> {}

    /**
     * Input to the CameraAvStreamManagement videoStreamDeallocate command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.7
     */
    export const TlvVideoStreamDeallocateRequest = TlvObject({
        /**
         * This field shall be a VideoStreamIDType for the stream to be deallocated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.7.1
         */
        videoStreamId: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the CameraAvStreamManagement videoStreamDeallocate command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.7
     */
    export interface VideoStreamDeallocateRequest extends TypeFromSchema<typeof TlvVideoStreamDeallocateRequest> {}

    /**
     * This data type is derived from enum8 and is used for tri-state settings on a device, where a setting can be in
     * one of three states, i.e., On, Off, or Automatic.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.5
     */
    export enum TriStateAuto {
        /**
         * Off
         */
        Off = 0,

        /**
         * On
         */
        On = 1,

        /**
         * Automatic Operation
         */
        Auto = 2
    }

    /**
     * This data type provides an enumeration of the audio codecs supported by the camera.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.2
     */
    export enum AudioCodec {
        /**
         * Open source IETF standard codec.
         *
         * An open-source and royalty-free audio codec that is versatile and designed for both speech and music.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.2.1
         */
        Opus = 0,

        /**
         * Advanced Audio Coding codec-Low Complexity
         */
        AacLc = 1
    }

    /**
     * This struct is used to express the audio capabilities of the camera.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.10
     */
    export const TlvAudioCapabilities = TlvObject({
        /**
         * This field shall indicate the maximum number of channels supported by an audio stream from the camera.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.10.1
         */
        maxNumberOfChannels: TlvField(0, TlvUInt8.bound({ min: 1 })),

        /**
         * This field shall indicate the list of audio codecs from AudioCodecEnum that are supported by the camera.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.10.2
         */
        supportedCodecs: TlvField(1, TlvArray(TlvEnum<AudioCodec>(), { minLength: 1 })),

        /**
         * This field shall indicate the list of sample rates that are supported by the audio stream from the camera
         * expressed in Hz, e.g., (48000, 32000, 16000).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.10.3
         */
        supportedSampleRates: TlvField(2, TlvArray(TlvUInt32, { minLength: 1 })),

        /**
         * This field shall indicate the list of bit depths that are supported by the audio stream, e.g., (16-bit,
         * 24-bit).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.10.4
         */
        supportedBitDepths: TlvField(3, TlvArray(TlvUInt8, { minLength: 1 }))
    });

    /**
     * This struct is used to express the audio capabilities of the camera.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.10
     */
    export interface AudioCapabilities extends TypeFromSchema<typeof TlvAudioCapabilities> {}

    /**
     * This struct is used to capture all constituent parameters of an audio stream in order to fully characterize it.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.12
     */
    export const TlvAudioStream = TlvObject({
        /**
         * This field shall indicate the uniquely allocated identifier for the audio stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.12.1
         */
        audioStreamId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the usage of stream as described in StreamUsageEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.12.2
         */
        streamUsage: TlvField(1, TlvEnum<StreamUsage>()),

        /**
         * This field shall indicate the type of audio codec being used by the corresponding audio stream as described
         * in AudioCodecEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.12.3
         */
        audioCodec: TlvField(2, TlvEnum<AudioCodec>()),

        /**
         * This field shall indicate the number of independent channels or tracks being used by the corresponding audio
         * stream. e.g., 1 for mono, 2 for stereo
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.12.4
         */
        channelCount: TlvField(3, TlvUInt8.bound({ min: 1, max: 8 })),

        /**
         * This field shall indicate the audio sample rate, in hertz (Hz).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.12.5
         */
        sampleRate: TlvField(4, TlvUInt32.bound({ min: 1 })),

        /**
         * This field shall indicate the target bit rate in bits per second of the audio stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.12.6
         */
        bitRate: TlvField(5, TlvUInt32.bound({ min: 1 })),

        /**
         * This field shall indicate the bit depth (8, 16, 24 or 32 bits) of the audio stream. It represents the number
         * of bits of information used to represent each sample of the audio signal, and affects the resolution and
         * dynamic range of the audio.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.12.7
         */
        bitDepth: TlvField(6, TlvUInt8),

        /**
         * This field shall indicate the number of entities currently using this audio stream. The node shall recompute
         * this field to reflect the correct value at runtime (e.g., when restored from a persisted value after a
         * reboot).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.12.8
         */
        referenceCount: TlvField(7, TlvUInt8)
    });

    /**
     * This struct is used to capture all constituent parameters of an audio stream in order to fully characterize it.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.12
     */
    export interface AudioStream extends TypeFromSchema<typeof TlvAudioStream> {}

    /**
     * Input to the CameraAvStreamManagement audioStreamAllocate command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.1
     */
    export const TlvAudioStreamAllocateRequest = TlvObject({
        /**
         * This field shall indicate the usage of the stream (Recording, LiveView, etc) that this allocation is for.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.1.1
         */
        streamUsage: TlvField(0, TlvEnum<StreamUsage>()),

        /**
         * This field shall indicate the type of Codec used by the allocated stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.1.2
         */
        audioCodec: TlvField(1, TlvEnum<AudioCodec>()),

        /**
         * This field shall indicate the number of channels used by the allocated stream, e.g., Mono (1), Stereo (2),
         * etc.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.1.3
         */
        channelCount: TlvField(2, TlvUInt8.bound({ min: 1, max: 8 })),

        /**
         * This field shall indicate the sampling rate of the audio stream in Hz. Typical values would be 48000 (48
         * kHz), 32000 (32 kHz) or 16000 (16 kHz).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.1.4
         */
        sampleRate: TlvField(3, TlvUInt32.bound({ min: 1 })),

        /**
         * This field shall indicate the bitrate of the specified audio codec in bits per second. The default bitrate
         * may vary based on the type of device and codec.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.1.5
         */
        bitRate: TlvField(4, TlvUInt32.bound({ min: 1 })),

        /**
         * This field shall indicate the number of bits of information (8, 16, 24 or 32 bits) used to represent each
         * sample of the audio signal.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.1.6
         */
        bitDepth: TlvField(5, TlvUInt8)
    });

    /**
     * Input to the CameraAvStreamManagement audioStreamAllocate command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.1
     */
    export interface AudioStreamAllocateRequest extends TypeFromSchema<typeof TlvAudioStreamAllocateRequest> {}

    /**
     * This command shall be sent by the camera in response to the AudioStreamAllocate command, carrying the newly
     * allocated or re-used audio stream identifier.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.2
     */
    export const TlvAudioStreamAllocateResponse = TlvObject({
        /**
         * The AudioStreamID field shall be a AudioStreamIDType representing the unique audio stream identifier.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.2.1
         */
        audioStreamId: TlvField(0, TlvUInt16)
    });

    /**
     * This command shall be sent by the camera in response to the AudioStreamAllocate command, carrying the newly
     * allocated or re-used audio stream identifier.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.2
     */
    export interface AudioStreamAllocateResponse extends TypeFromSchema<typeof TlvAudioStreamAllocateResponse> {}

    /**
     * Input to the CameraAvStreamManagement audioStreamDeallocate command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.3
     */
    export const TlvAudioStreamDeallocateRequest = TlvObject({
        /**
         * The AudioStreamID field shall be a AudioStreamIDType representing the unique audio stream identifier for the
         * stream that needs to be deallocated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.3.1
         */
        audioStreamId: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the CameraAvStreamManagement audioStreamDeallocate command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.3
     */
    export interface AudioStreamDeallocateRequest extends TypeFromSchema<typeof TlvAudioStreamDeallocateRequest> {}

    /**
     * This data type provides an enumeration of the different modes of bi-directional audio communication that are
     * supported by the camera.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.4
     */
    export enum TwoWayTalkSupportType {
        /**
         * Two-way Talk support is absent.
         */
        NotSupported = 0,

        /**
         * Audio in one direction at a time.
         */
        HalfDuplex = 1,

        /**
         * Audio in both directions simultaneously.
         */
        FullDuplex = 2
    }

    /**
     * This data type provides an enumeration of the image codecs supported by the camera.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.3
     */
    export enum ImageCodec {
        /**
         * JPEG image codec.
         *
         * The JPEG image codec as defined by ITU-T T.81 and ISO/IEC 10918.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.3.1
         */
        Jpeg = 0
    }

    /**
     * This struct is used to define the set of parameters that characterize a snapshot image that is used to build a
     * snapshot stream.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.9
     */
    export const TlvSnapshotCapabilities = TlvObject({
        /**
         * This field shall indicate the resolution in pixels of the snapshot image.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.9.1
         */
        resolution: TlvField(0, TlvVideoResolution),

        /**
         * This field shall indicate the maximum frame rate in frames per second of the snapshot stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.9.2
         */
        maxFrameRate: TlvField(1, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall indicate the format of the snapshot image, e.g., JPEG, as specified in ImageCodecEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.9.3
         */
        imageCodec: TlvField(2, TlvEnum<ImageCodec>()),

        /**
         * This field shall indicate if this entry requires using any resources from the available MaxEncodedPixelRate.
         * If true, clients need to include this entry’s Resolution and MaxFrameRate in the calculation for determining
         * overall stream allocation resources.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.9.4
         */
        requiresEncodedPixels: TlvField(3, TlvBoolean),

        /**
         * This field shall indicate if this entry requires using a hardware encoder and thus needs to be considered
         * when determining overall stream allocation resources.
         *
         * If true, the device requires an encoder from MaxConcurrentEncoders for this combination of ImageCodec,
         * Resolution, and MaxFrameRate.
         *
         * If false, the device can produce this combination without needing a dedicated encoder.
         *
         * This field is only considered if RequiresEncodedPixels is true.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.9.5
         */
        requiresHardwareEncoder: TlvOptionalField(4, TlvBoolean)
    });

    /**
     * This struct is used to define the set of parameters that characterize a snapshot image that is used to build a
     * snapshot stream.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.9
     */
    export interface SnapshotCapabilities extends TypeFromSchema<typeof TlvSnapshotCapabilities> {}

    /**
     * This struct is used to capture all constituent parameters of a snapshot stream in order to fully characterize it.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13
     */
    export const TlvSnapshotStream = TlvObject({
        /**
         * This field shall indicate the uniquely allocated identifier for the snapshot stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13.1
         */
        snapshotStreamId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the type of image codec being used by the corresponding snapshot stream as
         * described in ImageCodecEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13.2
         */
        imageCodec: TlvField(1, TlvEnum<ImageCodec>()),

        /**
         * This field shall indicate the frame rate as frames per second of the snapshot stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13.3
         */
        frameRate: TlvField(2, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall indicate the minimum resolution for the corresponding snapshot stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13.4
         */
        minResolution: TlvField(3, TlvVideoResolution),

        /**
         * This field shall indicate the maximum resolution for the corresponding snapshot stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13.5
         */
        maxResolution: TlvField(4, TlvVideoResolution),

        /**
         * This field shall indicate a generic quality metric (integer between 1 and 100) as an input parameter to the
         * image codec. A lower number indicates lower image quality. A higher value indicates higher image quality but
         * larger file size and higher bit rate.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13.6
         */
        quality: TlvField(5, TlvUInt8.bound({ min: 1, max: 100 })),

        /**
         * This field shall indicate the number of entities currently using this snapshot stream. The node shall
         * recompute this field to reflect the correct value at runtime (e.g., when restored from a persisted value
         * after a reboot).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13.7
         */
        referenceCount: TlvField(6, TlvUInt8),

        /**
         * This field shall indicate if this entry counts in the system encoded pixel rate calculation.
         *
         * This shall be true if the SnapshotCapabilitiesStruct for the selected ImageCodec and MaxResolution has
         * RequiresEncodedPixels set to true.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13.8
         */
        encodedPixels: TlvField(7, TlvBoolean),

        /**
         * This field shall indicate if one of the system hardware encoders is used by this snapshot stream.
         *
         * This shall be true if the SnapshotCapabilitiesStruct for the selected ImageCodec and MaxResolution has
         * RequiresHardwareEncoder set to true.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13.9
         */
        hardwareEncoder: TlvField(8, TlvBoolean),

        /**
         * This field indicates the status of an applied watermark for the specific snapshot stream. A value of TRUE
         * means that watermarking has been enabled for that stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13.10
         */
        watermarkEnabled: TlvOptionalField(9, TlvBoolean),

        /**
         * This field indicates the status of the OSD (On-Screen Display) for the specific snapshot stream. A value of
         * TRUE means that OSD has been enabled for that stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13.11
         */
        osdEnabled: TlvOptionalField(10, TlvBoolean)
    });

    /**
     * This struct is used to capture all constituent parameters of a snapshot stream in order to fully characterize it.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.13
     */
    export interface SnapshotStream extends TypeFromSchema<typeof TlvSnapshotStream> {}

    /**
     * Input to the CameraAvStreamManagement snapshotStreamAllocate command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.8
     */
    export const TlvSnapshotStreamAllocateRequest = TlvObject({
        /**
         * This field shall indicate the type of image codec to be used by the allocated snapshot stream as described in
         * ImageCodecEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.8.1
         */
        imageCodec: TlvField(0, TlvEnum<ImageCodec>()),

        /**
         * This field shall indicate the maximum frame rate in frames per second of the allocated snapshot stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.8.2
         */
        maxFrameRate: TlvField(1, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall indicate the minimum resolution of the allocated snapshot stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.8.3
         */
        minResolution: TlvField(2, TlvVideoResolution),

        /**
         * This field shall indicate the maximum resolution of the allocated snapshot stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.8.4
         */
        maxResolution: TlvField(3, TlvVideoResolution),

        /**
         * This field shall indicate a codec quality metric(integer between 1 and 100) for the allocated snapshot
         * stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.8.5
         */
        quality: TlvField(4, TlvUInt8.bound({ min: 1, max: 100 })),

        /**
         * This field shall indicate whether a watermark can be applied on the snapshot stream. A value of TRUE means
         * that watermarking has been requested for that stream.
         *
         * This field may be ignored if RequiresHardwareEncoder is FALSE on the matching entry from
         * SnapshotCapabilities. When ignored, the associated WatermarkEnabled entry for the Video Stream that is the
         * source of this snapshot may be used.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.8.6
         */
        watermarkEnabled: TlvOptionalField(5, TlvBoolean),

        /**
         * This field shall indicate whether the OSD (On-Screen Display) can be applied on the snapshot stream. A value
         * of TRUE means that OSD has been requested for that stream.
         *
         * This field may be ignored if RequiresHardwareEncoder is FALSE on the matching entry from
         * SnapshotCapabilities. When ignored, the associated OSDEnabled entry for the Video Stream that is the source
         * of this snapshot may be used.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.8.7
         */
        osdEnabled: TlvOptionalField(6, TlvBoolean)
    });

    /**
     * Input to the CameraAvStreamManagement snapshotStreamAllocate command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.8
     */
    export interface SnapshotStreamAllocateRequest extends TypeFromSchema<typeof TlvSnapshotStreamAllocateRequest> {}

    /**
     * This command shall be sent by the device in response to the SnapshotStreamAllocate command, carrying the newly
     * allocated or re-used snapshot stream identifier.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.9
     */
    export const TlvSnapshotStreamAllocateResponse = TlvObject({
        /**
         * The SnapshotStreamID field shall be an unsigned 16 bit integer representing the unique snapshot stream
         * identifier.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.9.1
         */
        snapshotStreamId: TlvField(0, TlvUInt16)
    });

    /**
     * This command shall be sent by the device in response to the SnapshotStreamAllocate command, carrying the newly
     * allocated or re-used snapshot stream identifier.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.9
     */
    export interface SnapshotStreamAllocateResponse extends TypeFromSchema<typeof TlvSnapshotStreamAllocateResponse> {}

    /**
     * Input to the CameraAvStreamManagement snapshotStreamDeallocate command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.10
     */
    export const TlvSnapshotStreamDeallocateRequest = TlvObject({
        /**
         * The SnapshotStreamID field shall be an unsigned 16 bit integer representing the unique snapshot stream
         * identifier for the stream that needs to be deallocated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.10.1
         */
        snapshotStreamId: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the CameraAvStreamManagement snapshotStreamDeallocate command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.10
     */
    export interface SnapshotStreamDeallocateRequest extends TypeFromSchema<typeof TlvSnapshotStreamDeallocateRequest> {}

    /**
     * Input to the CameraAvStreamManagement captureSnapshot command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.13
     */
    export const TlvCaptureSnapshotRequest = TlvObject({
        /**
         * The SnapshotStreamID field shall be a SnapshotStreamIDType representing the allocated Snapshot Stream to use,
         * or null to allow automatic stream selection.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.13.1
         */
        snapshotStreamId: TlvField(0, TlvNullable(TlvUInt16)),

        /**
         * The RequestedResolution field shall be a VideoResolutionStruct representing the preferred resolution of the
         * snapshot.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.13.2
         */
        requestedResolution: TlvField(1, TlvVideoResolution)
    });

    /**
     * Input to the CameraAvStreamManagement captureSnapshot command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.13
     */
    export interface CaptureSnapshotRequest extends TypeFromSchema<typeof TlvCaptureSnapshotRequest> {}

    /**
     * This command shall be sent by the device in response to the CaptureSnapshot command, carrying the requested
     * snapshot.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.14
     */
    export const TlvCaptureSnapshotResponse = TlvObject({
        /**
         * The Data field shall be an octet string representing the image data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.14.1
         */
        data: TlvField(0, TlvByteString),

        /**
         * The ImageCodec field shall be an ImageCodecEnum representing the codec used to encode the image. This shall
         * match the value found in the corresponding allocated snapshot stream and is provided for convenience.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.14.2
         */
        imageCodec: TlvField(1, TlvEnum<ImageCodec>()),

        /**
         * The Resolution field shall be a VideoResolutionStruct representing the resolution of the supplied image.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.14.3
         */
        resolution: TlvField(2, TlvVideoResolution)
    });

    /**
     * This command shall be sent by the device in response to the CaptureSnapshot command, carrying the requested
     * snapshot.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.14
     */
    export interface CaptureSnapshotResponse extends TypeFromSchema<typeof TlvCaptureSnapshotResponse> {}

    /**
     * Input to the CameraAvStreamManagement videoStreamModify command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.6
     */
    export const TlvVideoStreamModifyRequest = TlvObject({
        /**
         * This field shall be a VideoStreamIDType representing the video stream to modify.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.6.1
         */
        videoStreamId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate whether a watermark can be applied on the video stream. A value of TRUE means that
         * watermarking has been requested for that stream. If this field is not present, then no change to the existing
         * value shall be made.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.6.2
         */
        watermarkEnabled: TlvOptionalField(1, TlvBoolean),

        /**
         * This field shall indicate whether the OSD (On-Screen Display) can be applied on the video stream. A value of
         * TRUE means that OSD has been requested for that stream. If this field is not present, then no change to the
         * existing value shall be made.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.6.3
         */
        osdEnabled: TlvOptionalField(2, TlvBoolean)
    });

    /**
     * Input to the CameraAvStreamManagement videoStreamModify command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.6
     */
    export interface VideoStreamModifyRequest extends TypeFromSchema<typeof TlvVideoStreamModifyRequest> {}

    /**
     * Input to the CameraAvStreamManagement setStreamPriorities command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.12
     */
    export const TlvSetStreamPrioritiesRequest = TlvObject({
        /**
         * The StreamPriorities field shall contain a list of stream usages in decreasing order of stream priorities,
         * starting at index 0 of the list, with no duplicate values allowed, and only containing entries found in
         * SupportedStreamUsages.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.12.1
         */
        streamPriorities: TlvField(0, TlvArray(TlvEnum<StreamUsage>()))
    });

    /**
     * Input to the CameraAvStreamManagement setStreamPriorities command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.12
     */
    export interface SetStreamPrioritiesRequest extends TypeFromSchema<typeof TlvSetStreamPrioritiesRequest> {}

    /**
     * This struct is used to encode the metadata generated by the device and is included by the various transports that
     * handle audio and video streams.
     *
     * When encoded in TLV binary format and placed inside other standards, this shall be represented using the RFC 8141
     * compliant string urn:csa:matter:av-metadata.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.14
     */
    export const TlvAvMetadata = TlvObject({
        /**
         * This field shall represent the UTC time that this metadata belongs to. The field is sourced from the Time
         * Synchronization cluster’s UTCTime attribute.
         *
         * If null, the device has no current source of wall clock time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.14.1
         */
        utcTime: TlvField(1, TlvNullable(TlvEpochUs)),

        /**
         * This field shall represent the list of Motion Zones that are currently triggered.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.14.2
         */
        motionZonesActive: TlvOptionalField(2, TlvArray(TlvUInt16, { minLength: 1 })),

        /**
         * This field shall indicate if the sensor is currently active in black and white only mode. A value of true
         * means the sensor and video encode process is operating in black and white only mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.14.3
         */
        blackAndWhiteActive: TlvOptionalField(3, TlvBoolean),

        /**
         * This field shall be an octet string representing arbitrary format user defined metadata attached. The
         * UserDefined Field field of the ManuallyTriggerTransport command can be used to populate this field. The
         * format and meaning of this field is not defined in this specification and is up to the users, vendors, or
         * ecosystems deploying it.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.14.4
         */
        userDefined: TlvOptionalField(4, TlvByteString.bound({ maxLength: 256 }))
    });

    /**
     * This struct is used to encode the metadata generated by the device and is included by the various transports that
     * handle audio and video streams.
     *
     * When encoded in TLV binary format and placed inside other standards, this shall be represented using the RFC 8141
     * compliant string urn:csa:matter:av-metadata.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2.6.14
     */
    export interface AvMetadata extends TypeFromSchema<typeof TlvAvMetadata> {}

    /**
     * A CameraAvStreamManagementCluster supports these elements if it supports features Video or Snapshot.
     */
    export const VideoOrSnapshotComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the maximum number of concurrent encoders supported by the camera.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.1
             */
            maxConcurrentEncoders: FixedAttribute(0x0, TlvUInt8),

            /**
             * Indicates the maximum data rate in encoded pixels per second that the camera can produce given the
             * hardware encoder resources it has. This value is manufacturer specified.
             *
             * If the camera supports Snapshots and requires hardware encoder resources to produce those Snapshots, then
             * this attribute shall be present, and a manufacturer specific value shall be present in each
             * SnapshotCapabilities MaxFrameRate entry that requires hardware resources to produce.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.2
             */
            maxEncodedPixelRate: FixedAttribute(0x1, TlvUInt32)
        }
    });

    /**
     * A CameraAvStreamManagementCluster supports these elements if it supports feature Video.
     */
    export const VideoComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the set of video sensor parameters for the camera. These include the video sensor dimensions,
             * its frame rate and HDR capabilities.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.3
             */
            videoSensorParams: FixedAttribute(0x2, TlvVideoSensorParams),

            /**
             * Indicates the minimum resolution (width and height) in pixels that the camera allows for its viewport.
             *
             * The choice of the minimum viewport width and height is, typically, directed towards maintaining the best
             * image quality (reduced distortion) for a given size of the video sensor, for different camera functions,
             * e.g., digital zoom. Furthermore, the minimum viewport size and the video sensor size also dictate the
             * upscaling capabilities and requirements of the image processor.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.5
             */
            minViewportResolution: FixedAttribute(0x4, TlvVideoResolution),

            /**
             * This attribute shall list the set of rate distortion trade-off points between resolution, frame rate and
             * bitrate for each supported hardware encoder.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.6
             */
            rateDistortionTradeOffPoints: FixedAttribute(
                0x5,
                TlvArray(TlvRateDistortionTradeOffPoints),
                { default: [] }
            ),

            /**
             * Indicates the current logical frame rate of the sensor in frames per second.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.13
             */
            currentFrameRate: Attribute(0xc, TlvUInt16),

            /**
             * Indicates the list of allocated video streams on the device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.16
             */
            allocatedVideoStreams: Attribute(0xf, TlvArray(TlvVideoStream), { persistent: true, default: [] }),

            /**
             * This attribute shall be a ViewportStruct representing the viewport to apply to all streams.
             *
             * The coordinate values represent the upper left corner and lower right corner coordinates of the source
             * rectangle on the sensor. The coordinate values are within the two-dimensional Cartesian plane of size
             * SensorWidth and SensorHeight (See VideoSensorParamsStruct in the VideoSensorParams) with the origin (0,0)
             * being the upper left corner, positive X and Y values moving right and down across the Cartesian plane
             * respectively, and (SensorWidth, SensorHeight) being the lower right corner.
             *
             * When changing the Viewport, the aspect ratio of the sensor as indicated in the VideoSensorParams
             * attribute SHOULD be preserved.
             *
             * After a factory reset, this shall default to {0, 0, SensorWidth,SensorHeight}, using the SensorWidth and
             * SensorHeight fields from the VideoSensorParams attribute.
             *
             * When this attribute is changed, all Viewport values found in DPTZStreams shall be updated to the new
             * values set here.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.25
             */
            viewport: WritableAttribute(
                0x18,
                TlvViewport,
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            )
        },

        commands: {
            /**
             * This command shall allocate a video stream on the camera and return an allocated video stream identifier.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.4
             */
            videoStreamAllocate: Command(
                0x3,
                TlvVideoStreamAllocateRequest,
                0x4,
                TlvVideoStreamAllocateResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command shall deallocate a video stream on the camera, corresponding to the given video stream
             * identifier.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.7
             */
            videoStreamDeallocate: Command(
                0x6,
                TlvVideoStreamDeallocateRequest,
                0x6,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A CameraAvStreamManagementCluster supports these elements if it supports feature NightVision.
     */
    export const NightVisionComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates if the night vision mode is infrared based or not. A value of TRUE indicates infrared mode with
             * a cut filter being used. A value of FALSE indicates color is used. When infrared is active and the
             * resulting content is in black and white, the BlackAndWhiteActive field inside any produced
             * AVMetadataStruct shall be TRUE.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.4
             */
            nightVisionUsesInfrared: FixedAttribute(0x3, TlvBoolean),

            /**
             * This attribute indicates the currently selected Night Vision mode. A value of Off means the device will
             * never activate its Night Vision mode of operation. A value of On means the Night Vision mode of operation
             * is always active. A value of Auto means the device will automatically move between active and inactive
             * based on the light level it detects.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.23
             */
            nightVision: WritableAttribute(
                0x16,
                TlvEnum<TriStateAuto>(),
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute indicates the currently selected the Night Vision Illumination mode. A value of Off means
             * the device will never activate its built-in Night Vision Illumination. A value of On means the built-in
             * Night Vision Illumination is always active. A value of Auto means the device will automatically enable
             * its built-in Night Vision Illumination based on the light level it detects.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.24
             */
            nightVisionIllum: OptionalWritableAttribute(
                0x17,
                TlvEnum<TriStateAuto>(),
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A CameraAvStreamManagementCluster supports these elements if it supports feature Audio.
     */
    export const AudioComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the audio capabilities of the microphone in terms of the codec used, supported sample rates and
             * the number of channels.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.8
             */
            microphoneCapabilities: FixedAttribute(0x7, TlvAudioCapabilities),

            /**
             * Indicates the list of allocated audio streams on the device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.17
             */
            allocatedAudioStreams: Attribute(0x10, TlvArray(TlvAudioStream), { persistent: true, default: [] }),

            /**
             * This attribute indicates whether the microphone is currently muted or not. A value of TRUE indicates that
             * the microphone has been muted. In this state, the microphone data shall be replaced with all 0 bits,
             * representing silence. A value of FALSE indicates that the microphone is On and is capable of transmitting
             * audio.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.30
             */
            microphoneMuted: WritableAttribute(
                0x1d,
                TlvBoolean,
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute indicates the current gain or volume level of the microphone.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.31
             */
            microphoneVolumeLevel: WritableAttribute(
                0x1e,
                TlvUInt8,
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute indicates the maximum value of the MicrophoneVolumeLevel that can be assigned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.32
             */
            microphoneMaxLevel: Attribute(
                0x1f,
                TlvUInt8.bound({ max: 254 }),
                { readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute indicates the minimum value of the MicrophoneVolumeLevel that can be assigned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.33
             */
            microphoneMinLevel: Attribute(
                0x20,
                TlvUInt8,
                { readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute indicates the currently selected AGC (Automatic Gain Control) mode for the microphone. A
             * value of TRUE indicates that microphone AGC is enabled. Otherwise, it is disabled.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.34
             */
            microphoneAgcEnabled: OptionalWritableAttribute(
                0x21,
                TlvBoolean,
                { persistent: true, default: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            )
        },

        commands: {
            /**
             * This command shall allocate an audio stream on the camera and return an allocated audio stream
             * identifier.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.1
             */
            audioStreamAllocate: Command(
                0x0,
                TlvAudioStreamAllocateRequest,
                0x1,
                TlvAudioStreamAllocateResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command shall deallocate an audio stream on the camera, corresponding to the given audio stream
             * identifier.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.3
             */
            audioStreamDeallocate: Command(
                0x2,
                TlvAudioStreamDeallocateRequest,
                0x2,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A CameraAvStreamManagementCluster supports these elements if it supports feature Speaker.
     */
    export const SpeakerComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the audio capabilities of the speaker in terms of the supported codecs, sample rates, and the
             * number of channels when a speaker is present.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.9
             */
            speakerCapabilities: FixedAttribute(0x8, TlvAudioCapabilities),

            /**
             * Indicates the type of two-way talk support the device has, e.g., NotSupported, HalfDuplex, or FullDuplex.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.10
             */
            twoWayTalkSupport: FixedAttribute(0x9, TlvEnum<TwoWayTalkSupportType>()),

            /**
             * This attribute indicates whether the speaker is currently muted or not. A value of TRUE indicates that
             * the speaker has been muted and shall not play anything. A value of FALSE indicates that the Speaker is
             * enabled.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.26
             */
            speakerMuted: WritableAttribute(
                0x19,
                TlvBoolean,
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute indicates the current volume level of the speaker.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.27
             */
            speakerVolumeLevel: WritableAttribute(
                0x1a,
                TlvUInt8,
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute indicates the maximum value of the SpeakerVolumeLevel that can be assigned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.28
             */
            speakerMaxLevel: Attribute(
                0x1b,
                TlvUInt8.bound({ max: 254 }),
                { readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute indicates the minimum value of the SpeakerVolumeLevel that can be assigned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.29
             */
            speakerMinLevel: Attribute(0x1c, TlvUInt8, { readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage })
        }
    });

    /**
     * A CameraAvStreamManagementCluster supports these elements if it supports feature Snapshot.
     */
    export const SnapshotComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the list of supported snapshot capabilities the device has. This list is a set of entries for
             * image codec, resolution, maximum frame rate, hardware encoder, and encoded pixels.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.11
             */
            snapshotCapabilities: FixedAttribute(0xa, TlvArray(TlvSnapshotCapabilities), { default: [] }),

            /**
             * Indicates the list of allocated snapshot streams on the device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.18
             */
            allocatedSnapshotStreams: Attribute(0x11, TlvArray(TlvSnapshotStream), { persistent: true, default: [] })
        },

        commands: {
            /**
             * This command shall allocate a snapshot stream on the device and return an allocated snapshot stream
             * identifier.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.8
             */
            snapshotStreamAllocate: Command(
                0x7,
                TlvSnapshotStreamAllocateRequest,
                0x8,
                TlvSnapshotStreamAllocateResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command shall deallocate an snapshot stream on the camera, corresponding to the given snapshot
             * stream identifier.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.10
             */
            snapshotStreamDeallocate: Command(
                0xa,
                TlvSnapshotStreamDeallocateRequest,
                0xa,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command shall return a Snapshot from the camera.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.13
             */
            captureSnapshot: Command(0xc, TlvCaptureSnapshotRequest, 0xd, TlvCaptureSnapshotResponse)
        }
    });

    /**
     * A CameraAvStreamManagementCluster supports these elements if it supports feature HighDynamicRange.
     */
    export const HighDynamicRangeComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute indicates the currently selected High Dynamic Range (HDR) mode. A value of TRUE indicates
             * that HDR video capturing is enabled. Otherwise, HDR video capturing is disabled.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.14
             */
            hdrModeEnabled: WritableAttribute(
                0xd,
                TlvBoolean,
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A CameraAvStreamManagementCluster supports these elements if it supports feature Privacy.
     */
    export const PrivacyComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute indicates the current value of the soft privacy mode for transports using the Stream Usage
             * types Recording and Analysis. A value of TRUE indicates that delivery of video frames and audio samples
             * from any streams to these transports is skipped. A value of TRUE also indicates that no new transports
             * using these stream usage values can be created or started. When FALSE, these transports can be resumed or
             * started, and have video frames and audio samples delivered.
             *
             * When this attribute is set to TRUE, any active WebRTC transports using these stream usage types shall
             * terminate the session by calling End using WebRTCEndReasonEnum PrivacyMode.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.20
             */
            softRecordingPrivacyModeEnabled: WritableAttribute(0x13, TlvBoolean, { persistent: true }),

            /**
             * This attribute indicates the current value of the soft privacy mode for transports using the Stream Usage
             * type LiveView. A value of TRUE indicates that delivery of video frames and audio samples from any streams
             * to these transports is skipped. A value of TRUE also indicates that no new transports using this stream
             * usage type can be created or started. When FALSE, these transports can be resumed or started, and have
             * video frames and audio samples delivered.
             *
             * When this attribute is set to TRUE, any active WebRTC transports using this stream usage type shall
             * terminate the session by calling End using WebRTCEndReasonEnum PrivacyMode.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.21
             */
            softLivestreamPrivacyModeEnabled: WritableAttribute(0x14, TlvBoolean, { persistent: true })
        }
    });

    /**
     * A CameraAvStreamManagementCluster supports these elements if it supports feature ImageControl.
     */
    export const ImageControlComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute indicates the amount of clockwise rotation in degrees that the image has been subjected
             * to.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.35
             */
            imageRotation: OptionalWritableAttribute(
                0x22,
                TlvUInt16.bound({ max: 359 }),
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute indicates whether the image has been flipped horizontally or not. A value of TRUE
             * indicates that the image has been flipped horizontally.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.36
             */
            imageFlipHorizontal: OptionalWritableAttribute(
                0x23,
                TlvBoolean,
                { persistent: true, default: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute indicates whether the image has been flipped vertically or not. A value of TRUE indicates
             * that the image has been flipped vertically.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.37
             */
            imageFlipVertical: OptionalWritableAttribute(
                0x24,
                TlvBoolean,
                { persistent: true, default: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A CameraAvStreamManagementCluster supports these elements if it supports features Video and LocalStorage.
     */
    export const VideoAndLocalStorageComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute indicates whether local storage based video recording is enabled. A value of TRUE
             * indicates that local storage based video recording has been enabled.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.38
             */
            localVideoRecordingEnabled: WritableAttribute(
                0x25,
                TlvBoolean,
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A CameraAvStreamManagementCluster supports these elements if it supports features Snapshot and LocalStorage.
     */
    export const SnapshotAndLocalStorageComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute indicates whether local storage based snapshot recording is enabled. A value of TRUE
             * indicates that local storage based snapshot recording has been enabled.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.39
             */
            localSnapshotRecordingEnabled: WritableAttribute(
                0x26,
                TlvBoolean,
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A CameraAvStreamManagementCluster supports these elements if it supports feature Video and it it supports
     * features Watermark or OnScreenDisplay.
     */
    export const WatermarkOrOnScreenDisplayComponent = MutableCluster.Component({
        commands: {
            /**
             * This command shall be used to modify a stream specified by the VideoStreamID.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.6
             */
            videoStreamModify: Command(
                0x5,
                TlvVideoStreamModifyRequest,
                0x5,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * These elements and properties are present in all CameraAvStreamManagement clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x551,
        name: "CameraAvStreamManagement",
        revision: 1,

        features: {
            /**
             * The Audio feature indicates the ability of the node to support audio streams.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.1
             */
            audio: BitFlag(0),

            /**
             * The Video feature indicates the ability of the node to support video streams. The video streams could be
             * for either live streaming or recording stream transfer, or both.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.2
             */
            video: BitFlag(1),

            /**
             * The Snapshot feature indicates the ability of the node to support snapshot streams.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.3
             */
            snapshot: BitFlag(2),

            /**
             * The Privacy feature indicates the ability of the node to support privacy settings.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.4
             */
            privacy: BitFlag(3),

            /**
             * The Speaker feature indicates the ability of the node to support audio playback via a speaker. The Audio
             * feature shall be supported if the Speaker feature is supported. Nodes which support this feature shall
             * have the ability to perform playback audio mixing in software or hardware.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.5
             */
            speaker: BitFlag(4),

            /**
             * Image control supported
             */
            imageControl: BitFlag(5),

            /**
             * The Watermark feature indicates the ability of the node to apply a manufacturer watermark logo on a video
             * stream.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.7
             */
            watermark: BitFlag(6),

            /**
             * The On Screen Display (OSD) feature indicates the ability of the node to display text such as date, time,
             * timezone, and/or device name, etc. for a video stream.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.8
             */
            onScreenDisplay: BitFlag(7),

            /**
             * The Local Storage feature indicates that this device has the ability to store recordings and/or snapshots
             * on this device itself. While this specification defines the ability to have this feature and enable or
             * disable it only, it does not currently define any way to access or manage this storage.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.9
             */
            localStorage: BitFlag(8),

            /**
             * The High Dynamic Range feature indicates that the sensor on this device supports operating in High
             * Dynamic Range mode, in addition to a normal operating mode.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.10
             */
            highDynamicRange: BitFlag(9),

            /**
             * The Night Vision feature indicates the ability to operate in a low light environment mode, in addition to
             * a normal operating mode.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.5.11
             */
            nightVision: BitFlag(10)
        },

        attributes: {
            /**
             * Indicates the maximum size of the content buffer in bytes. This buffer holds the compressed and/or raw
             * content for audio/video pre-roll, queued transmissions, the current frame for each snapshot stream, and
             * the metadata context for recording events. For devices which support more than one encoder, the device
             * shall evenly allocate this buffer space amongst all streams that utilize pre-roll content such as the
             * Push AV Stream Transport Cluster.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.7
             */
            maxContentBufferSize: FixedAttribute(0x6, TlvUInt32),

            /**
             * Indicates the maximum network bandwidth in bits per second that the device would consume for the
             * transmission of its media streams.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.12
             */
            maxNetworkBandwidth: FixedAttribute(0xb, TlvUInt32),

            /**
             * Indicates the list of Stream Usages that are supported by the camera. Manufacturers shall provide a
             * usages list that is appropriate to their product. If a usage is found in this list, then it can be used
             * in the StreamUsagePriorities attribute. The ordering and values of this list shall match the values found
             * in StreamUsagePriorities after a factory reset.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.15
             */
            supportedStreamUsages: FixedAttribute(0xe, TlvArray(TlvEnum<StreamUsage>()), { default: [] }),

            /**
             * Indicates a list of the video stream usages represented in a ranked order of their priorities, starting
             * with Index 0 having the stream usage type with the highest priority. See Resource Management and Stream
             * Priorities for further details. Only usages found in the SupportedStreamUsages attribute can be included.
             * To change the contents, use the SetStreamPriorities command. Manufacturers shall provide a default ranked
             * priorities list that is appropriate to their product and this default ranking shall exactly match the
             * contents of SupportedStreamUsages. Clients can use the contents of the SupportedStreamUsages to restore
             * this default state if the contents have been changed by the SetStreamPriorities command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.19
             */
            streamUsagePriorities: Attribute(0x12, TlvArray(TlvEnum<StreamUsage>()), { persistent: true, default: [] }),

            /**
             * This attribute indicates the current value of the hard privacy mode for all streams. This is controlled
             * via a physical button or switch, potentially. A value of TRUE indicates that all streams are currently
             * paused. When FALSE, the streams may resume if they are not already paused by their corresponding soft
             * privacy mode.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.22
             */
            hardPrivacyModeOn: OptionalAttribute(0x15, TlvBoolean, { default: true }),

            /**
             * This attribute indicates whether the status light has been enabled or not. A value of TRUE indicates the
             * status light has been enabled. When enabled, the camera may use it for visual signaling purposes to
             * indicate various states of the camera.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.40
             */
            statusLightEnabled: OptionalWritableAttribute(
                0x27,
                TlvBoolean,
                { persistent: true, default: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute indicates the brightness level of the status light.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.7.41
             */
            statusLightBrightness: OptionalWritableAttribute(
                0x28,
                TlvEnum<ThreeLevelAuto>(),
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            )
        },

        commands: {
            /**
             * This command shall set the relative priorities of the various stream usages on the camera. The camera
             * then bases its allocation of resources for each stream allocation based on the order of these stream
             * priorities. In order to avoid the complexity of dynamically changing the configurations of currently
             * active streams, this command shall NOT be invoked when there are allocated streams. If changes are
             * required while streams are allocated, all existing streams would need to be deallocated before invoking
             * this command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.2.8.12
             */
            setStreamPriorities: Command(
                0xb,
                TlvSetStreamPrioritiesRequest,
                0xb,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            )
        },

        /**
         * This metadata controls which CameraAvStreamManagementCluster elements matter.js activates for specific
         * feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { video: true }, component: VideoOrSnapshotComponent },
            { flags: { snapshot: true }, component: VideoOrSnapshotComponent },
            { flags: { video: true }, component: VideoComponent },
            { flags: { nightVision: true }, component: NightVisionComponent },
            { flags: { audio: true }, component: AudioComponent },
            { flags: { speaker: true }, component: SpeakerComponent },
            { flags: { snapshot: true }, component: SnapshotComponent },
            { flags: { highDynamicRange: true }, component: HighDynamicRangeComponent },
            { flags: { privacy: true }, component: PrivacyComponent },
            { flags: { imageControl: true }, component: ImageControlComponent },
            { flags: { video: true, localStorage: true }, component: VideoAndLocalStorageComponent },
            { flags: { snapshot: true, localStorage: true }, component: SnapshotAndLocalStorageComponent },
            { flags: { video: true, watermark: true }, component: WatermarkOrOnScreenDisplayComponent },
            { flags: { video: true, onScreenDisplay: true }, component: WatermarkOrOnScreenDisplayComponent },
            { flags: { speaker: true, audio: false }, component: false },
            { flags: { imageControl: true, video: true, snapshot: true }, component: false },
            { flags: { watermark: true, video: true, snapshot: true }, component: false },
            { flags: { onScreenDisplay: true, video: true, snapshot: true }, component: false },
            { flags: { highDynamicRange: true, video: true, snapshot: true }, component: false },
            { flags: { nightVision: true, video: true, snapshot: true }, component: false },
            { flags: { audio: false, video: false, snapshot: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This cluster is used to allow clients to manage, control, and configure various audio, video, and snapshot
     * streams on a camera. Broadly, this cluster would be used to:
     *
     *   1. Create and manage all streams on the camera.
     *
     *   2. Manage the static and dynamic characteristics of all streams on the camera.
     *
     *   3. Manage settings attributes that are globally applicable across fabrics and controlled by administrators.
     *
     * Per the Matter specification you cannot use {@link CameraAvStreamManagementCluster} without enabling certain
     * feature combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.2
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const VDO = { video: true };
    const SNP = { snapshot: true };
    const NV = { nightVision: true };
    const ADO = { audio: true };
    const SPKR = { speaker: true };
    const HDR = { highDynamicRange: true };
    const PRIV = { privacy: true };
    const ICTL = { imageControl: true };
    const VDO_STOR = { video: true, localStorage: true };
    const SNP_STOR = { snapshot: true, localStorage: true };
    const WMARK = { watermark: true };
    const OSD = { onScreenDisplay: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Base.id,
        name: Base.name,
        revision: Base.revision,
        features: Base.features,

        attributes: {
            ...Base.attributes,
            maxConcurrentEncoders: MutableCluster.AsConditional(
                VideoOrSnapshotComponent.attributes.maxConcurrentEncoders,
                { mandatoryIf: [VDO, SNP] }
            ),
            maxEncodedPixelRate: MutableCluster.AsConditional(
                VideoOrSnapshotComponent.attributes.maxEncodedPixelRate,
                { mandatoryIf: [VDO, SNP] }
            ),
            videoSensorParams: MutableCluster.AsConditional(
                VideoComponent.attributes.videoSensorParams,
                { mandatoryIf: [VDO] }
            ),
            nightVisionUsesInfrared: MutableCluster.AsConditional(
                NightVisionComponent.attributes.nightVisionUsesInfrared,
                { mandatoryIf: [NV] }
            ),
            minViewportResolution: MutableCluster.AsConditional(
                VideoComponent.attributes.minViewportResolution,
                { mandatoryIf: [VDO] }
            ),
            rateDistortionTradeOffPoints: MutableCluster.AsConditional(
                VideoComponent.attributes.rateDistortionTradeOffPoints,
                { mandatoryIf: [VDO] }
            ),
            microphoneCapabilities: MutableCluster.AsConditional(
                AudioComponent.attributes.microphoneCapabilities,
                { mandatoryIf: [ADO] }
            ),
            speakerCapabilities: MutableCluster.AsConditional(
                SpeakerComponent.attributes.speakerCapabilities,
                { mandatoryIf: [SPKR] }
            ),
            twoWayTalkSupport: MutableCluster.AsConditional(
                SpeakerComponent.attributes.twoWayTalkSupport,
                { mandatoryIf: [SPKR] }
            ),
            snapshotCapabilities: MutableCluster.AsConditional(
                SnapshotComponent.attributes.snapshotCapabilities,
                { mandatoryIf: [SNP] }
            ),
            currentFrameRate: MutableCluster.AsConditional(
                VideoComponent.attributes.currentFrameRate,
                { mandatoryIf: [VDO] }
            ),
            hdrModeEnabled: MutableCluster.AsConditional(
                HighDynamicRangeComponent.attributes.hdrModeEnabled,
                { mandatoryIf: [HDR] }
            ),
            allocatedVideoStreams: MutableCluster.AsConditional(
                VideoComponent.attributes.allocatedVideoStreams,
                { mandatoryIf: [VDO] }
            ),
            allocatedAudioStreams: MutableCluster.AsConditional(
                AudioComponent.attributes.allocatedAudioStreams,
                { mandatoryIf: [ADO] }
            ),
            allocatedSnapshotStreams: MutableCluster.AsConditional(
                SnapshotComponent.attributes.allocatedSnapshotStreams,
                { mandatoryIf: [SNP] }
            ),
            softRecordingPrivacyModeEnabled: MutableCluster.AsConditional(
                PrivacyComponent.attributes.softRecordingPrivacyModeEnabled,
                { mandatoryIf: [PRIV] }
            ),
            softLivestreamPrivacyModeEnabled: MutableCluster.AsConditional(
                PrivacyComponent.attributes.softLivestreamPrivacyModeEnabled,
                { mandatoryIf: [PRIV] }
            ),
            nightVision: MutableCluster.AsConditional(
                NightVisionComponent.attributes.nightVision,
                { mandatoryIf: [NV] }
            ),
            nightVisionIllum: MutableCluster.AsConditional(
                NightVisionComponent.attributes.nightVisionIllum,
                { optionalIf: [NV] }
            ),
            viewport: MutableCluster.AsConditional(VideoComponent.attributes.viewport, { mandatoryIf: [VDO] }),
            speakerMuted: MutableCluster.AsConditional(
                SpeakerComponent.attributes.speakerMuted,
                { mandatoryIf: [SPKR] }
            ),
            speakerVolumeLevel: MutableCluster.AsConditional(
                SpeakerComponent.attributes.speakerVolumeLevel,
                { mandatoryIf: [SPKR] }
            ),
            speakerMaxLevel: MutableCluster.AsConditional(
                SpeakerComponent.attributes.speakerMaxLevel,
                { mandatoryIf: [SPKR] }
            ),
            speakerMinLevel: MutableCluster.AsConditional(
                SpeakerComponent.attributes.speakerMinLevel,
                { mandatoryIf: [SPKR] }
            ),
            microphoneMuted: MutableCluster.AsConditional(
                AudioComponent.attributes.microphoneMuted,
                { mandatoryIf: [ADO] }
            ),
            microphoneVolumeLevel: MutableCluster.AsConditional(
                AudioComponent.attributes.microphoneVolumeLevel,
                { mandatoryIf: [ADO] }
            ),
            microphoneMaxLevel: MutableCluster.AsConditional(
                AudioComponent.attributes.microphoneMaxLevel,
                { mandatoryIf: [ADO] }
            ),
            microphoneMinLevel: MutableCluster.AsConditional(
                AudioComponent.attributes.microphoneMinLevel,
                { mandatoryIf: [ADO] }
            ),
            microphoneAgcEnabled: MutableCluster.AsConditional(
                AudioComponent.attributes.microphoneAgcEnabled,
                { optionalIf: [ADO] }
            ),
            imageRotation: MutableCluster.AsConditional(
                ImageControlComponent.attributes.imageRotation,
                { optionalIf: [ICTL] }
            ),
            imageFlipHorizontal: MutableCluster.AsConditional(
                ImageControlComponent.attributes.imageFlipHorizontal,
                { optionalIf: [ICTL] }
            ),
            imageFlipVertical: MutableCluster.AsConditional(
                ImageControlComponent.attributes.imageFlipVertical,
                { optionalIf: [ICTL] }
            ),
            localVideoRecordingEnabled: MutableCluster.AsConditional(
                VideoAndLocalStorageComponent.attributes.localVideoRecordingEnabled,
                { mandatoryIf: [VDO_STOR] }
            ),
            localSnapshotRecordingEnabled: MutableCluster.AsConditional(
                SnapshotAndLocalStorageComponent.attributes.localSnapshotRecordingEnabled,
                { mandatoryIf: [SNP_STOR] }
            )
        },

        commands: {
            ...Base.commands,
            audioStreamAllocate: MutableCluster.AsConditional(
                AudioComponent.commands.audioStreamAllocate,
                { mandatoryIf: [ADO] }
            ),
            audioStreamDeallocate: MutableCluster.AsConditional(
                AudioComponent.commands.audioStreamDeallocate,
                { mandatoryIf: [ADO] }
            ),
            videoStreamAllocate: MutableCluster.AsConditional(
                VideoComponent.commands.videoStreamAllocate,
                { mandatoryIf: [VDO] }
            ),
            videoStreamModify: MutableCluster.AsConditional(
                WatermarkOrOnScreenDisplayComponent.commands.videoStreamModify,
                { mandatoryIf: [VDO, WMARK, OSD] }
            ),
            videoStreamDeallocate: MutableCluster.AsConditional(
                VideoComponent.commands.videoStreamDeallocate,
                { mandatoryIf: [VDO] }
            ),
            snapshotStreamAllocate: MutableCluster.AsConditional(
                SnapshotComponent.commands.snapshotStreamAllocate,
                { mandatoryIf: [SNP] }
            ),
            snapshotStreamDeallocate: MutableCluster.AsConditional(
                SnapshotComponent.commands.snapshotStreamDeallocate,
                { mandatoryIf: [SNP] }
            ),
            captureSnapshot: MutableCluster.AsConditional(
                SnapshotComponent.commands.captureSnapshot,
                { mandatoryIf: [SNP] }
            )
        }
    });

    /**
     * This cluster supports all CameraAvStreamManagement features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type CameraAvStreamManagementCluster = CameraAvStreamManagement.Cluster;
export const CameraAvStreamManagementCluster = CameraAvStreamManagement.Cluster;
ClusterRegistry.register(CameraAvStreamManagement.Complete);
