/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { WebRtcTransportRequestor } from "@matter/types/clusters/web-rtc-transport-requestor";

export namespace WebRtcTransportRequestorInterface {
    export interface Base {
        /**
         * This command provides the stream requestor with WebRTC session details. It is sent following the receipt of a
         * SolicitOffer command or a re-Offer initiated by the Provider.
         *
         * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an entry
         * in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the accessing
         * fabric and the Peer Node ID entry stored in the Secure Session Context (see Chapter 4 Secure Channel, Secure
         * Session Context section, in [MatterCore]) of the session this command was received on.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1
         */
        offer(request: WebRtcTransportRequestor.OfferRequest): MaybePromise;

        /**
         * This command provides the stream requestor with the WebRTC session details (i.e. Session ID and SDP answer),
         * It is the next command in the Offer/Answer flow to the ProvideOffer command.
         *
         * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an entry
         * in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the accessing
         * fabric and the Peer Node ID entry stored in the Secure Session Context of the session this command was
         * received on.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.2
         */
        answer(request: WebRtcTransportRequestor.AnswerRequest): MaybePromise;

        /**
         * This command allows for the object based ICE candidates generated after the initial Offer / Answer exchange,
         * via a JSEP onicecandidate event, a DOM rtcpeerconnectioniceevent event, or other WebRTC compliant
         * implementations, to be added to a session during the gathering phase. This is typically used for STUN or TURN
         * discovered candidates, or to indicate the end of gathering state.
         *
         * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an entry
         * in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the accessing
         * fabric and the Peer Node ID entry stored in the Secure Session Context of the session this command was
         * received on.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.3
         */
        iceCandidates(request: WebRtcTransportRequestor.IceCandidatesRequest): MaybePromise;

        /**
         * This command notifies the stream requestor that the provider has ended the WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.4
         */
        end(request: WebRtcTransportRequestor.EndRequest): MaybePromise;
    }
}

export type WebRtcTransportRequestorInterface = {
    components: [{ flags: {}, methods: WebRtcTransportRequestorInterface.Base }]
};
