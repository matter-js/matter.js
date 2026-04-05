/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "WebRtcTransportProvider", pics: "WEBRTCP", xref: "cluster§11.5",
    details: "The WebRTC transport provider cluster provides a way for stream providers (e.g. Cameras) to stream " +
        "or receive their data through WebRTC. Devices implementing this cluster shall also implement Camera " +
        "AV Stream Management Cluster on the same endpoint.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§11.5.4",

            children: [{
                tag: "field", name: "METADATA", xref: "cluster§11.5.4.1",

                details: "When this feature is supported and a session activates it, a WebRTC DataChannel using the protocol " +
                    "name urn:csa:matter:av-metadata shall be used for transmitting the metadata. The ability to include " +
                    "metadata is supported on a per session basis." +
                    "\n" +
                    "This feature is designed to be JSEP compliant with the RTCDataChannel object interface and consists " +
                    "of AVMetadataStruct content." +
                    "\n" +
                    "If SFrame End-to-End Encryption is active in a session, all metadata transmissions shall be sent " +
                    "using the protocol name urn:csa:matter:sframe:av-metadata instead with each transmission being " +
                    "wrapped in SFrames."
            }]
        },

        {
            tag: "attribute", name: "CurrentSessions", xref: "cluster§11.5.6.1",
            details: "This attribute shall be a list of WebRTCSessionStruct, which represents all the active WebRTC " +
                "Sessions."
        },

        {
            tag: "command", name: "SolicitOffer", xref: "cluster§11.5.7.1",
            details: "Requests that the Provider initiates a new session with the Offer / Answer flow in a way that allows " +
                "for options to be passed and work with devices needing the standby flow.",

            children: [
                {
                    tag: "field", name: "StreamUsage", xref: "cluster§11.5.7.1.1",
                    details: "This field shall contain the StreamUsageEnum that indicates the stream usage for this session and is " +
                        "used per Resource Management and Stream Priorities."
                },
                {
                    tag: "field", name: "OriginatingEndpointId", xref: "cluster§11.5.7.1.2",
                    details: "This field shall indicate the endpoint that originates this command. This endpoint shall be used " +
                        "when acting as a client to invoke the commands on the Requestor cluster."
                },

                {
                    tag: "field", name: "VideoStreamId", xref: "cluster§11.5.7.1.4",

                    details: "This field is deprecated and the VideoStreams field used instead." +
                        "\n" +
                        "If this field is encountered from clients implementing cluster revision 1, then the following shall " +
                        "be done:" +
                        "\n" +
                        "  - If not present, no video should be included in the resulting Offer." +
                        "\n" +
                        "  - If present and null, then automatic stream assignment or creation is requested." +
                        "\n" +
                        "  - If present and non-null, the specific video stream identified by the VideoStreamID is added as " +
                        "an entry to the VideoStreams list."
                },

                {
                    tag: "field", name: "AudioStreamId", xref: "cluster§11.5.7.1.3",

                    details: "This field is deprecated and the AudioStreams field used instead." +
                        "\n" +
                        "If this field is encountered from clients implementing cluster revision 1, then the following shall " +
                        "be done:" +
                        "\n" +
                        "  - If not present, no audio should be included in the resulting Offer." +
                        "\n" +
                        "  - If present and null, then automatic stream assignment or creation is requested." +
                        "\n" +
                        "  - If present and non-null, the specific audio stream identified by the AudioStreamID is added as " +
                        "an entry to the AudioStreams list."
                },

                {
                    tag: "field", name: "IceServers", xref: "cluster§11.5.7.1.5",
                    details: "This field shall be a list of ICEServerStruct which contains the ICE servers and their credentials " +
                        "to use for this session. See ICEServerStruct for further details."
                },

                {
                    tag: "field", name: "IceTransportPolicy", xref: "cluster§11.5.7.1.6",

                    details: "This field shall contain a string which dictates the gathering and usage of ICE candidates. " +
                        "Specifically whether all candidates are used or if restrictions are applied to only use TURN server " +
                        "candidates. It is important for both security and connectivity behavior, as it allows applications " +
                        "to define a preferred approach to network routing and privacy. This field shall mirror the " +
                        "acceptable values in the W3C WebRTC API RTCIceTransportPolicy enum, which are listed below for " +
                        "convenience:"
                },

                {
                    tag: "field", name: "MetadataEnabled", xref: "cluster§11.5.7.1.7",
                    details: "This field indicates if metadata transmission shall be active in this session."
                },
                {
                    tag: "field", name: "SFrameConfig", xref: "cluster§11.5.7.1.8",
                    details: "This field if present indicates that SFrame End-to-End Encryption shall be active in this session " +
                        "using the configuration provided."
                },
                {
                    tag: "field", name: "VideoStreams", xref: "cluster§11.5.7.1.9",
                    details: "This field shall be the list of requested VideoStreamID for this session. Valid values are found in " +
                        "the AllocatedVideoStreams attribute."
                },
                {
                    tag: "field", name: "AudioStreams", xref: "cluster§11.5.7.1.10",
                    details: "This field shall be a list of requested AudioStreamID for this session. Valid values are found in " +
                        "the AllocatedAudioStreams attribute."
                }
            ]
        },

        {
            tag: "command", name: "SolicitOfferResponse", xref: "cluster§11.5.7.2",

            details: "This command shall be generated in response to a SolicitOffer command." +
                "\n" +
                "This response contains information about the session and streams created and/or if a deferred offer " +
                "will take place." +
                "\n" +
                "Upon receipt, the client shall create a new WebRTCSessionStruct populated with the values from this " +
                "command, along with the accessing Peer Node ID and Local Fabric Index entries stored in the Secure " +
                "Session Context as the PeerNodeID and FabricIndex values, and store it in the WebRTC Transport " +
                "Requestor cluster’s CurrentSessions attribute." +
                "\n" +
                "The session establishment shall be considered failed unless a Offer command is received by the " +
                "Requestor from the PeerEndpointID / FabricIndex within 30 seconds.",

            children: [
                {
                    tag: "field", name: "WebRtcSessionId", xref: "cluster§11.5.7.2.1",
                    details: "This field shall contain the ID of the established WebRTC session."
                },

                {
                    tag: "field", name: "DeferredOffer", xref: "cluster§11.5.7.2.2",

                    details: "This field shall indicates the delayed processing hint of the provider." +
                        "\n" +
                        "If DeferredOffer is FALSE, the VideoStreamID and AudioStreamID fields shall NOT be null in this " +
                        "response and the Provider will without delay invoke the Offer command. If DeferredOffer is TRUE, the " +
                        "VideoStreamID and AudioStreamID fields may be non-null in this response, if the stream mapping logic " +
                        "can be done while in its low-power state, or they may be null, if it cannot. When TRUE, this is a " +
                        "hint to the Requestor that there will be a larger than normal amount of time before the Offer " +
                        "command will be invoked and the Requestor SHOULD use this extra time gap to begin its own ICE " +
                        "Candidate generation until the Offer arrives. (See further details in the section WebRTC Battery " +
                        "Camera in Standby Flow)"
                },

                {
                    tag: "field", name: "VideoStreamId", xref: "cluster§11.5.7.2.3",
                    details: "This field is deprecated and is only present when clients implementing cluster revision 1 included " +
                        "the VideoStreamID field in the request. When included, it shall contain a VideoStreamID used for the " +
                        "session if known or null if unknown at this time."
                },

                {
                    tag: "field", name: "AudioStreamId", xref: "cluster§11.5.7.2.4",
                    details: "This field is deprecated and is only present when clients implementing cluster revision 1 included " +
                        "the AudioStreamID field in the request. When included, it shall contain a AudioStreamID used for the " +
                        "session if known or null if unknown at this time."
                }
            ]
        },

        {
            tag: "command", name: "ProvideOffer", xref: "cluster§11.5.7.3",
            details: "This command allows an SDP Offer to be set and start a new session. This command can also be used in " +
                "the re-offer flow of an existing session to change the details of the SDP (e.g. to enable/disable " +
                "two-way talk).",

            children: [
                {
                    tag: "field", name: "WebRtcSessionId", xref: "cluster§11.5.7.3.1",
                    details: "This field shall be a WebRTCSessionID and contain the ID of an established WebRTC session or null if " +
                        "requesting a new session."
                },
                {
                    tag: "field", name: "Sdp", xref: "cluster§11.5.7.3.2",
                    details: "This field shall contain the string based SDP Offer. See WebRTC Transport for further details on SDP " +
                        "and Offer/Answer semantics."
                },
                {
                    tag: "field", name: "StreamUsage", xref: "cluster§11.5.7.3.3",
                    details: "This field shall contain the StreamUsageEnum that indicates the stream usage for this session."
                },
                {
                    tag: "field", name: "OriginatingEndpointId", xref: "cluster§11.5.7.3.4",
                    details: "This field shall indicate the endpoint that originates this command. This endpoint shall be used " +
                        "when acting as a client to invoke the commands on the Requestor cluster."
                },

                {
                    tag: "field", name: "VideoStreamId", xref: "cluster§11.5.7.3.5",

                    details: "This field is deprecated and the VideoStreams field used instead." +
                        "\n" +
                        "If this field is encountered from clients implementing cluster revision 1, then the following shall " +
                        "be done:" +
                        "\n" +
                        "  - If not present, no video should be included in the resulting Answer." +
                        "\n" +
                        "  - If present and null, then automatic stream assignment or creation is requested." +
                        "\n" +
                        "  - If present and non-null, the specific video stream identified by the VideoStreamID shall be " +
                        "added as an entry to the VideoStreams list."
                },

                {
                    tag: "field", name: "AudioStreamId", xref: "cluster§11.5.7.3.6",

                    details: "This field is deprecated and the AudioStreams field used instead." +
                        "\n" +
                        "If this field is encountered from clients implementing cluster revision 1, then the following shall " +
                        "be done:" +
                        "\n" +
                        "  - If not present, no audio should be included in the resulting Answer." +
                        "\n" +
                        "  - If present and null, then automatic stream assignment or creation is requested." +
                        "\n" +
                        "  - If present and non-null, the specific video stream identified by the AudioStreamID shall be " +
                        "added as an entry to the AudioStreams list."
                },

                {
                    tag: "field", name: "IceServers", xref: "cluster§11.5.7.3.7",
                    details: "This field shall be a list of ICEServerStruct which contains the ICE servers and their credentials " +
                        "to use for this session. See ICEServerStruct for further details."
                },
                {
                    tag: "field", name: "IceTransportPolicy", xref: "cluster§11.5.7.3.8",
                    details: "This field controls the gathering and usage of ICE candidates and shall have one of the values found " +
                        "in ICETransportPolicy."
                },
                {
                    tag: "field", name: "MetadataEnabled", xref: "cluster§11.5.7.3.9",
                    details: "This field indicates if metadata transmission shall be active in this session."
                },
                {
                    tag: "field", name: "SFrameConfig", xref: "cluster§11.5.7.3.10",
                    details: "This field if present indicates that SFrame End-to-End Encryption shall be active in this session " +
                        "using the configuration provided."
                },
                {
                    tag: "field", name: "VideoStreams", xref: "cluster§11.5.7.3.11",
                    details: "This field shall be the list of requested VideoStreamID for this session. Valid values are found in " +
                        "the AllocatedVideoStreams attribute."
                },
                {
                    tag: "field", name: "AudioStreams", xref: "cluster§11.5.7.3.12",
                    details: "This field shall be a list of requested AudioStreamID for this session. Valid values are found in " +
                        "the AllocatedAudioStreams attribute."
                }
            ]
        },

        {
            tag: "command", name: "ProvideOfferResponse", xref: "cluster§11.5.7.4",

            details: "This command contains information about the session and streams created as a response to the " +
                "requestor’s offer." +
                "\n" +
                "Upon receipt, the client shall create a new WebRTCSessionStruct populated with the values from this " +
                "command, along with the accessing Peer Node ID and Local Fabric Index entries stored in the Secure " +
                "Session Context as the PeerNodeID and FabricIndex values, and store it in the WebRTC Transport " +
                "Requestor cluster’s CurrentSessions attribute.",

            children: [
                {
                    tag: "field", name: "WebRtcSessionId", xref: "cluster§11.5.7.4.1",
                    details: "This field shall contain the WebRTCSessionID of the established WebRTC session."
                },

                {
                    tag: "field", name: "VideoStreamId", xref: "cluster§11.5.7.4.2",
                    details: "This field is deprecated and is only present when clients implementing cluster revision 1 included " +
                        "the VideoStreamID field in the request. When included, it shall contain a VideoStreamID used for the " +
                        "session if known or null if unknown at this time."
                },

                {
                    tag: "field", name: "AudioStreamId", xref: "cluster§11.5.7.4.3",
                    details: "This field is deprecated and is only present when clients implementing cluster revision 1 included " +
                        "the AudioStreamID field in the request. When included, shall contain a AudioStreamID used for the " +
                        "session if known or null if unknown at this time."
                }
            ]
        },

        {
            tag: "command", name: "ProvideAnswer", xref: "cluster§11.5.7.5",

            details: "This command shall be initiated from a Node in response to an Offer that was previously received " +
                "from a remote peer. It shall have the following data fields:" +
                "\n" +
                "This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match " +
                "an entry in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not " +
                "match the accessing fabric and the Peer Node ID entry stored in the Secure Session Context of the " +
                "session this command was received on.",

            children: [
                {
                    tag: "field", name: "WebRtcSessionId", xref: "cluster§11.5.7.5.1",
                    details: "This field shall contain the WebRTCSessionID of the established WebRTC session."
                },
                {
                    tag: "field", name: "Sdp", xref: "cluster§11.5.7.5.2",
                    details: "This field shall contain the string based SDP Answer. See WebRTC Transport for further details on " +
                        "SDP and Offer/Answer semantics."
                }
            ]
        },

        {
            tag: "command", name: "ProvideIceCandidates", xref: "cluster§11.5.7.6",

            details: "This command allows for string based ICE candidates generated after the initial Offer / Answer " +
                "exchange, via a JSEP onicecandidate event, a DOM rtcpeerconnectioniceevent event, or other WebRTC " +
                "compliant implementations, to be added to a session during the gathering phase. This is typically " +
                "used for STUN or TURN discovered candidates, or to indicate the end of gathering state." +
                "\n" +
                "This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match " +
                "an entry in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not " +
                "match the accessing fabric and the Peer Node ID entry stored in the Secure Session Context of the " +
                "session this command was received on.",

            children: [
                {
                    tag: "field", name: "WebRtcSessionId", xref: "cluster§11.5.7.6.1",
                    details: "This field shall contain the WebRTCSessionID of the established WebRTC session."
                },
                {
                    tag: "field", name: "IceCandidates", xref: "cluster§11.5.7.6.2",
                    details: "This field shall contain a list of JSEP compliant ICE Candidate Format objects."
                }
            ]
        },

        {
            tag: "command", name: "EndSession", xref: "cluster§11.5.7.7",
            details: "This command instructs the stream provider to end the WebRTC session.",

            children: [
                {
                    tag: "field", name: "WebRtcSessionId", xref: "cluster§11.5.7.7.1",
                    details: "This field shall contain the WebRTCSessionID of the established WebRTC session."
                },
                {
                    tag: "field", name: "Reason", xref: "cluster§11.5.7.7.2",
                    details: "This field shall be one of the values in WebRTCEndReasonEnum."
                }
            ]
        },

        {
            tag: "datatype", name: "SFrameStruct", xref: "cluster§11.5.5.1",
            details: "This type shall specify the RFC 9605 data needed to use SFrames as an end-to-end encryption " +
                "mechanism with WebRTC.",

            children: [
                {
                    tag: "field", name: "CipherSuite", xref: "cluster§11.5.5.1.1",
                    details: "This field shall specify the SFrame cipher suite value as defined in RFC 9605 Section 8.1 Cipher " +
                        "Suites table, and maintained in the IANA SFrame Registry."
                },
                {
                    tag: "field", name: "BaseKey", xref: "cluster§11.5.5.1.2",
                    details: "This field shall specify the SFrame base_key value to use for a session. The length of this key " +
                        "depends on the selected cipher suite’s Nk value as defined in Section 4.5 Cipher Suites."
                },
                {
                    tag: "field", name: "Kid", xref: "cluster§11.5.5.1.3",
                    details: "This field shall specify the initial SFrame KID (Key Id) value to be used. The bottom 8 bits of this " +
                        "value will be overwritten and used for ratchet step tracking."
                }
            ]
        }
    ]
});
