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
import type { FabricIndex } from "../datatype/FabricIndex.js";
import type { NodeId } from "../datatype/NodeId.js";
import type { EndpointNumber } from "../datatype/EndpointNumber.js";
import type { StatusResponseError } from "../common/StatusResponseError.js";
import type { Status } from "../globals/Status.js";

/**
 * Definitions for the TimeSynchronization cluster.
 *
 * Accurate time is required for a number of reasons, including scheduling, display and validating security materials.
 *
 * This section describes a mechanism for Nodes to achieve and maintain time synchronization. The Time Synchronization
 * cluster provides attributes for reading a Node's current time. It also allows Administrators to set current time,
 * time zone and daylight savings time (DST) settings.
 *
 * The Time Synchronization cluster may be present on the root node endpoint, and shall NOT be present on any other
 * Endpoint of any Node.
 *
 * @see {@link MatterSpecification.v151.Core} § 11.17
 */
export declare namespace TimeSynchronization {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0038;

    /**
     * Textual cluster identifier.
     */
    export const name: "TimeSynchronization";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 2;

    /**
     * Canonical metadata for the TimeSynchronization cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link TimeSynchronization} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * If the node has achieved time synchronization, this attribute shall indicate the current time as a UTC
         * epoch-us (Epoch Time in Microseconds).
         *
         * If the node has not achieved time synchronization, this attribute shall be null. This attribute may be set
         * when a SetUTCTime is received.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.1
         */
        utcTime: number | bigint | null;

        /**
         * Indicates granularity of the error that the node is willing to guarantee on the time synchronization. It is
         * of type GranularityEnum.
         *
         * This value shall be set to NoTimeGranularity if UTCTime is null and shall NOT be set to NoTimeGranularity if
         * UTCTime is non-null.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.2
         */
        granularity: Granularity;

