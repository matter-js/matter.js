/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { WebRtcTransportProvider } from "@matter/types/clusters/web-rtc-transport-provider";

export namespace WebRtcTransportProviderInterface {
    export interface Base {
        /**
         * Requests that the Provider initiates a new session with the Offer / Answer flow in a way that allows for
         * options to be passed and work with devices needing the standby flow.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1
         */
        solicitOffer(request: WebRtcTransportProvider.SolicitOfferRequest): MaybePromise<WebRtcTransportProvider.SolicitOfferResponse>;

        /**
         * This command allows an SDP Offer to be set and start a new session. This command can also be used in the
         * re-offer flow of an existing session to change the details of the SDP (e.g. to enable/disable two-way talk).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3
         */
        provideOffer(request: WebRtcTransportProvider.ProvideOfferRequest): MaybePromise<WebRtcTransportProvider.ProvideOfferResponse>;

        /**
         * This command shall be initiated from a Node in response to an Offer that was previously received from a
         * remote peer. It shall have the following data fields:
         *
         * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an entry
         * in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the accessing
         * fabric and the Peer Node ID entry stored in the Secure Session Context of the session this command was
         * received on.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.5
         */
        provideAnswer(request: WebRtcTransportProvider.ProvideAnswerRequest): MaybePromise;

        /**
         * This command allows for string based ICE candidates generated after the initial Offer / Answer exchange, via
         * a JSEP onicecandidate event, a DOM rtcpeerconnectioniceevent event, or other WebRTC compliant
         * implementations, to be added to a session during the gathering phase. This is typically used for STUN or TURN
         * discovered candidates, or to indicate the end of gathering state.
         *
         * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an entry
         * in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the accessing
         * fabric and the Peer Node ID entry stored in the Secure Session Context of the session this command was
         * received on.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.6
         */
        provideIceCandidates(request: WebRtcTransportProvider.ProvideIceCandidatesRequest): MaybePromise;

        /**
         * This command instructs the stream provider to end the WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.7
         */
        endSession(request: WebRtcTransportProvider.EndSessionRequest): MaybePromise;
    }
}

export type WebRtcTransportProviderInterface = {
    components: [{ flags: {}, methods: WebRtcTransportProviderInterface.Base }]
};
