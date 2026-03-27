/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise, Bytes } from "@matter/general";
import type { GroupId } from "../datatype/GroupId.js";
import type { FabricIndex } from "../datatype/FabricIndex.js";
import type { EndpointNumber } from "../datatype/EndpointNumber.js";

/**
 * Definitions for the GroupKeyManagement cluster.
 *
 * The Group Key Management cluster manages group keys for the node. The cluster is scoped to the node and is a
 * singleton for the node. This cluster maintains a list of groups supported by the node. Each group list entry supports
 * a single group, with a single group ID and single group key. Duplicate groups are not allowed in the list. Additions
 * or removal of a group entry are performed via modifications of the list. Such modifications require Administer
 * privilege.
 *
 * Each group entry includes a membership list of zero of more endpoints that are members of the group on the node.
 * Modification of this membership list is done via the Groups cluster, which is scoped to an endpoint. See the Chapter
 * 9, System Model Specification specification for more information on groups.
 *
 * @see {@link MatterSpecification.v142.Core} § 11.2
 */
export declare namespace GroupKeyManagement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x003f;

    /**
     * Textual cluster identifier.
     */
    export const name: "GroupKeyManagement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 2;

    /**
     * Canonical metadata for the GroupKeyManagement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link GroupKeyManagement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute is a list of GroupKeyMapStruct entries. Each entry associates a logical Group Id with a
         * particular group key set.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.6.1
         */
        groupKeyMap: GroupKeyMap[];

        /**
         * This attribute is a list of GroupInfoMapStruct entries. Each entry provides read-only information about how a
         * given logical Group ID maps to a particular set of endpoints, and a name for the group. The content of this
         * attribute reflects data managed via the Groups cluster (see AppClusters), and is in general terms referred to
         * as the 'node-wide Group Table'.
         *
         * The GroupTable shall NOT contain any entry whose GroupInfoMapStruct has an empty Endpoints list. If a
         * RemoveGroup or RemoveAllGroups command causes the removal of a group mapping from its last mapped endpoint,
         * the entire GroupTable entry for that given GroupId shall be removed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.6.2
         */
        groupTable: GroupInfoMap[];

        /**
         * Indicates the maximum number of groups that this node supports per fabric. The value of this attribute shall
         * be set to be no less than the required minimum supported groups as specified in Section 2.11.1.2, “Group
         * Limits”. The length of the GroupKeyMap and GroupTable list attributes shall NOT exceed the value of the
         * MaxGroupsPerFabric attribute multiplied by the number of supported fabrics.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.6.3
         */
        maxGroupsPerFabric: number;

        /**
         * Indicates the maximum number of group key sets this node supports per fabric. The value of this attribute
         * shall be set according to the minimum number of group key sets to support as specified in Section 2.11.1.2,
         * “Group Limits”.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.6.4
         */
        maxGroupKeysPerFabric: number;
    }

    /**
     * Attributes that may appear in {@link GroupKeyManagement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute is a list of GroupKeyMapStruct entries. Each entry associates a logical Group Id with a
         * particular group key set.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.6.1
         */
        groupKeyMap: GroupKeyMap[];

        /**
         * This attribute is a list of GroupInfoMapStruct entries. Each entry provides read-only information about how a
         * given logical Group ID maps to a particular set of endpoints, and a name for the group. The content of this
         * attribute reflects data managed via the Groups cluster (see AppClusters), and is in general terms referred to
         * as the 'node-wide Group Table'.
         *
         * The GroupTable shall NOT contain any entry whose GroupInfoMapStruct has an empty Endpoints list. If a
         * RemoveGroup or RemoveAllGroups command causes the removal of a group mapping from its last mapped endpoint,
         * the entire GroupTable entry for that given GroupId shall be removed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.6.2
         */
        groupTable: GroupInfoMap[];

        /**
         * Indicates the maximum number of groups that this node supports per fabric. The value of this attribute shall
         * be set to be no less than the required minimum supported groups as specified in Section 2.11.1.2, “Group
         * Limits”. The length of the GroupKeyMap and GroupTable list attributes shall NOT exceed the value of the
         * MaxGroupsPerFabric attribute multiplied by the number of supported fabrics.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.6.3
         */
        maxGroupsPerFabric: number;

        /**
         * Indicates the maximum number of group key sets this node supports per fabric. The value of this attribute
         * shall be set according to the minimum number of group key sets to support as specified in Section 2.11.1.2,
         * “Group Limits”.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.6.4
         */
        maxGroupKeysPerFabric: number;
    }

    /**
     * {@link GroupKeyManagement} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used by Administrators to set the state of a given Group Key Set, including atomically
         * updating the state of all epoch keys.
         *
         * ### Effect on Receipt
         *
         * The following validations shall be done against the content of the GroupKeySet field:
         *
         *   - If the EpochKey0 field is null or its associated EpochStartTime0 field is null, then this command shall
         *     fail with an INVALID_COMMAND status code responded to the client.
         *
         *   - If the EpochKey0 field’s length is not exactly 16 bytes, then this command shall fail with a
         *     CONSTRAINT_ERROR status code responded to the client.
         *
         *   - If the EpochStartTime0 is set to 0, then this command shall fail with an INVALID_COMMAND status code
         *     responded to the client. Note that internally, a GroupKeySetStruct’s EpochStartTime0 may be set to zero,
         *     due to the behavior of the AddNOC command which synthesizes a GroupKeySetStruct (see Section 11.18.6.8.1,
         *     “IPKValue Field”). However, the value 0 is illegal in the GroupKeySet field sent by a client.
         *
         *   - If the EpochKey1 field is not null, then the EpochKey0 field shall NOT be null. Otherwise this command
         *     shall fail with an INVALID_COMMAND status code responded to the client.
         *
         *   - If the EpochKey1 field is not null, and the field’s length is not exactly 16 bytes, then this command
         *     shall fail with a CONSTRAINT_ERROR status code responded to the client.
         *
         *   - If the EpochKey1 field is not null, its associated EpochStartTime1 field shall NOT be null and shall
         *     contain a later epoch start time than the epoch start time found in the EpochStartTime0 field. Otherwise
         *     this command shall fail with an INVALID_COMMAND status code responded to the client.
         *
         *   - If exactly one of the EpochKey1 or EpochStartTime1 is null, rather than both being null, or neither being
         *     null, then this command shall fail with an INVALID_COMMAND status code responded to the client.
         *
         *   - If the EpochKey2 field is not null, then the EpochKey1 and EpochKey0 fields shall NOT be null. Otherwise
         *     this command shall fail with an INVALID_COMMAND status code responded to the client.
         *
         *   - If the EpochKey2 field is not null, and the field’s length is not exactly 16 bytes, then this command
         *     shall fail with a CONSTRAINT_ERROR status code responded to the client.
         *
         *   - If the EpochKey2 field is not null, its associated EpochStartTime2 field shall NOT be null and shall
         *     contain a later epoch start time than the epoch start time found in the EpochStartTime1 field. Otherwise
         *     this command shall fail with an INVALID_COMMAND status code responded to the client.
         *
         *   - If exactly one of the EpochKey2 or EpochStartTime2 is null, rather than both being null, or neither being
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
         *   - If the Group Key Set was properly installed or updated on the Node, the status code shall be set to
         *     SUCCESS.
         *
         *   - If there are insufficient resources on the receiver to store an additional Group Key Set, the status code
         *     shall be set to RESOURCE_EXHAUSTED (see Section 2.11.1.2, “Group Limits”);
         *
         *   - Otherwise, this status code shall be set to FAILURE.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.7.1
         */
        keySetWrite(request: KeySetWriteRequest): MaybePromise;

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
        keySetRead(request: KeySetReadRequest): MaybePromise<KeySetReadResponse>;

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
        keySetRemove(request: KeySetRemoveRequest): MaybePromise;

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
        keySetReadAllIndices(): MaybePromise<KeySetReadAllIndicesResponse>;
    }

    /**
     * Commands that may appear in {@link GroupKeyManagement}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];
    export type Features = "CacheAndSync";

    /**
     * These are optional features supported by GroupKeyManagementCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.2.4
     */
    export enum Feature {
        /**
         * CacheAndSync (CS)
         *
         * The ability to support CacheAndSync security policy and MCSP.
         */
        CacheAndSync = "CacheAndSync"
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.2.5.3
     */
    export interface GroupKeyMap {
        /**
         * This field uniquely identifies the group within the scope of the given Fabric.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.3.1
         */
        groupId: GroupId;

        /**
         * This field references the set of group keys that generate operational group keys for use with this group, as
         * specified in Section 4.17.3.5.1, “Group Key Set ID”.
         *
         * A GroupKeyMapStruct shall NOT accept GroupKeySetID of 0, which is reserved for the IPK.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.3.2
         */
        groupKeySetId: number;

        fabricIndex: FabricIndex;
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.2.5.5
     */
    export interface GroupInfoMap {
        /**
         * This field uniquely identifies the group within the scope of the given Fabric.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.5.1
         */
        groupId: GroupId;

        /**
         * This field provides the list of Endpoint IDs on the Node to which messages to this group shall be forwarded.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.5.2
         */
        endpoints: EndpointNumber[];

        /**
         * This field provides a name for the group. This field shall contain the last GroupName written for a given
         * GroupId on any Endpoint via the Groups cluster.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.5.3
         */
        groupName?: string;

        fabricIndex: FabricIndex;
    }

    /**
     * This command is used by Administrators to set the state of a given Group Key Set, including atomically updating
     * the state of all epoch keys.
     *
     * ### Effect on Receipt
     *
     * The following validations shall be done against the content of the GroupKeySet field:
     *
     *   - If the EpochKey0 field is null or its associated EpochStartTime0 field is null, then this command shall fail
     *     with an INVALID_COMMAND status code responded to the client.
     *
     *   - If the EpochKey0 field’s length is not exactly 16 bytes, then this command shall fail with a CONSTRAINT_ERROR
     *     status code responded to the client.
     *
     *   - If the EpochStartTime0 is set to 0, then this command shall fail with an INVALID_COMMAND status code
     *     responded to the client. Note that internally, a GroupKeySetStruct’s EpochStartTime0 may be set to zero, due
     *     to the behavior of the AddNOC command which synthesizes a GroupKeySetStruct (see Section 11.18.6.8.1,
     *     “IPKValue Field”). However, the value 0 is illegal in the GroupKeySet field sent by a client.
     *
     *   - If the EpochKey1 field is not null, then the EpochKey0 field shall NOT be null. Otherwise this command shall
     *     fail with an INVALID_COMMAND status code responded to the client.
     *
     *   - If the EpochKey1 field is not null, and the field’s length is not exactly 16 bytes, then this command shall
     *     fail with a CONSTRAINT_ERROR status code responded to the client.
     *
     *   - If the EpochKey1 field is not null, its associated EpochStartTime1 field shall NOT be null and shall contain
     *     a later epoch start time than the epoch start time found in the EpochStartTime0 field. Otherwise this command
     *     shall fail with an INVALID_COMMAND status code responded to the client.
     *
     *   - If exactly one of the EpochKey1 or EpochStartTime1 is null, rather than both being null, or neither being
     *     null, then this command shall fail with an INVALID_COMMAND status code responded to the client.
     *
     *   - If the EpochKey2 field is not null, then the EpochKey1 and EpochKey0 fields shall NOT be null. Otherwise this
     *     command shall fail with an INVALID_COMMAND status code responded to the client.
     *
     *   - If the EpochKey2 field is not null, and the field’s length is not exactly 16 bytes, then this command shall
     *     fail with a CONSTRAINT_ERROR status code responded to the client.
     *
     *   - If the EpochKey2 field is not null, its associated EpochStartTime2 field shall NOT be null and shall contain
     *     a later epoch start time than the epoch start time found in the EpochStartTime1 field. Otherwise this command
     *     shall fail with an INVALID_COMMAND status code responded to the client.
     *
     *   - If exactly one of the EpochKey2 or EpochStartTime2 is null, rather than both being null, or neither being
     *     null, then this command shall fail with an INVALID_COMMAND status code responded to the client.
     *
     * If there exists a Group Key Set associated with the accessing fabric which has the same GroupKeySetID as that
     * provided in the GroupKeySet field, then the contents of that group key set shall be replaced. A replacement shall
     * be done by executing the equivalent of entirely removing the previous Group Key Set with the given GroupKeySetID,
     * followed by an addition of a Group Key Set with the provided configuration. Otherwise, if the GroupKeySetID did
     * not match an existing entry, a new Group Key Set associated with the accessing fabric shall be created with the
     * provided data. The Group Key Set shall be written to non-volatile storage.
     *
     * Upon completion, this command shall send a status code back to the initiator:
     *
     *   - If the Group Key Set was properly installed or updated on the Node, the status code shall be set to SUCCESS.
     *
     *   - If there are insufficient resources on the receiver to store an additional Group Key Set, the status code
     *     shall be set to RESOURCE_EXHAUSTED (see Section 2.11.1.2, “Group Limits”);
     *
     *   - Otherwise, this status code shall be set to FAILURE.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.2.7.1
     */
    export interface KeySetWriteRequest {
        groupKeySet: GroupKeySet;
    }

    /**
     * This command is used by Administrators to read the state of a given Group Key Set.
     *
     * ### Effect on Receipt
     *
     * If there exists a Group Key Set associated with the accessing fabric which has the same GroupKeySetID as that
     * provided in the GroupKeySetID field, then the contents of that Group Key Set shall be sent in a
     * KeySetReadResponse command, but with the EpochKey0, EpochKey1 and EpochKey2 fields replaced by null.
     *
     * Otherwise, if the GroupKeySetID does not refer to a Group Key Set associated with the accessing fabric, then this
     * command shall fail with a NOT_FOUND status code.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.2.7.2
     */
    export interface KeySetReadRequest {
        groupKeySetId: number;
    }

    /**
     * This command shall be generated in response to the KeySetRead command, if a valid Group Key Set was found. It
     * shall contain the configuration of the requested Group Key Set, with the EpochKey0, EpochKey1 and EpochKey2 key
     * contents replaced by null.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.2.7.3
     */
    export interface KeySetReadResponse {
        groupKeySet: GroupKeySet;
    }

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
     * removed is 0, which is the Key Set associated with the Identity Protection Key (IPK). The only method to remove
     * the IPK is usage of the RemoveFabric command or any operation which causes the equivalent of a RemoveFabric to
     * occur by side-effect.
     *
     * This command shall send a SUCCESS status code back to the initiator on success, or NOT_FOUND if the GroupKeySetID
     * requested did not exist.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.2.7.4
     */
    export interface KeySetRemoveRequest {
        groupKeySetId: number;
    }

    /**
     * This command shall be generated in response to KeySetReadAllIndices and it shall contain the list of
     * GroupKeySetID for all Group Key Sets associated with the scoped Fabric.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.2.7.6
     */
    export interface KeySetReadAllIndicesResponse {
        /**
         * This field references the set of group keys that generate operational group keys for use with the accessing
         * fabric.
         *
         * Each entry in GroupKeySetIDs is a GroupKeySetID field.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.7.6.1
         */
        groupKeySetIDs: number[];
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.2.5.1
     */
    export enum GroupKeySecurityPolicy {
        /**
         * Message counter synchronization using trust-first
         */
        TrustFirst = 0,

        /**
         * Message counter synchronization using cache-and-sync
         */
        CacheAndSync = 1
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.2.5.2
     */
    export enum GroupKeyMulticastPolicy {
        /**
         * Indicates filtering of multicast messages for a specific Group ID
         *
         * The 16-bit Group Identifier of the Multicast Address shall be the Group ID of the group.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.2.1
         */
        PerGroupId = 0,

        /**
         * Indicates not filtering of multicast messages
         *
         * The 16-bit Group Identifier of the Multicast Address shall be 0xFFFF.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.2.2
         */
        AllNodes = 1
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.2.5.4
     */
    export interface GroupKeySet {
        /**
         * This field shall provide the fabric-unique index for the associated group key set, as specified in Section
         * 4.17.3.5.1, “Group Key Set ID”.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.4.1
         */
        groupKeySetId: number;

        /**
         * This field shall provide the security policy for an operational group key set.
         *
         * When CacheAndSync is not supported in the FeatureMap of this cluster, any action attempting to set
         * CacheAndSync in the GroupKeySecurityPolicy field shall fail with an INVALID_COMMAND error.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.4.2
         */
        groupKeySecurityPolicy: GroupKeySecurityPolicy;

        /**
         * This field, if not null, shall be the root credential used in the derivation of an operational group key for
         * epoch slot 0 of the given group key set. If EpochKey0 is not null, EpochStartTime0 shall NOT be null.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.4.3
         */
        epochKey0: Bytes | null;

        /**
         * This field, if not null, shall define when EpochKey0 becomes valid as specified by Section 4.17.3, “Epoch
         * Keys”. Units are absolute UTC time in microseconds encoded using the epoch-us representation.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.4.4
         */
        epochStartTime0: number | bigint | null;

        /**
         * This field, if not null, shall be the root credential used in the derivation of an operational group key for
         * epoch slot 1 of the given group key set. If EpochKey1 is not null, EpochStartTime1 shall NOT be null.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.4.5
         */
        epochKey1: Bytes | null;

        /**
         * This field, if not null, shall define when EpochKey1 becomes valid as specified by Section 4.17.3, “Epoch
         * Keys”. Units are absolute UTC time in microseconds encoded using the epoch-us representation.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.4.6
         */
        epochStartTime1: number | bigint | null;

        /**
         * This field, if not null, shall be the root credential used in the derivation of an operational group key for
         * epoch slot 2 of the given group key set. If EpochKey2 is not null, EpochStartTime2 shall NOT be null.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.4.7
         */
        epochKey2: Bytes | null;

        /**
         * This field, if not null, shall define when EpochKey2 becomes valid as specified by Section 4.17.3, “Epoch
         * Keys”. Units are absolute UTC time in microseconds encoded using the epoch-us representation.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.4.8
         */
        epochStartTime2: number | bigint | null;

        /**
         * This field specifies how the IPv6 Multicast Address shall be formed for groups using this operational group
         * key set.
         *
         * The PerGroupID method maximizes filtering of multicast messages, so that receiving nodes receive only
         * multicast messages for groups to which they are subscribed.
         *
         * The AllNodes method minimizes the number of multicast addresses to which a receiver node needs to subscribe.
         *
         * > [!NOTE]
         *
         * > Support for GroupKeyMulticastPolicy is provisional. Correct default behavior is that implied by value
         *   PerGroupID.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.2.5.4.9
         */
        groupKeyMulticastPolicy?: GroupKeyMulticastPolicy;

        fabricIndex?: FabricIndex;
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
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link GroupKeyManagement}.
     */
    export const Cluster: typeof GroupKeyManagement;

    /**
     * @deprecated Use {@link GroupKeyManagement}.
     */
    export const Complete: typeof GroupKeyManagement;

    export const Typing: GroupKeyManagement;
}

/**
 * @deprecated Use {@link GroupKeyManagement}.
 */
export declare const GroupKeyManagementCluster: typeof GroupKeyManagement;

export interface GroupKeyManagement extends ClusterTyping {
    Attributes: GroupKeyManagement.Attributes;
    Commands: GroupKeyManagement.Commands;
    Features: GroupKeyManagement.Features;
    Components: GroupKeyManagement.Components;
}
