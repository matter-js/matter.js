/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "WebRtcTransportDefinitions", xref: "cluster§11.4",

    children: [
        {
            tag: "datatype", name: "WebRTCSessionID", xref: "cluster§11.4.6.1",
            details: "It represents an active WebRTC session. This value starts at 0 and monotonically increases by 1 with " +
                "each new allocation provisioned by the Node. A value incremented past 65534 shall wrap to 0. The " +
                "Node shall verify that the incremented ID does not match any other active session ID. If such a " +
                "match is found, the ID shall be incremented until a unique ID is found."
        },

        {
            tag: "datatype", name: "WebRTCEndReasonEnum", xref: "cluster§11.4.6.2",

            children: [
                {
                    tag: "field", name: "IceFailed",
                    description: "No media connection could be established to the other party"
                },
                {
                    tag: "field", name: "IceTimeout",
                    description: "The call timed out whilst waiting for ICE candidate gathering to complete"
                },
                { tag: "field", name: "UserHangup", description: "The user chose to end the call" },
                { tag: "field", name: "UserBusy", description: "The remote party is busy" },
                { tag: "field", name: "Replaced", description: "The call was replaced by another call" },
                {
                    tag: "field", name: "NoUserMedia",
                    description: "An error code when there is no local mic/camera to use. This may be because the hardware isn't plugged in, or the user has explicitly denied access"
                },
                {
                    tag: "field", name: "InviteTimeout",
                    description: "The call timed out whilst waiting for the offer/answer step to complete"
                },
                {
                    tag: "field", name: "AnsweredElsewhere",
                    description: "The call was answered from a different device"
                },
                {
                    tag: "field", name: "OutOfResources",
                    description: "The was unable to continue due to not enough resources or available streams"
                },
                { tag: "field", name: "MediaTimeout", description: "The call ended due to a media timeout" },
                { tag: "field", name: "LowPower", description: "The call ended due to hitting a low power condition" },
                {
                    tag: "field", name: "PrivacyMode",
                    description: "The call ended due to the camera being set into a privacy mode."
                },
                { tag: "field", name: "UnknownReason", description: "Unknown or unspecified reason" }
            ]
        },

        {
            tag: "datatype", name: "ICEServerStruct", xref: "cluster§11.4.6.3",

            details: "This type shall specify the RFC 8825 compliant ICE servers used to facilitate the negotiation of " +
                "peer-to-peer connections through NATs (Network Address Translators) and firewalls. It mimics the " +
                "model used in the W3C WebRTC API RTCIceServer dictionary with the addition of a Matter specific " +
                "field for specifying the Root Certificate of any ICE servers that require TLS." +
                "\n" +
                "There are two types of ICE Servers which help to discover the public IP address of a device and " +
                "relay media traffic when direct peer-to-peer communication is not possible:" +
                "\n" +
                "  - STUN Servers, which help to discover the public IP address and NAT/Firewall type if any, of a " +
                "    device. When a WebRTC session starts, it contacts the STUN server, which returns the device's " +
                "public IP and port number. This information is used to generate ICE candidates for the " +
                "peer-to-peer connection setup." +
                "\n" +
                "  - TURN Servers, which are used when STUN is not sufficient to establish a peer-to-peer " +
                "connection—typically such as when devices are behind symmetric NATs, which STUN cannot traverse. " +
                "TURN servers act as a relay between the peers, routing the media traffic between them.",

            children: [
                {
                    tag: "field", name: "UrLs", xref: "cluster§11.4.6.3.1",
                    details: "This field shall specify a list of URLs pointing to the STUN and/or TURN servers. The URL scheme " +
                        "distinguishes whether it is a STUN or TURN server (stun:, stuns:, turn:, or turns: respectively). " +
                        "This field maps to the RTCIceServer urls field."
                },

                {
                    tag: "field", name: "Username", xref: "cluster§11.4.6.3.2",
                    details: "(Optional for STUN, usually required for TURN) The RFC 8489 compliant UTF-8 encoded username " +
                        "required for authentication with the STUN or TURN servers found in the URLs field. This field maps " +
                        "to the RTCIceServer username field."
                },

                {
                    tag: "field", name: "Credential", xref: "cluster§11.4.6.3.3",
                    details: "(Optional for STUN, usually required for TURN) The RFC 8489 compliant UTF-8 encoded short-term " +
                        "credential (password) used for authentication with the STUN or TURN servers found in the URLs field. " +
                        "This field maps to the RTCIceServer credential field."
                },

                {
                    tag: "field", name: "Caid", xref: "cluster§11.4.6.3.4",
                    details: "This field represents the TLSRCAC via its assigned TLSCAID (see Chapter 14, Certificate Authority ID " +
                        "(CAID) Mapping and TLS Certificate Management Commands sections in [[MatterCore]](#ref_MatterCore)) " +
                        "that will validate the certificate chain presented by the entries in the urls field. It shall be set " +
                        "to a valid value if a turns: or stuns: url is present in the urls field and shall be used to " +
                        "validate those servers' presented TLS root certificates."
                }
            ]
        },

        {
            tag: "datatype", name: "ICECandidateStruct", xref: "cluster§11.4.6.4",
            details: "This type shall specify the RFC 8825 compliant ICE Candidate used to facilitate the negotiation of " +
                "peer-to-peer connections through NATs (Network Address Translators) and firewalls. It mimics the " +
                "model used in the W3C WebRTC API RTCIceCandidate dictionary.",

            children: [
                {
                    tag: "field", name: "Candidate", xref: "cluster§11.4.6.4.1",

                    details: "This field shall specify the RFC 8825 compliant RFC 8839 candidate-attribute field in string form. " +
                        "This is the same value as the W3C WebRTC API RTCIceCandidate candidate value. The RFCs define no min " +
                        "or max length on this value." +
                        "\n" +
                        "Note: This string is not the same string as doing a candidate.toString() on a RTCIceCandidate " +
                        "ECMAScript object itself. Some browsers and ECMAScript libraries use non-standard ways to serialize " +
                        "sdpMid and sdpMLineIndex into the resulting string, but this is not defined in the W3 specification. " +
                        "This specification requires those fields to be passed directly using the named struct fields SDPMid " +
                        "and SDPMLineIndex."
                },

                {
                    tag: "field", name: "SdpMid", xref: "cluster§11.4.6.4.2",
                    details: "This field shall specify the Candidate's media stream identification tag which uniquely identifies " +
                        "the media stream within the component with which the candidate is associated, or null if no such " +
                        "association exists. This is the same value as the W3C WebRTC API RTCIceCandidate sdpMid value. The " +
                        "RFCs define no max length on this value."
                },

                {
                    tag: "field", name: "SdpmLineIndex", xref: "cluster§11.4.6.4.3",
                    details: "This field shall specify the zero-based index number of the media description (as defined in RFC " +
                        "8866) in the SDP with which the Candidate is associated or null if no such association exists. This " +
                        "is the same value as the W3C WebRTC API RTCIceCandidate sdpMLineIndex value."
                }
            ]
        },

        {
            tag: "datatype", name: "WebRTCSessionStruct", xref: "cluster§11.4.6.5",
            details: "This type stores all the relevant values associated with an active WebRTC session." +
                "\n" +
                "This values of PeerNodeID and FabricIndex are used to validate the source of, or select the correct " +
                "remote target, for WebRTC session related commands. The implicit field FabricIndex exists since this " +
                "structure is defined as Fabric Scoped.",

            children: [
                {
                    tag: "field", name: "Id", xref: "cluster§11.4.6.5.1",
                    details: "This field contains the WebRTC Session ID for this session."
                },
                {
                    tag: "field", name: "PeerNodeId", xref: "cluster§11.4.6.5.2",
                    details: "This field contains the NodeId for the peer entity involved in this session."
                },
                {
                    tag: "field", name: "PeerEndpointId", xref: "cluster§11.4.6.5.3",
                    details: "This field contains the EndpointId for the peer entity involved in this session."
                },
                {
                    tag: "field", name: "StreamUsage", xref: "cluster§11.4.6.5.4",
                    details: "This field contains the StreamUsageEnum of this session."
                },

                {
                    tag: "field", name: "VideoStreamId", xref: "cluster§11.4.6.5.5",
                    details: "This field is deprecated and the VideoStreams field used instead." +
                        "\n" +
                        "For compatibility with clients implementing cluster revision 1, the first video stream found in the " +
                        "VideoStreams field shall be populated here, or null if no video stream is currently associated with " +
                        "this session."
                },

                {
                    tag: "field", name: "AudioStreamId", xref: "cluster§11.4.6.5.6",
                    details: "This field is deprecated and the AudioStreams field used instead." +
                        "\n" +
                        "For compatibility with clients implementing cluster revision 1, the first audio stream found in the " +
                        "AudioStreams field shall be populated here, or null if no audio stream is currently associated with " +
                        "this session."
                },

                {
                    tag: "field", name: "MetadataEnabled", xref: "cluster§11.4.6.5.7",
                    details: "This field indicates if metadata is active in this session."
                },

                {
                    tag: "field", name: "VideoStreams", xref: "cluster§11.4.6.5.8",

                    details: "This field shall be a list of all video streams used by this session. Each VideoStreamID entry " +
                        "corresponds to an entry in the AllocatedVideoStreams attribute." +
                        "\n" +
                        "  - If present, the specified video streams from the AllocatedVideoStreams attribute shall be used." +
                        "\n" +
                        "  - If not present, this session has no video."
                },

                {
                    tag: "field", name: "AudioStreams", xref: "cluster§11.4.6.5.9",

                    details: "This field shall be a list of all audio streams used by this session. Each VideoStreamID entry " +
                        "corresponds to an entry in the AllocatedVideoStreams attribute." +
                        "\n" +
                        "  - If present, the specified audio streams from the AllocatedAudioStreams attribute shall be used." +
                        "\n" +
                        "  - If not present, this session has no audio."
                }
            ]
        }
    ]
});
