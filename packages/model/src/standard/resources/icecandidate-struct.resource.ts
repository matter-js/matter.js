/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "ICECandidateStruct", xref: "cluster§11.4.5.4",
    details: "This type shall specify the RFC 8825 compliant ICE Candidate used to facilitate the negotiation of " +
        "peer-to-peer connections through NATs (Network Address Translators) and firewalls. It mimics the " +
        "model used in the W3C WebRTC API RTCIceCandidate dictionary.",

    children: [
        {
            tag: "field", name: "Candidate", xref: "cluster§11.4.5.4.1",

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
            tag: "field", name: "SdpMid", xref: "cluster§11.4.5.4.2",
            details: "This field shall specify the Candidate’s media stream identification tag which uniquely identifies " +
                "the media stream within the component with which the candidate is associated, or null if no such " +
                "association exists. This is the same value as the W3C WebRTC API RTCIceCandidate sdpMid value. The " +
                "RFCs define no max length on this value."
        },

        {
            tag: "field", name: "SdpmLineIndex", xref: "cluster§11.4.5.4.3",
            details: "This field shall specify the zero-based index number of the media description (as defined in RFC " +
                "8866) in the SDP with which the Candidate is associated or null if no such association exists. This " +
                "is the same value as the W3C WebRTC API RTCIceCandidate sdpMLineIndex value."
        }
    ]
});
