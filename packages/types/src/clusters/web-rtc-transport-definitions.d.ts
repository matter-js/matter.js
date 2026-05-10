/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterModel } from "@matter/model";
import type { NodeId } from "../datatype/NodeId.js";
import type { EndpointNumber } from "../datatype/EndpointNumber.js";
import type { StreamUsage } from "../globals/StreamUsage.js";
import type { FabricIndex } from "../datatype/FabricIndex.js";

/**
 * Definitions for the WebRtcTransportDefinitions cluster.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 11.4
 */
export declare namespace WebRtcTransportDefinitions {
    /**
     * Textual cluster identifier.
     */
    export const name: "WebRtcTransportDefinitions";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the WebRtcTransportDefinitions cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.2
     */
    export enum WebRtcEndReason {
        /**
         * No media connection could be established to the other party
         */
        IceFailed = 0,

        /**
         * The call timed out whilst waiting for ICE candidate gathering to complete
         */
        IceTimeout = 1,

        /**
         * The user chose to end the call
         */
        UserHangup = 2,

        /**
         * The remote party is busy
         */
        UserBusy = 3,

        /**
         * The call was replaced by another call
         */
        Replaced = 4,

        /**
         * An error code when there is no local mic/camera to use. This may be because the hardware isn't plugged in, or
         * the user has explicitly denied access
         */
        NoUserMedia = 5,

        /**
         * The call timed out whilst waiting for the offer/answer step to complete
         */
        InviteTimeout = 6,

        /**
         * The call was answered from a different device
         */
        AnsweredElsewhere = 7,

        /**
         * The was unable to continue due to not enough resources or available streams
         */
        OutOfResources = 8,

        /**
         * The call ended due to a media timeout
         */
        MediaTimeout = 9,

        /**
         * The call ended due to hitting a low power condition
         */
        LowPower = 10,

        /**
         * The call ended due to the camera being set into a privacy mode.
         */
        PrivacyMode = 11,

        /**
         * Unknown or unspecified reason
         */
        UnknownReason = 12
    }

    /**
     * This type shall specify the RFC 8825 compliant ICE servers used to facilitate the negotiation of peer-to-peer
     * connections through NATs (Network Address Translators) and firewalls. It mimics the model used in the W3C WebRTC
     * API RTCIceServer dictionary with the addition of a Matter specific field for specifying the Root Certificate of
     * any ICE servers that require TLS.
     *
     * There are two types of ICE Servers which help to discover the public IP address of a device and relay media
     * traffic when direct peer-to-peer communication is not possible:
     *
     *   - STUN Servers, which help to discover the public IP address and NAT/Firewall type if any, of a device. When a
     *     WebRTC session starts, it contacts the STUN server, which returns the device's public IP and port number.
     *     This information is used to generate ICE candidates for the peer-to-peer connection setup.
     *
     *   - TURN Servers, which are used when STUN is not sufficient to establish a peer-to-peer connection—typically
     *     such as when devices are behind symmetric NATs, which STUN cannot traverse. TURN servers act as a relay
     *     between the peers, routing the media traffic between them.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.3
     */
    export class IceServer {
        constructor(values?: Partial<IceServer>);

        /**
         * This field shall specify a list of URLs pointing to the STUN and/or TURN servers. The URL scheme
         * distinguishes whether it is a STUN or TURN server (stun:, stuns:, turn:, or turns: respectively). This field
         * maps to the RTCIceServer urls field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.3.1
         */
        urLs: string[];

        /**
         * (Optional for STUN, usually required for TURN) The RFC 8489 compliant UTF-8 encoded username required for
         * authentication with the STUN or TURN servers found in the URLs field. This field maps to the RTCIceServer
         * username field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.3.2
         */
        username?: string;

        /**
         * (Optional for STUN, usually required for TURN) The RFC 8489 compliant UTF-8 encoded short-term credential
         * (password) used for authentication with the STUN or TURN servers found in the URLs field. This field maps to
         * the RTCIceServer credential field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.3.3
         */
        credential?: string;

        /**
         * This field represents the TLSRCAC via its assigned TLSCAID (see Chapter 14, Certificate Authority ID (CAID)
         * Mapping and TLS Certificate Management Commands sections in [[MatterCore]](#ref_MatterCore)) that will
         * validate the certificate chain presented by the entries in the urls field. It shall be set to a valid value
         * if a turns: or stuns: url is present in the urls field and shall be used to validate those servers' presented
         * TLS root certificates.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.3.4
         */
        caid?: number;
    }

