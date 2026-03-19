/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "ICEServerStruct", xref: "cluster§11.4.5.3",

    details: "This type shall specify the RFC 8825 compliant ICE servers used to facilitate the negotiation of " +
        "peer-to-peer connections through NATs (Network Address Translators) and firewalls. It mimics the " +
        "model used in the W3C WebRTC API RTCIceServer dictionary with the addition of a Matter specific " +
        "field for specifying the Root Certificate of any ICE servers that require TLS." +
        "\n" +
        "There are two types of ICE Servers which help to discover the public IP address of a device and " +
        "relay media traffic when direct peer-to-peer communication is not possible:" +
        "\n" +
        "  - STUN Servers, which help to discover the public IP address and NAT/Firewall type if any, of a " +
        "    device. When a WebRTC session starts, it contacts the STUN server, which returns the device’s " +
        "public IP and port number. This information is used to generate ICE candidates for the " +
        "peer-to-peer connection setup." +
        "\n" +
        "  - TURN Servers, which are used when STUN is not sufficient to establish a peer-to-peer " +
        "connection—typically such as when devices are behind symmetric NATs, which STUN cannot traverse. " +
        "TURN servers act as a relay between the peers, routing the media traffic between them.",

    children: [
        {
            tag: "field", name: "UrLs", xref: "cluster§11.4.5.3.1",
            details: "This field shall specify a list of URLs pointing to the STUN and/or TURN servers. The URL scheme " +
                "distinguishes whether it is a STUN or TURN server (stun:, stuns:, turn:, or turns: respectively). " +
                "This field maps to the RTCIceServer urls field."
        },

        {
            tag: "field", name: "Username", xref: "cluster§11.4.5.3.2",
            details: "(Optional for STUN, usually required for TURN) The RFC 8489 compliant UTF-8 encoded username " +
                "required for authentication with the STUN or TURN servers found in the URLs field. This field maps " +
                "to the RTCIceServer username field."
        },

        {
            tag: "field", name: "Credential", xref: "cluster§11.4.5.3.3",
            details: "(Optional for STUN, usually required for TURN) The RFC 8489 compliant UTF-8 encoded short-term " +
                "credential (password) used for authentication with the STUN or TURN servers found in the URLs field. " +
                "This field maps to the RTCIceServer credential field."
        },

        {
            tag: "field", name: "Caid", xref: "cluster§11.4.5.3.4",
            details: "This field represents the TLSRCAC via its assigned TLSCAID (see Chapter 14, Certificate Authority ID " +
                "(CAID) Mapping and TLS Certificate Management Commands sections in [MatterCore]) that will validate " +
                "the certificate chain presented by the entries in the urls field. It shall be set to a valid value " +
                "if a turns: or stuns: url is present in the urls field and shall be used to validate those servers' " +
                "presented TLS root certificates."
        }
    ]
});
