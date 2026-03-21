/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FabricScopedAttribute, Command, TlvNoResponse } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvOptionalField, TlvObject, TlvField } from "../tlv/TlvObject.js";
import { TlvUInt16, TlvEnum } from "../tlv/TlvNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { AccessLevel } from "@matter/model";
import { TlvString } from "../tlv/TlvString.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace WebRtcTransportRequestor {
    export const TlvWebRtcSession = TlvObject({
        videoStreamId: TlvOptionalField(4, TlvUInt16),
        audioStreamId: TlvOptionalField(5, TlvUInt16)
    });
    export interface WebRtcSession extends TypeFromSchema<typeof TlvWebRtcSession> {}
    export const TlvIceServer = TlvObject({ caid: TlvOptionalField(3, TlvUInt16) });
    export interface IceServer extends TypeFromSchema<typeof TlvIceServer> {}

    /**
     * Input to the WebRtcTransportRequestor offer command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1
     */
    export const TlvOfferRequest = TlvObject({
        /**
         * This field shall contain the ID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1.1
         */
        webRtcSessionId: TlvField(0, TlvUInt16),

        /**
         * This field shall contain the string based SDP Offer. See WebRTC Transport for further details on SDP and
         * Offer/Answer semantics.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1.2
         */
        sdp: TlvField(1, TlvString),

        /**
         * This field shall be a list of ICEServerStruct which contains the ICE servers and their credentials to use for
         * this session. See ICEServerStruct for further details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1.3
         */
        iceServers: TlvOptionalField(2, TlvArray(TlvIceServer, { maxLength: 10 })),

        /**
         * This field controls the gathering and usage of ICE candidates and shall have one of the values found in
         * ICETransportPolicy.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1.4
         */
        iceTransportPolicy: TlvOptionalField(3, TlvString.bound({ maxLength: 16 }))
    });

    /**
     * Input to the WebRtcTransportRequestor offer command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1
     */
    export interface OfferRequest extends TypeFromSchema<typeof TlvOfferRequest> {}

    /**
     * Input to the WebRtcTransportRequestor answer command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.2
     */
    export const TlvAnswerRequest = TlvObject({
        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.2.1
         */
        webRtcSessionId: TlvField(0, TlvUInt16),

        /**
         * This field shall contain the string based SDP Answer. See WebRTC Transport for further details on SDP and
         * Offer/Answer semantics.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.2.2
         */
        sdp: TlvField(1, TlvString)
    });

    /**
     * Input to the WebRtcTransportRequestor answer command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.2
     */
    export interface AnswerRequest extends TypeFromSchema<typeof TlvAnswerRequest> {}

    export const TlvIceCandidate = TlvObject({
        candidate: TlvOptionalField(0, TlvString),
        sdpMid: TlvOptionalField(1, TlvNullable(TlvString)),
        sdpMLineIndex: TlvOptionalField(2, TlvNullable(TlvUInt16))
    });
    export interface IceCandidate extends TypeFromSchema<typeof TlvIceCandidate> {}

    /**
     * Input to the WebRtcTransportRequestor iceCandidates command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.3
     */
    export const TlvIceCandidatesRequest = TlvObject({
        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.3.1
         */
        webRtcSessionId: TlvField(0, TlvUInt16),

        /**
         * This field shall contain a list of JSEP compliant ICE Candidate Format objects.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.3.2
         */
        iceCandidates: TlvField(1, TlvArray(TlvIceCandidate, { minLength: 1 }))
    });

    /**
     * Input to the WebRtcTransportRequestor iceCandidates command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.3
     */
    export interface IceCandidatesRequest extends TypeFromSchema<typeof TlvIceCandidatesRequest> {}

    export enum WebRtcEndReason {
        IceFailed = 0,
        IceTimeout = 1,
        UserHangup = 2,
        PeerHangup = 3,
        Busy = 4,
        TimedOut = 5,
        InternalError = 6
    }

    /**
     * Input to the WebRtcTransportRequestor end command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.4
     */
    export const TlvEndRequest = TlvObject({
        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.4.1
         */
        webRtcSessionId: TlvField(0, TlvUInt16),

        /**
         * This field shall be one of the values in WebRTCEndReasonEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.4.2
         */
        reason: TlvField(1, TlvEnum<WebRtcEndReason>())
    });

    /**
     * Input to the WebRtcTransportRequestor end command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.4
     */
    export interface EndRequest extends TypeFromSchema<typeof TlvEndRequest> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x554,
        name: "WebRtcTransportRequestor",
        revision: 1,

        attributes: {
            /**
             * This attribute shall be a list of WebRTCSessionStruct, which represents all the active WebRTC Sessions on
             * this Node.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.6.4.1
             */
            currentSessions: FabricScopedAttribute(
                0x0,
                TlvArray(TlvWebRtcSession),
                { default: [], readAcl: AccessLevel.Administer, writeAcl: AccessLevel.Administer }
            )
        },

        commands: {
            /**
             * This command provides the stream requestor with WebRTC session details. It is sent following the receipt
             * of a SolicitOffer command or a re-Offer initiated by the Provider.
             *
             * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an
             * entry in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the
             * accessing fabric and the Peer Node ID entry stored in the Secure Session Context (see Chapter 4 Secure
             * Channel, Secure Session Context section, in [MatterCore]) of the session this command was received on.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1
             */
            offer: Command(0x0, TlvOfferRequest, 0x0, TlvNoResponse),

            /**
             * This command provides the stream requestor with the WebRTC session details (i.e. Session ID and SDP
             * answer), It is the next command in the Offer/Answer flow to the ProvideOffer command.
             *
             * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an
             * entry in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the
             * accessing fabric and the Peer Node ID entry stored in the Secure Session Context of the session this
             * command was received on.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.2
             */
            answer: Command(0x1, TlvAnswerRequest, 0x1, TlvNoResponse),

            /**
             * This command allows for the object based ICE candidates generated after the initial Offer / Answer
             * exchange, via a JSEP onicecandidate event, a DOM rtcpeerconnectioniceevent event, or other WebRTC
             * compliant implementations, to be added to a session during the gathering phase. This is typically used
             * for STUN or TURN discovered candidates, or to indicate the end of gathering state.
             *
             * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an
             * entry in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the
             * accessing fabric and the Peer Node ID entry stored in the Secure Session Context of the session this
             * command was received on.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.3
             */
            iceCandidates: Command(0x2, TlvIceCandidatesRequest, 0x2, TlvNoResponse),

            /**
             * This command notifies the stream requestor that the provider has ended the WebRTC session.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.4
             */
            end: Command(0x3, TlvEndRequest, 0x3, TlvNoResponse)
        }
    });

    /**
     * The WebRTC transport requestor cluster provides a way for stream consumers (e.g. Matter Stream Viewer) to
     * establish a WebRTC connection with a stream provider that implements the WebRTC Transport Provider Cluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type WebRtcTransportRequestorCluster = WebRtcTransportRequestor.Cluster;
export const WebRtcTransportRequestorCluster = WebRtcTransportRequestor.Cluster;
ClusterRegistry.register(WebRtcTransportRequestor.Complete);
