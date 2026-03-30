/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "PushAvStreamTransport", pics: "PAVST", xref: "cluster§11.7",

    details: "This cluster implements the upload of Audio and Video streams from the Camera AV Stream Management " +
        "Cluster using suitable push-based transports. Push AV Stream Transport is the transmission of a " +
        "stream of media to a server, initiated by the activation of an associated trigger. A push transport " +
        "can be triggered from a camera operating in an always-on mode for supporting 24/7 style recording, " +
        "triggered by events based on motion zones defined in the Zone Management Cluster, or manually " +
        "triggered using commands or bindings." +
        "\n" +
        "A push transport shall be allocated before it is intended to be used, and then it is subsequently " +
        "started when its configured trigger is activated." +
        "\n" +
        "An allocated push transport consists of five main logical things:" +
        "\n" +
        "  - A container format, which specifies how the individual media frames are formatted or multiplexed " +
        "together" +
        "\n" +
        "  - An ingestion format which specifies how it is signaled and transmitted to the far end." +
        "\n" +
        "  - A trigger which specifies when transport will occur." +
        "\n" +
        "  - Which media stream/s to package together in the container format." +
        "\n" +
        "  - Various options to the above." +
        "\n" +
        "All push transport ingest methods shall use TLS as specified by the core specification. TLS Client " +
        "Certificates shall be used for Authorization and Identification of a Node on the underlying TLS " +
        "connection (see Chapter 14, TLS Certificate Management and TLS Client Management sections in " +
        "[MatterCore]). Nodes supporting this cluster shall also support the TLS Client Management Cluster " +
        "and its dependencies.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§11.7.6",

            children: [
                {
                    tag: "field", name: "PERZONESENS", xref: "cluster§11.7.6.1",
                    details: "When this feature is supported, the Sensitivity for a Motion Trigger can be set per zone. When not " +
                        "supported, only a single sensitivity can be used for all Motion Triggers."
                },
                {
                    tag: "field", name: "METADATA", xref: "cluster§11.7.6.2",
                    details: "When this feature is supported and a transport activates it, metadata shall be included within the " +
                        "uploaded data."
                }
            ]
        },

        {
            tag: "attribute", name: "SupportedFormats", xref: "cluster§11.7.9.1",
            details: "This attribute shall contain a list of Supported Container Format structs, which represents the " +
                "combinations of Ingestion Method and Container Format that the Node supports. Nodes shall support at " +
                "least the combination CMAFIngest,CMAF."
        },

        {
            tag: "attribute", name: "CurrentConnections", xref: "cluster§11.7.9.2",

            details: "This attribute shall be a list of TransportConfigurationStruct which represents all the allocated " +
                "connections added via AllocatePushTransport. When this attribute is read over a non Large Message " +
                "(See Large Message Quality in the Data Model section of [MatterCore]) capable transport, the " +
                "TransportOptions field shall NOT be included. To get the full details of the connections use the " +
                "FindTransport command. The maximum size of this list is run-time dependent upon the resource " +
                "constraints of the system as described in Resource Management and Stream Priorities and the " +
                "currently used bandwidth of the total available specified by MaxNetworkBandwidth."
        },

        {
            tag: "event", name: "PushTransportBegin", xref: "cluster§11.7.11.1",

            details: "This event shall indicate a push transport transmission has begun." +
                "\n" +
                "With Motion and Continuous based triggers, this event shall be generated when each new recording " +
                "starts uploading." +
                "\n" +
                "With Command based triggers, this event shall be generated when uploading starts via the " +
                "ManuallyTriggerTransport command." +
                "\n" +
                "The data on this event shall contain the following information.",

            children: [
                {
                    tag: "field", name: "ConnectionId", xref: "cluster§11.7.11.1.1",
                    details: "This field shall be a PushTransportConnectionID representing the push transport which started " +
                        "transmitting."
                },
                {
                    tag: "field", name: "TriggerType", xref: "cluster§11.7.11.1.2",
                    details: "This field shall represent the type of trigger which caused this event to be generated."
                },
                {
                    tag: "field", name: "ActivationReason", xref: "cluster§11.7.11.1.3",
                    details: "This field shall only be present when the TriggerType is Command and provides the reason for the " +
                        "event."
                },
                {
                    tag: "field", name: "ContainerType", xref: "cluster§11.7.11.1.4",
                    details: "This field shall indicate the container type chosen for this transport."
                },
                {
                    tag: "field", name: "CmafSessionNumber", xref: "cluster§11.7.11.1.5",
                    details: "This field shall represent the CMAF Session number of the recording session that was triggered."
                }
            ]
        },

        {
            tag: "event", name: "PushTransportEnd", xref: "cluster§11.7.11.2",

            details: "This event shall indicate a push transport upload of the indicated recording has completed." +
                "\n" +
                "With Motion, Continuous, and Command based triggers, this event shall be generated when each new " +
                "recording finishes uploading." +
                "\n" +
                "The data on this event shall contain the following information.",

            children: [
                {
                    tag: "field", name: "ConnectionId", xref: "cluster§11.7.11.2.1",
                    details: "This field shall be a PushTransportConnectionID representing the push transport which stopped " +
                        "transmitting."
                },
                {
                    tag: "field", name: "ContainerType", xref: "cluster§11.7.11.2.2",
                    details: "This field shall indicate the container type chosen for this transport."
                },
                {
                    tag: "field", name: "CmafSessionNumber", xref: "cluster§11.7.11.2.3",
                    details: "This field shall represent the CMAF Session number of the recording session that ended."
                }
            ]
        },

        {
            tag: "command", name: "AllocatePushTransport", xref: "cluster§11.7.10.1",
            details: "This command shall allocate a transport and return a PushTransportConnectionID.",
            children: [{
                tag: "field", name: "TransportOptions", xref: "cluster§11.7.10.1.1",
                details: "This field shall represent the configuration options of the transport to be allocated."
            }]
        },

        {
            tag: "command", name: "AllocatePushTransportResponse", xref: "cluster§11.7.10.2",
            details: "This command shall be generated in response to a successful AllocatePushTransport command.",

            children: [{
                tag: "field", name: "TransportConfiguration", xref: "cluster§11.7.10.2.1",
                details: "This field shall be a TransportConfigurationStruct representing the newly allocated transport." +
                    "\n" +
                    "For compatibility with clients implementing cluster revision 1, the VideoStreamID and AudioStreamID " +
                    "fields shall be populated with the first video and audio stream entries that exist in the " +
                    "VideoStreams and AudioStreams lists."
            }]
        },

        {
            tag: "command", name: "DeallocatePushTransport", xref: "cluster§11.7.10.3",
            details: "This command shall be generated to request the Node deallocates the specified transport.",
            children: [{
                tag: "field", name: "ConnectionId", xref: "cluster§11.7.10.3.1",
                details: "This field shall be a PushTransportConnectionID representing the allocated transport to deallocate."
            }]
        },

        {
            tag: "command", name: "ModifyPushTransport", xref: "cluster§11.7.10.4",
            details: "This command is used to request the Node modifies the configuration of the specified push transport.",

            children: [
                {
                    tag: "field", name: "ConnectionId", xref: "cluster§11.7.10.4.1",
                    details: "This field shall be a PushTransportConnectionID representing the transport to modify."
                },
                {
                    tag: "field", name: "TransportOptions", xref: "cluster§11.7.10.4.2",
                    details: "This field shall represent the Transport Options to modify."
                }
            ]
        },

        {
            tag: "command", name: "SetTransportStatus", xref: "cluster§11.7.10.5",
            details: "This command shall be generated to request the Node modifies the Transport Status of a specified " +
                "transport or all transports.",

            children: [
                {
                    tag: "field", name: "ConnectionId", xref: "cluster§11.7.10.5.1",
                    details: "This field shall be a PushTransportConnectionID representing the transport to modify. If null is " +
                        "passed, all transports belonging to the calling fabric will be modified."
                },
                {
                    tag: "field", name: "TransportStatus", xref: "cluster§11.7.10.5.2",
                    details: "This field shall be a TransportStatusEnum and represent the new transport status to apply."
                }
            ]
        },

        {
            tag: "command", name: "ManuallyTriggerTransport", xref: "cluster§11.7.10.6",
            details: "This command shall be generated to request the Node to manually start the specified push transport.",

            children: [
                {
                    tag: "field", name: "ConnectionId", xref: "cluster§11.7.10.6.1",
                    details: "This field shall be a PushTransportConnectionID representing the push transport to start or stop."
                },
                {
                    tag: "field", name: "ActivationReason", xref: "cluster§11.7.10.6.2",
                    details: "This field shall provide information as to why the transport was started or stopped."
                },
                {
                    tag: "field", name: "TimeControl", xref: "cluster§11.7.10.6.3",
                    details: "This field shall be a struct of type TransportMotionTriggerTimeControlStruct, but the BlindDuration " +
                        "field shall be ignored."
                },

                {
                    tag: "field", name: "UserDefined", xref: "cluster§11.7.10.6.4",
                    details: "This field shall be an octet string representing arbitrary format user defined metadata that will be " +
                        "included in the recording via the UserDefined field of AVMetadataStruct. The format and meaning of " +
                        "this field is not defined in this specification and is up to the users, vendors, or ecosystems " +
                        "deploying it."
                }
            ]
        },

        {
            tag: "command", name: "FindTransport", xref: "cluster§11.7.10.7",
            details: "This command shall return the Transport Configuration for the specified push transport or all " +
                "allocated transports for the fabric if null.",
            children: [{
                tag: "field", name: "ConnectionId", xref: "cluster§11.7.10.7.1",
                details: "This field shall be a PushTransportConnectionID or NULL representing the allocated push transport."
            }]
        },

        {
            tag: "command", name: "FindTransportResponse", xref: "cluster§11.7.10.8",
            details: "This command shall be generated in response to a successful FindTransport command.",
            children: [{
                tag: "field", name: "TransportConfigurations", xref: "cluster§11.7.10.8.1",
                details: "This field shall be a list of Transport Configurations."
            }]
        },

        {
            tag: "datatype", name: "TransportTriggerTypeEnum", xref: "cluster§11.7.7.1",
            details: "The Trigger Type determines the basic operation of the Push Transport and when it will actually " +
                "transmit content.",

            children: [
                {
                    tag: "field", name: "Command", description: "Triggered only via a command invocation",
                    xref: "cluster§11.7.7.1.1",
                    details: "When set to this value, transport will only occur if a command is invoked to trigger it. This could " +
                        "be a ManuallyTriggerTransport command or an internally triggered command such as a physical button " +
                        "press."
                },

                {
                    tag: "field", name: "Motion", description: "Triggered via motion detection or command",
                    xref: "cluster§11.7.7.1.2",
                    details: "When set to this value, transport will occur if either the Motion Detector becomes triggered, or " +
                        "ManuallyTriggerTransport is invoked. This is generally known as event driven recording."
                },

                {
                    tag: "field", name: "Continuous", description: "Triggered always when transport status is Active",
                    xref: "cluster§11.7.7.1.3",
                    details: "When set to this value, transport will always occur so long as the TransportStatus is Active. This " +
                        "is generally known as 24/7 always-on recording."
                }
            ]
        },

        {
            tag: "datatype", name: "TransportStatusEnum", xref: "cluster§11.7.7.2",
            children: [
                { tag: "field", name: "Active", description: "Push Transport can transport AV Streams" },
                { tag: "field", name: "Inactive", description: "Push Transport cannot transport AV Streams" }
            ]
        },

        {
            tag: "datatype", name: "ContainerFormatEnum", xref: "cluster§11.7.7.3",

            children: [{
                tag: "field", name: "Cmaf", description: "CMAF container format", xref: "cluster§11.7.7.3.1",
                details: "CMAF (Common Media Application Format) is a container format based on the ISO Base Media File Format " +
                    "and is described in MPEGCMAF. Nodes using CMAF as the container format shall also use CMAFIngest as " +
                    "the ingestion format."
            }]
        },

        {
            tag: "datatype", name: "IngestMethodsEnum", xref: "cluster§11.7.7.4",
            children: [{
                tag: "field", name: "CmafIngest", description: "CMAF ingestion format", xref: "cluster§11.7.7.4.1",
                details: "This value shall mean that CMAF Ingestion is utilized. See CMAF Ingestion for full details."
            }]
        },

        {
            tag: "datatype", name: "TriggerActivationReasonEnum", xref: "cluster§11.7.7.5",

            children: [
                { tag: "field", name: "UserInitiated", description: "Trigger has been activated by user action" },
                { tag: "field", name: "Automation", description: "Trigger has been activated by automation" },
                { tag: "field", name: "Emergency", description: "Trigger has been activated for emergency reasons" },
                {
                    tag: "field", name: "DoorbellPressed",
                    description: "Trigger has been activated by a doorbell press"
                }
            ]
        },

        {
            tag: "datatype", name: "SupportedFormatStruct", xref: "cluster§11.7.7.6",
            details: "This struct holds the combination of container format and ingest method which represents a valid " +
                "combination for a transport.",

            children: [
                {
                    tag: "field", name: "ContainerFormat", xref: "cluster§11.7.7.6.1",
                    details: "This field shall indicate a supported container format that when combined with IngestMethod, can be " +
                        "used in a transport."
                },
                {
                    tag: "field", name: "IngestMethod", xref: "cluster§11.7.7.6.2",
                    details: "This field shall indicate a supported ingest method that when combined with ContainerFormat, can be " +
                        "used in a transport."
                }
            ]
        },

        {
            tag: "datatype", name: "CMAFInterfaceEnum", xref: "cluster§11.7.7.7",
            details: "This type indicates the exact mode of CMAF that is in use.",

            children: [
                {
                    tag: "field", name: "Interface1", description: "CMAF Interface-1 Mode", xref: "cluster§11.7.7.7.1",
                    details: "This value indicates that only the operations specified in CMAF Interface-1 will be done."
                },

                {
                    tag: "field", name: "Interface2Dash", description: "CMAF Interface-2 Mode with DASH Support",
                    xref: "cluster§11.7.7.7.2",
                    details: "This value indicates the operations specified in CMAF Interface-2 with the DASH specific portions " +
                        "will be done."
                },

                {
                    tag: "field", name: "Interface2Hls", description: "CMAF Interface-2 Mode with HLS Support",
                    xref: "cluster§11.7.7.7.3",
                    details: "This value indicates the operations specified in CMAF Interface-2 with the HLS specific portions " +
                        "will be done."
                }
            ]
        },

        {
            tag: "datatype", name: "VideoStreamStruct", xref: "cluster§11.7.7.8",
            details: "This struct holds a video stream id and the symbolic stream name associated with it. For CMAF based " +
                "transports, this becomes a CMAF Track.",

            children: [
                {
                    tag: "field", name: "VideoStreamName", xref: "cluster§11.7.7.8.1",
                    details: "This field shall identify the unique name assigned to this stream. In CMAF, this value becomes the " +
                        "CMAF track name."
                },
                {
                    tag: "field", name: "VideoStreamId", xref: "cluster§11.7.7.8.2",
                    details: "This field shall indicate the video stream identified by the VideoStreamID entry in the " +
                        "AllocatedVideoStreams list to use."
                }
            ]
        },

        {
            tag: "datatype", name: "AudioStreamStruct", xref: "cluster§11.7.7.9",
            details: "This struct holds a video stream id and the symbolic stream name associated with it. For CMAF based " +
                "transports, this becomes a CMAF Track.",

            children: [
                {
                    tag: "field", name: "AudioStreamName", xref: "cluster§11.7.7.9.1",
                    details: "This field shall identify the unique name assigned to this stream. In CMAF, this value becomes the " +
                        "CMAF track name."
                },
                {
                    tag: "field", name: "AudioStreamId", xref: "cluster§11.7.7.9.2",
                    details: "This field shall indicate the audio stream identified by the AudioStreamID entry in the " +
                        "AllocatedAudioStreams list to use."
                }
            ]
        },

        {
            tag: "datatype", name: "CMAFContainerOptionsStruct", xref: "cluster§11.7.7.10",
            details: "This struct encodes options for configuration of the CMAF container format.",

            children: [
                {
                    tag: "field", name: "CmafInterface", xref: "cluster§11.7.7.10.1",
                    details: "This field shall indicate the selected Interface of the CMAF container. The Interface chosen " +
                        "determines the number and type of operations that occur within each CMAF session. See " +
                        "CMAFInterfaceEnum for details on CMAF Interfaces."
                },

                {
                    tag: "field", name: "SegmentDuration", xref: "cluster§11.7.7.10.2",
                    details: "This field shall indicate the segment duration (in milliseconds) of the CMAF container. This value " +
                        "shall be a multiple of the KeyFrameInterval for the associated video stream. It is recommended to " +
                        "use a value of 4000 (4 seconds)."
                },

                {
                    tag: "field", name: "ChunkDuration", xref: "cluster§11.7.7.10.3",

                    details: "This field shall indicate the chunk duration (in milliseconds) of the CMAF container. A value of 0 " +
                        "shall indicate that chunks are not used." +
                        "\n" +
                        "When chunking is used, an even divisor of SegmentDuration SHOULD be used that aligns with the video " +
                        "frame rate and audio frame duration. recommended values are 1/2, 1/4, or 1/8 of the SegmentDuration " +
                        "depending on the end to end latency requirements needed. Each chunk results in an additional 144 " +
                        "bytes of overhead in the resulting file."
                },

                {
                    tag: "field", name: "SessionGroup", xref: "cluster§11.7.7.10.4",
                    details: "This field is deprecated and has been replaced with the VideoStreams and AudioStreams fields."
                },
                {
                    tag: "field", name: "TrackName", xref: "cluster§11.7.7.10.5",
                    details: "This field is deprecated and has been replaced with the VideoStreamName or AudioStreamName fields of " +
                        "the associated stream entry in the VideoStreams or AudioStreams lists"
                },

                {
                    tag: "field", name: "CencKey", xref: "cluster§11.7.7.10.6",
                    details: "This field, if present, shall indicate the CENC key to be used to encrypt the CMAF data. When " +
                        "absent, the CMAF data shall be sent without CENC encryption added. See CMAF Background for further " +
                        "details on CMAF CENC encryption."
                },

                {
                    tag: "field", name: "CencKeyId", xref: "cluster§11.7.7.10.7",
                    details: "This field, if present, shall indicate the opaque CENC Key ID (KID) that represents the key in the " +
                        "Controllers ecosystem. This fields maps to the KID value as specified in ISO 23001-7:2023 or later. " +
                        "See CMAF Background for further details on CMAF CENC encryption."
                },

                {
                    tag: "field", name: "MetadataEnabled", xref: "cluster§11.7.7.10.8",

                    details: "This field, if present and true, indicates that AVMetadataStruct based Metadata tracks and boxes may " +
                        "be included in the CMAF segments. If this field is not present or is false, metadata tracks and " +
                        "boxes shall NOT be included." +
                        "\n" +
                        "Metadata within CMAF segments when used, shall be encoded as follows:" +
                        "\n" +
                        "  - Use urim as the codec-type." +
                        "\n" +
                        "  - Use meta as the content-type." +
                        "\n" +
                        "  - Use urn:csa:matter:av-metadata as the uri." +
                        "\n" +
                        "Placement of the metadata shall be as follows:" +
                        "\n" +
                        "  - Use a single trac for time-synced data points as described in CMAF-Ingest Interface-1 Section " +
                        "6.6 Requirements for Timed Metadata Tracks." +
                        "\n" +
                        "  - Use a single Box for non-time synced data points."
                }
            ]
        },

        {
            tag: "datatype", name: "ContainerOptionsStruct", xref: "cluster§11.7.7.11",
            details: "This struct encodes the specific container type options struct",

            children: [
                {
                    tag: "field", name: "ContainerType", xref: "cluster§11.7.7.11.1",
                    details: "This field shall indicate the container type chosen for this transport."
                },
                {
                    tag: "field", name: "CmafContainerOptions", xref: "cluster§11.7.7.11.2",
                    details: "This field shall contain a CMAF Container Options if the ContainerType is set to CMAF, otherwise " +
                        "this field shall be omitted."
                }
            ]
        },

        {
            tag: "datatype", name: "TransportZoneOptionsStruct", xref: "cluster§11.7.7.12",
            details: "This struct encodes the options that configure the per Zone portion of a Trigger configuration.",

            children: [
                {
                    tag: "field", name: "Zone", xref: "cluster§11.7.7.12.1",
                    details: "This field shall be a Motion ZoneID found in the Zone Management Cluster which shall cause the " +
                        "trigger to activate. If not null, motion in this zone will activate the trigger. If null, motion " +
                        "anywhere in the complement of the union of all the Zones defined in the Zone Management Cluster on " +
                        "this endpoint will activate the trigger."
                },

                {
                    tag: "field", name: "Sensitivity", xref: "cluster§11.7.7.12.2",
                    details: "This field shall indicate how sensitive the trigger for the specified Zone is, and shall match the " +
                        "same implementation specifics as the Sensitivity attribute in the Zone Management Cluster. This " +
                        "field shall only be included when PerZoneSensitivity is supported, otherwise the value from " +
                        "MotionSensitivity is used."
                }
            ]
        },

        {
            tag: "datatype", name: "TransportTriggerOptionsStruct", xref: "cluster§11.7.7.13",
            details: "This struct encodes the conditions and options that configures the trigger for the push transport. " +
                "The transport shall only start transmitting AV Streams when it’s associated trigger is activated.",

            children: [
                {
                    tag: "field", name: "TriggerType", xref: "cluster§11.7.7.13.1",
                    details: "This field shall indicate the type of the transport trigger."
                },

                {
                    tag: "field", name: "MotionZones", xref: "cluster§11.7.7.13.2",
                    details: "This field shall be a list of TransportZoneOptionsStruct containing the Motion Zones to trigger on. " +
                        "If this list is null, empty, or the Zone Management Cluster is not supported on this endpoint, then " +
                        "motion anywhere shall cause the trigger to activate. The maximum size of this list is MaxZones."
                },

                {
                    tag: "field", name: "MotionSensitivity", xref: "cluster§11.7.7.13.3",

                    details: "This field shall indicate how sensitive the trigger is to motion and shall match the same " +
                        "implementation specifics as Sensitivity. This field shall NOT be used if the PerZoneSensitivity " +
                        "feature is supported, as a Zone specific value is available in the TransportZoneOptionsStruct " +
                        "Sensitivity field. If this is null and the Zone Management Cluster is supported on this endpoint, " +
                        "then the value found in the Sensitivity attribute in the Zone Management Cluster shall be used. If " +
                        "this is null and the Zone Management Cluster is not supported on this endpoint, a value of 10 shall " +
                        "be used."
                },

                {
                    tag: "field", name: "MotionTimeControl", xref: "cluster§11.7.7.13.4",
                    details: "This field shall control timing around repeated activation of the trigger (see " +
                        "TransportMotionTriggerTimeControlStruct). If TriggerType is Motion Value, this field shall be " +
                        "required."
                },

                {
                    tag: "field", name: "MaxPreRollLen", xref: "cluster§11.7.7.13.5",

                    details: "This field shall indicate the maximum duration in milliseconds of pre-roll content that can be " +
                        "included, if the TriggerType is Motion Value or Command Value, when the trigger activates." +
                        "\n" +
                        "A value of 0 shall indicate that no extra segments beyond the one containing the trigger point will " +
                        "be sent." +
                        "\n" +
                        "When using a non 0 value, the value shall be greater than or equal to the value of the stream’s " +
                        "KeyFrameInterval and it SHOULD be a multiple of that value if larger." +
                        "\n" +
                        "The actual amount transmitted will always be less than or equal to the per stream storage amount " +
                        "found in the MaxContentBufferSize." +
                        "\n" +
                        "Since a transmission caused by a trigger activation always begins on the Container Format’s segment " +
                        "(or key-frame) boundary, if the trigger occurs mid segment, the entire segment still needs to be " +
                        "sent. This time delta between the actual trigger point and the start of the segment is counted as " +
                        "part of the pre-roll length. Thus, for more than the current segment to be sent as pre-roll, the " +
                        "full size of a segment must fit within the remainder of this length. For this reason, it is " +
                        "recommended that a value of at least two times SegmentDuration be used so that a full segment is " +
                        "always included if available."
                }
            ]
        },

        {
            tag: "datatype", name: "TransportMotionTriggerTimeControlStruct", xref: "cluster§11.7.7.14",

            details: "This struct is used to encode a set of values for controlling the lifecycle of a motion triggered " +
                "transport." +
                "\n" +
                "When a Motion Trigger is activated, either by receiving a ManuallyTriggerTransport command, or when " +
                "motion is initially detected which matches a configured motion trigger, the Node shall start the " +
                "push transport configured with this trigger see (TransportOptionsStruct)." +
                "\n" +
                "This places the Node in a Motion Detected state, at which point the Node shall internally track two " +
                "values." +
                "\n" +
                "The time in seconds since the trigger was activated." +
                "\n" +
                "Initially set to the InitialDuration value." +
                "\n" +
                "The transport shall remain active minimally for InitialDuration period before a PushTransportEnd " +
                "event can occur." +
                "\n" +
                "However, if additional motion is detected during this MotionDetectedDuration period, the Node shall " +
                "increase its value by the AugmentationDuration value. This process may occur repeatedly, but after " +
                "the first increase of MotionDetectedDuration, the Node shall NOT increase the MotionDetectedDuration " +
                "value unless the previous MotionDetectedDuration has been exceeded by the TimeSinceActivation." +
                "\n" +
                "If the TimeSinceActivation value exceeds the MaxDuration or MotionDetectedDuration value, the Node " +
                "shall generate a PushTransportEnd event and stop detecting motion for this trigger for the period of " +
                "the BlindDuration value." +
                "\n" +
                "If SetTransportStatus is called anytime during this state and sets the TransportStatus to Inactive, " +
                "the Motion Detected state is superseded." +
                "\n" +
                "Since multiple triggers (and corresponding push transports) may be activated by the same motion, the " +
                "Node shall perform this process independently for each motion trigger activated.",

            children: [
                {
                    tag: "field", name: "InitialDuration", xref: "cluster§11.7.7.14.1",
                    details: "This field shall indicate the initial duration (in seconds) of the recording, following the initial " +
                        "trigger."
                },
                {
                    tag: "field", name: "AugmentationDuration", xref: "cluster§11.7.7.14.2",
                    details: "This field shall indicate the duration (in seconds) that the MotionDetectedDuration value is to be " +
                        "extended by if motion is still detected during this period."
                },
                {
                    tag: "field", name: "MaxDuration", xref: "cluster§11.7.7.14.3",
                    details: "This field shall indicate the maximum duration (in seconds) after initial motion detection that " +
                        "additional motion will be detected."
                },
                {
                    tag: "field", name: "BlindDuration", xref: "cluster§11.7.7.14.4",
                    details: "This field shall indicate the duration (in seconds) after a transport finishes transmitting that the " +
                        "Node shall NOT activate the trigger again."
                }
            ]
        },

        {
            tag: "datatype", name: "TransportOptionsStruct", xref: "cluster§11.7.7.15",
            details: "This encodes the options and configuration of a transport.",

            children: [
                {
                    tag: "field", name: "StreamUsage", xref: "cluster§11.7.7.15.1",
                    details: "This field contains the StreamUsageEnum of this transport."
                },

                {
                    tag: "field", name: "VideoStreamId", xref: "cluster§11.7.7.15.2",

                    details: "This field is deprecated and the VideoStreams field used instead." +
                        "\n" +
                        "If this field is encountered from clients implementing cluster revision 1, then the following shall " +
                        "be done:" +
                        "\n" +
                        "  - If not present, video isn’t requested." +
                        "\n" +
                        "  - If present and null, automatic video stream assignment is requested." +
                        "\n" +
                        "  - If present and non-null, the specific video stream identified by the VideoStreamID shall be " +
                        "added as an entry to the VideoStreams field using the VideoStreamName of video."
                },

                {
                    tag: "field", name: "AudioStreamId", xref: "cluster§11.7.7.15.3",

                    details: "This field is deprecated and the AudioStreams field used instead." +
                        "\n" +
                        "If this field is encountered from clients implementing cluster revision 1, then the following shall " +
                        "be done:" +
                        "\n" +
                        "  - If not present, audio isn’t requested." +
                        "\n" +
                        "  - If present and null, automatic audio stream assignment is requested." +
                        "\n" +
                        "  - If present and non-null, the specific audio stream identified by the AudioStreamID shall be " +
                        "added as an entry to the AudioStreams field using the AudioStreamName of audio."
                },

                {
                    tag: "field", name: "TlsEndpointId", xref: "cluster§11.7.7.15.4",
                    details: "This field shall be a TLSEndpointID representing a provisioned TLS Endpoint, which shall have valid " +
                        "TLSCAID and TLSCCDID values (see Chapter 14, Certificate Authority ID (CAID) Mapping and the " +
                        "ProvisionEndpoint command in the TLS Client Management Cluster sections in [MatterCore])."
                },

                {
                    tag: "field", name: "Url", xref: "cluster§11.7.7.15.5",

                    details: "This field shall be a valid string in RFC 3986 format representing the upload location. The field " +
                        "shall use the https scheme which will be validated by the underlying TLSEndpointID." +
                        "\n" +
                        "When the IngestMethod is CMAFIngest, this shall be the CMAF publishing_point_URL to transport the AV " +
                        "Stream to. The URL length does not need to include space for the full CMAF POST_URL fields which " +
                        "specify the session, track, and segment names as these will be internally appended. See Section " +
                        "11.7.1.2, “Operation” for further restrictions on the characters allowed in the URL."
                },

                {
                    tag: "field", name: "TriggerOptions", xref: "cluster§11.7.7.15.6",
                    details: "This field shall be of type TransportTriggerOptionsStruct and represents the Trigger Type and its " +
                        "sub options."
                },
                {
                    tag: "field", name: "IngestMethod", xref: "cluster§11.7.7.15.7",
                    details: "This field shall be of type IngestMethodsEnum and represents the Ingest Method to be used."
                },
                {
                    tag: "field", name: "ContainerOptions", xref: "cluster§11.7.7.15.8",
                    details: "This field shall be of type ContainerOptionsStruct and represents the type of Push AV Stream " +
                        "Container to be uploaded and any additional options relating to the Container Format used."
                },
                {
                    tag: "field", name: "ExpiryTime", xref: "cluster§11.7.7.15.9",
                    details: "This field shall be an unsigned 32 bit integer representing the TTL in seconds of a transport " +
                        "allocation. If not present, the transport shall never expire."
                },
                {
                    tag: "field", name: "VideoStreams", xref: "cluster§11.7.7.15.10",
                    details: "This field shall be a list of VideoStreamStruct which indicates the requested video streams and the " +
                        "stream names for this transport."
                },
                {
                    tag: "field", name: "AudioStreams", xref: "cluster§11.7.7.15.11",
                    details: "This field shall be a list of AudioStreamStruct which indicates the requested audio streams and the " +
                        "stream names for this transport."
                }
            ]
        },

        {
            tag: "datatype", name: "TransportConfigurationStruct", xref: "cluster§11.7.7.16",
            details: "This encodes the current configuration of an allocated transport.",

            children: [
                {
                    tag: "field", name: "ConnectionId", xref: "cluster§11.7.7.16.1",
                    details: "This field shall be a PushTransportConnectionID representing a unique transport."
                },
                {
                    tag: "field", name: "TransportStatus", xref: "cluster§11.7.7.16.2",
                    details: "This field shall represent the Stream Transport Status of the transport."
                },
                {
                    tag: "field", name: "TransportOptions", xref: "cluster§11.7.7.16.3",
                    details: "This field shall represent the Stream Transport Options of the transport."
                }
            ]
        },

        {
            tag: "datatype", name: "PushTransportConnectionID", xref: "cluster§11.7.7.17",
            details: "It represents an allocated transport. This value starts at 0 and monotonically increases by 1 with " +
                "each new allocation provisioned by the Node. A value incremented past 65534 shall wrap to 0. The " +
                "Node shall verify that the incremented ID does not match any other ID. If such a match is found, the " +
                "ID shall be incremented until a unique ID is found."
        },

        {
            tag: "datatype", name: "StatusCodeEnum", xref: "cluster§11.7.8.1",

            children: [
                {
                    tag: "field", name: "InvalidTlsEndpoint",
                    description: "The specified TLSEndpointID cannot be found."
                },
                {
                    tag: "field", name: "InvalidStream",
                    description: "The specified VideoStreamID or AudioStreamID cannot be found."
                },
                { tag: "field", name: "InvalidUrl", description: "The specified URL is invalid." },
                { tag: "field", name: "InvalidZone", description: "A specified ZoneID was invalid." },
                {
                    tag: "field", name: "InvalidCombination",
                    description: "The specified combination of Ingestion method and Container format is not supported."
                },
                {
                    tag: "field", name: "InvalidTriggerType",
                    description: "The trigger type is invalid for this command."
                },
                {
                    tag: "field", name: "InvalidTransportStatus",
                    description: "The Stream Transport Status is invalid for this command."
                },
                {
                    tag: "field", name: "InvalidOptions",
                    description: "The requested Container options are not supported with the streams indicated."
                },
                { tag: "field", name: "InvalidStreamUsage", description: "The requested StreamUsage is not allowed." },
                { tag: "field", name: "InvalidTime", description: "Time sync has not occurred yet." },
                {
                    tag: "field", name: "InvalidPreRollLength",
                    description: "The requested pre roll length is not compatible with the streams key frame interval."
                },
                {
                    tag: "field", name: "DuplicateStreamValues",
                    description: "The requested Streams info contained duplicate entries."
                }
            ]
        }
    ]
});