        /**
         * Indicates the node's time source. This attribute indicates what method the node is using to sync, whether the
         * source uses NTS or not and whether the source is internal or external to the Matter network. This attribute
         * may be used by a client to determine its level of trust in the UTCTime. It is of type TimeSourceEnum.
         *
         * If a node is unsure if the selected NTP server is within the Matter network, it SHOULD select one of the
         * NonMatter* values.
         *
         * This value shall be set to None if UTCTime is null and shall NOT be set to None if UTCTime is non-null.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.3
         */
        timeSource?: TimeSource;
    }

    /**
     * {@link TimeSynchronization} supports these elements if it supports feature "TimeSyncClient".
     */
    export interface TimeSyncClientAttributes {
        /**
         * Indicates the Node ID, endpoint, and associated fabric index of a Node that may be used as trusted time
         * source. See Section 11.17.13, "Time source prioritization". This attribute reflects the last value set by an
         * administrator using the SetTrustedTimeSource command. If the value is null, no trusted time source has yet
         * been set.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.4
         */
        trustedTimeSource: TrustedTimeSource | null;
    }

    /**
     * {@link TimeSynchronization} supports these elements if it supports feature "NtpClient".
     */
    export interface NtpClientAttributes {
        /**
         * Indicates the default NTP server that this Node may use if other time sources are unavailable. This attribute
         * is settable by an Administrator using the SetDefaultNTP command. It SHOULD be set by the Commissioner during
         * commissioning. If no default NTP server is available, the Commissioner may set this value to null. The
         * default IANA assigned NTP port of 123 shall be used to access the NTP server.
         *
         * If set, the format of this attribute shall be a domain name or a static IPv6 address with no port, in text
         * format, as specified in RFC 5952. The address format shall follow the recommendations in Section 4 and shall
         * NOT contain a port number.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.5
         */
        defaultNtp: string | null;

        /**
         * Indicates if the node supports resolving a domain name. DefaultNTP Address values for these nodes may include
         * domain names. If this is False, the Address for a DefaultNTP shall be an IPv6 address.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.13
         */
        supportsDnsResolve: boolean;
    }

    /**
     * {@link TimeSynchronization} supports these elements if it supports feature "TimeZone".
     */
    export interface TimeZoneAttributes {
        /**
         * This attribute shall contain a list of time zone offsets from UTC and when they shall take effect. This
         * attribute uses a list of time offset configurations to allow Nodes to handle scheduled regulatory time zone
         * changes. This attribute shall NOT be used to indicate daylight savings time changes (see Section 11.17.8.7,
         * "DSTOffset Attribute" for daylight savings time).
         *
         * The first entry shall have a ValidAt entry of 0. If there is a second entry, it shall have a non-zero ValidAt
         * time.
         *
         * If a node supports a TimeZoneDatabase, and it has data for the given time zone Name and the given Offset
         * matches, the node may update its own DSTOffset attribute to add new DST change times as required, based on
         * the Name fields of the TimeZoneStruct. Administrators may add additional entries to the DSTOffset of other
         * Nodes with the same time zone, if required.
         *
         * If a node does not support a TimeZoneDatabase, the Name field of the TimeZoneStruct is only applicable for
         * client-side localization. In particular:
         *
         *   - If the node does not support a TimeZoneDatabase, the Name field shall NOT be used to calculate the local
         *     time.
         *
         *   - If the node does not support a TimeZoneDatabase, the Name field shall NOT be used to calculate DST start
         *     or end dates.
         *
         * When time passes, the node SHOULD remove any entries which are no longer active and change the ValidAt time
         * for the currently used TimeZoneStruct list item to zero.
         *
         * This attribute shall have at least one entry. If the node does not have a default time zone and no time zone
         * has been set, it may set this value to a list containing a single TimeZoneStruct with an offset of 0 (UTC)
         * and a ValidAt time of 0.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.6
         */
        timeZone: TimeZone[];

        /**
         * This attribute shall contain a list of offsets to apply for daylight savings time, and their validity period.
         *
         * List entries shall be sorted by ValidStarting time.
         *
         * A list entry shall NOT have a ValidStarting time that is smaller than the ValidUntil time of the previous
         * entry. There shall be at most one list entry with a null ValidUntil time and, if such an entry is present, it
         * shall appear last in the list.
         *
         * Over time, the node SHOULD remove any entries which are no longer active from the list.
         *
         * Over time, if the node supports a TimeZoneDatabase and it has information available for the given time zone
         * name, it may update its own list to add additional entries.
         *
         * If a time zone does not use DST, this shall be indicated by a single entry with a 0 offset and a null
         * ValidUntil field.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.7
         */
        dstOffset: DstOffset[];

        /**
         * Indicates the computed current local time of the node as a epoch-us (Epoch Time in Microseconds). The value
         * of LocalTime shall be the sum of the UTCTime, the offset of the currently valid TimeZoneStruct from the
         * TimeZone attribute (converted to microseconds), and the offset of the currently valid DSTOffsetStruct from
         * the DSTOffset attribute (converted to microseconds), if such an entry exists.
         *
         * If the node has not achieved time synchronization, this shall be null. If the node has an empty DSTOffset,
         * this shall be null.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.8
         */
        localTime: number | bigint | null;

        /**
         * Indicates whether the node has access to a time zone database. Nodes with a time zone database may update
         * their own DSTOffset attribute to add new entries and may push DSTOffset updates to other Nodes in the same
         * time zone as required.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.9
         */
        timeZoneDatabase: TimeZoneDatabase;

        /**
         * Indicates the number of supported list entries in the TimeZone attribute. This attribute may take the value
         * of 1 or 2, where the optional second list entry may be used to handle scheduled regulatory time zone changes.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.11
         */
        timeZoneListMaxSize: number;

        /**
         * Indicates the number of supported list entries in DSTOffset attribute. This value must be at least 1.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.12
         */
        dstOffsetListMaxSize: number;
    }

    /**
     * {@link TimeSynchronization} supports these elements if it supports feature "NtpServer".
     */
    export interface NtpServerAttributes {
        /**
         * Indicates if the node is running an RFC 5905 NTPv4 compliant server on port 123, this value shall be True.
         *
         * If the node is not currently running an NTP server, this value shall be False.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.10
         */
        ntpServerAvailable: boolean;
    }

    /**
     * Attributes that may appear in {@link TimeSynchronization}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * If the node has achieved time synchronization, this attribute shall indicate the current time as a UTC
         * epoch-us (Epoch Time in Microseconds).
         *
         * If the node has not achieved time synchronization, this attribute shall be null. This attribute may be set
         * when a SetUTCTime is received.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.1
         */
        utcTime: number | bigint | null;

        /**
         * Indicates granularity of the error that the node is willing to guarantee on the time synchronization. It is
         * of type GranularityEnum.
         *
         * This value shall be set to NoTimeGranularity if UTCTime is null and shall NOT be set to NoTimeGranularity if
         * UTCTime is non-null.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.2
         */
        granularity: Granularity;

        /**
         * Indicates the node's time source. This attribute indicates what method the node is using to sync, whether the
         * source uses NTS or not and whether the source is internal or external to the Matter network. This attribute
         * may be used by a client to determine its level of trust in the UTCTime. It is of type TimeSourceEnum.
         *
         * If a node is unsure if the selected NTP server is within the Matter network, it SHOULD select one of the
         * NonMatter* values.
         *
         * This value shall be set to None if UTCTime is null and shall NOT be set to None if UTCTime is non-null.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.3
         */
        timeSource: TimeSource;

        /**
         * Indicates the Node ID, endpoint, and associated fabric index of a Node that may be used as trusted time
         * source. See Section 11.17.13, "Time source prioritization". This attribute reflects the last value set by an
         * administrator using the SetTrustedTimeSource command. If the value is null, no trusted time source has yet
         * been set.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.4
         */
        trustedTimeSource: TrustedTimeSource | null;

        /**
         * Indicates the default NTP server that this Node may use if other time sources are unavailable. This attribute
         * is settable by an Administrator using the SetDefaultNTP command. It SHOULD be set by the Commissioner during
         * commissioning. If no default NTP server is available, the Commissioner may set this value to null. The
         * default IANA assigned NTP port of 123 shall be used to access the NTP server.
         *
         * If set, the format of this attribute shall be a domain name or a static IPv6 address with no port, in text
         * format, as specified in RFC 5952. The address format shall follow the recommendations in Section 4 and shall
         * NOT contain a port number.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.5
         */
        defaultNtp: string | null;

        /**
         * Indicates if the node supports resolving a domain name. DefaultNTP Address values for these nodes may include
         * domain names. If this is False, the Address for a DefaultNTP shall be an IPv6 address.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.13
         */
        supportsDnsResolve: boolean;

        /**
         * This attribute shall contain a list of time zone offsets from UTC and when they shall take effect. This
         * attribute uses a list of time offset configurations to allow Nodes to handle scheduled regulatory time zone
         * changes. This attribute shall NOT be used to indicate daylight savings time changes (see Section 11.17.8.7,
         * "DSTOffset Attribute" for daylight savings time).
         *
         * The first entry shall have a ValidAt entry of 0. If there is a second entry, it shall have a non-zero ValidAt
         * time.
         *
         * If a node supports a TimeZoneDatabase, and it has data for the given time zone Name and the given Offset
         * matches, the node may update its own DSTOffset attribute to add new DST change times as required, based on
         * the Name fields of the TimeZoneStruct. Administrators may add additional entries to the DSTOffset of other
         * Nodes with the same time zone, if required.
         *
         * If a node does not support a TimeZoneDatabase, the Name field of the TimeZoneStruct is only applicable for
         * client-side localization. In particular:
         *
         *   - If the node does not support a TimeZoneDatabase, the Name field shall NOT be used to calculate the local
         *     time.
         *
         *   - If the node does not support a TimeZoneDatabase, the Name field shall NOT be used to calculate DST start
         *     or end dates.
         *
         * When time passes, the node SHOULD remove any entries which are no longer active and change the ValidAt time
         * for the currently used TimeZoneStruct list item to zero.
         *
         * This attribute shall have at least one entry. If the node does not have a default time zone and no time zone
         * has been set, it may set this value to a list containing a single TimeZoneStruct with an offset of 0 (UTC)
         * and a ValidAt time of 0.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.6
         */
        timeZone: TimeZone[];

        /**
         * This attribute shall contain a list of offsets to apply for daylight savings time, and their validity period.
         *
         * List entries shall be sorted by ValidStarting time.
         *
         * A list entry shall NOT have a ValidStarting time that is smaller than the ValidUntil time of the previous
         * entry. There shall be at most one list entry with a null ValidUntil time and, if such an entry is present, it
         * shall appear last in the list.
         *
         * Over time, the node SHOULD remove any entries which are no longer active from the list.
         *
         * Over time, if the node supports a TimeZoneDatabase and it has information available for the given time zone
         * name, it may update its own list to add additional entries.
         *
         * If a time zone does not use DST, this shall be indicated by a single entry with a 0 offset and a null
         * ValidUntil field.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.7
         */
        dstOffset: DstOffset[];

        /**
         * Indicates the computed current local time of the node as a epoch-us (Epoch Time in Microseconds). The value
         * of LocalTime shall be the sum of the UTCTime, the offset of the currently valid TimeZoneStruct from the
         * TimeZone attribute (converted to microseconds), and the offset of the currently valid DSTOffsetStruct from
         * the DSTOffset attribute (converted to microseconds), if such an entry exists.
         *
         * If the node has not achieved time synchronization, this shall be null. If the node has an empty DSTOffset,
         * this shall be null.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.8
         */
        localTime: number | bigint | null;

        /**
         * Indicates whether the node has access to a time zone database. Nodes with a time zone database may update
         * their own DSTOffset attribute to add new entries and may push DSTOffset updates to other Nodes in the same
         * time zone as required.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.9
         */
        timeZoneDatabase: TimeZoneDatabase;

        /**
         * Indicates the number of supported list entries in the TimeZone attribute. This attribute may take the value
         * of 1 or 2, where the optional second list entry may be used to handle scheduled regulatory time zone changes.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.11
         */
        timeZoneListMaxSize: number;

        /**
         * Indicates the number of supported list entries in DSTOffset attribute. This value must be at least 1.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.12
         */
        dstOffsetListMaxSize: number;

        /**
         * Indicates if the node is running an RFC 5905 NTPv4 compliant server on port 123, this value shall be True.
         *
         * If the node is not currently running an NTP server, this value shall be False.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.8.10
         */
        ntpServerAvailable: boolean;
    }

    /**
     * {@link TimeSynchronization} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to set the UTC time of the node.
         *
         * This command may be issued by Administrator to set the time. If the Commissioner does not have a valid time
         * source, it may send a Granularity of NoTimeGranularity.
         *
         * Upon receipt of this command, the node may update its UTCTime attribute to match the time specified in the
         * command, if the stated Granularity and TimeSource are acceptable. The node shall update its UTCTime attribute
         * if its current Granularity is NoTimeGranularity.
         *
         * If the time is updated, the node shall also update its Granularity attribute based on the granularity
         * specified in the command and the expected clock drift of the node. This SHOULD normally be one level lower
         * than the stated command Granularity. It shall also update its TimeSource attribute to Admin. It shall also
         * update its Last Known Good UTC Time as defined in Section 3.5.6.1, "Last Known Good UTC Time".
         *
         * If the node updates its UTCTime attribute, it shall accept the command with a status code of SUCCESS. If it
         * opts to not update its time, it shall fail the command with a cluster specific Status Code of
         * TimeNotAccepted.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.9.1
         */
        setUtcTime(request: SetUtcTimeRequest): MaybePromise;
    }

    /**
     * {@link TimeSynchronization} supports these elements if it supports feature "TimeSyncClient".
     */
    export interface TimeSyncClientCommands {
        /**
         * This command is used to set the TrustedTimeSource attribute.
         *
         * Upon receipt of this command:
         *
         *   - If the TrustedTimeSource field in the command is null, the node shall set the TrustedTimeSource attribute
         *     to null and shall generate a MissingTrustedTimeSource event.
         *
         *   - Otherwise, the node shall set the TrustedTimeSource attribute to a struct which has NodeID and Endpoint
         *     fields matching those in the TrustedTimeSource field and has its FabricIndex field set to the command's
         *     accessing fabric index.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.9.2
         */
        setTrustedTimeSource(request: SetTrustedTimeSourceRequest): MaybePromise;
    }

    /**
     * {@link TimeSynchronization} supports these elements if it supports feature "NtpClient".
     */
    export interface NtpClientCommands {
        /**
         * This command is used to set the DefaultNTP attribute.
         *
         * If the DefaultNTP Address field does not conform to the requirements in the DefaultNTP attribute description,
         * the command shall fail with a status code of INVALID_COMMAND. If the node does not support DNS resolution (as
         * specified in SupportsDNSResolve) and the provided Address is a domain name, the command shall fail with a
         * status code of INVALID_COMMAND. Otherwise, the node shall set the DefaultNTP attribute to match the
         * DefaultNTP provided in this command.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.9.6
         */
        setDefaultNtp(request: SetDefaultNtpRequest): MaybePromise;
    }

    /**
     * {@link TimeSynchronization} supports these elements if it supports feature "TimeZone".
     */
    export interface TimeZoneCommands {
        /**
         * This command is used to set the time zone of the node.
         *
         * If the given list is larger than the TimeZoneListMaxSize, the node shall respond with RESOURCE_EXHAUSTED and
         * the TimeZone attribute shall NOT be updated.
         *
         * If the given list does not conform to the list requirements in TimeZone attribute the node shall respond with
         * a CONSTRAINT_ERROR and the TimeZone attribute shall NOT be updated.
         *
         * If there are no errors in the list, the TimeZone field shall be copied to the TimeZone attribute. A
         * TimeZoneStatus event shall be generated with the new time zone information.
         *
         * If the node supports a time zone database and it has information available for the time zone that will be
         * applied, it may set its DSTOffset attribute, otherwise the DSTOffset attribute shall be set to an empty list.
         * A DSTTableEmpty event shall be generated if the DSTOffset attribute is empty. A DSTStatus event shall be
         * generated if the node was previously applying a DST offset.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.9.3
         */
        setTimeZone(request: SetTimeZoneRequest): MaybePromise<SetTimeZoneResponse>;

        /**
         * This command is used to set the DST offsets for a node.
         *
         *   - If the length of DSTOffset is larger than DSTOffsetListMaxSize, the node shall respond with
         *     RESOURCE_EXHAUSTED.
         *
         *   - Else if the list entries do not conform to the list requirements for DSTOffset attribute, the node shall
         *     respond with CONSTRAINT_ERROR.
         *
         * If there are no errors in the list, the DSTOffset field shall be copied to the DSTOffset attribute.
         *
         * If the DSTOffset attribute change causes a corresponding change to the DST state, a DSTStatus event shall be
         * generated. If the list is empty, the node shall generate a DSTTableEmpty event.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.9.5
         */
        setDstOffset(request: SetDstOffsetRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link TimeSynchronization}.
     */
    export interface Commands extends
        BaseCommands,
        TimeSyncClientCommands,
        NtpClientCommands,
        TimeZoneCommands
    {}

    /**
     * {@link TimeSynchronization} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated if the node has not generated a TimeFailure event in the last hour, and the
         * node is unable to get a time from any source. This event SHOULD NOT be generated more often than once per
         * hour.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.4
         */
        timeFailure: void;
    }

    /**
     * {@link TimeSynchronization} supports these elements if it supports feature "TimeSyncClient".
     */
    export interface TimeSyncClientEvents {
        /**
         * This event shall be generated if the TrustedTimeSource is set to null upon fabric removal or by a
         * SetTrustedTimeSource command.
         *
         * This event shall also be generated if the node has not generated a MissingTrustedTimeSource event in the last
         * hour, and the node fails to update its time from the TrustedTimeSource because the TrustedTimeSource is null
         * or the specified peer cannot be reached. MissingTrustedTimeSource events corresponding to a time update
         * SHOULD NOT be generated more often than once per hour.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.5
         */
        missingTrustedTimeSource: void;
    }

    /**
     * {@link TimeSynchronization} supports these elements if it supports feature "TimeZone".
     */
    export interface TimeZoneEvents {
        /**
         * This event shall be generated when the node stops applying the current DSTOffset and there are no entries in
         * the list with a larger ValidStarting time, indicating the need to possibly get new DST data. This event shall
         * also be generated if the DSTOffset list is cleared either by a SetTimeZone command, or by a SetDSTOffset
         * command with an empty list.
         *
         * The node shall generate this event if the node has not generated a DSTTableEmpty event in the last hour, and
         * the DSTOffset list is empty when the node attempts to update its time. DSTTableEmpty events corresponding to
         * a time update SHOULD NOT be generated more often than once per hour.
         *
         * There is no data for this event.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.1
         */
        dstTableEmpty: void;

        /**
         * This event shall be generated when the node starts or stops applying a DST offset.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.2
         */
        dstStatus: DstStatusEvent;

        /**
         * This event shall be generated when the node changes its time zone offset or name. It shall NOT be sent for
         * DST changes that are not accompanied by a time zone change.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.3
         */
        timeZoneStatus: TimeZoneStatusEvent;
    }

    /**
     * Events that may appear in {@link TimeSynchronization}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated if the node has not generated a TimeFailure event in the last hour, and the
         * node is unable to get a time from any source. This event SHOULD NOT be generated more often than once per
         * hour.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.4
         */
        timeFailure: void;

        /**
         * This event shall be generated if the TrustedTimeSource is set to null upon fabric removal or by a
         * SetTrustedTimeSource command.
         *
         * This event shall also be generated if the node has not generated a MissingTrustedTimeSource event in the last
         * hour, and the node fails to update its time from the TrustedTimeSource because the TrustedTimeSource is null
         * or the specified peer cannot be reached. MissingTrustedTimeSource events corresponding to a time update
         * SHOULD NOT be generated more often than once per hour.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.5
         */
        missingTrustedTimeSource: void;

        /**
         * This event shall be generated when the node stops applying the current DSTOffset and there are no entries in
         * the list with a larger ValidStarting time, indicating the need to possibly get new DST data. This event shall
         * also be generated if the DSTOffset list is cleared either by a SetTimeZone command, or by a SetDSTOffset
         * command with an empty list.
         *
         * The node shall generate this event if the node has not generated a DSTTableEmpty event in the last hour, and
         * the DSTOffset list is empty when the node attempts to update its time. DSTTableEmpty events corresponding to
         * a time update SHOULD NOT be generated more often than once per hour.
         *
         * There is no data for this event.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.1
         */
        dstTableEmpty: void;

        /**
         * This event shall be generated when the node starts or stops applying a DST offset.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.2
         */
        dstStatus: DstStatusEvent;

        /**
         * This event shall be generated when the node changes its time zone offset or name. It shall NOT be sent for
         * DST changes that are not accompanied by a time zone change.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.3
         */
        timeZoneStatus: TimeZoneStatusEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents },

        {
            flags: { timeSyncClient: true },
            attributes: TimeSyncClientAttributes,
            commands: TimeSyncClientCommands,
            events: TimeSyncClientEvents
        },

        { flags: { ntpClient: true }, attributes: NtpClientAttributes, commands: NtpClientCommands },

        {
            flags: { timeZone: true },
            attributes: TimeZoneAttributes,
            commands: TimeZoneCommands,
            events: TimeZoneEvents
        },

        { flags: { ntpServer: true }, attributes: NtpServerAttributes }
    ];

    export type Features = "TimeZone" | "NtpClient" | "NtpServer" | "TimeSyncClient";

    /**
     * These are optional features supported by TimeSynchronizationCluster.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.17.5
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
         * @see {@link MatterSpecification.v151.Core} § 11.17.5.1
         */
        TimeZone = "TimeZone",

        /**
         * NtpClient (NTPC)
         *
         * Allows a node to use NTP/SNTP for time synchronization.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.5.2
         */
        NtpClient = "NtpClient",

        /**
         * NtpServer (NTPS)
         *
         * Allows a Node to host an NTP server for the network so that other Nodes can achieve a high accuracy time
         * synchronization within the network. See Section 11.17.15, "Acting as an NTP Server".
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.5.3
         */
        NtpServer = "NtpServer",

        /**
         * TimeSyncClient (TSC)
         *
         * This node also supports a time synchronization client and can connect to and read time from other nodes.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.5.4
         */
        TimeSyncClient = "TimeSyncClient"
    }

    /**
     * @see {@link MatterSpecification.v151.Core} § 11.17.6.1
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
     * @see {@link MatterSpecification.v151.Core} § 11.17.6.2
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
     * @see {@link MatterSpecification.v151.Core} § 11.17.6.4
     */
    export declare class TrustedTimeSource {
        constructor(values?: Partial<TrustedTimeSource>);

        /**
         * The Fabric Index associated with the Fabric of the client which last set the value of the trusted time source
         * node.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.6.4.1
         */
        fabricIndex: FabricIndex;

        /**
         * Node ID of the trusted time source node on the Fabric associated with the entry.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.6.4.2
         */
        nodeId: NodeId;

        /**
         * Endpoint on the trusted time source node that contains the Time Synchronization cluster server.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.6.4.3
         */
        endpoint: EndpointNumber;
    };

    /**
     * @see {@link MatterSpecification.v151.Core} § 11.17.6.6
     */
    export declare class TimeZone {
        constructor(values?: Partial<TimeZone>);

        /**
         * The time zone offset from UTC in seconds.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.6.6.1
         */
        offset: number;

        /**
         * The UTC time when the offset shall be applied.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.6.6.2
         */
        validAt: number | bigint;

        /**
         * The time zone name SHOULD provide a human-readable time zone name and it SHOULD use the country/city format
         * specified by the IANA Time Zone Database. The Name field may be used for display. If the node supports a
         * TimeZoneDatabase it may use the Name field to set its own DST offsets if it has database information for the
         * supplied time zone Name and the given Offset matches.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.6.6.3
         */
        name?: string;
    };

    /**
     * @see {@link MatterSpecification.v151.Core} § 11.17.6.7
     */
    export declare class DstOffset {
        constructor(values?: Partial<DstOffset>);

        /**
         * The DST offset in seconds. Normally this is in the range of 0 to 3600 seconds (1 hour), but this field will
         * accept any values in the int32 range to accommodate potential future legislation that does not fit with these
         * assumptions.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.6.7.1
         */
        offset: number;

        /**
         * The UTC time when the offset shall be applied.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.6.7.2
         */
        validStarting: number | bigint;

        /**
         * The UTC time when the offset shall stop being applied. Providing a null value here indicates a permanent DST
         * change. If this value is non-null the value shall be larger than the ValidStarting time.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.6.7.3
         */
        validUntil: number | bigint | null;
    };

    /**
     * It indicates what the device knows about the contents of the IANA Time Zone Database. Partial support on a device
     * may be used to omit historical data, less commonly used time zones, and/or time zones not related to the region a
     * product is sold in.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.17.6.3
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
     * This command is used to set the UTC time of the node.
     *
     * This command may be issued by Administrator to set the time. If the Commissioner does not have a valid time
     * source, it may send a Granularity of NoTimeGranularity.
     *
     * Upon receipt of this command, the node may update its UTCTime attribute to match the time specified in the
     * command, if the stated Granularity and TimeSource are acceptable. The node shall update its UTCTime attribute if
     * its current Granularity is NoTimeGranularity.
     *
     * If the time is updated, the node shall also update its Granularity attribute based on the granularity specified
     * in the command and the expected clock drift of the node. This SHOULD normally be one level lower than the stated
     * command Granularity. It shall also update its TimeSource attribute to Admin. It shall also update its Last Known
     * Good UTC Time as defined in Section 3.5.6.1, "Last Known Good UTC Time".
     *
     * If the node updates its UTCTime attribute, it shall accept the command with a status code of SUCCESS. If it opts
     * to not update its time, it shall fail the command with a cluster specific Status Code of TimeNotAccepted.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.17.9.1
     */
    export declare class SetUtcTimeRequest {
        constructor(values?: Partial<SetUtcTimeRequest>);

        /**
         * This field shall give the Client's UTC Time.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.9.1.1
         */
        utcTime: number | bigint;

        /**
         * This field shall give the Client's Granularity, as described in Granularity.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.9.1.2
         */
        granularity: Granularity;

        /**
         * This field shall give the Client's TimeSource, as described in TimeSource.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.9.1.3
         */
        timeSource?: TimeSource;
    };

    /**
     * This command is used to set the TrustedTimeSource attribute.
     *
     * Upon receipt of this command:
     *
     *   - If the TrustedTimeSource field in the command is null, the node shall set the TrustedTimeSource attribute to
     *     null and shall generate a MissingTrustedTimeSource event.
     *
     *   - Otherwise, the node shall set the TrustedTimeSource attribute to a struct which has NodeID and Endpoint
     *     fields matching those in the TrustedTimeSource field and has its FabricIndex field set to the command's
     *     accessing fabric index.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.17.9.2
     */
    export declare class SetTrustedTimeSourceRequest {
        constructor(values?: Partial<SetTrustedTimeSourceRequest>);

        /**
         * This field contains the Node ID and endpoint of a trusted time source on the accessing fabric.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.9.2.1
         */
        trustedTimeSource: FabricScopedTrustedTimeSource | null;

        fabricIndex: FabricIndex;
    };

    /**
     * This command is used to set the DefaultNTP attribute.
     *
     * If the DefaultNTP Address field does not conform to the requirements in the DefaultNTP attribute description, the
     * command shall fail with a status code of INVALID_COMMAND. If the node does not support DNS resolution (as
     * specified in SupportsDNSResolve) and the provided Address is a domain name, the command shall fail with a status
     * code of INVALID_COMMAND. Otherwise, the node shall set the DefaultNTP attribute to match the DefaultNTP provided
     * in this command.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.17.9.6
     */
    export declare class SetDefaultNtpRequest {
        constructor(values?: Partial<SetDefaultNtpRequest>);

        /**
         * This field contains the address of an NTP server than can be used as a fallback for time synchronization. The
         * format of this field shall follow the requirements in the DefaultNTP attribute description.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.9.6.1
         */
        defaultNtp: string | null;
    };

    /**
     * This command is used to set the time zone of the node.
     *
     * If the given list is larger than the TimeZoneListMaxSize, the node shall respond with RESOURCE_EXHAUSTED and the
     * TimeZone attribute shall NOT be updated.
     *
     * If the given list does not conform to the list requirements in TimeZone attribute the node shall respond with a
     * CONSTRAINT_ERROR and the TimeZone attribute shall NOT be updated.
     *
     * If there are no errors in the list, the TimeZone field shall be copied to the TimeZone attribute. A
     * TimeZoneStatus event shall be generated with the new time zone information.
     *
     * If the node supports a time zone database and it has information available for the time zone that will be
     * applied, it may set its DSTOffset attribute, otherwise the DSTOffset attribute shall be set to an empty list. A
     * DSTTableEmpty event shall be generated if the DSTOffset attribute is empty. A DSTStatus event shall be generated
     * if the node was previously applying a DST offset.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.17.9.3
     */
    export declare class SetTimeZoneRequest {
        constructor(values?: Partial<SetTimeZoneRequest>);
        timeZone: TimeZone[];
    };

    /**
     * THis command is used to report the result of a SetTimeZone command. This command shall be generated in response
     * to a SetTimeZone command.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.17.9.4
     */
    export declare class SetTimeZoneResponse {
        constructor(values?: Partial<SetTimeZoneResponse>);

        /**
         * If the node supports a time zone database with information for the time zone that will be applied, it may use
         * this information to set the DSTOffset attribute. If the node is setting its own DSTOffset attribute, the
         * DSTOffsetRequired field shall be set to false, otherwise it shall be set to true.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.9.4.1
         */
        dstOffsetRequired: boolean;
    };

    /**
     * This command is used to set the DST offsets for a node.
     *
     *   - If the length of DSTOffset is larger than DSTOffsetListMaxSize, the node shall respond with
     *     RESOURCE_EXHAUSTED.
     *
     *   - Else if the list entries do not conform to the list requirements for DSTOffset attribute, the node shall
     *     respond with CONSTRAINT_ERROR.
     *
     * If there are no errors in the list, the DSTOffset field shall be copied to the DSTOffset attribute.
     *
     * If the DSTOffset attribute change causes a corresponding change to the DST state, a DSTStatus event shall be
     * generated. If the list is empty, the node shall generate a DSTTableEmpty event.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.17.9.5
     */
    export declare class SetDstOffsetRequest {
        constructor(values?: Partial<SetDstOffsetRequest>);
        dstOffset: DstOffset[];
    };

    /**
     * This event shall be generated when the node starts or stops applying a DST offset.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.17.10.2
     */
    export declare class DstStatusEvent {
        constructor(values?: Partial<DstStatusEvent>);

        /**
         * Indicates whether the current DST offset is being applied (i.e, daylight savings time is applied, as opposed
         * to standard time).
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.2.1
         */
        dstOffsetActive: boolean;
    };

    /**
     * This event shall be generated when the node changes its time zone offset or name. It shall NOT be sent for DST
     * changes that are not accompanied by a time zone change.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.17.10.3
     */
    export declare class TimeZoneStatusEvent {
        constructor(values?: Partial<TimeZoneStatusEvent>);

        /**
         * Current time zone offset from UTC in seconds.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.3.1
         */
        offset: number;

        /**
         * Current time zone name. This name SHOULD use the country/city format specified by the IANA Time Zone
         * Database.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.10.3.2
         */
        name?: string;
    };

    /**
     * @see {@link MatterSpecification.v151.Core} § 11.17.6.5
     */
    export declare class FabricScopedTrustedTimeSource {
        constructor(values?: Partial<FabricScopedTrustedTimeSource>);

        /**
         * Node ID of the trusted time source node on the Fabric of the issuer.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.6.5.1
         */
        nodeId: NodeId;

        /**
         * Endpoint on the trusted time source node that contains the Time Synchronization cluster server. This is
         * provided to avoid having to do discovery of the location of that endpoint by walking over all endpoints and
         * checking their Descriptor Cluster.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.17.6.5.2
         */
        endpoint: EndpointNumber;
    };

    /**
     * @see {@link MatterSpecification.v151.Core} § 11.17.7.1
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
     * @see {@link MatterSpecification.v151.Core} § 11.17.7.1
     */
    export class TimeNotAcceptedError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
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
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link TimeSynchronization}.
     */
    export const Cluster: ClusterType.WithCompat<typeof TimeSynchronization, TimeSynchronization>;

    /**
     * @deprecated Use {@link TimeSynchronization}.
     */
    export const Complete: typeof TimeSynchronization;

    export const Typing: TimeSynchronization;
}

/**
 * @deprecated Use {@link TimeSynchronization}.
 */
export declare const TimeSynchronizationCluster: typeof TimeSynchronization;

export interface TimeSynchronization extends ClusterTyping {
    Attributes: TimeSynchronization.Attributes;
    Commands: TimeSynchronization.Commands;
    Events: TimeSynchronization.Events;
    Features: TimeSynchronization.Features;
    Components: TimeSynchronization.Components;
}
