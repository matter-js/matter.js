/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { WebRtcTransportDefinitions } from "./web-rtc-transport-definitions.js";
import type { MaybePromise, Bytes } from "@matter/general";
import type { StreamUsage } from "../globals/StreamUsage.js";
import type { EndpointNumber } from "../datatype/EndpointNumber.js";

/**
 * Definitions for the WebRtcTransportProvider cluster.
 *
 * The WebRTC transport provider cluster provides a way for stream providers (e.g. Cameras) to stream or receive their
 * data through WebRTC. Devices implementing this cluster shall also implement Camera AV Stream Management Cluster on
 * the same endpoint.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 11.5
 */
export declare namespace WebRtcTransportProvider {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0553;

    /**
     * Textual cluster identifier.
     */
    export const name: "WebRtcTransportProvider";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the WebRtcTransportProvider cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link WebRtcTransportProvider} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall be a list of WebRTCSessionStruct, which represents all the active WebRTC Sessions.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.6.1
         */
        currentSessions: WebRtcTransportDefinitions.WebRtcSession[];
    }

    /**
     * Attributes that may appear in {@link WebRtcTransportProvider}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall be a list of WebRTCSessionStruct, which represents all the active WebRTC Sessions.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.6.1
         */
        currentSessions: WebRtcTransportDefinitions.WebRtcSession[];
    }

    /**
     * {@link WebRtcTransportProvider} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Requests that the Provider initiates a new session with the Offer / Answer flow in a way that allows for
         * options to be passed and work with devices needing the standby flow.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1
         */
        solicitOffer(request: SolicitOfferRequest): MaybePromise<SolicitOfferResponse>;

        /**
         * This command allows an SDP Offer to be set and start a new session. This command can also be used in the
         * re-offer flow of an existing session to change the details of the SDP (e.g. to enable/disable two-way talk).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3
         */
        provideOffer(request: ProvideOfferRequest): MaybePromise<ProvideOfferResponse>;

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
        provideAnswer(request: ProvideAnswerRequest): MaybePromise;

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
        provideIceCandidates(request: ProvideIceCandidatesRequest): MaybePromise;

        /**
         * This command instructs the stream provider to end the WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.7
         */
        endSession(request: EndSessionRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link WebRtcTransportProvider}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];
    export type Features = "Metadata";

    /**
     * These are optional features supported by WebRtcTransportProviderCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.4
     */
    export enum Feature {
        /**
         * Metadata (METADATA)
         *
         * When this feature is supported and a session activates it, a WebRTC DataChannel using the protocol name
         * urn:csa:matter:av-metadata shall be used for transmitting the metadata. The ability to include metadata is
         * supported on a per session basis.
         *
         * This feature is designed to be JSEP compliant with the RTCDataChannel object interface and consists of
         * AVMetadataStruct content.
         *
         * If SFrame End-to-End Encryption is active in a session, all metadata transmissions shall be sent using the
         * protocol name urn:csa:matter:sframe:av-metadata instead with each transmission being wrapped in SFrames.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.4.1
         */
        Metadata = "Metadata"
    }

    /**
     * Requests that the Provider initiates a new session with the Offer / Answer flow in a way that allows for options
     * to be passed and work with devices needing the standby flow.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1
     */
    export declare class SolicitOfferRequest {
        constructor(values?: Partial<SolicitOfferRequest>);

        /**
         * This field shall contain the StreamUsageEnum that indicates the stream usage for this session and is used per
         * Resource Management and Stream Priorities.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.1
         */
        streamUsage: StreamUsage;

        /**
         * This field shall indicate the endpoint that originates this command. This endpoint shall be used when acting
         * as a client to invoke the commands on the Requestor cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.2
         */
        originatingEndpointId: EndpointNumber;

        /**
         * This field shall indicate the video stream to use, not use, or let be automatically selected.
         *
         *   - If not present, no video should be included in the resulting Offer.
         *
         *   - If present and null, then automatic stream assignment or creation is requested.
         *
         *   - If present and a valid video stream ID, use only this specific stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.4
         */
        videoStreamId?: number | null;

        /**
         * This field shall indicate the audio stream to use, not use, or let be automatically selected.
         *
         *   - If not present, no audio should be included in the resulting Offer.
         *
         *   - If present and null, then automatic stream assignment or creation is requested.
         *
         *   - If present and a valid audio stream ID, use only this specific stream.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.3
         */
        audioStreamId?: number | null;

        /**
         * This field shall be a list of ICEServerStruct which contains the ICE servers and their credentials to use for
         * this session. See ICEServerStruct for further details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.5
         */
        iceServers?: WebRtcTransportDefinitions.IceServer[];

        /**
         * This field shall contain a string which dictates the gathering and usage of ICE candidates. Specifically
         * whether all candidates are used or if restrictions are applied to only use TURN server candidates. It is
         * important for both security and connectivity behavior, as it allows applications to define a preferred
         * approach to network routing and privacy. This field shall mirror the acceptable values in the W3C WebRTC API
         * RTCIceTransportPolicy enum, which are listed below for convenience:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.6
         */
        iceTransportPolicy?: string;

        /**
         * This field indicates if metadata transmission shall be active in this session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.7
         */
        metadataEnabled?: boolean;

        /**
         * This field if present indicates that SFrame End-to-End Encryption shall be active in this session using the
         * configuration provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.8
         */
        sFrameConfig?: SFrame;
    };

    /**
     * This command shall be generated in response to a SolicitOffer command.
     *
     * This response contains information about the session and streams created and/or if a deferred offer will take
     * place.
     *
     * Upon receipt, the client shall create a new WebRTCSessionStruct populated with the values from this command,
     * along with the accessing Peer Node ID and Local Fabric Index entries stored in the Secure Session Context as the
     * PeerNodeID and FabricIndex values, and store it in the WebRTC Transport Requestor cluster’s CurrentSessions
     * attribute.
     *
     * The session establishment shall be considered failed unless a Offer command is received by the Requestor from the
     * PeerEndpointID / FabricIndex within 30 seconds.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.2
     */
    export declare class SolicitOfferResponse {
        constructor(values?: Partial<SolicitOfferResponse>);

        /**
         * This field shall contain the ID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.2.1
         */
        webRtcSessionId: number;

        /**
         * This field shall indicates the delayed processing hint of the provider.
         *
         * If DeferredOffer is FALSE, the VideoStreamID and AudioStreamID fields shall NOT be null in this response and
         * the Provider will without delay invoke the Offer command. If DeferredOffer is TRUE, the VideoStreamID and
         * AudioStreamID fields may be non-null in this response, if the stream mapping logic can be done while in its
         * low-power state, or they may be null, if it cannot. When TRUE, this is a hint to the Requestor that there
         * will be a larger than normal amount of time before the Offer command will be invoked and the Requestor SHOULD
         * use this extra time gap to begin its own ICE Candidate generation until the Offer arrives. (See further
         * details in the section WebRTC Battery Camera in Standby Flow)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.2.2
         */
        deferredOffer: boolean;

        /**
         * This field shall contain the VideoStreamIDType used for the session if known or null if unknown at this time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.2.3
         */
        videoStreamId?: number | null;

        /**
         * This field shall contain the AudioStreamIDType used for the session if known or null if unknown at this time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.2.4
         */
        audioStreamId?: number | null;
    };

    /**
     * This command allows an SDP Offer to be set and start a new session. This command can also be used in the re-offer
     * flow of an existing session to change the details of the SDP (e.g. to enable/disable two-way talk).
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3
     */
    export declare class ProvideOfferRequest {
        constructor(values?: Partial<ProvideOfferRequest>);

        /**
         * This field shall be a WebRTCSessionID and contain the ID of an established WebRTC session or null if
         * requesting a new session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.1
         */
        webRtcSessionId: number | null;

        /**
         * This field shall contain the string based SDP Offer. See WebRTC Transport for further details on SDP and
         * Offer/Answer semantics.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.2
         */
        sdp: string;

        /**
         * This field shall contain the StreamUsageEnum that indicates the stream usage for this session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.3
         */
        streamUsage: StreamUsage;

        /**
         * This field shall indicate the endpoint that originates this command. This endpoint shall be used when acting
         * as a client to invoke the commands on the Requestor cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.4
         */
        originatingEndpointId: EndpointNumber;

        /**
         * This field shall have the following semantics:
         *
         *   - If not present, video is not being requested.
         *
         *   - If present and null, automatic assignment of a video stream is requested.
         *
         *   - If present and not null, the specific stream identified by the VideoStreamIDType is requested.
         *
         * In a reOffer flow, this field shall be set to the existing VideoStreamID stored for this session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.5
         */
        videoStreamId?: number | null;

        /**
         * This field shall have the following semantics:
         *
         *   - If not present, audio is not being requested.
         *
         *   - If present and null, automatic assignment of a audio stream is requested.
         *
         *   - If present and not null, the specific stream identified by the AudioStreamIDType is requested.
         *
         * In a reOffer flow, this field shall be set to the existing AudioStreamID stored for this session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.6
         */
        audioStreamId?: number | null;

        /**
         * This field shall be a list of ICEServerStruct which contains the ICE servers and their credentials to use for
         * this session. See ICEServerStruct for further details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.7
         */
        iceServers?: WebRtcTransportDefinitions.IceServer[];

        /**
         * This field controls the gathering and usage of ICE candidates and shall have one of the values found in
         * ICETransportPolicy.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.8
         */
        iceTransportPolicy?: string;

        /**
         * This field indicates if metadata transmission shall be active in this session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.9
         */
        metadataEnabled?: boolean;

        /**
         * This field if present indicates that SFrame End-to-End Encryption shall be active in this session using the
         * configuration provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.10
         */
        sFrameConfig?: SFrame;
    };

    /**
     * This command contains information about the session and streams created as a response to the requestor’s offer.
     *
     * Upon receipt, the client shall create a new WebRTCSessionStruct populated with the values from this command,
     * along with the accessing Peer Node ID and Local Fabric Index entries stored in the Secure Session Context as the
     * PeerNodeID and FabricIndex values, and store it in the WebRTC Transport Requestor cluster’s CurrentSessions
     * attribute.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.4
     */
    export declare class ProvideOfferResponse {
        constructor(values?: Partial<ProvideOfferResponse>);

        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.4.1
         */
        webRtcSessionId: number;

        /**
         * This field shall contain the VideoStreamIDType used for this session. If no video stream was used, null shall
         * be passed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.4.2
         */
        videoStreamId?: number | null;

        /**
         * This field shall contain the AudioStreamIDType used for this session. If no audio stream was used, null shall
         * be passed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.4.3
         */
        audioStreamId?: number | null;
    };

    /**
     * This command shall be initiated from a Node in response to an Offer that was previously received from a remote
     * peer. It shall have the following data fields:
     *
     * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an entry in
     * CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the accessing fabric
     * and the Peer Node ID entry stored in the Secure Session Context of the session this command was received on.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.5
     */
    export declare class ProvideAnswerRequest {
        constructor(values?: Partial<ProvideAnswerRequest>);

        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.5.1
         */
        webRtcSessionId: number;

        /**
         * This field shall contain the string based SDP Answer. See WebRTC Transport for further details on SDP and
         * Offer/Answer semantics.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.5.2
         */
        sdp: string;
    };

    /**
     * This command allows for string based ICE candidates generated after the initial Offer / Answer exchange, via a
     * JSEP onicecandidate event, a DOM rtcpeerconnectioniceevent event, or other WebRTC compliant implementations, to
     * be added to a session during the gathering phase. This is typically used for STUN or TURN discovered candidates,
     * or to indicate the end of gathering state.
     *
     * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an entry in
     * CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the accessing fabric
     * and the Peer Node ID entry stored in the Secure Session Context of the session this command was received on.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.6
     */
    export declare class ProvideIceCandidatesRequest {
        constructor(values?: Partial<ProvideIceCandidatesRequest>);

        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.6.1
         */
        webRtcSessionId: number;

        /**
         * This field shall contain a list of JSEP compliant ICE Candidate Format objects.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.6.2
         */
        iceCandidates: WebRtcTransportDefinitions.IceCandidate[];
    };

    /**
     * This command instructs the stream provider to end the WebRTC session.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.7
     */
    export declare class EndSessionRequest {
        constructor(values?: Partial<EndSessionRequest>);

        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.7.1
         */
        webRtcSessionId: number;

        /**
         * This field shall be one of the values in WebRTCEndReasonEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.7.2
         */
        reason: WebRtcTransportDefinitions.WebRtcEndReason;
    };

    /**
     * This type shall specify the RFC 9605 data needed to use SFrames as an end-to-end encryption mechanism with
     * WebRTC.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.5.1
     */
    export declare class SFrame {
        constructor(values?: Partial<SFrame>);

        /**
         * This field shall specify the SFrame cipher suite value as defined in RFC 9605 Section 8.1 Cipher Suites
         * table, and maintained in the IANA SFrame Registry.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.5.1.1
         */
        cipherSuite: number;

        /**
         * This field shall specify the SFrame base_key value to use for a session. The length of this key depends on
         * the selected cipher suite’s Nk value as defined in Section 4.5 Cipher Suites.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.5.1.2
         */
        baseKey: Bytes;

        /**
         * This field shall specify the initial SFrame KID (Key Id) value to be used. The bottom 8 bits of this value
         * will be overwritten and used for ratchet step tracking.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.5.1.3
         */
        kid: Bytes;
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link WebRtcTransportProvider}.
     */
    export const Cluster: typeof WebRtcTransportProvider;

    /**
     * @deprecated Use {@link WebRtcTransportProvider}.
     */
    export const Complete: typeof WebRtcTransportProvider;

    export const Typing: WebRtcTransportProvider;
}

/**
 * @deprecated Use {@link WebRtcTransportProvider}.
 */
export declare const WebRtcTransportProviderCluster: typeof WebRtcTransportProvider;

export interface WebRtcTransportProvider extends ClusterTyping {
    Attributes: WebRtcTransportProvider.Attributes;
    Commands: WebRtcTransportProvider.Commands;
    Features: WebRtcTransportProvider.Features;
    Components: WebRtcTransportProvider.Components;
}
