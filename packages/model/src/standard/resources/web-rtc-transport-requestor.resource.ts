/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "WebRtcTransportRequestor", pics: "WEBRTCR", xref: "cluster§11.6",
    details: "The WebRTC transport requestor cluster provides a way for stream consumers (e.g. Matter Stream " +
        "Viewer) to establish a WebRTC connection with a stream provider that implements the WebRTC Transport " +
        "Provider Cluster.",

    children: [
        {
            tag: "attribute", name: "CurrentSessions", xref: "cluster§11.6.4.1",
            details: "This attribute shall be a list of WebRTCSessionStruct, which represents all the active WebRTC " +
                "Sessions on this Node."
        },

        {
            tag: "command", name: "Offer", xref: "cluster§11.6.5.1",

            details: "This command provides the stream requestor with WebRTC session details. It is sent following the " +
                "receipt of a SolicitOffer command or a re-Offer initiated by the Provider." +
                "\n" +
                "This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match " +
                "an entry in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not " +
                "match the accessing fabric and the Peer Node ID entry stored in the Secure Session Context (see " +
                "Chapter 4 Secure Channel, Secure Session Context section, in [MatterCore]) of the session this " +
                "command was received on.",

            children: [
                {
                    tag: "field", name: "WebRtcSessionId", xref: "cluster§11.6.5.1.1",
                    details: "This field shall contain the ID of the established WebRTC session."
                },
                {
                    tag: "field", name: "Sdp", xref: "cluster§11.6.5.1.2",
                    details: "This field shall contain the string based SDP Offer. See WebRTC Transport for further details on SDP " +
                        "and Offer/Answer semantics."
                },
                {
                    tag: "field", name: "IceServers", xref: "cluster§11.6.5.1.3",
                    details: "This field shall be a list of ICEServerStruct which contains the ICE servers and their credentials " +
                        "to use for this session. See ICEServerStruct for further details."
                },
                {
                    tag: "field", name: "IceTransportPolicy", xref: "cluster§11.6.5.1.4",
                    details: "This field controls the gathering and usage of ICE candidates and shall have one of the values found " +
                        "in ICETransportPolicy."
                }
            ]
        },

        {
            tag: "command", name: "Answer", xref: "cluster§11.6.5.2",

            details: "This command provides the stream requestor with the WebRTC session details (i.e. Session ID and SDP " +
                "answer), It is the next command in the Offer/Answer flow to the ProvideOffer command." +
                "\n" +
                "This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match " +
                "an entry in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not " +
                "match the accessing fabric and the Peer Node ID entry stored in the Secure Session Context of the " +
                "session this command was received on.",

            children: [
                {
                    tag: "field", name: "WebRtcSessionId", xref: "cluster§11.6.5.2.1",
                    details: "This field shall contain the WebRTCSessionID of the established WebRTC session."
                },
                {
                    tag: "field", name: "Sdp", xref: "cluster§11.6.5.2.2",
                    details: "This field shall contain the string based SDP Answer. See WebRTC Transport for further details on " +
                        "SDP and Offer/Answer semantics."
                }
            ]
        },

        {
            tag: "command", name: "IceCandidates", xref: "cluster§11.6.5.3",

            details: "This command allows for the object based ICE candidates generated after the initial Offer / Answer " +
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
                    tag: "field", name: "WebRtcSessionId", xref: "cluster§11.6.5.3.1",
                    details: "This field shall contain the WebRTCSessionID of the established WebRTC session."
                },
                {
                    tag: "field", name: "IceCandidates", xref: "cluster§11.6.5.3.2",
                    details: "This field shall contain a list of JSEP compliant ICE Candidate Format objects."
                }
            ]
        },

        {
            tag: "command", name: "End", xref: "cluster§11.6.5.4",
            details: "This command notifies the stream requestor that the provider has ended the WebRTC session.",

            children: [
                {
                    tag: "field", name: "WebRtcSessionId", xref: "cluster§11.6.5.4.1",
                    details: "This field shall contain the WebRTCSessionID of the established WebRTC session."
                },
                {
                    tag: "field", name: "Reason", xref: "cluster§11.6.5.4.2",
                    details: "This field shall be one of the values in WebRTCEndReasonEnum."
                }
            ]
        }
    ]
});