    /**
     * This type shall specify the RFC 8825 compliant ICE Candidate used to facilitate the negotiation of peer-to-peer
     * connections through NATs (Network Address Translators) and firewalls. It mimics the model used in the W3C WebRTC
     * API RTCIceCandidate dictionary.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.4
     */
    export class IceCandidate {
        constructor(values?: Partial<IceCandidate>);

        /**
         * This field shall specify the RFC 8825 compliant RFC 8839 candidate-attribute field in string form. This is
         * the same value as the W3C WebRTC API RTCIceCandidate candidate value. The RFCs define no min or max length on
         * this value.
         *
         * Note: This string is not the same string as doing a candidate.toString() on a RTCIceCandidate ECMAScript
         * object itself. Some browsers and ECMAScript libraries use non-standard ways to serialize sdpMid and
         * sdpMLineIndex into the resulting string, but this is not defined in the W3 specification. This specification
         * requires those fields to be passed directly using the named struct fields SDPMid and SDPMLineIndex.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.4.1
         */
        candidate: string;

        /**
         * This field shall specify the Candidate's media stream identification tag which uniquely identifies the media
         * stream within the component with which the candidate is associated, or null if no such association exists.
         * This is the same value as the W3C WebRTC API RTCIceCandidate sdpMid value. The RFCs define no max length on
         * this value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.4.2
         */
        sdpMid: string | null;

        /**
         * This field shall specify the zero-based index number of the media description (as defined in RFC 8866) in the
         * SDP with which the Candidate is associated or null if no such association exists. This is the same value as
         * the W3C WebRTC API RTCIceCandidate sdpMLineIndex value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.4.3
         */
        sdpmLineIndex: number | null;
    }

    /**
     * This type stores all the relevant values associated with an active WebRTC session.
     *
     * This values of PeerNodeID and FabricIndex are used to validate the source of, or select the correct remote
     * target, for WebRTC session related commands. The implicit field FabricIndex exists since this structure is
     * defined as Fabric Scoped.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.5
     */
    export class WebRtcSession {
        constructor(values?: Partial<WebRtcSession>);

        /**
         * This field contains the WebRTC Session ID for this session.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.5.1
         */
        id: number;

        /**
         * This field contains the NodeId for the peer entity involved in this session.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.5.2
         */
        peerNodeId: NodeId;

        /**
         * This field contains the EndpointId for the peer entity involved in this session.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.5.3
         */
        peerEndpointId: EndpointNumber;

        /**
         * This field contains the StreamUsageEnum of this session.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.5.4
         */
        streamUsage: StreamUsage;

        /**
         * This field is deprecated and the VideoStreams field used instead.
         *
         * For compatibility with clients implementing cluster revision 1, the first video stream found in the
         * VideoStreams field shall be populated here, or null if no video stream is currently associated with this
         * session.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.5.5
         */
        videoStreamId?: number | null;

        /**
         * This field is deprecated and the AudioStreams field used instead.
         *
         * For compatibility with clients implementing cluster revision 1, the first audio stream found in the
         * AudioStreams field shall be populated here, or null if no audio stream is currently associated with this
         * session.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.5.6
         */
        audioStreamId?: number | null;

        /**
         * This field indicates if metadata is active in this session.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.5.7
         */
        metadataEnabled: boolean;

        /**
         * This field shall be a list of all video streams used by this session. Each VideoStreamID entry corresponds to
         * an entry in the AllocatedVideoStreams attribute.
         *
         *   - If present, the specified video streams from the AllocatedVideoStreams attribute shall be used.
         *
         *   - If not present, this session has no video.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.5.8
         */
        videoStreams?: number[];

        /**
         * This field shall be a list of all audio streams used by this session. Each VideoStreamID entry corresponds to
         * an entry in the AllocatedVideoStreams attribute.
         *
         *   - If present, the specified audio streams from the AllocatedAudioStreams attribute shall be used.
         *
         *   - If not present, this session has no audio.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 11.4.6.5.9
         */
        audioStreams?: number[];

        fabricIndex: FabricIndex;
    }

    /**
     * @deprecated Use {@link WebRtcTransportDefinitions}.
     */
    export const Complete: typeof WebRtcTransportDefinitions;

    export const Typing: WebRtcTransportDefinitions;
}

export interface WebRtcTransportDefinitions extends ClusterTyping {}
