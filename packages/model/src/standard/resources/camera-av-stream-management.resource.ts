/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "CameraAvStreamManagement", pics: "AVSM", xref: "cluster§11.2",

    details: "This cluster is used to allow clients to manage, control, and configure various audio, video, and " +
        "snapshot streams on a camera. Broadly, this cluster would be used to:" +
        "\n" +
        "  1. Create and manage all streams on the camera." +
        "\n" +
        "  2. Manage the static and dynamic characteristics of all streams on the camera." +
        "\n" +
        "  3. Manage settings attributes that are globally applicable across fabrics and controlled by " +
        "administrators.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§11.2.5",

            children: [
                {
                    tag: "field", name: "ADO", xref: "cluster§11.2.5.1",
                    details: "The Audio feature indicates the ability of the node to support audio streams."
                },
                {
                    tag: "field", name: "VDO", xref: "cluster§11.2.5.2",
                    details: "The Video feature indicates the ability of the node to support video streams. The video streams " +
                        "could be for either live streaming or recording stream transfer, or both."
                },
                {
                    tag: "field", name: "SNP", xref: "cluster§11.2.5.3",
                    details: "The Snapshot feature indicates the ability of the node to support snapshot streams."
                },
                {
                    tag: "field", name: "PRIV", xref: "cluster§11.2.5.4",
                    details: "The Privacy feature indicates the ability of the node to support privacy settings."
                },

                {
                    tag: "field", name: "SPKR", xref: "cluster§11.2.5.5",
                    details: "The Speaker feature indicates the ability of the node to support audio playback via a speaker. The " +
                        "Audio feature shall be supported if the Speaker feature is supported. Nodes which support this " +
                        "feature shall have the ability to perform playback audio mixing in software or hardware."
                },

                { tag: "field", name: "ICTL", details: "Image control supported" },
                {
                    tag: "field", name: "WMARK", xref: "cluster§11.2.5.7",
                    details: "The Watermark feature indicates the ability of the node to apply a manufacturer watermark logo on a " +
                        "video stream."
                },
                {
                    tag: "field", name: "OSD", xref: "cluster§11.2.5.8",
                    details: "The On Screen Display (OSD) feature indicates the ability of the node to display text such as date, " +
                        "time, timezone, and/or device name, etc. for a video stream."
                },

                {
                    tag: "field", name: "STOR", xref: "cluster§11.2.5.9",
                    details: "The Local Storage feature indicates that this device has the ability to store recordings and/or " +
                        "snapshots on this device itself. While this specification defines the ability to have this feature " +
                        "and enable or disable it only, it does not currently define any way to access or manage this " +
                        "storage."
                },

                {
                    tag: "field", name: "HDR", xref: "cluster§11.2.5.10",
                    details: "The High Dynamic Range feature indicates that the sensor on this device supports operating in High " +
                        "Dynamic Range mode, in addition to a normal operating mode."
                },
                {
                    tag: "field", name: "NV", xref: "cluster§11.2.5.11",
                    details: "The Night Vision feature indicates the ability to operate in a low light environment mode, in " +
                        "addition to a normal operating mode."
                }
            ]
        },

        {
            tag: "attribute", name: "MaxConcurrentEncoders", xref: "cluster§11.2.7.1",
            details: "Indicates the maximum number of concurrent encoders supported by the camera."
        },

        {
            tag: "attribute", name: "MaxEncodedPixelRate", xref: "cluster§11.2.7.2",

            details: "Indicates the maximum data rate in encoded pixels per second that the camera can produce given the " +
                "hardware encoder resources it has. This value is manufacturer specified." +
                "\n" +
                "If the camera supports Snapshots and requires hardware encoder resources to produce those Snapshots, " +
                "then this attribute shall be present, and a manufacturer specific value shall be present in each " +
                "SnapshotCapabilities MaxFrameRate entry that requires hardware resources to produce."
        },

        {
            tag: "attribute", name: "VideoSensorParams", xref: "cluster§11.2.7.3",
            details: "Indicates the set of video sensor parameters for the camera. These include the video sensor " +
                "dimensions, its frame rate and HDR capabilities."
        },

        {
            tag: "attribute", name: "NightVisionUsesInfrared", xref: "cluster§11.2.7.4",
            details: "Indicates if the night vision mode is infrared based or not. A value of TRUE indicates infrared mode " +
                "with a cut filter being used. A value of FALSE indicates color is used. When infrared is active and " +
                "the resulting content is in black and white, the BlackAndWhiteActive field inside any produced " +
                "AVMetadataStruct shall be TRUE."
        },

        {
            tag: "attribute", name: "MinViewportResolution", xref: "cluster§11.2.7.5",

            details: "Indicates the minimum resolution (width and height) in pixels that the camera allows for its " +
                "viewport." +
                "\n" +
                "The choice of the minimum viewport width and height is, typically, directed towards maintaining the " +
                "best image quality (reduced distortion) for a given size of the video sensor, for different camera " +
                "functions, e.g., digital zoom. Furthermore, the minimum viewport size and the video sensor size also " +
                "dictate the upscaling capabilities and requirements of the image processor."
        },

        {
            tag: "attribute", name: "RateDistortionTradeOffPoints", xref: "cluster§11.2.7.6",
            details: "This attribute shall list the set of rate distortion trade-off points between resolution, frame rate " +
                "and bitrate for each supported hardware encoder."
        },

        {
            tag: "attribute", name: "MaxContentBufferSize", xref: "cluster§11.2.7.7",
            details: "Indicates the maximum size of the content buffer in bytes. This buffer holds the compressed and/or " +
                "raw content for audio/video pre-roll, queued transmissions, the current frame for each snapshot " +
                "stream, and the metadata context for recording events. For devices which support more than one " +
                "encoder, the device shall evenly allocate this buffer space amongst all streams that utilize " +
                "pre-roll content such as the Push AV Stream Transport Cluster."
        },

        {
            tag: "attribute", name: "MicrophoneCapabilities", xref: "cluster§11.2.7.8",
            details: "Indicates the audio capabilities of the microphone in terms of the codec used, supported sample " +
                "rates and the number of channels."
        },
        {
            tag: "attribute", name: "SpeakerCapabilities", xref: "cluster§11.2.7.9",
            details: "Indicates the audio capabilities of the speaker in terms of the supported codecs, sample rates, and " +
                "the number of channels when a speaker is present."
        },
        {
            tag: "attribute", name: "TwoWayTalkSupport", xref: "cluster§11.2.7.10",
            details: "Indicates the type of two-way talk support the device has, e.g., NotSupported, HalfDuplex, or " +
                "FullDuplex."
        },
        {
            tag: "attribute", name: "SnapshotCapabilities", xref: "cluster§11.2.7.11",
            details: "Indicates the list of supported snapshot capabilities the device has. This list is a set of entries " +
                "for image codec, resolution, maximum frame rate, hardware encoder, and encoded pixels."
        },
        {
            tag: "attribute", name: "MaxNetworkBandwidth", xref: "cluster§11.2.7.12",
            details: "Indicates the maximum network bandwidth in bits per second that the device would consume for the " +
                "transmission of its media streams."
        },
        {
            tag: "attribute", name: "CurrentFrameRate", xref: "cluster§11.2.7.13",
            details: "Indicates the current logical frame rate of the sensor in frames per second."
        },
        {
            tag: "attribute", name: "HdrModeEnabled", xref: "cluster§11.2.7.14",
            details: "This attribute indicates the currently selected High Dynamic Range (HDR) mode. A value of TRUE " +
                "indicates that HDR video capturing is enabled. Otherwise, HDR video capturing is disabled."
        },

        {
            tag: "attribute", name: "SupportedStreamUsages", xref: "cluster§11.2.7.15",
            details: "Indicates the list of Stream Usages that are supported by the camera. Manufacturers shall provide a " +
                "usages list that is appropriate to their product. If a usage is found in this list, then it can be " +
                "used in the StreamUsagePriorities attribute. The ordering and values of this list shall match the " +
                "values found in StreamUsagePriorities after a factory reset."
        },

        {
            tag: "attribute", name: "AllocatedVideoStreams", xref: "cluster§11.2.7.16",
            details: "Indicates the list of allocated video streams on the device."
        },
        {
            tag: "attribute", name: "AllocatedAudioStreams", xref: "cluster§11.2.7.17",
            details: "Indicates the list of allocated audio streams on the device."
        },
        {
            tag: "attribute", name: "AllocatedSnapshotStreams", xref: "cluster§11.2.7.18",
            details: "Indicates the list of allocated snapshot streams on the device."
        },

        {
            tag: "attribute", name: "StreamUsagePriorities", xref: "cluster§11.2.7.19",

            details: "Indicates a list of the video stream usages represented in a ranked order of their priorities, " +
                "starting with Index 0 having the stream usage type with the highest priority. See Resource " +
                "Management and Stream Priorities for further details. Only usages found in the SupportedStreamUsages " +
                "attribute can be included. To change the contents, use the SetStreamPriorities command. " +
                "Manufacturers shall provide a default ranked priorities list that is appropriate to their product " +
                "and this default ranking shall exactly match the contents of SupportedStreamUsages. Clients can use " +
                "the contents of the SupportedStreamUsages to restore this default state if the contents have been " +
                "changed by the SetStreamPriorities command."
        },

        {
            tag: "attribute", name: "SoftRecordingPrivacyModeEnabled", xref: "cluster§11.2.7.20",

            details: "This attribute indicates the current value of the soft privacy mode for transports using the Stream " +
                "Usage types Recording and Analysis. A value of TRUE indicates that delivery of video frames and " +
                "audio samples from any streams to these transports is skipped. A value of TRUE also indicates that " +
                "no new transports using these stream usage values can be created or started. When FALSE, these " +
                "transports can be resumed or started, and have video frames and audio samples delivered." +
                "\n" +
                "When this attribute is set to TRUE, any active WebRTC transports using these stream usage types " +
                "shall terminate the session by calling End using WebRTCEndReasonEnum PrivacyMode."
        },

        {
            tag: "attribute", name: "SoftLivestreamPrivacyModeEnabled", xref: "cluster§11.2.7.21",

            details: "This attribute indicates the current value of the soft privacy mode for transports using the Stream " +
                "Usage type LiveView. A value of TRUE indicates that delivery of video frames and audio samples from " +
                "any streams to these transports is skipped. A value of TRUE also indicates that no new transports " +
                "using this stream usage type can be created or started. When FALSE, these transports can be resumed " +
                "or started, and have video frames and audio samples delivered." +
                "\n" +
                "When this attribute is set to TRUE, any active WebRTC transports using this stream usage type shall " +
                "terminate the session by calling End using WebRTCEndReasonEnum PrivacyMode."
        },

        {
            tag: "attribute", name: "HardPrivacyModeOn", xref: "cluster§11.2.7.22",
            details: "This attribute indicates the current value of the hard privacy mode for all streams. This is " +
                "controlled via a physical button or switch, potentially. A value of TRUE indicates that all streams " +
                "are currently paused. When FALSE, the streams may resume if they are not already paused by their " +
                "corresponding soft privacy mode."
        },

        {
            tag: "attribute", name: "NightVision", xref: "cluster§11.2.7.23",
            details: "This attribute indicates the currently selected Night Vision mode. A value of Off means the device " +
                "will never activate its Night Vision mode of operation. A value of On means the Night Vision mode of " +
                "operation is always active. A value of Auto means the device will automatically move between active " +
                "and inactive based on the light level it detects."
        },

        {
            tag: "attribute", name: "NightVisionIllum", xref: "cluster§11.2.7.24",
            details: "This attribute indicates the currently selected the Night Vision Illumination mode. A value of Off " +
                "means the device will never activate its built-in Night Vision Illumination. A value of On means the " +
                "built-in Night Vision Illumination is always active. A value of Auto means the device will " +
                "automatically enable its built-in Night Vision Illumination based on the light level it detects."
        },

        {
            tag: "attribute", name: "Viewport", xref: "cluster§11.2.7.25",

            details: "This attribute shall be a ViewportStruct representing the viewport to apply to all streams." +
                "\n" +
                "The coordinate values represent the upper left corner and lower right corner coordinates of the " +
                "source rectangle on the sensor. The coordinate values are within the two-dimensional Cartesian plane " +
                "of size SensorWidth and SensorHeight (See VideoSensorParamsStruct in the VideoSensorParams) with the " +
                "origin (0,0) being the upper left corner, positive X and Y values moving right and down across the " +
                "Cartesian plane respectively, and (SensorWidth, SensorHeight) being the lower right corner." +
                "\n" +
                "When changing the Viewport, the aspect ratio of the sensor as indicated in the VideoSensorParams " +
                "attribute SHOULD be preserved." +
                "\n" +
                "After a factory reset, this shall default to {0, 0, SensorWidth,SensorHeight}, using the SensorWidth " +
                "and SensorHeight fields from the VideoSensorParams attribute." +
                "\n" +
                "When this attribute is changed, all Viewport values found in DPTZStreams shall be updated to the new " +
                "values set here."
        },

        {
            tag: "attribute", name: "SpeakerMuted", xref: "cluster§11.2.7.26",
            details: "This attribute indicates whether the speaker is currently muted or not. A value of TRUE indicates " +
                "that the speaker has been muted and shall not play anything. A value of FALSE indicates that the " +
                "Speaker is enabled."
        },

        {
            tag: "attribute", name: "SpeakerVolumeLevel", xref: "cluster§11.2.7.27",
            details: "This attribute indicates the current volume level of the speaker."
        },
        {
            tag: "attribute", name: "SpeakerMaxLevel", xref: "cluster§11.2.7.28",
            details: "This attribute indicates the maximum value of the SpeakerVolumeLevel that can be assigned."
        },
        {
            tag: "attribute", name: "SpeakerMinLevel", xref: "cluster§11.2.7.29",
            details: "This attribute indicates the minimum value of the SpeakerVolumeLevel that can be assigned."
        },

        {
            tag: "attribute", name: "MicrophoneMuted", xref: "cluster§11.2.7.30",
            details: "This attribute indicates whether the microphone is currently muted or not. A value of TRUE indicates " +
                "that the microphone has been muted. In this state, the microphone data shall be replaced with all 0 " +
                "bits, representing silence. A value of FALSE indicates that the microphone is On and is capable of " +
                "transmitting audio."
        },

        {
            tag: "attribute", name: "MicrophoneVolumeLevel", xref: "cluster§11.2.7.31",
            details: "This attribute indicates the current gain or volume level of the microphone."
        },
        {
            tag: "attribute", name: "MicrophoneMaxLevel", xref: "cluster§11.2.7.32",
            details: "This attribute indicates the maximum value of the MicrophoneVolumeLevel that can be assigned."
        },
        {
            tag: "attribute", name: "MicrophoneMinLevel", xref: "cluster§11.2.7.33",
            details: "This attribute indicates the minimum value of the MicrophoneVolumeLevel that can be assigned."
        },
        {
            tag: "attribute", name: "MicrophoneAgcEnabled", xref: "cluster§11.2.7.34",
            details: "This attribute indicates the currently selected AGC (Automatic Gain Control) mode for the " +
                "microphone. A value of TRUE indicates that microphone AGC is enabled. Otherwise, it is disabled."
        },
        {
            tag: "attribute", name: "ImageRotation", xref: "cluster§11.2.7.35",
            details: "This attribute indicates the amount of clockwise rotation in degrees that the image has been " +
                "subjected to."
        },
        {
            tag: "attribute", name: "ImageFlipHorizontal", xref: "cluster§11.2.7.36",
            details: "This attribute indicates whether the image has been flipped horizontally or not. A value of TRUE " +
                "indicates that the image has been flipped horizontally."
        },
        {
            tag: "attribute", name: "ImageFlipVertical", xref: "cluster§11.2.7.37",
            details: "This attribute indicates whether the image has been flipped vertically or not. A value of TRUE " +
                "indicates that the image has been flipped vertically."
        },
        {
            tag: "attribute", name: "LocalVideoRecordingEnabled", xref: "cluster§11.2.7.38",
            details: "This attribute indicates whether local storage based video recording is enabled. A value of TRUE " +
                "indicates that local storage based video recording has been enabled."
        },
        {
            tag: "attribute", name: "LocalSnapshotRecordingEnabled", xref: "cluster§11.2.7.39",
            details: "This attribute indicates whether local storage based snapshot recording is enabled. A value of TRUE " +
                "indicates that local storage based snapshot recording has been enabled."
        },

        {
            tag: "attribute", name: "StatusLightEnabled", xref: "cluster§11.2.7.40",
            details: "This attribute indicates whether the status light has been enabled or not. A value of TRUE indicates " +
                "the status light has been enabled. When enabled, the camera may use it for visual signaling purposes " +
                "to indicate various states of the camera."
        },

        {
            tag: "attribute", name: "StatusLightBrightness", xref: "cluster§11.2.7.41",
            details: "This attribute indicates the brightness level of the status light."
        },

        {
            tag: "command", name: "AudioStreamAllocate", xref: "cluster§11.2.8.1",
            details: "This command shall allocate an audio stream on the camera and return an allocated audio stream " +
                "identifier.",

            children: [
                {
                    tag: "field", name: "StreamUsage", xref: "cluster§11.2.8.1.1",
                    details: "This field shall indicate the usage of the stream (Recording, LiveView, etc) that this allocation is " +
                        "for."
                },
                {
                    tag: "field", name: "AudioCodec", xref: "cluster§11.2.8.1.2",
                    details: "This field shall indicate the type of Codec used by the allocated stream."
                },
                {
                    tag: "field", name: "ChannelCount", xref: "cluster§11.2.8.1.3",
                    details: "This field shall indicate the number of channels used by the allocated stream, e.g., Mono (1), " +
                        "Stereo (2), etc."
                },
                {
                    tag: "field", name: "SampleRate", xref: "cluster§11.2.8.1.4",
                    details: "This field shall indicate the sampling rate of the audio stream in Hz. Typical values would be 48000 " +
                        "(48 kHz), 32000 (32 kHz) or 16000 (16 kHz)."
                },
                {
                    tag: "field", name: "BitRate", xref: "cluster§11.2.8.1.5",
                    details: "This field shall indicate the bitrate of the specified audio codec in bits per second. The default " +
                        "bitrate may vary based on the type of device and codec."
                },
                {
                    tag: "field", name: "BitDepth", xref: "cluster§11.2.8.1.6",
                    details: "This field shall indicate the number of bits of information (8, 16, 24 or 32 bits) used to represent " +
                        "each sample of the audio signal."
                }
            ]
        },

        {
            tag: "command", name: "AudioStreamAllocateResponse", xref: "cluster§11.2.8.2",
            details: "This command shall be sent by the camera in response to the AudioStreamAllocate command, carrying " +
                "the newly allocated or re-used audio stream identifier.",
            children: [{
                tag: "field", name: "AudioStreamId", xref: "cluster§11.2.8.2.1",
                details: "The AudioStreamID field shall be a AudioStreamID representing the unique audio stream identifier."
            }]
        },

        {
            tag: "command", name: "AudioStreamDeallocate", xref: "cluster§11.2.8.3",
            details: "This command shall deallocate an audio stream on the camera, corresponding to the given audio stream " +
                "identifier.",
            children: [{
                tag: "field", name: "AudioStreamId", xref: "cluster§11.2.8.3.1",
                details: "The AudioStreamID field shall be a AudioStreamID representing the unique audio stream identifier for " +
                    "the stream that needs to be deallocated."
            }]
        },

        {
            tag: "command", name: "VideoStreamAllocate", xref: "cluster§11.2.8.4",
            details: "This command shall allocate a video stream on the camera and return an allocated video stream " +
                "identifier.",

            children: [
                {
                    tag: "field", name: "StreamUsage", xref: "cluster§11.2.8.4.1",
                    details: "This field shall indicate the usage of the stream (Recording, LiveView, etc) that this allocation is " +
                        "for."
                },
                {
                    tag: "field", name: "VideoCodec", xref: "cluster§11.2.8.4.2",
                    details: "This field shall indicate the type of codec used by the allocated video stream."
                },
                {
                    tag: "field", name: "MinFrameRate", xref: "cluster§11.2.8.4.3",
                    details: "This field shall indicate the minimum frame rate in frames per second of the allocated video stream."
                },
                {
                    tag: "field", name: "MaxFrameRate", xref: "cluster§11.2.8.4.4",
                    details: "This field shall indicate the maximum frame rate in frames per second of the allocated video stream."
                },
                {
                    tag: "field", name: "MinResolution", xref: "cluster§11.2.8.4.5",
                    details: "This field shall indicate the minimum resolution of the allocated video stream."
                },
                {
                    tag: "field", name: "MaxResolution", xref: "cluster§11.2.8.4.6",
                    details: "This field shall indicate the maximum resolution of the allocated video stream."
                },
                {
                    tag: "field", name: "MinBitRate", xref: "cluster§11.2.8.4.7",
                    details: "This field shall indicate the minimum bitrate in bits per second of the allocated video stream."
                },
                {
                    tag: "field", name: "MaxBitRate", xref: "cluster§11.2.8.4.8",
                    details: "This field shall indicate the maximum bitrate in bits per second of the allocated video stream."
                },
                {
                    tag: "field", name: "KeyFrameInterval", xref: "cluster§11.2.8.4.9",
                    details: "This field shall indicate the duration in milliseconds before a regular key-frame is generated. See " +
                        "KeyFrameInterval for further details."
                },
                {
                    tag: "field", name: "WatermarkEnabled", xref: "cluster§11.2.8.4.10",
                    details: "This field shall indicate whether a watermark can be applied on the video stream. A value of TRUE " +
                        "means that watermarking has been enabled for that stream."
                },
                {
                    tag: "field", name: "OsdEnabled", xref: "cluster§11.2.8.4.11",
                    details: "This field shall indicate whether the OSD (On-Screen Display) can be applied on the video stream. A " +
                        "value of TRUE means that OSD has been enabled for that stream."
                }
            ]
        },

        {
            tag: "command", name: "VideoStreamAllocateResponse", xref: "cluster§11.2.8.5",
            details: "This command shall be sent by the camera in response to the VideoStreamAllocate command, carrying " +
                "the newly allocated or re-used video stream identifier.",
            children: [{
                tag: "field", name: "VideoStreamId", xref: "cluster§11.2.8.5.1",
                details: "This field shall be a VideoStreamID representing the newly created unique video stream identifier."
            }]
        },

        {
            tag: "command", name: "VideoStreamModify", xref: "cluster§11.2.8.6",
            details: "This command shall be used to modify a stream specified by the VideoStreamID.",

            children: [
                {
                    tag: "field", name: "VideoStreamId", xref: "cluster§11.2.8.6.1",
                    details: "This field shall be a VideoStreamID representing the video stream to modify."
                },

                {
                    tag: "field", name: "WatermarkEnabled", xref: "cluster§11.2.8.6.2",
                    details: "This field shall indicate whether a watermark can be applied on the video stream. A value of TRUE " +
                        "means that watermarking has been requested for that stream. If this field is not present, then no " +
                        "change to the existing value shall be made."
                },

                {
                    tag: "field", name: "OsdEnabled", xref: "cluster§11.2.8.6.3",
                    details: "This field shall indicate whether the OSD (On-Screen Display) can be applied on the video stream. A " +
                        "value of TRUE means that OSD has been requested for that stream. If this field is not present, then " +
                        "no change to the existing value shall be made."
                }
            ]
        },

        {
            tag: "command", name: "VideoStreamDeallocate", xref: "cluster§11.2.8.7",
            details: "This command shall deallocate a video stream on the camera, corresponding to the given video stream " +
                "identifier.",
            children: [{
                tag: "field", name: "VideoStreamId", xref: "cluster§11.2.8.7.1",
                details: "This field shall be a VideoStreamID for the stream to be deallocated."
            }]
        },

        {
            tag: "command", name: "SnapshotStreamAllocate", xref: "cluster§11.2.8.8",
            details: "This command shall allocate a snapshot stream on the device and return an allocated snapshot stream " +
                "identifier.",

            children: [
                {
                    tag: "field", name: "ImageCodec", xref: "cluster§11.2.8.8.1",
                    details: "This field shall indicate the type of image codec to be used by the allocated snapshot stream as " +
                        "described in ImageCodecEnum."
                },
                {
                    tag: "field", name: "MaxFrameRate", xref: "cluster§11.2.8.8.2",
                    details: "This field shall indicate the maximum frame rate in frames per second of the allocated snapshot " +
                        "stream."
                },
                {
                    tag: "field", name: "MinResolution", xref: "cluster§11.2.8.8.3",
                    details: "This field shall indicate the minimum resolution of the allocated snapshot stream."
                },
                {
                    tag: "field", name: "MaxResolution", xref: "cluster§11.2.8.8.4",
                    details: "This field shall indicate the maximum resolution of the allocated snapshot stream."
                },
                {
                    tag: "field", name: "Quality", xref: "cluster§11.2.8.8.5",
                    details: "This field shall indicate a codec quality metric(integer between 1 and 100) for the allocated " +
                        "snapshot stream."
                },

                {
                    tag: "field", name: "WatermarkEnabled", xref: "cluster§11.2.8.8.6",

                    details: "This field shall indicate whether a watermark can be applied on the snapshot stream. A value of TRUE " +
                        "means that watermarking has been requested for that stream." +
                        "\n" +
                        "This field may be ignored if RequiresHardwareEncoder is FALSE on the matching entry from " +
                        "SnapshotCapabilities. When ignored, the associated WatermarkEnabled entry for the Video Stream that " +
                        "is the source of this snapshot may be used."
                },

                {
                    tag: "field", name: "OsdEnabled", xref: "cluster§11.2.8.8.7",

                    details: "This field shall indicate whether the OSD (On-Screen Display) can be applied on the snapshot stream. " +
                        "A value of TRUE means that OSD has been requested for that stream." +
                        "\n" +
                        "This field may be ignored if RequiresHardwareEncoder is FALSE on the matching entry from " +
                        "SnapshotCapabilities. When ignored, the associated OSDEnabled entry for the Video Stream that is the " +
                        "source of this snapshot may be used."
                }
            ]
        },

        {
            tag: "command", name: "SnapshotStreamAllocateResponse", xref: "cluster§11.2.8.9",
            details: "This command shall be sent by the device in response to the SnapshotStreamAllocate command, carrying " +
                "the newly allocated or re-used snapshot stream identifier.",
            children: [{
                tag: "field", name: "SnapshotStreamId", xref: "cluster§11.2.8.9.1",
                details: "The SnapshotStreamID field shall be an unsigned 16 bit integer representing the unique snapshot " +
                    "stream identifier."
            }]
        },

        {
            tag: "command", name: "SnapshotStreamModify", xref: "cluster§11.2.8.11",
            details: "This command shall be used to modify a stream specified by the VideoStreamID.",

            children: [
                {
                    tag: "field", name: "SnapshotStreamId", xref: "cluster§11.2.8.11.1",
                    details: "This field shall be a SnapshotStreamID representing the snapshot stream to modify."
                },

                {
                    tag: "field", name: "WatermarkEnabled", xref: "cluster§11.2.8.11.2",
                    details: "This field shall indicate whether a watermark can be applied on the video stream. A value of TRUE " +
                        "means that watermarking has been requested for that stream." +
                        "\n" +
                        "If this field is not present, then no change to the existing value shall be made."
                },

                {
                    tag: "field", name: "OsdEnabled", xref: "cluster§11.2.8.11.3",
                    details: "This field shall indicate whether the OSD (On-Screen Display) can be applied on the video stream. A " +
                        "value of TRUE means that OSD has been requested for that stream." +
                        "\n" +
                        "If this field is not present, then no change to the existing value shall be made."
                }
            ]
        },

        {
            tag: "command", name: "SnapshotStreamDeallocate", xref: "cluster§11.2.8.10",
            details: "This command shall deallocate an snapshot stream on the camera, corresponding to the given snapshot " +
                "stream identifier.",
            children: [{
                tag: "field", name: "SnapshotStreamId", xref: "cluster§11.2.8.10.1",
                details: "The SnapshotStreamID field shall be an unsigned 16 bit integer representing the unique snapshot " +
                    "stream identifier for the stream that needs to be deallocated."
            }]
        },

        {
            tag: "command", name: "SetStreamPriorities", xref: "cluster§11.2.8.12",

            details: "This command shall set the relative priorities of the various stream usages on the camera. The " +
                "camera then bases its allocation of resources for each stream allocation based on the order of these " +
                "stream priorities. In order to avoid the complexity of dynamically changing the configurations of " +
                "currently active streams, this command shall NOT be invoked when there are allocated streams. If " +
                "changes are required while streams are allocated, all existing streams would need to be deallocated " +
                "before invoking this command.",

            children: [{
                tag: "field", name: "StreamPriorities", xref: "cluster§11.2.8.12.1",
                details: "The StreamPriorities field shall contain a list of stream usages in decreasing order of stream " +
                    "priorities, starting at index 0 of the list, with no duplicate values allowed, and only containing " +
                    "entries found in SupportedStreamUsages."
            }]
        },

        {
            tag: "command", name: "CaptureSnapshot", xref: "cluster§11.2.8.13",
            details: "This command shall return a Snapshot from the camera.",

            children: [
                {
                    tag: "field", name: "SnapshotStreamId", xref: "cluster§11.2.8.13.1",
                    details: "The SnapshotStreamID field shall be a SnapshotStreamID representing the allocated Snapshot Stream to " +
                        "use, or null to allow automatic stream selection."
                },
                {
                    tag: "field", name: "RequestedResolution", xref: "cluster§11.2.8.13.2",
                    details: "The RequestedResolution field shall be a VideoResolutionStruct representing the preferred resolution " +
                        "of the snapshot."
                }
            ]
        },

        {
            tag: "command", name: "CaptureSnapshotResponse", xref: "cluster§11.2.8.14",
            details: "This command shall be sent by the device in response to the CaptureSnapshot command, carrying the " +
                "requested snapshot.",

            children: [
                {
                    tag: "field", name: "Data", xref: "cluster§11.2.8.14.1",
                    details: "The Data field shall be an octet string representing the image data."
                },

                {
                    tag: "field", name: "ImageCodec", xref: "cluster§11.2.8.14.2",
                    details: "The ImageCodec field shall be an ImageCodecEnum representing the codec used to encode the image. " +
                        "This shall match the value found in the corresponding allocated snapshot stream and is provided for " +
                        "convenience."
                },

                {
                    tag: "field", name: "Resolution", xref: "cluster§11.2.8.14.3",
                    details: "The Resolution field shall be a VideoResolutionStruct representing the resolution of the supplied " +
                        "image."
                }
            ]
        },

        {
            tag: "datatype", name: "VideoCodecEnum", xref: "cluster§11.2.6.1",
            details: "This data type provides an enumeration of the video codecs supported by the camera.",

            children: [
                {
                    tag: "field", name: "H264", description: "Advanced Video Coding (H.264) codec.",
                    xref: "cluster§11.2.6.1.1",
                    details: "Advanced Video Coding (AVC) standard, also referred to as MPEG-4 Part 10, is a widely used codec " +
                        "offering good balance of compression and quality."
                },

                {
                    tag: "field", name: "Hevc", description: "High efficiency Video Coding (H.265) codec.",
                    xref: "cluster§11.2.6.1.2",
                    details: "High Efficiency Video Coding, also known as H.265, is a successor to H.264. It offers significantly " +
                        "better compression at the same quality level of its predecessors."
                },

                {
                    tag: "field", name: "Vvc", description: "Versatile Video Coding (H.266) codec.",
                    xref: "cluster§11.2.6.1.3",
                    details: "Versatile Video Coding, also known as H.266, is a successor to H.265. It builds upon the " +
                        "capabilities of its predecessors to achieve even more efficient compression."
                },

                {
                    tag: "field", name: "Av1", description: "AOMedia Video 1 codec.", xref: "cluster§11.2.6.1.4",
                    details: "An open-source and royalty-free codec that provides high compression efficiency."
                }
            ]
        },

        {
            tag: "datatype", name: "AudioCodecEnum", xref: "cluster§11.2.6.2",
            details: "This data type provides an enumeration of the audio codecs supported by the camera.",

            children: [
                {
                    tag: "field", name: "Opus", description: "Open source IETF standard codec.",
                    xref: "cluster§11.2.6.2.1",
                    details: "An open-source and royalty-free audio codec that is versatile and designed for both speech and " +
                        "music."
                },

                { tag: "field", name: "AacLc", description: "Advanced Audio Coding codec-Low Complexity" }
            ]
        },

        {
            tag: "datatype", name: "ImageCodecEnum", xref: "cluster§11.2.6.3",
            details: "This data type provides an enumeration of the image codecs supported by the camera.",

            children: [
                {
                    tag: "field", name: "Jpeg", description: "JPEG image codec.", xref: "cluster§11.2.6.3.1",
                    details: "The JPEG image codec as defined by ITU-T T.81 and ISO/IEC 10918."
                },
                {
                    tag: "field", name: "Heic", description: "HEIC image codec.", xref: "cluster§11.2.6.3.2",
                    details: "The HEIC image codec as defined in Annex B of ISO/IEC 23008-12 also known as the HEVC Image File " +
                        "Format. Support for HEIC is optional, but recommended if the HEVC video codec is supported."
                }
            ]
        },

        {
            tag: "datatype", name: "TwoWayTalkSupportTypeEnum", xref: "cluster§11.2.6.4",
            details: "This data type provides an enumeration of the different modes of bi-directional audio communication " +
                "that are supported by the camera.",
            children: [
                { tag: "field", name: "NotSupported", description: "Two-way Talk support is absent." },
                { tag: "field", name: "HalfDuplex", description: "Audio in one direction at a time." },
                { tag: "field", name: "FullDuplex", description: "Audio in both directions simultaneously." }
            ]
        },

        {
            tag: "datatype", name: "TriStateAutoEnum", xref: "cluster§11.2.6.5",
            details: "This data type is derived from enum8 and is used for tri-state settings on a device, where a setting " +
                "can be in one of three states, i.e., On, Off, or Automatic.",
            children: [
                { tag: "field", name: "Off", description: "Off" },
                { tag: "field", name: "On", description: "On" },
                { tag: "field", name: "Auto", description: "Automatic Operation" }
            ]
        },

        {
            tag: "datatype", name: "VideoSensorParamsStruct", xref: "cluster§11.2.6.6",
            details: "This struct is used to define a video sensor and its characteristics.",

            children: [
                {
                    tag: "field", name: "SensorWidth", xref: "cluster§11.2.6.6.1",
                    details: "This field shall indicate the practical width of the video sensor in pixels. This value is used for " +
                        "various purposes such as resolution control, boundaries for the Zone Management Cluster and digital " +
                        "Pan/Tilt/Zoom commands in the Camera AV Settings User Level Management."
                },

                {
                    tag: "field", name: "SensorHeight", xref: "cluster§11.2.6.6.2",
                    details: "This field shall indicate the practical height of the video sensor in pixels. This value is used for " +
                        "various purposes such as resolution control, boundaries for the Zone Management Cluster and digital " +
                        "Pan/Tilt/Zoom commands in the Camera AV Settings User Level Management."
                },

                {
                    tag: "field", name: "MaxFps", xref: "cluster§11.2.6.6.3",
                    details: "This field shall indicate the maximum frame rate, in frames per second, that the video sensor is " +
                        "capable of supporting."
                },
                {
                    tag: "field", name: "MaxHdrfps", xref: "cluster§11.2.6.6.4",
                    details: "This field shall indicate the maximum frame rate, in frames per second, that the video sensor is " +
                        "capable of supporting when HDR is enabled. The value may be less than or equal to the MaxFPS."
                }
            ]
        },

        {
            tag: "datatype", name: "VideoResolutionStruct", xref: "cluster§11.2.6.7",
            details: "This object defines the resolution parameters in pixels which can be used for defining the " +
                "resolutions of different video streams.",

            children: [
                {
                    tag: "field", name: "Width", xref: "cluster§11.2.6.7.1",
                    details: "This field shall indicate the width, in number of pixels, for a frame."
                },
                {
                    tag: "field", name: "Height", xref: "cluster§11.2.6.7.2",
                    details: "This field shall indicate the height, in number of pixels, for a frame."
                }
            ]
        },

        {
            tag: "datatype", name: "RateDistortionTradeOffPointsStruct", xref: "cluster§11.2.6.8",
            details: "This struct is used to define a set of parameters of the hardware video encoder that alter the rate " +
                "distortion trade-off points. The points are expressed as the minimum bitrate and resolution for each " +
                "supported codec type.",

            children: [
                {
                    tag: "field", name: "Codec", xref: "cluster§11.2.6.8.1",
                    details: "This field shall indicate the type of video codec based on the supported VideoCodecEnum types."
                },
                {
                    tag: "field", name: "Resolution", xref: "cluster§11.2.6.8.2",
                    details: "This field shall indicate the resolution in pixels for a specific rate distortion trade-off point."
                },
                {
                    tag: "field", name: "MinBitRate", xref: "cluster§11.2.6.8.3",
                    details: "This field shall indicate the minimum bitrate for a specific rate distortion trade-off point " +
                        "expressed as bits per second."
                }
            ]
        },

        {
            tag: "datatype", name: "SnapshotCapabilitiesStruct", xref: "cluster§11.2.6.9",
            details: "This struct is used to define the set of parameters that characterize a snapshot image that is used " +
                "to build a snapshot stream.",

            children: [
                {
                    tag: "field", name: "Resolution", xref: "cluster§11.2.6.9.1",
                    details: "This field shall indicate the resolution in pixels of the snapshot image."
                },
                {
                    tag: "field", name: "MaxFrameRate", xref: "cluster§11.2.6.9.2",
                    details: "This field shall indicate the maximum frame rate in frames per second of the snapshot stream."
                },
                {
                    tag: "field", name: "ImageCodec", xref: "cluster§11.2.6.9.3",
                    details: "This field shall indicate the format of the snapshot image, e.g., JPEG, as specified in " +
                        "ImageCodecEnum."
                },

                {
                    tag: "field", name: "RequiresEncodedPixels", xref: "cluster§11.2.6.9.4",
                    details: "This field shall indicate if this entry requires using any resources from the available " +
                        "MaxEncodedPixelRate. If true, clients need to include this entry’s Resolution and MaxFrameRate in " +
                        "the calculation for determining overall stream allocation resources."
                },

                {
                    tag: "field", name: "RequiresHardwareEncoder", xref: "cluster§11.2.6.9.5",

                    details: "This field shall indicate if this entry requires using a hardware encoder and thus needs to be " +
                        "considered when determining overall stream allocation resources." +
                        "\n" +
                        "If true, the device requires an encoder from MaxConcurrentEncoders for this combination of " +
                        "ImageCodec, Resolution, and MaxFrameRate." +
                        "\n" +
                        "If false, the device can produce this combination without needing a dedicated encoder." +
                        "\n" +
                        "This field is only considered if RequiresEncodedPixels is true."
                }
            ]
        },

        {
            tag: "datatype", name: "AudioCapabilitiesStruct", xref: "cluster§11.2.6.10",
            details: "This struct is used to express the audio capabilities of the camera.",

            children: [
                {
                    tag: "field", name: "MaxNumberOfChannels", xref: "cluster§11.2.6.10.1",
                    details: "This field shall indicate the maximum number of channels supported by an audio stream from the " +
                        "camera."
                },
                {
                    tag: "field", name: "SupportedCodecs", xref: "cluster§11.2.6.10.2",
                    details: "This field shall indicate the list of audio codecs from AudioCodecEnum that are supported by the " +
                        "camera."
                },
                {
                    tag: "field", name: "SupportedSampleRates", xref: "cluster§11.2.6.10.3",
                    details: "This field shall indicate the list of sample rates that are supported by the audio stream from the " +
                        "camera expressed in Hz, e.g., (48000, 32000, 16000)."
                },
                {
                    tag: "field", name: "SupportedBitDepths", xref: "cluster§11.2.6.10.4",
                    details: "This field shall indicate the list of bit depths that are supported by the audio stream, e.g., " +
                        "(16-bit, 24-bit)."
                }
            ]
        },

        {
            tag: "datatype", name: "VideoStreamStruct", xref: "cluster§11.2.6.11",
            details: "This struct is used to capture all constituent parameters of a video stream in order to fully " +
                "characterize it.",

            children: [
                {
                    tag: "field", name: "VideoStreamId", xref: "cluster§11.2.6.11.1",
                    details: "This field shall indicate the uniquely allocated identifier for the video stream."
                },
                {
                    tag: "field", name: "StreamUsage", xref: "cluster§11.2.6.11.2",
                    details: "This field shall indicate the usage of the stream as described in StreamUsageEnum."
                },
                {
                    tag: "field", name: "VideoCodec", xref: "cluster§11.2.6.11.3",
                    details: "This field shall indicate the type of video codec being used by the corresponding video stream as " +
                        "described in VideoCodecEnum."
                },
                {
                    tag: "field", name: "MinFrameRate", xref: "cluster§11.2.6.11.4",
                    details: "This field shall indicate the minimum frame rate in frames per second for the corresponding video " +
                        "stream."
                },
                {
                    tag: "field", name: "MaxFrameRate", xref: "cluster§11.2.6.11.5",
                    details: "This field shall indicate the maximum frame rate in frames per second for the corresponding video " +
                        "stream."
                },
                {
                    tag: "field", name: "MinResolution", xref: "cluster§11.2.6.11.6",
                    details: "This field shall indicate the minimum resolution for the corresponding video stream."
                },
                {
                    tag: "field", name: "MaxResolution", xref: "cluster§11.2.6.11.7",
                    details: "This field shall indicate the maximum resolution for the corresponding video stream."
                },
                {
                    tag: "field", name: "MinBitRate", xref: "cluster§11.2.6.11.8",
                    details: "This field shall indicate the minimum bitrate for the corresponding video stream in bits per second."
                },
                {
                    tag: "field", name: "MaxBitRate", xref: "cluster§11.2.6.11.9",
                    details: "This field shall indicate the maximum bitrate for the corresponding video stream in bits per second."
                },

                {
                    tag: "field", name: "KeyFrameInterval", xref: "cluster§11.2.6.11.10",
                    details: "This field shall indicate the duration in milliseconds before a regular key-frame shall be " +
                        "generated. A value of 0 shall mean that no regular key-frames are generated. When using push " +
                        "transports with a stream, it is recommended to use a value of 4000 (4 seconds). If the value " +
                        "requested does not exactly align with the framerate, then the next frame after the requested value " +
                        "shall be a regular key-frame."
                },

                {
                    tag: "field", name: "WatermarkEnabled", xref: "cluster§11.2.6.11.11",
                    details: "This field indicates the status of an applied watermark for the specific video stream. An Enabled " +
                        "value of TRUE means that watermarking has been enabled for that stream."
                },
                {
                    tag: "field", name: "OsdEnabled", xref: "cluster§11.2.6.11.12",
                    details: "This field indicates the status of the OSD (On-Screen Display) for the specific video stream. An " +
                        "Enabled value of TRUE means that OSD has been enabled for that stream."
                },

                {
                    tag: "field", name: "ReferenceCount", xref: "cluster§11.2.6.11.13",
                    details: "This field shall indicate the number of entities currently using this video stream. The node shall " +
                        "recompute this field to reflect the correct value at runtime (e.g., when restored from a persisted " +
                        "value after a reboot)."
                }
            ]
        },

        {
            tag: "datatype", name: "AudioStreamStruct", xref: "cluster§11.2.6.12",
            details: "This struct is used to capture all constituent parameters of an audio stream in order to fully " +
                "characterize it.",

            children: [
                {
                    tag: "field", name: "AudioStreamId", xref: "cluster§11.2.6.12.1",
                    details: "This field shall indicate the uniquely allocated identifier for the audio stream."
                },
                {
                    tag: "field", name: "StreamUsage", xref: "cluster§11.2.6.12.2",
                    details: "This field shall indicate the usage of stream as described in StreamUsageEnum."
                },
                {
                    tag: "field", name: "AudioCodec", xref: "cluster§11.2.6.12.3",
                    details: "This field shall indicate the type of audio codec being used by the corresponding audio stream as " +
                        "described in AudioCodecEnum."
                },
                {
                    tag: "field", name: "ChannelCount", xref: "cluster§11.2.6.12.4",
                    details: "This field shall indicate the number of independent channels or tracks being used by the " +
                        "corresponding audio stream. e.g., 1 for mono, 2 for stereo"
                },
                {
                    tag: "field", name: "SampleRate", xref: "cluster§11.2.6.12.5",
                    details: "This field shall indicate the audio sample rate, in hertz (Hz)."
                },
                {
                    tag: "field", name: "BitRate", xref: "cluster§11.2.6.12.6",
                    details: "This field shall indicate the target bit rate in bits per second of the audio stream."
                },

                {
                    tag: "field", name: "BitDepth", xref: "cluster§11.2.6.12.7",
                    details: "This field shall indicate the bit depth (8, 16, 24 or 32 bits) of the audio stream. It represents " +
                        "the number of bits of information used to represent each sample of the audio signal, and affects the " +
                        "resolution and dynamic range of the audio."
                },

                {
                    tag: "field", name: "ReferenceCount", xref: "cluster§11.2.6.12.8",
                    details: "This field shall indicate the number of entities currently using this audio stream. The node shall " +
                        "recompute this field to reflect the correct value at runtime (e.g., when restored from a persisted " +
                        "value after a reboot)."
                }
            ]
        },

        {
            tag: "datatype", name: "SnapshotStreamStruct", xref: "cluster§11.2.6.13",
            details: "This struct is used to capture all constituent parameters of a snapshot stream in order to fully " +
                "characterize it.",

            children: [
                {
                    tag: "field", name: "SnapshotStreamId", xref: "cluster§11.2.6.13.1",
                    details: "This field shall indicate the uniquely allocated identifier for the snapshot stream."
                },
                {
                    tag: "field", name: "ImageCodec", xref: "cluster§11.2.6.13.2",
                    details: "This field shall indicate the type of image codec being used by the corresponding snapshot stream as " +
                        "described in ImageCodecEnum."
                },
                {
                    tag: "field", name: "FrameRate", xref: "cluster§11.2.6.13.3",
                    details: "This field shall indicate the frame rate as frames per second of the snapshot stream."
                },
                {
                    tag: "field", name: "MinResolution", xref: "cluster§11.2.6.13.4",
                    details: "This field shall indicate the minimum resolution for the corresponding snapshot stream."
                },
                {
                    tag: "field", name: "MaxResolution", xref: "cluster§11.2.6.13.5",
                    details: "This field shall indicate the maximum resolution for the corresponding snapshot stream."
                },

                {
                    tag: "field", name: "Quality", xref: "cluster§11.2.6.13.6",
                    details: "This field shall indicate a generic quality metric (integer between 1 and 100) as an input parameter " +
                        "to the image codec. A lower number indicates lower image quality. A higher value indicates higher " +
                        "image quality but larger file size and higher bit rate."
                },

                {
                    tag: "field", name: "ReferenceCount", xref: "cluster§11.2.6.13.7",
                    details: "This field shall indicate the number of entities currently using this snapshot stream. The node " +
                        "shall recompute this field to reflect the correct value at runtime (e.g., when restored from a " +
                        "persisted value after a reboot)."
                },

                {
                    tag: "field", name: "EncodedPixels", xref: "cluster§11.2.6.13.8",
                    details: "This field shall indicate if this entry counts in the system encoded pixel rate calculation." +
                        "\n" +
                        "This shall be true if the SnapshotCapabilitiesStruct for the selected ImageCodec and MaxResolution " +
                        "has RequiresEncodedPixels set to true."
                },

                {
                    tag: "field", name: "HardwareEncoder", xref: "cluster§11.2.6.13.9",
                    details: "This field shall indicate if one of the system hardware encoders is used by this snapshot stream." +
                        "\n" +
                        "This shall be true if the SnapshotCapabilitiesStruct for the selected ImageCodec and MaxResolution " +
                        "has RequiresHardwareEncoder set to true."
                },

                {
                    tag: "field", name: "WatermarkEnabled", xref: "cluster§11.2.6.13.10",
                    details: "This field indicates the status of an applied watermark for the specific snapshot stream. A value of " +
                        "TRUE means that watermarking has been enabled for that stream."
                },
                {
                    tag: "field", name: "OsdEnabled", xref: "cluster§11.2.6.13.11",
                    details: "This field indicates the status of the OSD (On-Screen Display) for the specific snapshot stream. A " +
                        "value of TRUE means that OSD has been enabled for that stream."
                }
            ]
        },

        {
            tag: "datatype", name: "AVMetadataStruct", xref: "cluster§11.2.6.14",
            details: "This struct is used to encode the metadata generated by the device and is included by the various " +
                "transports that handle audio and video streams." +
                "\n" +
                "When encoded in TLV binary format and placed inside other standards, this shall be represented using " +
                "the RFC 8141 compliant string urn:csa:matter:av-metadata.",

            children: [
                {
                    tag: "field", name: "UtcTime", xref: "cluster§11.2.6.14.1",
                    details: "This field shall represent the UTC time that this metadata belongs to. The field is sourced from the " +
                        "Time Synchronization cluster’s UTCTime attribute." +
                        "\n" +
                        "If null, the device has no current source of wall clock time."
                },

                {
                    tag: "field", name: "MotionZonesActive", xref: "cluster§11.2.6.14.2",
                    details: "This field shall represent the list of Motion Zones that are currently triggered."
                },
                {
                    tag: "field", name: "BlackAndWhiteActive", xref: "cluster§11.2.6.14.3",
                    details: "This field shall indicate if the sensor is currently active in black and white only mode. A value of " +
                        "true means the sensor and video encode process is operating in black and white only mode."
                },

                {
                    tag: "field", name: "UserDefined", xref: "cluster§11.2.6.14.4",
                    details: "This field shall be an octet string representing arbitrary format user defined metadata attached. " +
                        "The UserDefined field of the ManuallyTriggerTransport command can be used to populate this field. " +
                        "The format and meaning of this field is not defined in this specification and is up to the users, " +
                        "vendors, or ecosystems deploying it."
                }
            ]
        },

        {
            tag: "datatype", name: "VideoStreamID", xref: "cluster§11.2.6.15",
            details: "This data type is derived from uint16 and represents an allocated video stream. This value starts at " +
                "0 and monotonically increases by 1 with each new allocation provisioned by the Node. A value " +
                "incremented past 65534 shall wrap to 0. The Node shall verify that the incremented ID does not match " +
                "any other ID. If such a match is found, the ID shall be incremented until a unique ID is found."
        },

        {
            tag: "datatype", name: "AudioStreamID", xref: "cluster§11.2.6.16",
            details: "This data type is derived from uint16 and represents an allocated audio stream. This value starts at " +
                "0 and monotonically increases by 1 with each new allocation provisioned by the Node. A value " +
                "incremented past 65534 shall wrap to 0. The Node shall verify that the incremented ID does not match " +
                "any other ID. If such a match is found, the ID shall be incremented until a unique ID is found."
        },

        {
            tag: "datatype", name: "SnapshotStreamID", xref: "cluster§11.2.6.17",
            details: "This data type is derived from uint16 and represents an allocated snapshot stream. This value starts " +
                "at 0 and monotonically increases by 1 with each new allocation provisioned by the Node. A value " +
                "incremented past 65534 shall wrap to 0. The Node shall verify that the incremented ID does not match " +
                "any other ID. If such a match is found, the ID shall be incremented until a unique ID is found."
        }
    ]
});
