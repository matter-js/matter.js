/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, Command, TlvNoResponse, Event, FixedAttribute, OptionalAttribute } from "../cluster/Cluster.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TlvFabricIndex } from "../datatype/FabricIndex.js";
import { TlvNodeId } from "../datatype/NodeId.js";
import { TlvEndpointNumber } from "../datatype/EndpointNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { AccessLevel } from "#model";
import { Priority } from "../globals/Priority.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvInt32, TlvEpochUs, TlvEnum, TlvUInt8 } from "../tlv/TlvNumber.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status } from "../globals/Status.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace TimeSynchronization {
    /**
     * These are optional features supported by TimeSynchronizationCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.5
     */
    export enum Feature {
        /**
         * TimeZone (TZ)
         *
         * Allows a server to translate a UTC time to a local time using the time zone and daylight savings time (DST)
         * offsets. If a server supports the TimeZone feature, it shall support the SetTimeZone and SetDSTOffset
         * commands, and TimeZone and DSTOffset attributes, and shall expose the local time through the LocalTime
         * attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.5.1
         */
        TimeZone = "TimeZone",

        /**
         * NtpClient (NTPC)
         *
         * Allows a node to use NTP/SNTP for time synchronization.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.5.2
         */
        NtpClient = "NtpClient",

        /**
         * NtpServer (NTPS)
         *
         * Allows a Node to host an NTP server for the network so that other Nodes can achieve a high accuracy time
         * synchronization within the network. See Section 11.17.15, “Acting as an NTP Server”.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.5.3
         */
        NtpServer = "NtpServer",

        /**
         * TimeSyncClient (TSC)
         *
         * This node also supports a time synchronization client and can connect to and read time from other nodes.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.5.4
         */
        TimeSyncClient = "TimeSyncClient"
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.17.6.4
     */
    export const TlvTrustedTimeSource = TlvObject({
        /**
         * The Fabric Index associated with the Fabric of the client which last set the value of the trusted time source
         * node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.6.4.1
         */
        fabricIndex: TlvField(0, TlvFabricIndex),

        /**
         * Node ID of the trusted time source node on the Fabric associated with the entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.6.4.2
         */
        nodeId: TlvField(1, TlvNodeId),

        /**
         * Endpoint on the trusted time source node that contains the Time Synchronization cluster server.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.6.4.3
         */
        endpoint: TlvField(2, TlvEndpointNumber)
    });

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.17.6.4
     */
    export interface TrustedTimeSource extends TypeFromSchema<typeof TlvTrustedTimeSource> {}

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.17.6.5
     */
    export const TlvFabricScopedTrustedTimeSource = TlvObject({
        /**
         * Node ID of the trusted time source node on the Fabric of the issuer.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.6.5.1
         */
        nodeId: TlvField(0, TlvNodeId),

        /**
         * Endpoint on the trusted time source node that contains the Time Synchronization cluster server. This is
         * provided to avoid having to do discovery of the location of that endpoint by walking over all endpoints and
         * checking their Descriptor Cluster.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.6.5.2
         */
        endpoint: TlvField(1, TlvEndpointNumber)
    });

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.17.6.5
     */
    export interface FabricScopedTrustedTimeSource extends TypeFromSchema<typeof TlvFabricScopedTrustedTimeSource> {}

    /**
     * Input to the TimeSynchronization setTrustedTimeSource command
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.9.2
     */
    export const TlvSetTrustedTimeSourceRequest = TlvObject({
        /**
         * This field contains the Node ID and endpoint of a trusted time source on the accessing fabric.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.9.2.1
         */
        trustedTimeSource: TlvField(0, TlvNullable(TlvFabricScopedTrustedTimeSource)),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * Input to the TimeSynchronization setTrustedTimeSource command
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.9.2
     */
    export interface SetTrustedTimeSourceRequest extends TypeFromSchema<typeof TlvSetTrustedTimeSourceRequest> {}

    /**
     * Input to the TimeSynchronization setDefaultNtp command
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.9.6
     */
    export const TlvSetDefaultNtpRequest = TlvObject({
        /**
         * This field contains the address of an NTP server than can be used as a fallback for time synchronization. The
         * format of this field shall follow the requirements in the DefaultNTP attribute description.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.9.6.1
         */
        defaultNtp: TlvField(0, TlvNullable(TlvString.bound({ maxLength: 128 })))
    });

    /**
     * Input to the TimeSynchronization setDefaultNtp command
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.9.6
     */
    export interface SetDefaultNtpRequest extends TypeFromSchema<typeof TlvSetDefaultNtpRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.17.6.6
     */
    export const TlvTimeZone = TlvObject({
        /**
         * The time zone offset from UTC in seconds.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.6.6.1
         */
        offset: TlvField(0, TlvInt32.bound({ min: -43200, max: 50400 })),

        /**
         * The UTC time when the offset shall be applied.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.6.6.2
         */
        validAt: TlvField(1, TlvEpochUs),

        /**
         * The time zone name SHOULD provide a human-readable time zone name and it SHOULD use the country/city format
         * specified by the IANA Time Zone Database. The Name field may be used for display. If the node supports a
         * TimeZoneDatabase it may use the Name field to set its own DST offsets if it has database information for the
         * supplied time zone Name and the given Offset matches.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.6.6.3
         */
        name: TlvOptionalField(2, TlvString.bound({ minLength: 0, maxLength: 64 }))
    });

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.17.6.6
     */
    export interface TimeZone extends TypeFromSchema<typeof TlvTimeZone> {}

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.17.6.7
     */
    export const TlvDstOffset = TlvObject({
        /**
         * The DST offset in seconds. Normally this is in the range of 0 to 3600 seconds (1 hour), but this field will
         * accept any values in the int32 range to accommodate potential future legislation that does not fit with these
         * assumptions.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.6.7.1
         */
        offset: TlvField(0, TlvInt32),

        /**
         * The UTC time when the offset shall be applied.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.6.7.2
         */
        validStarting: TlvField(1, TlvEpochUs),

        /**
         * The UTC time when the offset shall stop being applied. Providing a null value here indicates a permanent DST
         * change. If this value is non-null the value shall be larger than the ValidStarting time.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.6.7.3
         */
        validUntil: TlvField(2, TlvNullable(TlvEpochUs))
    });

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.17.6.7
     */
    export interface DstOffset extends TypeFromSchema<typeof TlvDstOffset> {}

    /**
     * It indicates what the device knows about the contents of the IANA Time Zone Database. Partial support on a device
     * may be used to omit historical data, less commonly used time zones, and/or time zones not related to the region a
     * product is sold in.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.6.3
     */
    export enum TimeZoneDatabase {
        /**
         * Node has a full list of the available time zones
         */
        Full = 0,

        /**
         * Node has a partial list of the available time zones
         */
        Partial = 1,

        /**
         * Node does not have a time zone database
         */
        None = 2
    }

    /**
     * Input to the TimeSynchronization setTimeZone command
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.9.3
     */
    export const TlvSetTimeZoneRequest = TlvObject({
        timeZone: TlvField(0, TlvArray(TlvTimeZone, { minLength: 1, maxLength: 2 }))
    });

    /**
     * Input to the TimeSynchronization setTimeZone command
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.9.3
     */
    export interface SetTimeZoneRequest extends TypeFromSchema<typeof TlvSetTimeZoneRequest> {}

    /**
     * THis command is used to report the result of a SetTimeZone command. This command shall be generated in response
     * to a SetTimeZone command.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.9.4
     */
    export const TlvSetTimeZoneResponse = TlvObject({
        /**
         * If the node supports a time zone database with information for the time zone that will be applied, it may use
         * this information to set the DSTOffset attribute. If the node is setting its own DSTOffset attribute, the
         * DSTOffsetRequired field shall be set to false, otherwise it shall be set to true.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.9.4.1
         */
        dstOffsetRequired: TlvField(0, TlvBoolean)
    });

    /**
     * THis command is used to report the result of a SetTimeZone command. This command shall be generated in response
     * to a SetTimeZone command.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.9.4
     */
    export interface SetTimeZoneResponse extends TypeFromSchema<typeof TlvSetTimeZoneResponse> {}

    /**
     * Input to the TimeSynchronization setDstOffset command
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.9.5
     */
    export const TlvSetDstOffsetRequest = TlvObject({ dstOffset: TlvField(0, TlvArray(TlvDstOffset)) });

    /**
     * Input to the TimeSynchronization setDstOffset command
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.9.5
     */
    export interface SetDstOffsetRequest extends TypeFromSchema<typeof TlvSetDstOffsetRequest> {}

    /**
     * Body of the TimeSynchronization dstStatus event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.10.2
     */
    export const TlvDstStatusEvent = TlvObject({
        /**
         * Indicates whether the current DST offset is being applied (i.e, daylight savings time is applied, as opposed
         * to standard time).
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.10.2.1
         */
        dstOffsetActive: TlvField(0, TlvBoolean)
    });

    /**
     * Body of the TimeSynchronization dstStatus event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.10.2
     */
    export interface DstStatusEvent extends TypeFromSchema<typeof TlvDstStatusEvent> {}

    /**
     * Body of the TimeSynchronization timeZoneStatus event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.10.3
     */
    export const TlvTimeZoneStatusEvent = TlvObject({
        /**
         * Current time zone offset from UTC in seconds.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.10.3.1
         */
        offset: TlvField(0, TlvInt32.bound({ min: -43200, max: 50400 })),

        /**
         * Current time zone name. This name SHOULD use the country/city format specified by the IANA Time Zone
         * Database.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.10.3.2
         */
        name: TlvOptionalField(1, TlvString.bound({ minLength: 0, maxLength: 64 }))
    });

    /**
     * Body of the TimeSynchronization timeZoneStatus event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.10.3
     */
    export interface TimeZoneStatusEvent extends TypeFromSchema<typeof TlvTimeZoneStatusEvent> {}

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.17.6.1
     */
    export enum Granularity {
        /**
         * This indicates that the node is not currently synchronized with a UTC Time source and its clock is based on
         * the Last Known Good UTC Time only.
         */
        NoTimeGranularity = 0,

        /**
         * This indicates the node was synchronized to an upstream source in the past, but sufficient clock drift has
         * occurred such that the clock error is now > 5 seconds.
         */
        MinutesGranularity = 1,

        /**
         * This indicates the node is synchronized to an upstream source using a low resolution protocol. UTC Time is
         * accurate to ± 5 seconds.
         */
        SecondsGranularity = 2,

        /**
         * This indicates the node is synchronized to an upstream source using high resolution time-synchronization
         * protocol such as NTP, or has built-in GNSS with some amount of jitter applying its GNSS timestamp. UTC Time
         * is accurate to ± 50 ms.
         */
        MillisecondsGranularity = 3,

        /**
         * This indicates the node is synchronized to an upstream source using a highly precise time-synchronization
         * protocol such as PTP, or has built-in GNSS. UTC time is accurate to ± 10 μs.
         */
        MicrosecondsGranularity = 4
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.17.6.2
     */
    export enum TimeSource {
        /**
         * Node is not currently synchronized with a UTC Time source.
         */
        None = 0,

        /**
         * Node uses an unlisted time source.
         */
        Unknown = 1,

        /**
         * Node received time from a client using the SetUTCTime Command.
         */
        Admin = 2,

        /**
         * Synchronized time by querying the Time Synchronization cluster of another Node.
         */
        NodeTimeCluster = 3,

        /**
         * SNTP from a server not in the Matter network. NTS is not used.
         */
        NonMatterSntp = 4,

        /**
         * NTP from servers not in the Matter network. None of the servers used NTS.
         */
        NonMatterNtp = 5,

        /**
         * SNTP from a server within the Matter network. NTS is not used.
         */
        MatterSntp = 6,

        /**
         * NTP from servers within the Matter network. None of the servers used NTS.
         */
        MatterNtp = 7,

        /**
         * NTP from multiple servers in the Matter network and external. None of the servers used NTS.
         */
        MixedNtp = 8,

        /**
         * SNTP from a server not in the Matter network. NTS is used.
         */
        NonMatterSntpnts = 9,

        /**
         * NTP from servers not in the Matter network. NTS is used on at least one server.
         */
        NonMatterNtpnts = 10,

        /**
         * SNTP from a server within the Matter network. NTS is used.
         */
        MatterSntpnts = 11,

        /**
         * NTP from a server within the Matter network. NTS is used on at least one server.
         */
        MatterNtpnts = 12,

        /**
         * NTP from multiple servers in the Matter network and external. NTS is used on at least one server.
         */
        MixedNtpnts = 13,

        /**
         * Time synchronization comes from a vendor cloud-based source (e.g. "Date" header in authenticated HTTPS
         * connection).
         */
        CloudSource = 14,

        /**
         * Time synchronization comes from PTP.
         */
        Ptp = 15,

        /**
         * Time synchronization comes from a GNSS source.
         */
        Gnss = 16
    }

    /**
     * Input to the TimeSynchronization setUtcTime command
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.9.1
     */
    export const TlvSetUtcTimeRequest = TlvObject({
        /**
         * This field shall give the Client’s UTC Time.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.9.1.1
         */
        utcTime: TlvField(0, TlvEpochUs),

        /**
         * This field shall give the Client’s Granularity, as described in Granularity.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.9.1.2
         */
        granularity: TlvField(1, TlvEnum<Granularity>()),

        /**
         * This field shall give the Client’s TimeSource, as described in TimeSource.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.17.9.1.3
         */
        timeSource: TlvOptionalField(2, TlvEnum<TimeSource>())
    });

    /**
     * Input to the TimeSynchronization setUtcTime command
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.9.1
     */
    export interface SetUtcTimeRequest extends TypeFromSchema<typeof TlvSetUtcTimeRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.17.7.1
     */
    export enum StatusCode {
        /**
         * Node rejected the attempt to set the UTC time
         */
        TimeNotAccepted = 2
    }

    /**
     * Thrown for cluster status code {@link StatusCode.TimeNotAccepted}.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17.7.1
     */
    export class TimeNotAcceptedError extends StatusResponseError {
        constructor(
            message = "Node rejected the attempt to set the UTC time",
            code = Status.Failure,
            clusterCode = StatusCode.TimeNotAccepted
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * A TimeSynchronizationCluster supports these elements if it supports feature TimeSyncClient.
     */
    export const TimeSyncClientComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the Node ID, endpoint, and associated fabric index of a Node that may be used as trusted time
             * source. See Section 11.17.13, “Time source prioritization”. This attribute reflects the last value set by
             * an administrator using the SetTrustedTimeSource command. If the value is null, no trusted time source has
             * yet been set.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.4
             */
            trustedTimeSource: Attribute(0x3, TlvNullable(TlvTrustedTimeSource), { persistent: true, default: null })
        },

        commands: {
            /**
             * This command is used to set the TrustedTimeSource attribute. Upon receipt of this command:
             *
             *   • If the TrustedTimeSource field in the command is null, the node shall set the TrustedTimeSource
             *     attribute to null and shall generate a MissingTrustedTimeSource event.
             *
             *   • Otherwise, the node shall set the TrustedTimeSource attribute to a struct which has NodeID and
             *     Endpoint fields matching those in the TrustedTimeSource field and has its FabricIndex field set to
             *     the command’s accessing fabric index.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.9.2
             */
            setTrustedTimeSource: Command(
                0x1,
                TlvSetTrustedTimeSourceRequest,
                0x1,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            )
        },

        events: {
            /**
             * This event shall be generated if the TrustedTimeSource is set to null upon fabric removal or by a
             * SetTrustedTimeSource command.
             *
             * This event shall also be generated if the node has not generated a MissingTrustedTimeSource event in the
             * last hour, and the node fails to update its time from the TrustedTimeSource because the TrustedTimeSource
             * is null or the specified peer cannot be reached. MissingTrustedTimeSource events corresponding to a time
             * update SHOULD NOT be generated more often than once per hour.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.10.5
             */
            missingTrustedTimeSource: Event(0x4, Priority.Info, TlvNoArguments)
        }
    });

    /**
     * A TimeSynchronizationCluster supports these elements if it supports feature NtpClient.
     */
    export const NtpClientComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the default NTP server that this Node may use if other time sources are unavailable. This
             * attribute is settable by an Administrator using the SetDefaultNTP command. It SHOULD be set by the
             * Commissioner during commissioning. If no default NTP server is available, the Commissioner may set this
             * value to null. The default IANA assigned NTP port of 123 shall be used to access the NTP server.
             *
             * If set, the format of this attribute shall be a domain name or a static IPv6 address with no port, in
             * text format, as specified in RFC 5952. The address format shall follow the recommendations in Section 4
             * and shall NOT contain a port number.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.5
             */
            defaultNtp: Attribute(
                0x4,
                TlvNullable(TlvString.bound({ maxLength: 128 })),
                { persistent: true, default: null }
            ),

            /**
             * Indicates if the node supports resolving a domain name. DefaultNTP Address values for these nodes may
             * include domain names. If this is False, the Address for a DefaultNTP shall be an IPv6 address.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.13
             */
            supportsDnsResolve: FixedAttribute(0xc, TlvBoolean, { default: false })
        },

        commands: {
            /**
             * This command is used to set the DefaultNTP attribute.
             *
             * If the DefaultNTP Address field does not conform to the requirements in the DefaultNTP attribute
             * description, the command shall fail with a status code of INVALID_COMMAND. If the node does not support
             * DNS resolution (as specified in SupportsDNSResolve) and the provided Address is a domain name, the
             * command shall fail with a status code of INVALID_COMMAND. Otherwise, the node shall set the DefaultNTP
             * attribute to match the DefaultNTP provided in this command.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.9.6
             */
            setDefaultNtp: Command(
                0x5,
                TlvSetDefaultNtpRequest,
                0x5,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            )
        }
    });

    /**
     * A TimeSynchronizationCluster supports these elements if it supports feature TimeZone.
     */
    export const TimeZoneComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall contain a list of time zone offsets from UTC and when they shall take effect.
             *
             * This attribute uses a list of time offset configurations to allow Nodes to handle scheduled regulatory
             * time zone changes. This attribute shall NOT be used to indicate daylight savings time changes (see
             * Section 11.17.8.7, “DSTOffset Attribute” for daylight savings time).
             *
             * The first entry shall have a ValidAt entry of 0. If there is a second entry, it shall have a non-zero
             * ValidAt time.
             *
             * If a node supports a TimeZoneDatabase, and it has data for the given time zone Name and the given Offset
             * matches, the node may update its own DSTOffset attribute to add new DST change times as required, based
             * on the Name fields of the TimeZoneStruct. Administrators may add additional entries to the DSTOffset of
             * other Nodes with the same time zone, if required.
             *
             * If a node does not support a TimeZoneDatabase, the Name field of the TimeZoneStruct is only applicable
             * for client-side localization. In particular:
             *
             *   • If the node does not support a TimeZoneDatabase, the Name field shall NOT be used to calculate the
             *     local time.
             *
             *   • If the node does not support a TimeZoneDatabase, the Name field shall NOT be used to calculate DST
             *     start or end dates.
             *
             * When time passes, the node SHOULD remove any entries which are no longer active and change the ValidAt
             * time for the currently used TimeZoneStruct list item to zero.
             *
             * This attribute shall have at least one entry. If the node does not have a default time zone and no time
             * zone has been set, it may set this value to a list containing a single TimeZoneStruct with an offset of 0
             * (UTC) and a ValidAt time of 0.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.6
             */
            timeZone: Attribute(
                0x5,
                TlvArray(TlvTimeZone, { minLength: 1, maxLength: 2 }),
                { persistent: true, default: [{ offset: 0, validAt: 0 }] }
            ),

            /**
             * This attribute shall contain a list of offsets to apply for daylight savings time, and their validity
             * period.
             *
             * List entries shall be sorted by ValidStarting time.
             *
             * A list entry shall NOT have a ValidStarting time that is smaller than the ValidUntil time of the previous
             * entry. There shall be at most one list entry with a null ValidUntil time and, if such an entry is
             * present, it shall appear last in the list.
             *
             * Over time, the node SHOULD remove any entries which are no longer active from the list.
             *
             * Over time, if the node supports a TimeZoneDatabase and it has information available for the given time
             * zone name, it may update its own list to add additional entries.
             *
             * If a time zone does not use DST, this shall be indicated by a single entry with a 0 offset and a null
             * ValidUntil field.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.7
             */
            dstOffset: Attribute(0x6, TlvArray(TlvDstOffset), { persistent: true, default: [] }),

            /**
             * Indicates the computed current local time of the node as a epoch-us (Epoch Time in Microseconds). The
             * value of LocalTime shall be the sum of the UTCTime, the offset of the currently valid TimeZoneStruct from
             * the TimeZone attribute (converted to microseconds), and the offset of the currently valid DSTOffsetStruct
             * from the DSTOffset attribute (converted to microseconds), if such an entry exists.
             *
             * If the node has not achieved time synchronization, this shall be null. If the node has an empty
             * DSTOffset, this shall be null.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.8
             */
            localTime: Attribute(0x7, TlvNullable(TlvEpochUs), { omitChanges: true, default: null }),

            /**
             * Indicates whether the node has access to a time zone database. Nodes with a time zone database may update
             * their own DSTOffset attribute to add new entries and may push DSTOffset updates to other Nodes in the
             * same time zone as required.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.9
             */
            timeZoneDatabase: FixedAttribute(0x8, TlvEnum<TimeZoneDatabase>(), { default: TimeZoneDatabase.None }),

            /**
             * Indicates the number of supported list entries in the TimeZone attribute. This attribute may take the
             * value of 1 or 2, where the optional second list entry may be used to handle scheduled regulatory time
             * zone changes.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.11
             */
            timeZoneListMaxSize: FixedAttribute(0xa, TlvUInt8.bound({ min: 1, max: 2 })),

            /**
             * Indicates the number of supported list entries in DSTOffset attribute. This value must be at least 1.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.12
             */
            dstOffsetListMaxSize: FixedAttribute(0xb, TlvUInt8.bound({ min: 1 }))
        },

        commands: {
            /**
             * This command is used to set the time zone of the node.
             *
             * If the given list is larger than the TimeZoneListMaxSize, the node shall respond with RESOURCE_EXHAUSTED
             * and the TimeZone attribute shall NOT be updated.
             *
             * If the given list does not conform to the list requirements in TimeZone attribute the node shall respond
             * with a CONSTRAINT_ERROR and the TimeZone attribute shall NOT be updated.
             *
             * If there are no errors in the list, the TimeZone field shall be copied to the TimeZone attribute. A
             * TimeZoneStatus event shall be generated with the new time zone information.
             *
             * If the node supports a time zone database and it has information available for the time zone that will be
             * applied, it may set its DSTOffset attribute, otherwise the DSTOffset attribute shall be set to an empty
             * list. A DSTTableEmpty event shall be generated if the DSTOffset attribute is empty. A DSTStatus event
             * shall be generated if the node was previously applying a DST offset.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.9.3
             */
            setTimeZone: Command(
                0x2,
                TlvSetTimeZoneRequest,
                0x3,
                TlvSetTimeZoneResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command is used to set the DST offsets for a node.
             *
             *   • If the length of DSTOffset is larger than DSTOffsetListMaxSize, the node shall respond with
             *     RESOURCE_EXHAUSTED.
             *
             *   • Else if the list entries do not conform to the list requirements for DSTOffset attribute, the node
             *     shall respond with CONSTRAINT_ERROR.
             *
             * If there are no errors in the list, the DSTOffset field shall be copied to the DSTOffset attribute.
             *
             * If the DSTOffset attribute change causes a corresponding change to the DST state, a DSTStatus event shall
             * be generated. If the list is empty, the node shall generate a DSTTableEmpty event.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.9.5
             */
            setDstOffset: Command(0x4, TlvSetDstOffsetRequest, 0x4, TlvNoResponse, { invokeAcl: AccessLevel.Manage })
        },

        events: {
            /**
             * This event shall be generated when the node stops applying the current DSTOffset and there are no entries
             * in the list with a larger ValidStarting time, indicating the need to possibly get new DST data. This
             * event shall also be generated if the DSTOffset list is cleared either by a SetTimeZone command, or by a
             * SetDSTOffset command with an empty list.
             *
             * The node shall generate this event if the node has not generated a DSTTableEmpty event in the last hour,
             * and the DSTOffset list is empty when the node attempts to update its time. DSTTableEmpty events
             * corresponding to a time update SHOULD NOT be generated more often than once per hour.
             *
             * There is no data for this event.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.10.1
             */
            dstTableEmpty: Event(0x0, Priority.Info, TlvNoArguments),

            /**
             * This event shall be generated when the node starts or stops applying a DST offset.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.10.2
             */
            dstStatus: Event(0x1, Priority.Info, TlvDstStatusEvent),

            /**
             * This event shall be generated when the node changes its time zone offset or name. It shall NOT be sent
             * for DST changes that are not accompanied by a time zone change.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.10.3
             */
            timeZoneStatus: Event(0x2, Priority.Info, TlvTimeZoneStatusEvent)
        }
    });

    /**
     * A TimeSynchronizationCluster supports these elements if it supports feature NtpServer.
     */
    export const NtpServerComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates if the node is running an RFC 5905 NTPv4 compliant server on port 123, this value shall be
             * True.
             *
             * If the node is not currently running an NTP server, this value shall be False.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.10
             */
            ntpServerAvailable: Attribute(0x9, TlvBoolean, { default: false })
        }
    });

    /**
     * These elements and properties are present in all TimeSynchronization clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x38,
        name: "TimeSynchronization",
        revision: 2,

        features: {
            /**
             * Allows a server to translate a UTC time to a local time using the time zone and daylight savings time
             * (DST) offsets. If a server supports the TimeZone feature, it shall support the SetTimeZone and
             * SetDSTOffset commands, and TimeZone and DSTOffset attributes, and shall expose the local time through the
             * LocalTime attribute.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.5.1
             */
            timeZone: BitFlag(0),

            /**
             * Allows a node to use NTP/SNTP for time synchronization.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.5.2
             */
            ntpClient: BitFlag(1),

            /**
             * Allows a Node to host an NTP server for the network so that other Nodes can achieve a high accuracy time
             * synchronization within the network. See Section 11.17.15, “Acting as an NTP Server”.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.5.3
             */
            ntpServer: BitFlag(2),

            /**
             * This node also supports a time synchronization client and can connect to and read time from other nodes.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.5.4
             */
            timeSyncClient: BitFlag(3)
        },

        attributes: {
            /**
             * If the node has achieved time synchronization, this attribute shall indicate the current time as a UTC
             * epoch-us (Epoch Time in Microseconds).
             *
             * If the node has not achieved time synchronization, this attribute shall be null. This attribute may be
             * set when a SetUTCTime is received.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.1
             */
            utcTime: Attribute(0x0, TlvNullable(TlvEpochUs), { omitChanges: true, default: null }),

            /**
             * Indicates granularity of the error that the node is willing to guarantee on the time synchronization. It
             * is of type GranularityEnum.
             *
             * This value shall be set to NoTimeGranularity if UTCTime is null and shall NOT be set to NoTimeGranularity
             * if UTCTime is non-null.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.2
             */
            granularity: Attribute(0x1, TlvEnum<Granularity>(), { default: Granularity.NoTimeGranularity }),

            /**
             * Indicates the node’s time source. This attribute indicates what method the node is using to sync, whether
             * the source uses NTS or not and whether the source is internal or external to the Matter network. This
             * attribute may be used by a client to determine its level of trust in the UTCTime. It is of type
             * TimeSourceEnum.
             *
             * If a node is unsure if the selected NTP server is within the Matter network, it SHOULD select one of the
             * NonMatter* values.
             *
             * This value shall be set to None if UTCTime is null and shall NOT be set to None if UTCTime is non-null.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.8.3
             */
            timeSource: OptionalAttribute(0x2, TlvEnum<TimeSource>(), { default: TimeSource.None })
        },

        commands: {
            /**
             * This command is used to set the UTC time of the node.
             *
             * This command may be issued by Administrator to set the time. If the Commissioner does not have a valid
             * time source, it may send a Granularity of NoTimeGranularity.
             *
             * Upon receipt of this command, the node may update its UTCTime attribute to match the time specified in
             * the command, if the stated Granularity and TimeSource are acceptable. The node shall update its UTCTime
             * attribute if its current Granularity is NoTimeGranularity.
             *
             * If the time is updated, the node shall also update its Granularity attribute based on the granularity
             * specified in the command and the expected clock drift of the node. This SHOULD normally be one level
             * lower than the stated command Granularity. It shall also update its TimeSource attribute to Admin. It
             * shall also update its Last Known Good UTC Time as defined in Section 3.5.6.1, “Last Known Good UTC Time”.
             *
             * If the node updates its UTCTime attribute, it shall accept the command with a status code of SUCCESS. If
             * it opts to not update its time, it shall fail the command with a cluster specific Status Code of
             * TimeNotAccepted.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.9.1
             */
            setUtcTime: Command(0x0, TlvSetUtcTimeRequest, 0x0, TlvNoResponse, { invokeAcl: AccessLevel.Administer })
        },

        events: {
            /**
             * This event shall be generated if the node has not generated a TimeFailure event in the last hour, and the
             * node is unable to get a time from any source. This event SHOULD NOT be generated more often than once per
             * hour.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.17.10.4
             */
            timeFailure: Event(0x3, Priority.Info, TlvNoArguments)
        },

        /**
         * This metadata controls which TimeSynchronizationCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { timeSyncClient: true }, component: TimeSyncClientComponent },
            { flags: { ntpClient: true }, component: NtpClientComponent },
            { flags: { timeZone: true }, component: TimeZoneComponent },
            { flags: { ntpServer: true }, component: NtpServerComponent }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * Accurate time is required for a number of reasons, including scheduling, display and validating security
     * materials.
     *
     * This section describes a mechanism for Nodes to achieve and maintain time synchronization. The Time
     * Synchronization cluster provides attributes for reading a Node’s current time. It also allows Administrators to
     * set current time, time zone and daylight savings time (DST) settings.
     *
     * The Time Synchronization cluster may be present on the root node endpoint, and shall NOT be present on any other
     * Endpoint of any Node.
     *
     * TimeSynchronizationCluster supports optional features that you can enable with the
     * TimeSynchronizationCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.17
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const TSC = { timeSyncClient: true };
    const NTPC = { ntpClient: true };
    const TZ = { timeZone: true };
    const NTPS = { ntpServer: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            trustedTimeSource: MutableCluster.AsConditional(
                TimeSyncClientComponent.attributes.trustedTimeSource,
                { mandatoryIf: [TSC] }
            ),
            defaultNtp: MutableCluster.AsConditional(NtpClientComponent.attributes.defaultNtp, { mandatoryIf: [NTPC] }),
            timeZone: MutableCluster.AsConditional(TimeZoneComponent.attributes.timeZone, { mandatoryIf: [TZ] }),
            dstOffset: MutableCluster.AsConditional(TimeZoneComponent.attributes.dstOffset, { mandatoryIf: [TZ] }),
            localTime: MutableCluster.AsConditional(TimeZoneComponent.attributes.localTime, { mandatoryIf: [TZ] }),
            timeZoneDatabase: MutableCluster.AsConditional(
                TimeZoneComponent.attributes.timeZoneDatabase,
                { mandatoryIf: [TZ] }
            ),
            ntpServerAvailable: MutableCluster.AsConditional(
                NtpServerComponent.attributes.ntpServerAvailable,
                { mandatoryIf: [NTPS] }
            ),
            timeZoneListMaxSize: MutableCluster.AsConditional(
                TimeZoneComponent.attributes.timeZoneListMaxSize,
                { mandatoryIf: [TZ] }
            ),
            dstOffsetListMaxSize: MutableCluster.AsConditional(
                TimeZoneComponent.attributes.dstOffsetListMaxSize,
                { mandatoryIf: [TZ] }
            ),
            supportsDnsResolve: MutableCluster.AsConditional(
                NtpClientComponent.attributes.supportsDnsResolve,
                { mandatoryIf: [NTPC] }
            )
        },

        commands: {
            ...Cluster.commands,
            setTrustedTimeSource: MutableCluster.AsConditional(
                TimeSyncClientComponent.commands.setTrustedTimeSource,
                { mandatoryIf: [TSC] }
            ),
            setTimeZone: MutableCluster.AsConditional(TimeZoneComponent.commands.setTimeZone, { mandatoryIf: [TZ] }),
            setDstOffset: MutableCluster.AsConditional(TimeZoneComponent.commands.setDstOffset, { mandatoryIf: [TZ] }),
            setDefaultNtp: MutableCluster.AsConditional(
                NtpClientComponent.commands.setDefaultNtp,
                { mandatoryIf: [NTPC] }
            )
        },

        events: {
            ...Cluster.events,
            dstTableEmpty: MutableCluster.AsConditional(TimeZoneComponent.events.dstTableEmpty, { mandatoryIf: [TZ] }),
            dstStatus: MutableCluster.AsConditional(TimeZoneComponent.events.dstStatus, { mandatoryIf: [TZ] }),
            timeZoneStatus: MutableCluster.AsConditional(
                TimeZoneComponent.events.timeZoneStatus,
                { mandatoryIf: [TZ] }
            ),
            missingTrustedTimeSource: MutableCluster.AsConditional(
                TimeSyncClientComponent.events.missingTrustedTimeSource,
                { mandatoryIf: [TSC] }
            )
        }
    });

    /**
     * This cluster supports all TimeSynchronization features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type TimeSynchronizationCluster = TimeSynchronization.Cluster;
export const TimeSynchronizationCluster = TimeSynchronization.Cluster;
ClusterRegistry.register(TimeSynchronization.Complete);
