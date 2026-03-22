/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { FixedAttribute, FabricScopedAttribute, Command, TlvNoResponse, Event } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TlvEnum, TlvUInt16, TlvUInt8, TlvUInt32, TlvEpochS } from "../tlv/TlvNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { StreamUsage } from "../globals/StreamUsage.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvString, TlvByteString } from "../tlv/TlvString.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvFabricIndex } from "../datatype/FabricIndex.js";
import { AccessLevel } from "@matter/model";
import { Priority } from "../globals/Priority.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status } from "../globals/Status.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace PushAvStreamTransport {
    /**
     * These are optional features supported by PushAvStreamTransportCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.5
     */
    export enum Feature {
        /**
         * PerZoneSensitivity (PERZONESENS)
         *
         * When this feature is supported, the Sensitivity for a Motion Trigger can be set per zone. When not supported,
         * only a single sensitivity can be used for all Motion Triggers.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.5.1
         */
        PerZoneSensitivity = "PerZoneSensitivity",

        /**
         * Metadata (METADATA)
         *
         * When this feature is supported and a transport activates it, metadata shall be included within the uploaded
         * data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.5.2
         */
        Metadata = "Metadata"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.3
     */
    export enum ContainerFormat {
        /**
         * CMAF container format
         *
         * CMAF (Common Media Application Format) is a container format based on the ISO Base Media File Format and is
         * described in MPEGCMAF. Nodes using CMAF as the container format shall also use CMAFIngest as the ingestion
         * format.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.3.1
         */
        Cmaf = 0
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.4
     */
    export enum IngestMethods {
        /**
         * CMAF ingestion format
         *
         * This value shall mean that CMAF Ingestion is utilized. See CMAF Ingestion for full details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.4.1
         */
        CmafIngest = 0
    }

    /**
     * This struct holds the combination of container format and ingest method which represents a valid combination for
     * a transport.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.6
     */
    export const TlvSupportedFormat = TlvObject({
        /**
         * This field shall indicate a supported container format that when combined with IngestMethod, can be used in a
         * transport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.6.1
         */
        containerFormat: TlvField(0, TlvEnum<ContainerFormat>()),

        /**
         * This field shall indicate a supported ingest method that when combined with ContainerFormat, can be used in a
         * transport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.6.2
         */
        ingestMethod: TlvField(1, TlvEnum<IngestMethods>())
    });

    /**
     * This struct holds the combination of container format and ingest method which represents a valid combination for
     * a transport.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.6
     */
    export interface SupportedFormat extends TypeFromSchema<typeof TlvSupportedFormat> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.2
     */
    export enum TransportStatus {
        /**
         * Push Transport can transport AV Streams
         */
        Active = 0,

        /**
         * Push Transport cannot transport AV Streams
         */
        Inactive = 1
    }

    /**
     * The Trigger Type determines the basic operation of the Push Transport and when it will actually transmit content.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.1
     */
    export enum TransportTriggerType {
        /**
         * Triggered only via a command invocation
         *
         * When set to this value, transport will only occur if ManuallyTriggerTransport is invoked.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.1.1
         */
        Command = 0,

        /**
         * Triggered via motion detection or command
         *
         * When set to this value, transport will occur if either the Motion Detector becomes triggered, or
         * ManuallyTriggerTransport is invoked. This is generally known as event driven recording.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.1.2
         */
        Motion = 1,

        /**
         * Triggered always when transport status is Active
         *
         * When set to this value, transport will always occur so long as the TransportStatus is Active. This is
         * generally known as 24/7 always-on recording.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.1.3
         */
        Continuous = 2
    }

    /**
     * This struct encodes the options that configure the per Zone portion of a Trigger configuration.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.10
     */
    export const TlvTransportZoneOptions = TlvObject({
        /**
         * This field shall be a Motion ZoneID found in the Zone Management Cluster which shall cause the trigger to
         * activate. If not null, motion in this zone will activate the trigger. If null, motion anywhere in the
         * complement of the union of all the Zones defined in the Zone Management Cluster on this endpoint will
         * activate the trigger.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.10.1
         */
        zone: TlvField(0, TlvNullable(TlvUInt16)),

        /**
         * This field shall indicate how sensitive the trigger for the specified Zone is, and shall match the same
         * implementation specifics as the Sensitivity attribute in the Zone Management Cluster. This field shall only
         * be included when PerZoneSensitivity is supported, otherwise the value from MotionSensitivity is used.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.10.2
         */
        sensitivity: TlvOptionalField(1, TlvUInt8.bound({ min: 1, max: 10 }))
    });

    /**
     * This struct encodes the options that configure the per Zone portion of a Trigger configuration.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.10
     */
    export interface TransportZoneOptions extends TypeFromSchema<typeof TlvTransportZoneOptions> {}

    /**
     * This struct is used to encode a set of values for controlling the lifecycle of a motion triggered transport.
     *
     * When a Motion Trigger is activated, either by receiving a ManuallyTriggerTransport command, or when motion is
     * initially detected which matches a configured motion trigger, the Node shall start the push transport configured
     * with this trigger see (TransportOptionsStruct).
     *
     * This places the Node in a Motion Detected state, at which point the Node shall internally track two values.
     *
     * The time in seconds since the trigger was activated.
     *
     * Initially set to the InitialDuration value.
     *
     * However, if additional motion is detected during this period, the Node shall increase the MotionDetectedDuration
     * value by the AugmentationDuration value. This process may occur repeatedly but after the first increase of
     * MotionDetectedDuration the Node shall NOT increase the MotionDetectedDuration value unless the previous
     * MotionDetectedDuration has been exceeded by the TimeSinceActivation.
     *
     * If the TimeSinceActivation value exceeds the MaxDuration or MotionDetectedDuration value, the Node shall stop
     * detecting motion for this trigger for the period of the BlindDuration value.
     *
     * Since multiple triggers (and corresponding push transports) may be activated by the same motion, the Node shall
     * perform this process independently for each motion trigger activated.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.12
     */
    export const TlvTransportMotionTriggerTimeControl = TlvObject({
        /**
         * This field shall indicate the initial duration in seconds after motion is first detected before the Node
         * could emit a MotionStopped event.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.12.1
         */
        initialDuration: TlvField(0, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall indicate the duration in seconds that the MotionDetectedDuration value is to be extended by
         * if motion is still detected during this period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.12.2
         */
        augmentationDuration: TlvField(1, TlvUInt16),

        /**
         * This field shall indicate the maximum duration in seconds after initial motion detection that additional
         * motion will be detected. The MaxDuration field value shall be greater or equal to the InitialDuration field
         * value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.12.3
         */
        maxDuration: TlvField(2, TlvUInt32.bound({ min: 1 })),

        /**
         * This field shall indicate the duration in seconds after a transport finishes transmitting that the Node shall
         * NOT activate the trigger again.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.12.4
         */
        blindDuration: TlvField(3, TlvUInt16)
    });

    /**
     * This struct is used to encode a set of values for controlling the lifecycle of a motion triggered transport.
     *
     * When a Motion Trigger is activated, either by receiving a ManuallyTriggerTransport command, or when motion is
     * initially detected which matches a configured motion trigger, the Node shall start the push transport configured
     * with this trigger see (TransportOptionsStruct).
     *
     * This places the Node in a Motion Detected state, at which point the Node shall internally track two values.
     *
     * The time in seconds since the trigger was activated.
     *
     * Initially set to the InitialDuration value.
     *
     * However, if additional motion is detected during this period, the Node shall increase the MotionDetectedDuration
     * value by the AugmentationDuration value. This process may occur repeatedly but after the first increase of
     * MotionDetectedDuration the Node shall NOT increase the MotionDetectedDuration value unless the previous
     * MotionDetectedDuration has been exceeded by the TimeSinceActivation.
     *
     * If the TimeSinceActivation value exceeds the MaxDuration or MotionDetectedDuration value, the Node shall stop
     * detecting motion for this trigger for the period of the BlindDuration value.
     *
     * Since multiple triggers (and corresponding push transports) may be activated by the same motion, the Node shall
     * perform this process independently for each motion trigger activated.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.12
     */
    export interface TransportMotionTriggerTimeControl extends TypeFromSchema<typeof TlvTransportMotionTriggerTimeControl> {}

    /**
     * This struct encodes the conditions and options that configures the trigger for the push transport. The transport
     * shall only start transmitting AV Streams when it’s associated trigger is activated.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.11
     */
    export const TlvTransportTriggerOptions = TlvObject({
        /**
         * This field shall indicate the type of the transport trigger.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.11.1
         */
        triggerType: TlvField(0, TlvEnum<TransportTriggerType>()),

        /**
         * This field shall be a list of TransportZoneOptionsStruct containing the Motion Zones to trigger on. If this
         * list is null, empty, or the Zone Management Cluster is not supported on this endpoint, then motion anywhere
         * shall cause the trigger to activate. The maximum size of this list is MaxZones.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.11.2
         */
        motionZones: TlvOptionalField(1, TlvNullable(TlvArray(TlvTransportZoneOptions))),

        /**
         * This field shall indicate how sensitive the trigger is to motion and shall match the same implementation
         * specifics as Sensitivity. This field shall NOT be used if the PerZoneSensitivity feature is supported, as a
         * Zone specific value is available in the TransportZoneOptionsStruct Sensitivity field. If this is null and the
         * Zone Management Cluster is supported on this endpoint, then the value found in the Sensitivity attribute in
         * the Zone Management Cluster shall be used. If this is null and the Zone Management Cluster is not supported
         * on this endpoint, a value of 10 shall be used.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.11.3
         */
        motionSensitivity: TlvOptionalField(2, TlvNullable(TlvUInt8.bound({ min: 1, max: 10 }))),

        /**
         * This field shall control timing around repeated activation of the trigger (see
         * TransportMotionTriggerTimeControlStruct). If TriggerType is Motion Value, this field shall be required.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.11.4
         */
        motionTimeControl: TlvOptionalField(3, TlvTransportMotionTriggerTimeControl),

        /**
         * This field shall indicate the maximum duration in milliseconds of pre-roll content that can be included, if
         * the TriggerType is Motion Value or Command Value, when the trigger activates.
         *
         * A value of 0 shall indicate that no extra segments beyond the one containing the trigger point will be sent.
         *
         * When using a non 0 value, the value shall be greater than or equal to the value of the stream’s
         * KeyFrameInterval and it SHOULD be a multiple of that value if larger.
         *
         * The actual amount transmitted will always be less than or equal to the per stream storage amount found in the
         * MaxContentBufferSize.
         *
         * Since a transmission caused by a trigger activation always begins on the Container Format’s segment (or
         * key-frame) boundary, if the trigger occurs mid segment, the entire segment still needs to be sent. This time
         * delta between the actual trigger point and the start of the segment is counted as part of the pre-roll
         * length. Thus, for more than the current segment to be sent as pre-roll, the full size of a segment must fit
         * within the remainder of this length. For this reason, it is recommended that a value of at least two times
         * SegmentDuration be used so that a full segment is always included if available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.11.5
         */
        maxPreRollLen: TlvOptionalField(4, TlvUInt16)
    });

    /**
     * This struct encodes the conditions and options that configures the trigger for the push transport. The transport
     * shall only start transmitting AV Streams when it’s associated trigger is activated.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.11
     */
    export interface TransportTriggerOptions extends TypeFromSchema<typeof TlvTransportTriggerOptions> {}

    /**
     * This type indicates the exact mode of CMAF that is in use.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.7
     */
    export enum CmafInterface {
        /**
         * CMAF Interface-1 Mode
         *
         * This value indicates that only the operations specified in CMAF Interface-1 will be done.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.7.1
         */
        Interface1 = 0,

        /**
         * CMAF Interface-2 Mode with DASH Support
         *
         * This value indicates the operations specified in CMAF Interface-2 with the DASH specific portions will be
         * done.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.7.2
         */
        Interface2Dash = 1,

        /**
         * CMAF Interface-2 Mode with HLS Support
         *
         * This value indicates the operations specified in CMAF Interface-2 with the HLS specific portions will be
         * done.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.7.3
         */
        Interface2Hls = 2
    }

    /**
     * This struct encodes options for configuration of the CMAF container format.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.8
     */
    export const TlvCmafContainerOptions = TlvObject({
        /**
         * This field shall indicate the selected Interface of the CMAF container. The Interface chosen determines the
         * number and type of operations that occur within each CMAF session. See CMAFInterfaceEnum for details on CMAF
         * Interfaces.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.8.1
         */
        cmafInterface: TlvField(0, TlvEnum<CmafInterface>()),

        /**
         * This field shall indicate the segment duration (in milliseconds) of the CMAF container. This value shall be a
         * multiple of the KeyFrameInterval for the associated video stream. It is recommended to use a value of 4000 (4
         * seconds).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.8.2
         */
        segmentDuration: TlvField(1, TlvUInt16.bound({ min: 500, max: 65500 })),

        /**
         * This field shall indicate the chunk duration (in milliseconds) of the CMAF container. A value of 0 shall
         * indicate that chunks are not used.
         *
         * When chunking is used, an even divisor of SegmentDuration SHOULD be used that aligns with the video frame
         * rate and audio frame duration. recommended values are 1/2, 1/4, or 1/8 of the SegmentDuration depending on
         * the end to end latency requirements needed. Each chunk results in an additional 144 bytes of overhead in the
         * resulting file.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.8.3
         */
        chunkDuration: TlvField(2, TlvUInt16),

        /**
         * This field shall identify the grouping semantic of the CMAF Session numbering between various CMAF transports
         * on the same Fabric. See Session Grouping for more details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.8.4
         */
        sessionGroup: TlvField(3, TlvUInt8),

        /**
         * This field shall identify the CMAF Track name value used inside the CMAF computed extended path fields
         * portion of the CMAF POST_URL. See Track Naming for full details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.8.5
         */
        trackName: TlvField(4, TlvString.bound({ minLength: 1, maxLength: 16 })),

        /**
         * This field, if present, shall indicate the CENC key to be used to encrypt the CMAF data. When absent, the
         * CMAF data shall be sent without CENC encryption added. See CMAF Background for further details on CMAF CENC
         * encryption.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.8.6
         */
        cencKey: TlvOptionalField(5, TlvByteString.bound({ length: 16 })),

        /**
         * This field, if present, shall indicate the opaque CENC Key ID (KID) that represents the key in the
         * Controllers ecosystem. This fields maps to the KID value as specified in ISO 23001-7:2023 or later. See CMAF
         * Background for further details on CMAF CENC encryption.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.8.7
         */
        cencKeyId: TlvOptionalField(6, TlvByteString.bound({ length: 16 })),

        /**
         * This field, if present and true, indicates that AVMetadataStruct based Metadata tracks and boxes may be
         * included in the CMAF segments. If this field is not present or is false, metadata tracks and boxes shall NOT
         * be included.
         *
         * Metadata within CMAF segments when used, shall be encoded as follows:
         *
         *   - Use urim as the codec-type.
         *
         *   - Use meta as the content-type.
         *
         *   - Use urn:csa:matter:av-metadata as the uri.
         *
         * Placement of the metadata shall be as follows:
         *
         *   - Use a single Track for time-synced data points as described in CMAF-Ingest Interface-1 Section 6.6
         *     Requirements for Timed Metadata Tracks.
         *
         *   - Use a single Box for non-time synced data points.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.8.8
         */
        metadataEnabled: TlvOptionalField(7, TlvBoolean)
    });

    /**
     * This struct encodes options for configuration of the CMAF container format.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.8
     */
    export interface CmafContainerOptions extends TypeFromSchema<typeof TlvCmafContainerOptions> {}

    /**
     * This struct encodes the specific container type options struct
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.9
     */
    export const TlvContainerOptions = TlvObject({
        /**
         * This field shall indicate the container type chosen for this transport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.9.1
         */
        containerType: TlvField(0, TlvEnum<ContainerFormat>()),

        /**
         * This field shall contain a CMAF Container Options if the ContainerType is set to CMAF, otherwise this field
         * shall be omitted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.9.2
         */
        cmafContainerOptions: TlvOptionalField(1, TlvCmafContainerOptions)
    });

    /**
     * This struct encodes the specific container type options struct
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.9
     */
    export interface ContainerOptions extends TypeFromSchema<typeof TlvContainerOptions> {}

    /**
     * This encodes the options and configuration of a transport.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.13
     */
    export const TlvTransportOptions = TlvObject({
        /**
         * This field contains the StreamUsageEnum of this transport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.13.1
         */
        streamUsage: TlvField(0, TlvEnum<StreamUsage>()),

        /**
         * This field shall have the following semantics:
         *
         *   - If not present, video isn’t requested.
         *
         *   - If present and null, automatic video stream assignment is requested.
         *
         *   - If present and non-null, the specific video stream identified by the VideoStreamIDType is requested.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.13.2
         */
        videoStreamId: TlvOptionalField(1, TlvNullable(TlvUInt16)),

        /**
         * This field shall have the following semantics:
         *
         *   - If not present, audio isn’t requested.
         *
         *   - If present and null, automatic audio stream assignment is requested.
         *
         *   - If present and non-null, the specific audio stream identified by the AudioStreamIDType is requested.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.13.3
         */
        audioStreamId: TlvOptionalField(2, TlvNullable(TlvUInt16)),

        /**
         * This field shall be a TLSEndpointID representing a provisioned TLS Endpoint, which shall have valid TLSCAID
         * and TLSCCDID values (see Chapter 14, Certificate Authority ID (CAID) Mapping and the ProvisionEndpoint
         * command in the TLS Client Management Cluster sections in [MatterCore]).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.13.4
         */
        tlsEndpointId: TlvField(3, TlvUInt16.bound({ min: 0, max: 65534 })),

        /**
         * This field shall be a valid string in RFC 3986 format representing the upload location. The field shall use
         * the https scheme which will be validated by the underlying TLSEndpointID.
         *
         * When the IngestMethod is CMAFIngest, this shall be the CMAF publishing_point_URL to transport the AV Stream
         * to. The URL length does not need to include space for the full CMAF POST_URL fields which specify the
         * session, track, and segment names as these will be internally appended.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.13.5
         */
        url: TlvField(4, TlvString.bound({ minLength: 13, maxLength: 2000 })),

        /**
         * This field shall be of type TransportTriggerOptionsStruct and represents the Trigger Type and its sub
         * options.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.13.6
         */
        triggerOptions: TlvField(5, TlvTransportTriggerOptions),

        /**
         * This field shall be of type IngestMethodsEnum and represents the Ingest Method to be used.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.13.7
         */
        ingestMethod: TlvField(6, TlvEnum<IngestMethods>()),

        /**
         * This field shall be of type ContainerOptionsStruct and represents the type of Push AV Stream Container to be
         * uploaded and any additional options relating to the Container Format used.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.13.8
         */
        containerOptions: TlvField(7, TlvContainerOptions),

        /**
         * This field shall be an unsigned 32 bit integer representing the TTL in seconds of a transport allocation. If
         * not present, the transport shall never expire.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.13.9
         */
        expiryTime: TlvOptionalField(8, TlvEpochS)
    });

    /**
     * This encodes the options and configuration of a transport.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.13
     */
    export interface TransportOptions extends TypeFromSchema<typeof TlvTransportOptions> {}

    /**
     * This encodes the current configuration of an allocated transport.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.14
     */
    export const TlvTransportConfiguration = TlvObject({
        /**
         * This field shall be a PushTransportConnectionID representing a unique transport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.14.1
         */
        connectionId: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 })),

        /**
         * This field shall represent the Stream Transport Status of the transport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.14.2
         */
        transportStatus: TlvField(1, TlvEnum<TransportStatus>()),

        /**
         * This field shall represent the Stream Transport Options of the transport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.14.3
         */
        transportOptions: TlvOptionalField(2, TlvTransportOptions),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * This encodes the current configuration of an allocated transport.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.14
     */
    export interface TransportConfiguration extends TypeFromSchema<typeof TlvTransportConfiguration> {}

    /**
     * Input to the PushAvStreamTransport allocatePushTransport command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.1
     */
    export const TlvAllocatePushTransportRequest = TlvObject({
        /**
         * This field shall represent the configuration options of the transport to be allocated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.1.1
         */
        transportOptions: TlvField(0, TlvTransportOptions)
    });

    /**
     * Input to the PushAvStreamTransport allocatePushTransport command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.1
     */
    export interface AllocatePushTransportRequest extends TypeFromSchema<typeof TlvAllocatePushTransportRequest> {}

    /**
     * This command shall be generated in response to a successful AllocatePushTransport command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.2
     */
    export const TlvAllocatePushTransportResponse = TlvObject({
        /**
         * This field shall be a TransportConfigurationStruct representing the newly allocated transport. If automatic
         * stream selection was requested, the used Stream ID fields will be present in the TransportOptions field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.2.1
         */
        transportConfiguration: TlvField(0, TlvTransportConfiguration)
    });

    /**
     * This command shall be generated in response to a successful AllocatePushTransport command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.2
     */
    export interface AllocatePushTransportResponse extends TypeFromSchema<typeof TlvAllocatePushTransportResponse> {}

    /**
     * Input to the PushAvStreamTransport deallocatePushTransport command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.3
     */
    export const TlvDeallocatePushTransportRequest = TlvObject({
        /**
         * This field shall be a PushTransportConnectionID representing the allocated transport to deallocate.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.3.1
         */
        connectionId: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 }))
    });

    /**
     * Input to the PushAvStreamTransport deallocatePushTransport command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.3
     */
    export interface DeallocatePushTransportRequest extends TypeFromSchema<typeof TlvDeallocatePushTransportRequest> {}

    /**
     * Input to the PushAvStreamTransport modifyPushTransport command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.4
     */
    export const TlvModifyPushTransportRequest = TlvObject({
        /**
         * This field shall be a PushTransportConnectionID representing the transport to modify.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.4.1
         */
        connectionId: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 })),

        /**
         * This field shall represent the Transport Options to modify.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.4.2
         */
        transportOptions: TlvField(1, TlvTransportOptions)
    });

    /**
     * Input to the PushAvStreamTransport modifyPushTransport command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.4
     */
    export interface ModifyPushTransportRequest extends TypeFromSchema<typeof TlvModifyPushTransportRequest> {}

    /**
     * Input to the PushAvStreamTransport setTransportStatus command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.5
     */
    export const TlvSetTransportStatusRequest = TlvObject({
        /**
         * This field shall be a PushTransportConnectionID representing the transport to modify. If null is passed, all
         * transports belonging to the calling fabric will be modified.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.5.1
         */
        connectionId: TlvField(0, TlvNullable(TlvUInt16)),

        /**
         * This field shall be a TransportStatusEnum and represent the new transport status to apply.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.5.2
         */
        transportStatus: TlvField(1, TlvEnum<TransportStatus>())
    });

    /**
     * Input to the PushAvStreamTransport setTransportStatus command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.5
     */
    export interface SetTransportStatusRequest extends TypeFromSchema<typeof TlvSetTransportStatusRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.6.5
     */
    export enum TriggerActivationReason {
        /**
         * Trigger has been activated by user action
         */
        UserInitiated = 0,

        /**
         * Trigger has been activated by automation
         */
        Automation = 1,

        /**
         * Trigger has been activated for emergency reasons
         */
        Emergency = 2
    }

    /**
     * Input to the PushAvStreamTransport manuallyTriggerTransport command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.6
     */
    export const TlvManuallyTriggerTransportRequest = TlvObject({
        /**
         * This field shall be a PushTransportConnectionID representing the push transport to start or stop.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.6.1
         */
        connectionId: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 })),

        /**
         * This field shall provide information as to why the transport was started or stopped.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.6.2
         */
        activationReason: TlvField(1, TlvEnum<TriggerActivationReason>()),

        /**
         * This field shall be a struct of type TransportMotionTriggerTimeControlStruct, but the BlindDuration field
         * shall be ignored.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.6.3
         */
        timeControl: TlvOptionalField(2, TlvTransportMotionTriggerTimeControl),

        /**
         * This field shall be an octet string representing arbitrary format user defined metadata that will be included
         * in the recording via the UserDefined Field field of AVMetadataStruct. The format and meaning of this field is
         * not defined in this specification and is up to the users, vendors, or ecosystems deploying it.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.6.4
         */
        userDefined: TlvOptionalField(3, TlvByteString.bound({ maxLength: 256 }))
    });

    /**
     * Input to the PushAvStreamTransport manuallyTriggerTransport command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.6
     */
    export interface ManuallyTriggerTransportRequest extends TypeFromSchema<typeof TlvManuallyTriggerTransportRequest> {}

    /**
     * Input to the PushAvStreamTransport findTransport command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.7
     */
    export const TlvFindTransportRequest = TlvObject({
        /**
         * This field shall be a PushTransportConnectionID or NULL representing the allocated push transport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.7.1
         */
        connectionId: TlvField(0, TlvNullable(TlvUInt16))
    });

    /**
     * Input to the PushAvStreamTransport findTransport command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.7
     */
    export interface FindTransportRequest extends TypeFromSchema<typeof TlvFindTransportRequest> {}

    /**
     * This command shall be generated in response to a successful FindTransport command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.8
     */
    export const TlvFindTransportResponse = TlvObject({
        /**
         * This field shall be a list of Transport Configurations.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.8.1
         */
        transportConfigurations: TlvField(0, TlvArray(TlvTransportConfiguration))
    });

    /**
     * This command shall be generated in response to a successful FindTransport command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.8
     */
    export interface FindTransportResponse extends TypeFromSchema<typeof TlvFindTransportResponse> {}

    /**
     * Body of the PushAvStreamTransport pushTransportBegin event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.10.1
     */
    export const TlvPushTransportBeginEvent = TlvObject({
        /**
         * This field shall be a PushTransportConnectionID representing the push transport which started transmitting.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.10.1.1
         */
        connectionId: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 })),

        /**
         * This field shall represent the type of trigger which caused this event to be emitted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.10.1.2
         */
        triggerType: TlvField(1, TlvEnum<TransportTriggerType>()),

        /**
         * This field shall only be present when the TriggerType is Command and provides the reason for the event.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.10.1.3
         */
        activationReason: TlvOptionalField(2, TlvEnum<TriggerActivationReason>())
    });

    /**
     * Body of the PushAvStreamTransport pushTransportBegin event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.10.1
     */
    export interface PushTransportBeginEvent extends TypeFromSchema<typeof TlvPushTransportBeginEvent> {}

    /**
     * Body of the PushAvStreamTransport pushTransportEnd event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.10.2
     */
    export const TlvPushTransportEndEvent = TlvObject({
        /**
         * This field shall be a PushTransportConnectionID representing the push transport which stopped transmitting.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.7.10.2.1
         */
        connectionId: TlvField(0, TlvUInt16.bound({ min: 0, max: 65534 }))
    });

    /**
     * Body of the PushAvStreamTransport pushTransportEnd event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.10.2
     */
    export interface PushTransportEndEvent extends TypeFromSchema<typeof TlvPushTransportEndEvent> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.7.1
     */
    export enum StatusCode {
        /**
         * The specified TLSEndpointID cannot be found.
         */
        InvalidTlsEndpoint = 2,

        /**
         * The specified VideoStreamID or AudioStreamID cannot be found.
         */
        InvalidStream = 3,

        /**
         * The specified URL is invalid.
         */
        InvalidUrl = 4,

        /**
         * A specified ZoneID was invalid.
         */
        InvalidZone = 5,

        /**
         * The specified combination of Ingestion method and Container format is not supported.
         */
        InvalidCombination = 6,

        /**
         * The trigger type is invalid for this command.
         */
        InvalidTriggerType = 7,

        /**
         * The Stream Transport Status is invalid for this command.
         */
        InvalidTransportStatus = 8,

        /**
         * The requested Container options are not supported with the streams indicated.
         */
        InvalidOptions = 9,

        /**
         * The requested StreamUsage is not allowed.
         */
        InvalidStreamUsage = 10,

        /**
         * Time sync has not occurred yet.
         */
        InvalidTime = 11
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidTlsEndpoint}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.7.1
     */
    export class InvalidTlsEndpointError extends StatusResponseError {
        constructor(
            message = "The specified TLSEndpointID cannot be found",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidTlsEndpoint
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidStream}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.7.1
     */
    export class InvalidStreamError extends StatusResponseError {
        constructor(
            message = "The specified VideoStreamID or AudioStreamID cannot be found",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidStream
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidUrl}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.7.1
     */
    export class InvalidUrlError extends StatusResponseError {
        constructor(
            message = "The specified URL is invalid",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidUrl
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidZone}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.7.1
     */
    export class InvalidZoneError extends StatusResponseError {
        constructor(
            message = "A specified ZoneID was invalid",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidZone
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidCombination}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.7.1
     */
    export class InvalidCombinationError extends StatusResponseError {
        constructor(
            message = "The specified combination of Ingestion method and Container format is not supported",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidCombination
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidTriggerType}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.7.1
     */
    export class InvalidTriggerTypeError extends StatusResponseError {
        constructor(
            message = "The trigger type is invalid for this command",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidTriggerType
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidTransportStatus}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.7.1
     */
    export class InvalidTransportStatusError extends StatusResponseError {
        constructor(
            message = "The Stream Transport Status is invalid for this command",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidTransportStatus
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidOptions}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.7.1
     */
    export class InvalidOptionsError extends StatusResponseError {
        constructor(
            message = "The requested Container options are not supported with the streams indicated",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidOptions
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidStreamUsage}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.7.1
     */
    export class InvalidStreamUsageError extends StatusResponseError {
        constructor(
            message = "The requested StreamUsage is not allowed",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidStreamUsage
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidTime}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7.7.1
     */
    export class InvalidTimeError extends StatusResponseError {
        constructor(
            message = "Time sync has not occurred yet",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidTime
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * These elements and properties are present in all PushAvStreamTransport clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x555,
        name: "PushAvStreamTransport",
        revision: 1,

        features: {
            /**
             * When this feature is supported, the Sensitivity for a Motion Trigger can be set per zone. When not
             * supported, only a single sensitivity can be used for all Motion Triggers.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.7.5.1
             */
            perZoneSensitivity: BitFlag(0),

            /**
             * When this feature is supported and a transport activates it, metadata shall be included within the
             * uploaded data.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.7.5.2
             */
            metadata: BitFlag(1)
        },

        attributes: {
            /**
             * This attribute shall contain a list of Supported Container Format structs, which represents the
             * combinations of Ingestion Method and Container Format that the Node supports. Nodes shall support at
             * least the combination CMAFIngest,CMAF.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.7.8.1
             */
            supportedFormats: FixedAttribute(0x0, TlvArray(TlvSupportedFormat, { minLength: 1 })),

            /**
             * This attribute shall be a list of TransportConfigurationStruct which represents all the allocated
             * connections added via AllocatePushTransport. When this attribute is read over a non Large Message (See
             * Large Message Quality in the Data Model section of [MatterCore]) capable transport, the TransportOptions
             * field shall NOT be included. To get the full details of the connections use the FindTransport command.
             * The maximum size of this list is run-time dependent upon the resource constraints of the system as
             * described in Resource Management and Stream Priorities and the currently used bandwidth of the total
             * available specified by MaxNetworkBandwidth.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.7.8.2
             */
            currentConnections: FabricScopedAttribute(
                0x1,
                TlvArray(TlvTransportConfiguration),
                { persistent: true, default: [] }
            )
        },

        commands: {
            /**
             * This command shall allocate a transport and return a PushTransportConnectionID.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.1
             */
            allocatePushTransport: Command(
                0x0,
                TlvAllocatePushTransportRequest,
                0x1,
                TlvAllocatePushTransportResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command shall be generated to request the Node deallocates the specified transport.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.3
             */
            deallocatePushTransport: Command(
                0x2,
                TlvDeallocatePushTransportRequest,
                0x2,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command is used to request the Node modifies the configuration of the specified push transport.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.4
             */
            modifyPushTransport: Command(
                0x3,
                TlvModifyPushTransportRequest,
                0x3,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command shall be generated to request the Node modifies the Transport Status of a specified
             * transport or all transports.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.5
             */
            setTransportStatus: Command(
                0x4,
                TlvSetTransportStatusRequest,
                0x4,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command shall be generated to request the Node to manually start the specified push transport.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.6
             */
            manuallyTriggerTransport: Command(0x5, TlvManuallyTriggerTransportRequest, 0x5, TlvNoResponse),

            /**
             * This command shall return the Transport Configuration for the specified push transport or all allocated
             * transports for the fabric if null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.7.9.7
             */
            findTransport: Command(0x6, TlvFindTransportRequest, 0x7, TlvFindTransportResponse)
        },

        events: {
            /**
             * This event shall indicate a push transport transmission has begun.
             *
             * The data on this event shall contain the following information.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.7.10.1
             */
            pushTransportBegin: Event(0x0, Priority.Info, TlvPushTransportBeginEvent),

            /**
             * This event shall indicate a push transport transmission has ended.
             *
             * The data on this event shall contain the following information.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.7.10.2
             */
            pushTransportEnd: Event(0x1, Priority.Info, TlvPushTransportEndEvent)
        },

        /**
         * This metadata controls which PushAvStreamTransportCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions()
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster implements the upload of Audio and Video streams from the Camera AV Stream Management Cluster using
     * suitable push-based transports. Push AV Stream Transport is the transmission of a stream of media to a server,
     * initiated by the activation of an associated trigger. A push transport can be triggered from a camera operating
     * in an always-on mode for supporting 24/7 style recording, triggered by events based on motion zones defined in
     * the Zone Management Cluster, or manually triggered using commands or bindings.
     *
     * A push transport shall be allocated before it is intended to be used, and then it is subsequently started when
     * its configured trigger is activated.
     *
     * An allocated push transport consists of five main logical things:
     *
     *   - A container format, which specifies how the individual media frames are formatted or multiplexed together
     *
     *   - An ingestion format which specifies how it is signaled and transmitted to the far end.
     *
     *   - A trigger which specifies when transport will occur.
     *
     *   - Which media stream/s to package together in the container format.
     *
     *   - Various options to the above.
     *
     * All push transport ingest methods shall use TLS as specified by the core specification. TLS Client Certificates
     * shall be used for Authorization and Identification of a Node on the underlying TLS connection (see Chapter 14,
     * TLS Certificate Management and TLS Client Management sections in [MatterCore]). Nodes supporting this cluster
     * shall also support the TLS Client Management Cluster and its dependencies.
     *
     * PushAvStreamTransportCluster supports optional features that you can enable with the
     * PushAvStreamTransportCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.7
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type PushAvStreamTransportCluster = PushAvStreamTransport.Cluster;
export const PushAvStreamTransportCluster = PushAvStreamTransport.Cluster;
ClusterRegistry.register(PushAvStreamTransport.Complete);
