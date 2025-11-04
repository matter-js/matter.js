/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { GroupKeyManagement } from "#clusters/group-key-management";

export namespace GroupKeyManagementInterface {
    export interface Base {
        /**
         * This command is used by Administrators to set the state of a given Group Key Set, including atomically
         * updating the state of all epoch keys.
         *
         * ### Effect on Receipt
         *
         * The following validations shall be done against the content of the GroupKeySet field:
         *
         *   • If the EpochKey0 field is null or its associated EpochStartTime0 field is null, then this command shall
         *     fail with an INVALID_COMMAND status code responded to the client.
         *
         *   • If the EpochKey0 field’s length is not exactly 16 bytes, then this command shall fail with a
         *     CONSTRAINT_ERROR status code responded to the client.
         *
         *   • If the EpochStartTime0 is set to 0, then this command shall fail with an INVALID_COMMAND status code
         *     responded to the client. Note that internally, a GroupKeySetStruct’s EpochStartTime0 may be set to zero,
         *     due to the behavior of the AddNOC command which synthesizes a GroupKeySetStruct (see Section 11.18.6.8.1,
         *     “IPKValue Field”). However, the value 0 is illegal in the GroupKeySet field sent by a client.
         *
         *   • If the EpochKey1 field is not null, then the EpochKey0 field shall NOT be null. Otherwise this command
         *     shall fail with an INVALID_COMMAND status code responded to the client.
         *
         *   • If the EpochKey1 field is not null, and the field’s length is not exactly 16 bytes, then this command
         *     shall fail with a CONSTRAINT_ERROR status code responded to the client.
         *
         *   • If the EpochKey1 field is not null, its associated EpochStartTime1 field shall NOT be null and shall
         *     contain a later epoch start time than the epoch start time found in the EpochStartTime0 field. Otherwise
         *     this command shall fail with an INVALID_COMMAND status code responded to the client.
         *
         *   • If exactly one of the EpochKey1 or EpochStartTime1 is null, rather than both being null, or neither being
         *     null, then this command shall fail with an INVALID_COMMAND status code responded to the client.
         *
         *   • If the EpochKey2 field is not null, then the EpochKey1 and EpochKey0 fields shall NOT be null. Otherwise
         *     this command shall fail with an INVALID_COMMAND status code responded to the client.
         *
         *   • If the EpochKey2 field is not null, and the field’s length is not exactly 16 bytes, then this command
         *     shall fail with a CONSTRAINT_ERROR status code responded to the client.
         *
         *   • If the EpochKey2 field is not null, its associated EpochStartTime2 field shall NOT be null and shall
         *     contain a later epoch start time than the epoch start time found in the EpochStartTime1 field. Otherwise
         *     this command shall fail with an INVALID_COMMAND status code responded to the client.
         *
         *   • If exactly one of the EpochKey2 or EpochStartTime2 is null, rather than both being null, or neither being
         *     null, then this command shall fail with an INVALID_COMMAND status code responded to the client.
         *
         * If there exists a Group Key Set associated with the accessing fabric which has the same GroupKeySetID as that
         * provided in the GroupKeySet field, then the contents of that group key set shall be replaced. A replacement
         * shall be done by executing the equivalent of entirely removing the previous Group Key Set with the given
         * GroupKeySetID, followed by an addition of a Group Key Set with the provided configuration. Otherwise, if the
         * GroupKeySetID did not match an existing entry, a new Group Key Set associated with the accessing fabric shall
         * be created with the provided data. The Group Key Set shall be written to non-volatile storage.
         *
         * Upon completion, this command shall send a status code back to the initiator:
         *
         *   • If the Group Key Set was properly installed or updated on the Node, the status code shall be set to
         *     SUCCESS.
         *
         *   • If there are insufficient resources on the receiver to store an additional Group Key Set, the status code
         *     shall be set to RESOURCE_EXHAUSTED (see Section 2.11.1.2, “Group Limits”);
         *
         *   • Otherwise, this status code shall be set to FAILURE.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.7.1
         */
        keySetWrite(request: GroupKeyManagement.KeySetWriteRequest): MaybePromise;

        /**
         * This command is used by Administrators to read the state of a given Group Key Set.
         *
         * ### Effect on Receipt
         *
         * If there exists a Group Key Set associated with the accessing fabric which has the same GroupKeySetID as that
         * provided in the GroupKeySetID field, then the contents of that Group Key Set shall be sent in a
         * KeySetReadResponse command, but with the EpochKey0, EpochKey1 and EpochKey2 fields replaced by null.
         *
         * Otherwise, if the GroupKeySetID does not refer to a Group Key Set associated with the accessing fabric, then
         * this command shall fail with a NOT_FOUND status code.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.7.2
         */
        keySetRead(request: GroupKeyManagement.KeySetReadRequest): MaybePromise<GroupKeyManagement.KeySetReadResponse>;

        /**
         * This command is used by Administrators to remove all state of a given Group Key Set.
         *
         * ### Effect on Receipt
         *
         * If there exists a Group Key Set associated with the accessing fabric which has the same GroupKeySetID as that
         * provided in the GroupKeySetID field, then the contents of that Group Key Set shall be removed, including all
         * epoch keys it contains.
         *
         * If there exist any entries for the accessing fabric within the GroupKeyMap attribute that refer to the
         * GroupKeySetID just removed, then these entries shall be removed from that list.
         *
         * This command shall fail with an INVALID_COMMAND status code back to the initiator if the GroupKeySetID being
         * removed is 0, which is the Key Set associated with the Identity Protection Key (IPK). The only method to
         * remove the IPK is usage of the RemoveFabric command or any operation which causes the equivalent of a
         * RemoveFabric to occur by side-effect.
         *
         * This command shall send a SUCCESS status code back to the initiator on success, or NOT_FOUND if the
         * GroupKeySetID requested did not exist.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.7.4
         */
        keySetRemove(request: GroupKeyManagement.KeySetRemoveRequest): MaybePromise;

        /**
         * This command is used by Administrators to query a list of all Group Key Sets associated with the accessing
         * fabric.
         *
         * ### Effect on Receipt
         *
         * Upon receipt, this command shall iterate all stored GroupKeySetStruct associated with the accessing fabric
         * and generate a KeySetReadAllIndicesResponse command containing the list of GroupKeySetID values from those
         * structs.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.7.5
         */
        keySetReadAllIndices(): MaybePromise<GroupKeyManagement.KeySetReadAllIndicesResponse>;
    }
}

export type GroupKeyManagementInterface = { components: [{ flags: {}, methods: GroupKeyManagementInterface.Base }] };
