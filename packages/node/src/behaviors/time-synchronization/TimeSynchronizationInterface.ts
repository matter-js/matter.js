/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { TimeSynchronization } from "#clusters/time-synchronization";

export namespace TimeSynchronizationInterface {
    export interface Base {
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
         * update its Last Known Good UTC Time as defined in Section 3.5.6.1, “Last Known Good UTC Time”.
         *
         * If the node updates its UTCTime attribute, it shall accept the command with a status code of SUCCESS. If it
         * opts to not update its time, it shall fail the command with a cluster specific Status Code of
         * TimeNotAccepted.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.17.9.1
         */
        setUtcTime(request: TimeSynchronization.SetUtcTimeRequest): MaybePromise;
    }

    export interface TimeSyncClient {
        /**
         * This command is used to set the TrustedTimeSource attribute. Upon receipt of this command:
         *
         *   • If the TrustedTimeSource field in the command is null, the node shall set the TrustedTimeSource attribute
         *     to null and shall generate a MissingTrustedTimeSource event.
         *
         *   • Otherwise, the node shall set the TrustedTimeSource attribute to a struct which has NodeID and Endpoint
         *     fields matching those in the TrustedTimeSource field and has its FabricIndex field set to the command’s
         *     accessing fabric index.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.17.9.2
         */
        setTrustedTimeSource(request: TimeSynchronization.SetTrustedTimeSourceRequest): MaybePromise;
    }

    export interface NtpClient {
        /**
         * This command is used to set the DefaultNTP attribute.
         *
         * If the DefaultNTP Address field does not conform to the requirements in the DefaultNTP attribute description,
         * the command shall fail with a status code of INVALID_COMMAND. If the node does not support DNS resolution (as
         * specified in SupportsDNSResolve) and the provided Address is a domain name, the command shall fail with a
         * status code of INVALID_COMMAND. Otherwise, the node shall set the DefaultNTP attribute to match the
         * DefaultNTP provided in this command.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.17.9.6
         */
        setDefaultNtp(request: TimeSynchronization.SetDefaultNtpRequest): MaybePromise;
    }

    export interface TimeZone {
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
         * @see {@link MatterSpecification.v141.Core} § 11.17.9.3
         */
        setTimeZone(request: TimeSynchronization.SetTimeZoneRequest): MaybePromise<TimeSynchronization.SetTimeZoneResponse>;

        /**
         * This command is used to set the DST offsets for a node.
         *
         *   • If the length of DSTOffset is larger than DSTOffsetListMaxSize, the node shall respond with
         *     RESOURCE_EXHAUSTED.
         *
         *   • Else if the list entries do not conform to the list requirements for DSTOffset attribute, the node shall
         *     respond with CONSTRAINT_ERROR.
         *
         * If there are no errors in the list, the DSTOffset field shall be copied to the DSTOffset attribute.
         *
         * If the DSTOffset attribute change causes a corresponding change to the DST state, a DSTStatus event shall be
         * generated. If the list is empty, the node shall generate a DSTTableEmpty event.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.17.9.5
         */
        setDstOffset(request: TimeSynchronization.SetDstOffsetRequest): MaybePromise;
    }
}

export type TimeSynchronizationInterface = {
    components: [
        { flags: {}, methods: TimeSynchronizationInterface.Base },
        { flags: { timeSyncClient: true }, methods: TimeSynchronizationInterface.TimeSyncClient },
        { flags: { ntpClient: true }, methods: TimeSynchronizationInterface.NtpClient },
        { flags: { timeZone: true }, methods: TimeSynchronizationInterface.TimeZone }
    ]
};
