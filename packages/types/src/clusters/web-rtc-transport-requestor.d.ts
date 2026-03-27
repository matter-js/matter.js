/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the WebRtcTransportRequestor cluster.
 *
 * The WebRTC transport requestor cluster provides a way for stream consumers (e.g. Matter Stream Viewer) to establish a
 * WebRTC connection with a stream provider that implements the WebRTC Transport Provider Cluster.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 11.6
 */
export declare namespace WebRtcTransportRequestor {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0554;

    /**
     * Textual cluster identifier.
     */
    export const name: "WebRtcTransportRequestor";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the WebRtcTransportRequestor cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link WebRtcTransportRequestor} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall be a list of WebRTCSessionStruct, which represents all the active WebRTC Sessions on
         * this Node.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.4.1
         */
        currentSessions: WebRtcSession[];
    }

    /**
     * Attributes that may appear in {@link WebRtcTransportRequestor}.
     */
    export interface Attributes {
        /**
         * This attribute shall be a list of WebRTCSessionStruct, which represents all the active WebRTC Sessions on
         * this Node.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.4.1
         */
        currentSessions: WebRtcSession[];
    }

    /**
     * {@link WebRtcTransportRequestor} always supports these elements.
     */
    export interface BaseCommands {
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
        offer(request: OfferRequest): MaybePromise;

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
        answer(request: AnswerRequest): MaybePromise;

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
        iceCandidates(request: IceCandidatesRequest): MaybePromise;

        /**
         * This command notifies the stream requestor that the provider has ended the WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.4
         */
        end(request: EndRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link WebRtcTransportRequestor}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];

    export interface WebRtcSession {
        videoStreamId?: number;
        audioStreamId?: number;
    }

    /**
     * This command provides the stream requestor with WebRTC session details. It is sent following the receipt of a
     * SolicitOffer command or a re-Offer initiated by the Provider.
     *
     * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an entry in
     * CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the accessing fabric
     * and the Peer Node ID entry stored in the Secure Session Context (see Chapter 4 Secure Channel, Secure Session
     * Context section, in [MatterCore]) of the session this command was received on.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1
     */
    export interface OfferRequest {
        /**
         * This field shall contain the ID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1.1
         */
        webRtcSessionId: number;

        /**
         * This field shall contain the string based SDP Offer. See WebRTC Transport for further details on SDP and
         * Offer/Answer semantics.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1.2
         */
        sdp: string;

        /**
         * This field shall be a list of ICEServerStruct which contains the ICE servers and their credentials to use for
         * this session. See ICEServerStruct for further details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1.3
         */
        iceServers?: IceServer[];

        /**
         * This field controls the gathering and usage of ICE candidates and shall have one of the values found in
         * ICETransportPolicy.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.1.4
         */
        iceTransportPolicy?: string;
    }

    /**
     * This command provides the stream requestor with the WebRTC session details (i.e. Session ID and SDP answer), It
     * is the next command in the Offer/Answer flow to the ProvideOffer command.
     *
     * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an entry in
     * CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the accessing fabric
     * and the Peer Node ID entry stored in the Secure Session Context of the session this command was received on.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.2
     */
    export interface AnswerRequest {
        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.2.1
         */
        webRtcSessionId: number;

        /**
         * This field shall contain the string based SDP Answer. See WebRTC Transport for further details on SDP and
         * Offer/Answer semantics.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.2.2
         */
        sdp: string;
    }

    /**
     * This command allows for the object based ICE candidates generated after the initial Offer / Answer exchange, via
     * a JSEP onicecandidate event, a DOM rtcpeerconnectioniceevent event, or other WebRTC compliant implementations, to
     * be added to a session during the gathering phase. This is typically used for STUN or TURN discovered candidates,
     * or to indicate the end of gathering state.
     *
     * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an entry in
     * CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the accessing fabric
     * and the Peer Node ID entry stored in the Secure Session Context of the session this command was received on.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.3
     */
    export interface IceCandidatesRequest {
        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.3.1
         */
        webRtcSessionId: number;

        /**
         * This field shall contain a list of JSEP compliant ICE Candidate Format objects.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.3.2
         */
        iceCandidates: IceCandidate[];
    }

    /**
     * This command notifies the stream requestor that the provider has ended the WebRTC session.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.4
     */
    export interface EndRequest {
        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.4.1
         */
        webRtcSessionId: number;

        /**
         * This field shall be one of the values in WebRTCEndReasonEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.6.5.4.2
         */
        reason: WebRtcEndReason;
    }

    export enum WebRtcEndReason {
        IceFailed = 0,
        IceTimeout = 1,
        UserHangup = 2,
        PeerHangup = 3,
        Busy = 4,
        TimedOut = 5,
        InternalError = 6
    }

    export interface IceCandidate {
        candidate?: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
    }
    export interface IceServer {
        caid?: number;
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * @deprecated Use {@link WebRtcTransportRequestor}.
     */
    export const Cluster: typeof WebRtcTransportRequestor;

    /**
     * @deprecated Use {@link WebRtcTransportRequestor}.
     */
    export const Complete: typeof WebRtcTransportRequestor;

    export const Typing: WebRtcTransportRequestor;
}

/**
 * @deprecated Use {@link WebRtcTransportRequestor}.
 */
export declare const WebRtcTransportRequestorCluster: typeof WebRtcTransportRequestor;

export interface WebRtcTransportRequestor extends ClusterTyping {
    Attributes: WebRtcTransportRequestor.Attributes;
    Commands: WebRtcTransportRequestor.Commands;
    Components: WebRtcTransportRequestor.Components;
}
