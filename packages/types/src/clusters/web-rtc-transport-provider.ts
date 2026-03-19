/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { FabricScopedAttribute, Command, TlvNoResponse } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvOptionalField, TlvObject, TlvField } from "../tlv/TlvObject.js";
import { TlvUInt16, TlvEnum } from "../tlv/TlvNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { AccessLevel } from "@matter/model";
import { StreamUsage } from "../globals/StreamUsage.js";
import { TlvEndpointNumber } from "../datatype/EndpointNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvIceServer as TlvIceServerStruct } from "../globals/IceServer.js";
import { TlvString, TlvByteString } from "../tlv/TlvString.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvIceCandidate } from "../globals/IceCandidate.js";
import { WebRtcEndReason } from "../globals/WebRtcEndReason.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace WebRtcTransportProvider {
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

    export const TlvWebRtcSession = TlvObject({
        videoStreamId: TlvOptionalField(4, TlvUInt16),
        audioStreamId: TlvOptionalField(5, TlvUInt16)
    });
    export interface WebRtcSession extends TypeFromSchema<typeof TlvWebRtcSession> {}

    /**
     * This type shall specify the RFC 9605 data needed to use SFrames as an end-to-end encryption mechanism with
     * WebRTC.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.5.1
     */
    export const TlvSFrame = TlvObject({
        /**
         * This field shall specify the SFrame cipher suite value as defined in RFC 9605 Section 8.1 Cipher Suites
         * table, and maintained in the IANA SFrame Registry.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.5.1.1
         */
        cipherSuite: TlvField(0, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall specify the SFrame base_key value to use for a session. The length of this key depends on
         * the selected cipher suite’s Nk value as defined in Section 4.5 Cipher Suites.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.5.1.2
         */
        baseKey: TlvField(1, TlvByteString.bound({ maxLength: 128 })),

        /**
         * This field shall specify the initial SFrame KID (Key Id) value to be used. The bottom 8 bits of this value
         * will be overwritten and used for ratchet step tracking.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.5.1.3
         */
        kid: TlvField(2, TlvByteString.bound({ minLength: 2, maxLength: 8 }))
    });

    /**
     * This type shall specify the RFC 9605 data needed to use SFrames as an end-to-end encryption mechanism with
     * WebRTC.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.5.1
     */
    export interface SFrame extends TypeFromSchema<typeof TlvSFrame> {}

    /**
     * Input to the WebRtcTransportProvider solicitOffer command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1
     */
    export const TlvSolicitOfferRequest = TlvObject({
        /**
         * This field shall contain the StreamUsageEnum that indicates the stream usage for this session and is used per
         * Resource Management and Stream Priorities.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.1
         */
        streamUsage: TlvField(0, TlvEnum<StreamUsage>()),

        /**
         * This field shall indicate the endpoint that originates this command. This endpoint shall be used when acting
         * as a client to invoke the commands on the Requestor cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.2
         */
        originatingEndpointId: TlvField(1, TlvEndpointNumber),

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
        videoStreamId: TlvOptionalField(2, TlvNullable(TlvUInt16)),

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
        audioStreamId: TlvOptionalField(3, TlvNullable(TlvUInt16)),

        /**
         * This field shall be a list of ICEServerStruct which contains the ICE servers and their credentials to use for
         * this session. See ICEServerStruct for further details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.5
         */
        iceServers: TlvOptionalField(4, TlvArray(TlvIceServerStruct, { maxLength: 10 })),

        /**
         * This field shall contain a string which dictates the gathering and usage of ICE candidates. Specifically
         * whether all candidates are used or if restrictions are applied to only use TURN server candidates. It is
         * important for both security and connectivity behavior, as it allows applications to define a preferred
         * approach to network routing and privacy. This field shall mirror the acceptable values in the W3C WebRTC API
         * RTCIceTransportPolicy enum, which are listed below for convenience:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.6
         */
        iceTransportPolicy: TlvOptionalField(5, TlvString.bound({ maxLength: 16 })),

        /**
         * This field indicates if metadata transmission shall be active in this session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.7
         */
        metadataEnabled: TlvOptionalField(6, TlvBoolean),

        /**
         * This field if present indicates that SFrame End-to-End Encryption shall be active in this session using the
         * configuration provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1.8
         */
        sFrameConfig: TlvOptionalField(7, TlvSFrame)
    });

    /**
     * Input to the WebRtcTransportProvider solicitOffer command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1
     */
    export interface SolicitOfferRequest extends TypeFromSchema<typeof TlvSolicitOfferRequest> {}

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
    export const TlvSolicitOfferResponse = TlvObject({
        /**
         * This field shall contain the ID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.2.1
         */
        webRtcSessionId: TlvField(0, TlvUInt16),

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
        deferredOffer: TlvField(1, TlvBoolean),

        /**
         * This field shall contain the VideoStreamIDType used for the session if known or null if unknown at this time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.2.3
         */
        videoStreamId: TlvOptionalField(2, TlvNullable(TlvUInt16)),

        /**
         * This field shall contain the AudioStreamIDType used for the session if known or null if unknown at this time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.2.4
         */
        audioStreamId: TlvOptionalField(3, TlvNullable(TlvUInt16))
    });

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
    export interface SolicitOfferResponse extends TypeFromSchema<typeof TlvSolicitOfferResponse> {}

    /**
     * Input to the WebRtcTransportProvider provideOffer command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3
     */
    export const TlvProvideOfferRequest = TlvObject({
        /**
         * This field shall be a WebRTCSessionID and contain the ID of an established WebRTC session or null if
         * requesting a new session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.1
         */
        webRtcSessionId: TlvField(0, TlvNullable(TlvUInt16)),

        /**
         * This field shall contain the string based SDP Offer. See WebRTC Transport for further details on SDP and
         * Offer/Answer semantics.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.2
         */
        sdp: TlvField(1, TlvString),

        /**
         * This field shall contain the StreamUsageEnum that indicates the stream usage for this session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.3
         */
        streamUsage: TlvField(2, TlvEnum<StreamUsage>()),

        /**
         * This field shall indicate the endpoint that originates this command. This endpoint shall be used when acting
         * as a client to invoke the commands on the Requestor cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.4
         */
        originatingEndpointId: TlvField(3, TlvEndpointNumber),

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
        videoStreamId: TlvOptionalField(4, TlvNullable(TlvUInt16)),

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
        audioStreamId: TlvOptionalField(5, TlvNullable(TlvUInt16)),

        /**
         * This field shall be a list of ICEServerStruct which contains the ICE servers and their credentials to use for
         * this session. See ICEServerStruct for further details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.7
         */
        iceServers: TlvOptionalField(6, TlvArray(TlvIceServerStruct, { maxLength: 10 })),

        /**
         * This field controls the gathering and usage of ICE candidates and shall have one of the values found in
         * ICETransportPolicy.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.8
         */
        iceTransportPolicy: TlvOptionalField(7, TlvString.bound({ maxLength: 16 })),

        /**
         * This field indicates if metadata transmission shall be active in this session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.9
         */
        metadataEnabled: TlvOptionalField(8, TlvBoolean),

        /**
         * This field if present indicates that SFrame End-to-End Encryption shall be active in this session using the
         * configuration provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3.10
         */
        sFrameConfig: TlvOptionalField(9, TlvSFrame)
    });

    /**
     * Input to the WebRtcTransportProvider provideOffer command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3
     */
    export interface ProvideOfferRequest extends TypeFromSchema<typeof TlvProvideOfferRequest> {}

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
    export const TlvProvideOfferResponse = TlvObject({
        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.4.1
         */
        webRtcSessionId: TlvField(0, TlvUInt16),

        /**
         * This field shall contain the VideoStreamIDType used for this session. If no video stream was used, null shall
         * be passed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.4.2
         */
        videoStreamId: TlvOptionalField(1, TlvNullable(TlvUInt16)),

        /**
         * This field shall contain the AudioStreamIDType used for this session. If no audio stream was used, null shall
         * be passed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.4.3
         */
        audioStreamId: TlvOptionalField(2, TlvNullable(TlvUInt16))
    });

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
    export interface ProvideOfferResponse extends TypeFromSchema<typeof TlvProvideOfferResponse> {}

    /**
     * Input to the WebRtcTransportProvider provideAnswer command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.5
     */
    export const TlvProvideAnswerRequest = TlvObject({
        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.5.1
         */
        webRtcSessionId: TlvField(0, TlvUInt16),

        /**
         * This field shall contain the string based SDP Answer. See WebRTC Transport for further details on SDP and
         * Offer/Answer semantics.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.5.2
         */
        sdp: TlvField(1, TlvString)
    });

    /**
     * Input to the WebRtcTransportProvider provideAnswer command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.5
     */
    export interface ProvideAnswerRequest extends TypeFromSchema<typeof TlvProvideAnswerRequest> {}

    /**
     * Input to the WebRtcTransportProvider provideIceCandidates command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.6
     */
    export const TlvProvideIceCandidatesRequest = TlvObject({
        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.6.1
         */
        webRtcSessionId: TlvField(0, TlvUInt16),

        /**
         * This field shall contain a list of JSEP compliant ICE Candidate Format objects.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.6.2
         */
        iceCandidates: TlvField(1, TlvArray(TlvIceCandidate, { minLength: 1 }))
    });

    /**
     * Input to the WebRtcTransportProvider provideIceCandidates command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.6
     */
    export interface ProvideIceCandidatesRequest extends TypeFromSchema<typeof TlvProvideIceCandidatesRequest> {}

    /**
     * Input to the WebRtcTransportProvider endSession command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.7
     */
    export const TlvEndSessionRequest = TlvObject({
        /**
         * This field shall contain the WebRTCSessionID of the established WebRTC session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.7.1
         */
        webRtcSessionId: TlvField(0, TlvUInt16),

        /**
         * This field shall be one of the values in WebRTCEndReasonEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.7.2
         */
        reason: TlvField(1, TlvEnum<WebRtcEndReason>())
    });

    /**
     * Input to the WebRtcTransportProvider endSession command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.7
     */
    export interface EndSessionRequest extends TypeFromSchema<typeof TlvEndSessionRequest> {}

    export const TlvIceServer = TlvObject({ caid: TlvOptionalField(3, TlvUInt16) });
    export interface IceServer extends TypeFromSchema<typeof TlvIceServer> {}

    /**
     * These elements and properties are present in all WebRtcTransportProvider clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x553,
        name: "WebRtcTransportProvider",
        revision: 1,

        features: {
            /**
             * When this feature is supported and a session activates it, a WebRTC DataChannel using the protocol name
             * urn:csa:matter:av-metadata shall be used for transmitting the metadata. The ability to include metadata
             * is supported on a per session basis.
             *
             * This feature is designed to be JSEP compliant with the RTCDataChannel object interface and consists of
             * AVMetadataStruct content.
             *
             * If SFrame End-to-End Encryption is active in a session, all metadata transmissions shall be sent using
             * the protocol name urn:csa:matter:sframe:av-metadata instead with each transmission being wrapped in
             * SFrames.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.5.4.1
             */
            metadata: BitFlag(0)
        },

        attributes: {
            /**
             * This attribute shall be a list of WebRTCSessionStruct, which represents all the active WebRTC Sessions.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.5.6.1
             */
            currentSessions: FabricScopedAttribute(
                0x0,
                TlvArray(TlvWebRtcSession),
                { default: [], readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            )
        },

        commands: {
            /**
             * Requests that the Provider initiates a new session with the Offer / Answer flow in a way that allows for
             * options to be passed and work with devices needing the standby flow.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.1
             */
            solicitOffer: Command(0x0, TlvSolicitOfferRequest, 0x1, TlvSolicitOfferResponse),

            /**
             * This command allows an SDP Offer to be set and start a new session. This command can also be used in the
             * re-offer flow of an existing session to change the details of the SDP (e.g. to enable/disable two-way
             * talk).
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.3
             */
            provideOffer: Command(0x2, TlvProvideOfferRequest, 0x3, TlvProvideOfferResponse),

            /**
             * This command shall be initiated from a Node in response to an Offer that was previously received from a
             * remote peer. It shall have the following data fields:
             *
             * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an
             * entry in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the
             * accessing fabric and the Peer Node ID entry stored in the Secure Session Context of the session this
             * command was received on.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.5
             */
            provideAnswer: Command(0x4, TlvProvideAnswerRequest, 0x4, TlvNoResponse),

            /**
             * This command allows for string based ICE candidates generated after the initial Offer / Answer exchange,
             * via a JSEP onicecandidate event, a DOM rtcpeerconnectioniceevent event, or other WebRTC compliant
             * implementations, to be added to a session during the gathering phase. This is typically used for STUN or
             * TURN discovered candidates, or to indicate the end of gathering state.
             *
             * This command shall respond with a response status of NOT_FOUND if the WebRTCSessionID does not match an
             * entry in CurrentSessions, or if the matching entry’s associated fabric and PeerNodeID do not match the
             * accessing fabric and the Peer Node ID entry stored in the Secure Session Context of the session this
             * command was received on.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.6
             */
            provideIceCandidates: Command(0x5, TlvProvideIceCandidatesRequest, 0x5, TlvNoResponse),

            /**
             * This command instructs the stream provider to end the WebRTC session.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.5.7.7
             */
            endSession: Command(0x6, TlvEndSessionRequest, 0x6, TlvNoResponse)
        },

        /**
         * This metadata controls which WebRtcTransportProviderCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions()
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * The WebRTC transport provider cluster provides a way for stream providers (e.g. Cameras) to stream or receive
     * their data through WebRTC. Devices implementing this cluster shall also implement Camera AV Stream Management
     * Cluster on the same endpoint.
     *
     * WebRtcTransportProviderCluster supports optional features that you can enable with the
     * WebRtcTransportProviderCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.5
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type WebRtcTransportProviderCluster = WebRtcTransportProvider.Cluster;
export const WebRtcTransportProviderCluster = WebRtcTransportProvider.Cluster;
ClusterRegistry.register(WebRtcTransportProvider.Complete);
