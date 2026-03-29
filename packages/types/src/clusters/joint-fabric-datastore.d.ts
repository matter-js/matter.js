/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { Bytes, MaybePromise } from "@matter/general";
import type { NodeId } from "../datatype/NodeId.js";
import type { VendorId } from "../datatype/VendorId.js";
import type { Status } from "../globals/Status.js";
import type { EndpointNumber } from "../datatype/EndpointNumber.js";
import type { GroupId } from "../datatype/GroupId.js";
import type { DeviceTypeId } from "../datatype/DeviceTypeId.js";
import type { SubjectId } from "../datatype/SubjectId.js";

/**
 * Definitions for the JointFabricDatastore cluster.
 *
 * The Joint Fabric Datastore Cluster is a cluster that provides a mechanism for the Joint Fabric Administrators to
 * manage the set of Nodes, Groups, and Group membership among Nodes in the Joint Fabric.
 *
 * When an Ecosystem Administrator Node is commissioned onto the Joint Fabric, the Ecosystem Administrator Node has no
 * knowledge of what Nodes and Groups are present, or what set-up information related to the Joint Fabric is provided by
 * the user. To address lack of knowledge, the Joint Fabric Datastore provides the information required for all
 * Ecosystem Administrators to maintain a consistent view of the Joint Fabric including Nodes, Groups, settings and
 * privileges.
 *
 * The Joint Fabric Datastore contains the access control configuration for the Joint Fabric - the groups, the group
 * keys, the group membership (expressed in terms of binding and ACL entries), as well as the CAT value and version for
 * each group. This section describes how all changes to the Joint Fabric access control configuration are made via the
 * Joint Fabric Datastore: a change is first made to the Datastore where the impacted configuration of individual nodes
 * is marked as pending; the Datastore is then responsible for propagating the change to all impacted nodes and then
 * updating its per-node (and sometimes per-endpoint) pending state to committed.
 *
 * The Joint Fabric Datastore cluster server shall only be accessible on a Node which is acting as the Joint Fabric
 * Anchor Administrator. When not acting as the Joint Fabric Anchor Administrator, the Joint Fabric Datastore cluster
 * shall NOT be accessible.
 *
 * The Admin level of access to the Joint Fabric Datastore cluster server shall be limited to JF Administrator Nodes
 * identified using the Administrator CAT.
 *
 * > [!NOTE]
 *
 * > Support for Joint Fabric Datastore cluster is provisional.
 *
 * @see {@link MatterSpecification.v142.Core} § 11.24
 */
export declare namespace JointFabricDatastore {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0752;

    /**
     * Textual cluster identifier.
     */
    export const name: "JointFabricDatastore";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the JointFabricDatastore cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link JointFabricDatastore} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This shall indicate the Anchor Root CA used to sign all NOC Issuers in the Joint Fabric for the accessing
         * fabric. A null value indicates that the Joint Fabric is not yet formed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.1
         */
        anchorRootCa: Bytes;

        /**
         * This shall indicate the Node identifier of the Joint Fabric Anchor Root CA for the accessing fabric.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.2
         */
        anchorNodeId: NodeId;

        /**
         * This shall indicate the Vendor identifier of the Joint Fabric Anchor Root CA for the accessing fabric.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.3
         */
        anchorVendorId: VendorId;

        /**
         * Friendly name for the accessing fabric which can be propagated to nodes.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.4
         */
        friendlyName: string;

        /**
         * This shall indicate the list of DatastoreGroupKeySetStruct used in the Joint Fabric for the accessing fabric.
         *
         * This attribute shall contain at least one entry, the IPK, which has GroupKeySetID of 0.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.5
         */
        groupKeySetList: DatastoreGroupKeySet[];

        /**
         * This shall indicate the list of groups in the Joint Fabric for the accessing fabric.
         *
         * This list must include, at a minimum, one group with GroupCAT value set to Administrator CAT and one group
         * with GroupCAT value set to Anchor CAT.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.6
         */
        groupList: DatastoreGroupInformationEntry[];

        /**
         * This shall indicate the list of nodes in the Joint Fabric for the accessing fabric.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.7
         */
        nodeList: DatastoreNodeInformationEntry[];

        /**
         * This shall indicate the list of administrators in the Joint Fabric for the accessing fabric.
         *
         * Only one Administrator may serve as the Anchor Root CA and Anchor Fabric Administrator and shall have index
         * value 0. All other Joint Fabric Administrators shall be referenced at index 1 or greater.
         *
         * A null value or empty list indicates that the Joint Fabric is not yet formed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.8
         */
        adminList: DatastoreAdministratorInformationEntry[];

        /**
         * This shall indicate the current state of the Joint Fabric Datastore Cluster for the accessing fabric.
         *
         * The Committed status indicates the DataStore is ready for use. The Pending status indicates that the
         * DataStore is not yet ready for use. The DeletePending status indicates that the DataStore is in the process
         * of being transferred to another Joint Fabric Anchor Administrator.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.9
         */
        status: DatastoreStatusEntry;

        /**
         * This shall indicate the group membership of endpoints in the accessing fabric.
         *
         * Any changes to this List (add/remove entry) must follow the pending→committed workflow with current state
         * reflected in the Status Entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.10
         */
        endpointGroupIdList: DatastoreEndpointGroupIdEntry[];

        /**
         * This shall indicate the binding list for endpoints in the accessing fabric.
         *
         * Any changes to this List (add/remove entry) must follow the pending→committed workflow with current state
         * reflected in the Status Entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.11
         */
        endpointBindingList: DatastoreEndpointBindingEntry[];

        /**
         * This shall indicate the KeySet entries for nodes in the accessing fabric.
         *
         * Any changes to this List (add/remove entry) must follow the pending→committed workflow with current state
         * reflected in the Status Entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.12
         */
        nodeKeySetList: DatastoreNodeKeySetEntry[];

        /**
         * This shall indicate the ACL entries for nodes in the accessing fabric.
         *
         * Any changes to this List (add/remove entry) must follow the pending→committed workflow with current state
         * reflected in the Status Entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.13
         */
        nodeAclList: DatastoreAclEntry[];

        /**
         * This shall indicate the Endpoint entries for nodes in the accessing fabric.
         *
         * Any changes to this List (add/remove entry) must follow the pending→committed workflow with current state
         * reflected in the Status Entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.14
         */
        nodeEndpointList: DatastoreEndpointEntry[];
    }

    /**
     * Attributes that may appear in {@link JointFabricDatastore}.
     */
    export interface Attributes {
        /**
         * This shall indicate the Anchor Root CA used to sign all NOC Issuers in the Joint Fabric for the accessing
         * fabric. A null value indicates that the Joint Fabric is not yet formed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.1
         */
        anchorRootCa: Bytes;

        /**
         * This shall indicate the Node identifier of the Joint Fabric Anchor Root CA for the accessing fabric.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.2
         */
        anchorNodeId: NodeId;

        /**
         * This shall indicate the Vendor identifier of the Joint Fabric Anchor Root CA for the accessing fabric.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.3
         */
        anchorVendorId: VendorId;

        /**
         * Friendly name for the accessing fabric which can be propagated to nodes.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.4
         */
        friendlyName: string;

        /**
         * This shall indicate the list of DatastoreGroupKeySetStruct used in the Joint Fabric for the accessing fabric.
         *
         * This attribute shall contain at least one entry, the IPK, which has GroupKeySetID of 0.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.5
         */
        groupKeySetList: DatastoreGroupKeySet[];

        /**
         * This shall indicate the list of groups in the Joint Fabric for the accessing fabric.
         *
         * This list must include, at a minimum, one group with GroupCAT value set to Administrator CAT and one group
         * with GroupCAT value set to Anchor CAT.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.6
         */
        groupList: DatastoreGroupInformationEntry[];

        /**
         * This shall indicate the list of nodes in the Joint Fabric for the accessing fabric.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.7
         */
        nodeList: DatastoreNodeInformationEntry[];

        /**
         * This shall indicate the list of administrators in the Joint Fabric for the accessing fabric.
         *
         * Only one Administrator may serve as the Anchor Root CA and Anchor Fabric Administrator and shall have index
         * value 0. All other Joint Fabric Administrators shall be referenced at index 1 or greater.
         *
         * A null value or empty list indicates that the Joint Fabric is not yet formed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.8
         */
        adminList: DatastoreAdministratorInformationEntry[];

        /**
         * This shall indicate the current state of the Joint Fabric Datastore Cluster for the accessing fabric.
         *
         * The Committed status indicates the DataStore is ready for use. The Pending status indicates that the
         * DataStore is not yet ready for use. The DeletePending status indicates that the DataStore is in the process
         * of being transferred to another Joint Fabric Anchor Administrator.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.9
         */
        status: DatastoreStatusEntry;

        /**
         * This shall indicate the group membership of endpoints in the accessing fabric.
         *
         * Any changes to this List (add/remove entry) must follow the pending→committed workflow with current state
         * reflected in the Status Entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.10
         */
        endpointGroupIdList: DatastoreEndpointGroupIdEntry[];

        /**
         * This shall indicate the binding list for endpoints in the accessing fabric.
         *
         * Any changes to this List (add/remove entry) must follow the pending→committed workflow with current state
         * reflected in the Status Entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.11
         */
        endpointBindingList: DatastoreEndpointBindingEntry[];

        /**
         * This shall indicate the KeySet entries for nodes in the accessing fabric.
         *
         * Any changes to this List (add/remove entry) must follow the pending→committed workflow with current state
         * reflected in the Status Entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.12
         */
        nodeKeySetList: DatastoreNodeKeySetEntry[];

        /**
         * This shall indicate the ACL entries for nodes in the accessing fabric.
         *
         * Any changes to this List (add/remove entry) must follow the pending→committed workflow with current state
         * reflected in the Status Entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.13
         */
        nodeAclList: DatastoreAclEntry[];

        /**
         * This shall indicate the Endpoint entries for nodes in the accessing fabric.
         *
         * Any changes to this List (add/remove entry) must follow the pending→committed workflow with current state
         * reflected in the Status Entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.6.14
         */
        nodeEndpointList: DatastoreEndpointEntry[];
    }

    /**
     * {@link JointFabricDatastore} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command shall be used to add a KeySet to the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * GroupKeySet represents the KeySet to be added to the Joint Fabric Datastore Cluster.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. Ensure there are no KeySets in the KeySetList attribute with the given GroupKeySetID.
         *
         *   2. If a match is found, return CONSTRAINT_ERROR.
         *
         *   3. Add the Epoch Key Entry for the KeySet to the KeySetList attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.1
         */
        addKeySet(request: AddKeySetRequest): MaybePromise;

        /**
         * This command shall be used to update a KeySet in the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * GroupKeySet represents the KeySet to be updated in the Joint Fabric Datastore Cluster.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. Find the Epoch Key Entry for the KeySet in the KeySetList attribute with the given GroupKeySetID, and
         *      update any changed fields.
         *
         *   2. If entry is not found, return NOT_FOUND.
         *
         *   3. If any fields are changed as a result of this command:
         *
         *     a. Iterate through each Node Information Entry:
         *
         *       i. If the NodeKeySetList contains an entry with the given GroupKeySetID:
         *
         *         A. Update the Status on the given DatastoreNodeKeySetEntryStruct tp Pending.
         *
         *         B. Update the GroupKeySet on the given Node with the new values.
         *
         *           I. If successful, update the Status on this DatastoreNodeKeySetEntryStruct to Committed.
         *
         *           II. If not successful, update the State field of the StatusEntry on this
         *               DatastoreNodeKeySetEntryStruct to CommitFailed and FailureCode code to the returned error. The
         *               pending change shall be applied in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.2
         */
        updateKeySet(request: UpdateKeySetRequest): MaybePromise;

        /**
         * This command shall be used to remove a KeySet from the Joint Fabric Datastore Cluster of the accessing
         * fabric.
         *
         * GroupKeySetID represents the unique identifier for the KeySet to be removed from the Joint Fabric Datastore
         * Cluster.
         *
         * Attempt to remove the IPK, which has GroupKeySetID of 0, shall fail with response CONSTRAINT_ERROR.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. If entry is not found, return NOT_FOUND.
         *
         *   2. Ensure there are no Nodes using this KeySet. To do this:
         *
         *     a. Iterate through each Node Information Entry:
         *
         *       i. If the NodeKeySetList list contains an entry with the given GroupKeySetID, and the entry does NOT
         *          have Status DeletePending, then return CONSTRAINT_ERROR.
         *
         *   3. Remove the DatastoreGroupKeySetStruct for the given GroupKeySetID from the GroupKeySetList attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.3
         */
        removeKeySet(request: RemoveKeySetRequest): MaybePromise;

        /**
         * This command shall be used to add a group to the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * GroupInformationEntry represents the group to be added to the Joint Fabric Datastore Cluster.
         *
         * GroupCAT values shall fall within the range 1 to 65534. Attempts to add a group with a GroupCAT value of
         * Administrator CAT or Anchor CAT shall fail with CONSTRAINT_ERROR.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. Ensure there are no Groups in the GroupList attribute with the given GroupID. If a match is found,
         *      return CONSTRAINT_ERROR.
         *
         *   2. Add the DatastoreGroupInformationEntryStruct for the Group with the given GroupID to the GroupList
         *      attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.4
         */
        addGroup(request: AddGroupRequest): MaybePromise;

        /**
         * This command shall be used to update a group in the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * GroupID represents the group to be updated in the Joint Fabric Datastore Cluster. NULL values for the
         * additional parameters will be ignored (not updated).
         *
         * GroupCAT values shall fall within the range 1 to 65534. Attempts to update the GroupCAT on an existing group
         * which has a GroupCAT value of Administrator CAT or Anchor CAT shall fail with CONSTRAINT_ERROR.
         *
         * Attempts to set the GroupCAT to Administrator CAT or Anchor CAT shall fail with CONSTRAINT_ERROR.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. If entry is not found, return NOT_FOUND.
         *
         *   2. Update the DatastoreGroupInformationEntryStruct for the Group with the given GroupID to match the
         *      non-NULL fields passed in.
         *
         *   3. If any fields are changed as a result of this command:
         *
         *     a. Iterate through each Node Information Entry:
         *
         *       i. If the GroupKeySetID changed:
         *
         *         I. Add a DatastoreNodeKeySetEntryStruct with the new GroupKeySetID, and Status set to Pending.
         *
         *         II. Add this KeySet to the Node.
         *
         *   1. If successful, Set the Status to Committed for this entry in the NodeKeySetList.
         *
         *   2. If not successful, Set the Status to CommitFailed and the FailureCode to the returned error. The pending
         *      change shall be applied in a subsequent Node Refresh.
         *
         *     A. If the NodeKeySetList list contains an entry with the previous GroupKeySetID:
         *
         *     III. Set the Status set to DeletePending.
         *
         *     IV. Remove this KeySet from the Node.
         *
         *   1. If successful, Remove this entry from the NodeKeySetList.
         *
         *   2. If not successful, the pending change shall be applied in a subsequent Node Refresh.
         *
         * ii. If the GroupCAT, GroupCATVersion or GroupPermission changed:
         *
         *   A. If the ACLList contains an entry for this Group, update the ACL List Entry in the Datastore with the new
         *      values and Status Pending, update the ACL attribute on the given Node with the new values. If the update
         *      succeeds, set the Status to Committed on the ACLList Entry in the Datastore.
         *
         * iii. If the FriendlyName changed:
         *
         *   A. Iterate through each Endpoint Information Entry:
         *
         *     I. If the GroupIDList contains an entry with the given GroupID:
         *
         *       1. Update the GroupIDList Entry in the Datastore with the new values and Status Pending
         *
         *       2. Update the Groups on the given Node with the new values.
         *
         *       1. If the update succeeds, set the Status to Committed on the GroupIDList Entry in the Datastore.
         *
         *       2. If not successful, the pending change shall be applied in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.5
         */
        updateGroup(request: UpdateGroupRequest): MaybePromise;

        /**
         * This command shall be used to remove a group from the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * GroupID represents the unique identifier for the group to be removed from the Joint Fabric Datastore Cluster.
         *
         * Attempts to remove a group with GroupCAT value set to Administrator CAT or Anchor CAT shall fail with
         * CONSTRAINT_ERROR.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. If entry is not found, return NOT_FOUND.
         *
         *   2. Ensure there are no Nodes in this group. To do this:
         *
         *     a. Iterate through each Node Information Entry:
         *
         *       i. If the GroupIDList contains an entry with the given GroupID, and the entry does NOT have Status
         *          DeletePending, then return CONSTRAINT_ERROR.
         *
         *   3. Remove the DatastoreGroupInformationEntryStruct for the Group with the given GroupID from the GroupList
         *      attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.6
         */
        removeGroup(request: RemoveGroupRequest): MaybePromise;

        /**
         * This command shall be used to add an admin to the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * NodeID, FriendlyName, VendorID and ICAC represent the admin to be added to the Joint Fabric Datastore
         * Cluster.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.7
         */
        addAdmin(request: AddAdminRequest): MaybePromise;

        /**
         * This command shall be used to update an admin in the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * NodeID represents the admin to be updated in the Joint Fabric Datastore Cluster. NULL values for the
         * additional parameters will be ignored (not updated).
         *
         * If entry is not found, return NOT_FOUND.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.8
         */
        updateAdmin(request: UpdateAdminRequest): MaybePromise;

        /**
         * This command shall be used to remove an admin from the Joint Fabric Datastore Cluster of the accessing
         * fabric.
         *
         * NodeID represents the unique identifier for the admin to be removed from the Joint Fabric Datastore Cluster.
         *
         * If entry is not found, return NOT_FOUND.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.9
         */
        removeAdmin(request: RemoveAdminRequest): MaybePromise;

        /**
         * The command shall be used to add a node to the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * NodeID represents the node to be added to the Joint Fabric Datastore Cluster.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. Update CommissioningStatusEntry of the Node Information Entry with the given NodeID to Pending.
         *
         * If a Node Information Entry exists for the given NodeID, this command shall return INVALID_CONSTRAINT.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.10
         */
        addPendingNode(request: AddPendingNodeRequest): MaybePromise;

        /**
         * The command shall be used to request that Datastore information relating to a Node of the accessing fabric is
         * refreshed.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. Confirm that a Node Information Entry exists for the given NodeID, and if not, return NOT_FOUND.
         *
         *   2. Update the CommissioningStatusEntry for the Node Information Entry to Pending.
         *
         *   3. Ensure the Endpoint List for the Node Information Entry with the given NodeID matches Endpoint list on
         *      the given Node. This involves the following steps:
         *
         *     a. Read the PartsList of the Descriptor cluster from the Node.
         *
         *     b. For each Endpoint Information Entry in the Endpoint List of the Node Information Entry that does not
         *        match an Endpoint ID in the PartsList, remove the Endpoint Information Entry.
         *
         *     c. For each Endpoint Information Entry in the Endpoint List of the Node Information Entry that matches an
         *        Endpoint ID in the PartsList:
         *
         *       i. Check that each entry in Node’s Group List occurs in the GroupIDList of the Endpoint Information
         *          Entry.
         *
         *         A. Add any missing entries to the GroupIDList of the Endpoint Information Entry.
         *
         *         B. For any entries in the GroupIDList with Status of Pending:
         *
         *           I. Add the corresponding change to the Node’s Group List.
         *
         *   1. If successful, mark the Status to Committed.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         * C. For any entries in the GroupIDList with Status of DeletePending:
         *
         *   1. If successful, remove the corresponding entry from the Node’s Group List.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         * D. For any entries in the GroupIDList with Status of CommitFailure:
         *
         *   I. A CommitFailure with an unrecoverable FailureCode shall be handled by removing the entry from the
         *      GroupIDList.
         *
         *   II. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a subsequent
         *       Node Refresh.
         *
         * ii. Check that each entry in Node’s Binding List occurs in the BindingList of the Endpoint Information Entry.
         *
         *   A. Add any missing entries to the BindingList of the Endpoint Information Entry.
         *
         *   B. For any entries in the BindingList with Status of Pending:
         *
         *     I. Add the corresponding change to the Node’s Binding List.
         *
         *       1. If successful, mark the Status to Committed.
         *
         *       2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *          error shall be handled in a subsequent Node Refresh.
         *
         *   C. For any entries in the BindingList with Status of DeletePending:
         *
         *     1. If successful, remove the corresponding entry from the Node’s BindingList.
         *
         *     2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *        error shall be handled in a subsequent Node Refresh.
         *
         *   D. For any entries in the BindingList with Status of CommitFailure:
         *
         *     I. A CommitFailure with an unrecoverable FailureCode shall be handled by removing the entry from the
         *        BindingList.
         *
         *     II. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a subsequent
         *         Node Refresh.
         *
         * 4. Ensure the GroupKeySetList for the Node Information Entry with the given NodeID matches the Group Keys on
         * the given Node. This involves the following steps:
         *
         *   a. Read the Group Keys from the Node.
         *
         *   b. For each GroupKeySetEntry in the GroupKeySetList of the Node Information Entry with a Pending Status:
         *
         *     i. Add the corresponding DatastoreGroupKeySetStruct to the Node’s Group Key list.
         *
         *       A. If successful, mark the Status to Committed.
         *
         *       B. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *          error shall be handled in a subsequent Node Refresh.
         *
         *   c. For each GroupKeySetEntry in the GroupKeySetList of the Node Information Entry with a CommitFailure
         *      Status:
         *
         *     i. A CommitFailure with an unrecoverable FailureCode shall be handled by removing the entry from the
         *        GroupKeySetList.
         *
         *     ii. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a subsequent
         *         Node Refresh.
         *
         *   d. All remaining entries in the GroupKeySetList should be replaced by the remaining entries on the Node.
         *
         * 5. Ensure the ACLList for the Node Information Entry with the given NodeID matches the ACL attribute on the
         * given Node. This involves the following steps:
         *
         *   a. Read the ACL attribute on the Node.
         *
         *   b. For each DatastoreACLEntryStruct in the ACLList of the Node Information Entry with a Pending Status:
         *
         *     i. Add the corresponding DatastoreACLEntryStruct to the Node’s ACL attribute.
         *
         *       A. If successful, mark the Status to Committed.
         *
         *       B. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *          error shall be handled in a subsequent Node Refresh.
         *
         *   c. For each DatastoreACLEntryStruct in the ACLList of the Node Information Entry with a CommitFailure
         *      Status:
         *
         *     i. A CommitFailure with an unrecoverable FailureCode (i.e. RESOURCE_EXHAUSTED, CONSTRAINT_ERROR) shall be
         *        handled by removing the entry from the ACLList.
         *
         *     ii. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a subsequent
         *         Node Refresh.
         *
         *   d. All remaining entries in the ACLList should be replaced by the remaining entries on the Node.
         *
         * 6. Update the CommissioningStatusEntry for the Node Information Entry to Committed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.11
         */
        refreshNode(request: RefreshNodeRequest): MaybePromise;

        /**
         * The command shall be used to update the friendly name for a node in the Joint Fabric Datastore Cluster of the
         * accessing fabric.
         *
         * NodeID represents the node to be updated in the Joint Fabric Datastore Cluster.
         *
         * If a Node Information Entry does not exist for the given NodeID, this command shall return NOT_FOUND.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.12
         */
        updateNode(request: UpdateNodeRequest): MaybePromise;

        /**
         * This command shall be used to remove a node from the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * NodeID represents the unique identifier for the node to be removed from the Joint Fabric Datastore Cluster.
         *
         * If a Node Information Entry does not exist for the given NodeID, this command shall return NOT_FOUND.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.13
         */
        removeNode(request: RemoveNodeRequest): MaybePromise;

        /**
         * This command shall be used to update the state of an endpoint for a node in the Joint Fabric Datastore
         * Cluster of the accessing fabric.
         *
         * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * NodeID represents the unique identifier for the node to which the endpoint belongs.
         *
         * If an Endpoint Information Entry does not exist for the given NodeID and EndpointID, this command shall
         * return NOT_FOUND.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.14
         */
        updateEndpointForNode(request: UpdateEndpointForNodeRequest): MaybePromise;

        /**
         * This command shall be used to add a Group ID to an endpoint for a node in the Joint Fabric Datastore Cluster
         * of the accessing fabric.
         *
         * GroupID represents the unique identifier for the group to be added to the endpoint.
         *
         * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * NodeID represents the unique identifier for the node to which the endpoint belongs.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. Confirm that an Endpoint Information Entry exists for the given NodeID and EndpointID, and if not,
         *      return NOT_FOUND.
         *
         *   2. Ensure the Group Key List for the Node Information Entry with the given NodeID includes the KeySet for
         *      the given Group ID. If it does not:
         *
         *     a. Add an entry for the KeySet of the given Group ID to the Group Key List for the Node. The new entry’s
         *        status shall be set to Pending.
         *
         *     b. Add a Group Key Entry for this KeySet to the given Node ID.
         *
         *       i. If this succeeds, update the new KeySet entry in the Datastore to Committed.
         *
         *       ii. If not successful, the pending change shall be applied in a subsequent Node Refresh.
         *
         *   3. Ensure the Group List for the Endpoint Information Entry with the given NodeID and EndpointID includes
         *      an entry for the given Group. If it does not:
         *
         *     a. Add a Group entry for the given Group ID to the Group List for the Endpoint and Node. The new entry’s
         *        status shall be set to Pending.
         *
         *     b. Add this Group entry to the given Endpoint ID on the given Node ID.
         *
         *       i. If this succeeds, update the new Group entry in the Datastore to Committed.
         *
         *       ii. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *           error shall be handled in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.15
         */
        addGroupIdToEndpointForNode(request: AddGroupIdToEndpointForNodeRequest): MaybePromise;

        /**
         * This command shall be used to remove a Group ID from an endpoint for a node in the Joint Fabric Datastore
         * Cluster of the accessing fabric.
         *
         * GroupID represents the unique identifier for the group to be removed from the endpoint.
         *
         * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * NodeID represents the unique identifier for the node to which the endpoint belongs.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. Confirm that an Endpoint Information Entry exists for the given NodeID and EndpointID, and if not,
         *      return NOT_FOUND.
         *
         *   2. Ensure the Group List for the Endpoint Information Entry with the given NodeID and EndpointID does not
         *      include an entry for the given Group. If it does:
         *
         *     a. Update the status to DeletePending of the Group entry for the given Group ID in the Group List.
         *
         *     b. Remove this Group entry for the given Endpoint ID on the given Node ID.
         *
         *       i. If this succeeds, remove the Group entry for the given Group ID in the Group List for this NodeID
         *          and EndpointID in the Datastore.
         *
         *       ii. If not successful, the pending change shall be applied in a subsequent Node Refresh.
         *
         *   3. Ensure the Group Key List for the Node Information Entry with the given NodeID does not include the
         *      KeySet for the given Group ID. If it does:
         *
         *     a. Update the status to DeletePending for the entry for the KeySet of the given Group ID in the Node
         *        Group Key List.
         *
         *     b. Remove the Group Key Entry for this KeySet from the given Node ID.
         *
         *       i. If this succeeds, remove the KeySet entry for the given Node ID.
         *
         *       ii. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *           error shall be handled in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.16
         */
        removeGroupIdFromEndpointForNode(request: RemoveGroupIdFromEndpointForNodeRequest): MaybePromise;

        /**
         * This command shall be used to add a binding to an endpoint for a node in the Joint Fabric Datastore Cluster
         * of the accessing fabric.
         *
         * Binding represents the binding to be added to the endpoint.
         *
         * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * NodeID represents the unique identifier for the node to which the endpoint belongs.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. Confirm that an Endpoint Information Entry exists for the given NodeID and EndpointID, and if not,
         *      return NOT_FOUND.
         *
         *   2. Ensure the Binding List for the Node Information Entry with the given NodeID includes the given Binding.
         *      If it does not:
         *
         *     a. Add the Binding to the Binding List for the Node Information Entry for the given NodeID. The new
         *        entry’s status shall be set to Pending.
         *
         *     b. Add this Binding to the given Node ID.
         *
         *       i. If this succeeds, update the new Binding in the Datastore to Committed.
         *
         *       ii. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *           error shall be handled in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.17
         */
        addBindingToEndpointForNode(request: AddBindingToEndpointForNodeRequest): MaybePromise;

        /**
         * This command shall be used to remove a binding from an endpoint for a node in the Joint Fabric Datastore
         * Cluster of the accessing fabric.
         *
         * ListID represents the unique identifier for the binding entry in the Datastore’s EndpointBindingList
         * attribute to be removed from the endpoint.
         *
         * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * NodeID represents the unique identifier for the node to which the endpoint belongs.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. Confirm that an Endpoint Information Entry exists for the given NodeID and EndpointID, and if not,
         *      return NOT_FOUND.
         *
         *   2. Ensure the Binding List for the Node Information Entry with the given NodeID does not include an entry
         *      with the given ListID. If it does:
         *
         *     a. Update the status to DeletePending for the given Binding in the Binding List.
         *
         *     b. Remove this Binding from the given Node ID.
         *
         *       i. If this succeeds, remove the given Binding from the Binding List.
         *
         *       ii. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *           error shall be handled in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.18
         */
        removeBindingFromEndpointForNode(request: RemoveBindingFromEndpointForNodeRequest): MaybePromise;

        /**
         * This command shall be used to add an ACL to a node in the Joint Fabric Datastore Cluster of the accessing
         * fabric.
         *
         * NodeID represents the unique identifier for the node to which the ACL is to be added.
         *
         * ACLEntry represents the ACL to be added to the Joint Fabric Datastore Cluster.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. Confirm that a Node Information Entry exists for the given NodeID, and if not, return NOT_FOUND.
         *
         *   2. Ensure the ACL List for the given NodeID includes the given ACLEntry. If it does not:
         *
         *     a. Add the ACLEntry to the ACL List for the given NodeID. The new entry’s status shall be set to Pending.
         *
         *     b. Add this ACLEntry to the given Node ID.
         *
         *       i. If this succeeds, update the new ACLEntry in the Datastore to Committed.
         *
         *       ii. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *           error shall be handled in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.19
         */
        addAclToNode(request: AddAclToNodeRequest): MaybePromise;

        /**
         * This command shall be used to remove an ACL from a node in the Joint Fabric Datastore Cluster of the
         * accessing fabric.
         *
         * ListID represents the unique identifier for the DatastoreACLEntryStruct to be removed from the Datastore’s
         * list of DatastoreACLEntry.
         *
         * NodeID represents the unique identifier for the node from which the ACL is to be removed.
         *
         * Upon receipt of this command, the Datastore shall:
         *
         *   1. Confirm that a Node Information Entry exists for the given NodeID, and if not, return NOT_FOUND.
         *
         *   2. Ensure the ACL List for the given NodeID does not include the given ACLEntry. If it does:
         *
         *     a. Update the status to DeletePending for the given ACLEntry in the ACL List.
         *
         *     b. Remove this ACLEntry from the given Node ID.
         *
         *       i. If this succeeds, remove the given ACLEntry from the Node ACL List.
         *
         *       ii. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *           error shall be handled in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.20
         */
        removeAclFromNode(request: RemoveAclFromNodeRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link JointFabricDatastore}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.18
     */
    export declare class DatastoreGroupKeySet {
        constructor(values?: Partial<DatastoreGroupKeySet>);
        groupKeySetId: number;
        groupKeySecurityPolicy: DatastoreGroupKeySecurityPolicy;
        epochKey0: Bytes | null;
        epochStartTime0: number | bigint | null;
        epochKey1: Bytes | null;
        epochStartTime1: number | bigint | null;
        epochKey2: Bytes | null;
        epochStartTime2: number | bigint | null;
        groupKeyMulticastPolicy?: DatastoreGroupKeyMulticastPolicy;
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.5
     */
    export declare class DatastoreGroupInformationEntry {
        constructor(values?: Partial<DatastoreGroupInformationEntry>);

        /**
         * The unique identifier for the group.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.5.1
         */
        groupId: number | bigint;

        /**
         * The friendly name for the group.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.5.2
         */
        friendlyName: string;

        /**
         * The unique identifier for the group key set.
         *
         * This value may be null when multicast communication is not used for the group. When GroupPermission is Admin
         * or Manage, this value shall be null.
         *
         * A value of 0 is not allowed since this value is reserved for IPK and the group entry for this value is not
         * managed by the Datastore.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.5.3
         */
        groupKeySetId: number | null;

        /**
         * CAT value for this group. This is used for control of individual members of a group (non-broadcast commands).
         *
         * Allowable values include the range 0x0000 to 0xEFFF, and the Administrator CAT and Anchor CAT values.
         *
         * This value may be null when unicast communication is not used for the group.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.5.4
         */
        groupCat: number | null;

        /**
         * Current version number for this CAT.
         *
         * This value shall be null when GroupCAT value is null.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.5.5
         */
        groupCatVersion: number | null;

        /**
         * The permission level associated with ACL entries for this group. There should be only one Administrator group
         * per fabric, and at most one Manage group per Ecosystem (Vendor Entry).
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.5.6
         */
        groupPermission: DatastoreAccessControlEntryPrivilege;
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.14
     */
    export declare class DatastoreNodeInformationEntry {
        constructor(values?: Partial<DatastoreNodeInformationEntry>);

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.14.1
         */
        nodeId: NodeId;

        /**
         * Friendly name for this node which is not propagated to nodes.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.14.2
         */
        friendlyName: string;

        /**
         * Set to Pending prior to completing commissioning, set to Committed after commissioning complete is
         * successful, or set to CommitFailed if commissioning failed with the FailureCode Field set to the error.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.14.3
         */
        commissioningStatusEntry: DatastoreStatusEntry;
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.15
     */
    export declare class DatastoreAdministratorInformationEntry {
        constructor(values?: Partial<DatastoreAdministratorInformationEntry>);

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.15.1
         */
        nodeId: NodeId;

        /**
         * Friendly name for this node which is not propagated to nodes.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.15.2
         */
        friendlyName: string;

        /**
         * The Vendor ID for the node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.15.3
         */
        vendorId: VendorId;

        /**
         * The ICAC used to issue the NOC.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.15.4
         */
        icac: Bytes;
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.2
     */
    export declare class DatastoreStatusEntry {
        constructor(values?: Partial<DatastoreStatusEntry>);

        /**
         * This field shall contain the current state of the target device operation.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.2.1
         */
        state: DatastoreState;

        /**
         * This field shall contain the timestamp of the last update.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.2.2
         */
        updateTimestamp: number;

        /**
         * This field shall contain the StatusCode of the last failed operation where the State field is set to
         * CommitFailure.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.2.3
         */
        failureCode: Status;
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.8
     */
    export declare class DatastoreEndpointGroupIdEntry {
        constructor(values?: Partial<DatastoreEndpointGroupIdEntry>);

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.8.1
         */
        nodeId: NodeId;

        /**
         * The unique identifier for the endpoint.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.8.2
         */
        endpointId: EndpointNumber;

        /**
         * The unique identifier for the group.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.8.3
         */
        groupId: GroupId;

        /**
         * Indicates whether entry in this list is pending, committed, delete-pending, or commit-failed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.8.4
         */
        statusEntry: DatastoreStatusEntry;
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.7
     */
    export declare class DatastoreEndpointBindingEntry {
        constructor(values?: Partial<DatastoreEndpointBindingEntry>);

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.7.1
         */
        nodeId: NodeId;

        /**
         * The unique identifier for the endpoint.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.7.2
         */
        endpointId: EndpointNumber;

        /**
         * The unique identifier for the entry in the Datastore’s EndpointBindingList attribute, which is a list of
         * DatastoreEndpointBindingEntryStruct.
         *
         * This field is used to uniquely identify an entry in the EndpointBindingList attribute for the purpose of
         * deletion (RemoveBindingFromEndpointForNode Command).
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.7.3
         */
        listId: number;

        /**
         * The binding target structure.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.7.4
         */
        binding: DatastoreBindingTarget;

        /**
         * Indicates whether entry in this list is pending, committed, delete-pending, or commit-failed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.7.5
         */
        statusEntry: DatastoreStatusEntry;
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.3
     */
    export declare class DatastoreNodeKeySetEntry {
        constructor(values?: Partial<DatastoreNodeKeySetEntry>);

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.3.1
         */
        nodeId: NodeId;

        groupKeySetId: number;

        /**
         * Indicates whether entry in this list is pending, committed, delete-pending, or commit-failed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.3.3
         */
        statusEntry: DatastoreStatusEntry;
    };

    /**
     * The DatastoreACLEntryStruct is a holder for an ACL (DatastoreAccessControlEntryStruct) on a specific Node which
     * is managed by the Datastore. Only ACLs on a specific Node that are fabric-scoped to the Joint Fabric are managed
     * by the Datastore. As a result, references to nodes and groups are specific to the Joint Fabric.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.13
     */
    export declare class DatastoreAclEntry {
        constructor(values?: Partial<DatastoreAclEntry>);

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.13.1
         */
        nodeId: NodeId;

        /**
         * The unique identifier for the ACL entry in the Datastore’s list of DatastoreACLEntry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.13.2
         */
        listId: number;

        /**
         * The Access Control Entry structure.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.13.3
         */
        aclEntry: DatastoreAccessControlEntry;

        /**
         * Indicates whether entry in this list is pending, committed, delete-pending, or commit-failed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.13.4
         */
        statusEntry: DatastoreStatusEntry;
    };

    /**
     * The DatastoreEndpointEntryStruct represents an Endpoint on a specific Node which is managed by the Datastore.
     * Only Nodes on the Joint Fabric are managed by the Datastore. As a result, references to NodeID are specific to
     * the Joint Fabric.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.9
     */
    export declare class DatastoreEndpointEntry {
        constructor(values?: Partial<DatastoreEndpointEntry>);

        /**
         * The unique identifier for the endpoint.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.9.1
         */
        endpointId: EndpointNumber;

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.9.2
         */
        nodeId: NodeId;

        /**
         * Friendly name for this endpoint which is propagated to nodes. Any changes to Friendly Name or Group Id List
         * (add/remove entry) must follow the pending→committed workflow with current state reflected in the Status
         * Entry.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.9.3
         */
        friendlyName: string;

        /**
         * Indicates whether changes to Friendly Name are pending, committed, or commit-failed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.9.4
         */
        statusEntry: DatastoreStatusEntry;
    };

    /**
     * This command shall be used to add a KeySet to the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * GroupKeySet represents the KeySet to be added to the Joint Fabric Datastore Cluster.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. Ensure there are no KeySets in the KeySetList attribute with the given GroupKeySetID.
     *
     *   2. If a match is found, return CONSTRAINT_ERROR.
     *
     *   3. Add the Epoch Key Entry for the KeySet to the KeySetList attribute.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.1
     */
    export declare class AddKeySetRequest {
        constructor(values?: Partial<AddKeySetRequest>);
        groupKeySet: DatastoreGroupKeySet;
    };

    /**
     * This command shall be used to update a KeySet in the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * GroupKeySet represents the KeySet to be updated in the Joint Fabric Datastore Cluster.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. Find the Epoch Key Entry for the KeySet in the KeySetList attribute with the given GroupKeySetID, and update
     *      any changed fields.
     *
     *   2. If entry is not found, return NOT_FOUND.
     *
     *   3. If any fields are changed as a result of this command:
     *
     *     a. Iterate through each Node Information Entry:
     *
     *       i. If the NodeKeySetList contains an entry with the given GroupKeySetID:
     *
     *         A. Update the Status on the given DatastoreNodeKeySetEntryStruct tp Pending.
     *
     *         B. Update the GroupKeySet on the given Node with the new values.
     *
     *           I. If successful, update the Status on this DatastoreNodeKeySetEntryStruct to Committed.
     *
     *           II. If not successful, update the State field of the StatusEntry on this DatastoreNodeKeySetEntryStruct
     *               to CommitFailed and FailureCode code to the returned error. The pending change shall be applied in
     *               a subsequent Node Refresh.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.2
     */
    export declare class UpdateKeySetRequest {
        constructor(values?: Partial<UpdateKeySetRequest>);
        groupKeySet: DatastoreGroupKeySet;
    };

    /**
     * This command shall be used to remove a KeySet from the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * GroupKeySetID represents the unique identifier for the KeySet to be removed from the Joint Fabric Datastore
     * Cluster.
     *
     * Attempt to remove the IPK, which has GroupKeySetID of 0, shall fail with response CONSTRAINT_ERROR.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. If entry is not found, return NOT_FOUND.
     *
     *   2. Ensure there are no Nodes using this KeySet. To do this:
     *
     *     a. Iterate through each Node Information Entry:
     *
     *       i. If the NodeKeySetList list contains an entry with the given GroupKeySetID, and the entry does NOT have
     *          Status DeletePending, then return CONSTRAINT_ERROR.
     *
     *   3. Remove the DatastoreGroupKeySetStruct for the given GroupKeySetID from the GroupKeySetList attribute.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.3
     */
    export declare class RemoveKeySetRequest {
        constructor(values?: Partial<RemoveKeySetRequest>);
        groupKeySetId: number;
    };

    /**
     * This command shall be used to add a group to the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * GroupInformationEntry represents the group to be added to the Joint Fabric Datastore Cluster.
     *
     * GroupCAT values shall fall within the range 1 to 65534. Attempts to add a group with a GroupCAT value of
     * Administrator CAT or Anchor CAT shall fail with CONSTRAINT_ERROR.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. Ensure there are no Groups in the GroupList attribute with the given GroupID. If a match is found, return
     *      CONSTRAINT_ERROR.
     *
     *   2. Add the DatastoreGroupInformationEntryStruct for the Group with the given GroupID to the GroupList
     *      attribute.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.4
     */
    export declare class AddGroupRequest {
        constructor(values?: Partial<AddGroupRequest>);
        groupId: GroupId;
        friendlyName: string;
        groupKeySetId: number | null;
        groupCat: number | null;
        groupCatVersion: number | null;
        groupPermission: DatastoreAccessControlEntryPrivilege;
    };

    /**
     * This command shall be used to update a group in the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * GroupID represents the group to be updated in the Joint Fabric Datastore Cluster. NULL values for the additional
     * parameters will be ignored (not updated).
     *
     * GroupCAT values shall fall within the range 1 to 65534. Attempts to update the GroupCAT on an existing group
     * which has a GroupCAT value of Administrator CAT or Anchor CAT shall fail with CONSTRAINT_ERROR.
     *
     * Attempts to set the GroupCAT to Administrator CAT or Anchor CAT shall fail with CONSTRAINT_ERROR.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. If entry is not found, return NOT_FOUND.
     *
     *   2. Update the DatastoreGroupInformationEntryStruct for the Group with the given GroupID to match the non-NULL
     *      fields passed in.
     *
     *   3. If any fields are changed as a result of this command:
     *
     *     a. Iterate through each Node Information Entry:
     *
     *       i. If the GroupKeySetID changed:
     *
     *         I. Add a DatastoreNodeKeySetEntryStruct with the new GroupKeySetID, and Status set to Pending.
     *
     *         II. Add this KeySet to the Node.
     *
     *   1. If successful, Set the Status to Committed for this entry in the NodeKeySetList.
     *
     *   2. If not successful, Set the Status to CommitFailed and the FailureCode to the returned error. The pending
     *      change shall be applied in a subsequent Node Refresh.
     *
     *     A. If the NodeKeySetList list contains an entry with the previous GroupKeySetID:
     *
     *     III. Set the Status set to DeletePending.
     *
     *     IV. Remove this KeySet from the Node.
     *
     *   1. If successful, Remove this entry from the NodeKeySetList.
     *
     *   2. If not successful, the pending change shall be applied in a subsequent Node Refresh.
     *
     * ii. If the GroupCAT, GroupCATVersion or GroupPermission changed:
     *
     *   A. If the ACLList contains an entry for this Group, update the ACL List Entry in the Datastore with the new
     *      values and Status Pending, update the ACL attribute on the given Node with the new values. If the update
     *      succeeds, set the Status to Committed on the ACLList Entry in the Datastore.
     *
     * iii. If the FriendlyName changed:
     *
     *   A. Iterate through each Endpoint Information Entry:
     *
     *     I. If the GroupIDList contains an entry with the given GroupID:
     *
     *       1. Update the GroupIDList Entry in the Datastore with the new values and Status Pending
     *
     *       2. Update the Groups on the given Node with the new values.
     *
     *       1. If the update succeeds, set the Status to Committed on the GroupIDList Entry in the Datastore.
     *
     *       2. If not successful, the pending change shall be applied in a subsequent Node Refresh.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.5
     */
    export declare class UpdateGroupRequest {
        constructor(values?: Partial<UpdateGroupRequest>);
        groupId: GroupId;
        friendlyName: string | null;
        groupKeySetId: number | null;
        groupCat: number | null;
        groupCatVersion: number | null;
        groupPermission: DatastoreAccessControlEntryPrivilege | null;
    };

    /**
     * This command shall be used to remove a group from the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * GroupID represents the unique identifier for the group to be removed from the Joint Fabric Datastore Cluster.
     *
     * Attempts to remove a group with GroupCAT value set to Administrator CAT or Anchor CAT shall fail with
     * CONSTRAINT_ERROR.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. If entry is not found, return NOT_FOUND.
     *
     *   2. Ensure there are no Nodes in this group. To do this:
     *
     *     a. Iterate through each Node Information Entry:
     *
     *       i. If the GroupIDList contains an entry with the given GroupID, and the entry does NOT have Status
     *          DeletePending, then return CONSTRAINT_ERROR.
     *
     *   3. Remove the DatastoreGroupInformationEntryStruct for the Group with the given GroupID from the GroupList
     *      attribute.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.6
     */
    export declare class RemoveGroupRequest {
        constructor(values?: Partial<RemoveGroupRequest>);
        groupId: GroupId;
    };

    /**
     * This command shall be used to add an admin to the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * NodeID, FriendlyName, VendorID and ICAC represent the admin to be added to the Joint Fabric Datastore Cluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.7
     */
    export declare class AddAdminRequest {
        constructor(values?: Partial<AddAdminRequest>);
        nodeId: NodeId;
        friendlyName: string;
        vendorId: VendorId;
        icac: Bytes;
    };

    /**
     * This command shall be used to update an admin in the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * NodeID represents the admin to be updated in the Joint Fabric Datastore Cluster. NULL values for the additional
     * parameters will be ignored (not updated).
     *
     * If entry is not found, return NOT_FOUND.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.8
     */
    export declare class UpdateAdminRequest {
        constructor(values?: Partial<UpdateAdminRequest>);
        nodeId: NodeId | null;
        friendlyName: string | null;
        icac: Bytes | null;
    };

    /**
     * This command shall be used to remove an admin from the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * NodeID represents the unique identifier for the admin to be removed from the Joint Fabric Datastore Cluster.
     *
     * If entry is not found, return NOT_FOUND.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.9
     */
    export declare class RemoveAdminRequest {
        constructor(values?: Partial<RemoveAdminRequest>);
        nodeId: NodeId;
    };

    /**
     * The command shall be used to add a node to the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * NodeID represents the node to be added to the Joint Fabric Datastore Cluster.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. Update CommissioningStatusEntry of the Node Information Entry with the given NodeID to Pending.
     *
     * If a Node Information Entry exists for the given NodeID, this command shall return INVALID_CONSTRAINT.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.10
     */
    export declare class AddPendingNodeRequest {
        constructor(values?: Partial<AddPendingNodeRequest>);
        nodeId: NodeId;
        friendlyName: string;
    };

    /**
     * The command shall be used to request that Datastore information relating to a Node of the accessing fabric is
     * refreshed.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. Confirm that a Node Information Entry exists for the given NodeID, and if not, return NOT_FOUND.
     *
     *   2. Update the CommissioningStatusEntry for the Node Information Entry to Pending.
     *
     *   3. Ensure the Endpoint List for the Node Information Entry with the given NodeID matches Endpoint list on the
     *      given Node. This involves the following steps:
     *
     *     a. Read the PartsList of the Descriptor cluster from the Node.
     *
     *     b. For each Endpoint Information Entry in the Endpoint List of the Node Information Entry that does not match
     *        an Endpoint ID in the PartsList, remove the Endpoint Information Entry.
     *
     *     c. For each Endpoint Information Entry in the Endpoint List of the Node Information Entry that matches an
     *        Endpoint ID in the PartsList:
     *
     *       i. Check that each entry in Node’s Group List occurs in the GroupIDList of the Endpoint Information Entry.
     *
     *         A. Add any missing entries to the GroupIDList of the Endpoint Information Entry.
     *
     *         B. For any entries in the GroupIDList with Status of Pending:
     *
     *           I. Add the corresponding change to the Node’s Group List.
     *
     *   1. If successful, mark the Status to Committed.
     *
     *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The error
     *      shall be handled in a subsequent Node Refresh.
     *
     * C. For any entries in the GroupIDList with Status of DeletePending:
     *
     *   1. If successful, remove the corresponding entry from the Node’s Group List.
     *
     *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The error
     *      shall be handled in a subsequent Node Refresh.
     *
     * D. For any entries in the GroupIDList with Status of CommitFailure:
     *
     *   I. A CommitFailure with an unrecoverable FailureCode shall be handled by removing the entry from the
     *      GroupIDList.
     *
     *   II. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a subsequent Node
     *       Refresh.
     *
     * ii. Check that each entry in Node’s Binding List occurs in the BindingList of the Endpoint Information Entry.
     *
     *   A. Add any missing entries to the BindingList of the Endpoint Information Entry.
     *
     *   B. For any entries in the BindingList with Status of Pending:
     *
     *     I. Add the corresponding change to the Node’s Binding List.
     *
     *       1. If successful, mark the Status to Committed.
     *
     *       2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
     *          error shall be handled in a subsequent Node Refresh.
     *
     *   C. For any entries in the BindingList with Status of DeletePending:
     *
     *     1. If successful, remove the corresponding entry from the Node’s BindingList.
     *
     *     2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The error
     *        shall be handled in a subsequent Node Refresh.
     *
     *   D. For any entries in the BindingList with Status of CommitFailure:
     *
     *     I. A CommitFailure with an unrecoverable FailureCode shall be handled by removing the entry from the
     *        BindingList.
     *
     *     II. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a subsequent Node
     *         Refresh.
     *
     * 4. Ensure the GroupKeySetList for the Node Information Entry with the given NodeID matches the Group Keys on the
     * given Node. This involves the following steps:
     *
     *   a. Read the Group Keys from the Node.
     *
     *   b. For each GroupKeySetEntry in the GroupKeySetList of the Node Information Entry with a Pending Status:
     *
     *     i. Add the corresponding DatastoreGroupKeySetStruct to the Node’s Group Key list.
     *
     *       A. If successful, mark the Status to Committed.
     *
     *       B. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
     *          error shall be handled in a subsequent Node Refresh.
     *
     *   c. For each GroupKeySetEntry in the GroupKeySetList of the Node Information Entry with a CommitFailure Status:
     *
     *     i. A CommitFailure with an unrecoverable FailureCode shall be handled by removing the entry from the
     *        GroupKeySetList.
     *
     *     ii. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a subsequent Node
     *         Refresh.
     *
     *   d. All remaining entries in the GroupKeySetList should be replaced by the remaining entries on the Node.
     *
     * 5. Ensure the ACLList for the Node Information Entry with the given NodeID matches the ACL attribute on the given
     * Node. This involves the following steps:
     *
     *   a. Read the ACL attribute on the Node.
     *
     *   b. For each DatastoreACLEntryStruct in the ACLList of the Node Information Entry with a Pending Status:
     *
     *     i. Add the corresponding DatastoreACLEntryStruct to the Node’s ACL attribute.
     *
     *       A. If successful, mark the Status to Committed.
     *
     *       B. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
     *          error shall be handled in a subsequent Node Refresh.
     *
     *   c. For each DatastoreACLEntryStruct in the ACLList of the Node Information Entry with a CommitFailure Status:
     *
     *     i. A CommitFailure with an unrecoverable FailureCode (i.e. RESOURCE_EXHAUSTED, CONSTRAINT_ERROR) shall be
     *        handled by removing the entry from the ACLList.
     *
     *     ii. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a subsequent Node
     *         Refresh.
     *
     *   d. All remaining entries in the ACLList should be replaced by the remaining entries on the Node.
     *
     * 6. Update the CommissioningStatusEntry for the Node Information Entry to Committed.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.11
     */
    export declare class RefreshNodeRequest {
        constructor(values?: Partial<RefreshNodeRequest>);
        nodeId: NodeId;
    };

    /**
     * The command shall be used to update the friendly name for a node in the Joint Fabric Datastore Cluster of the
     * accessing fabric.
     *
     * NodeID represents the node to be updated in the Joint Fabric Datastore Cluster.
     *
     * If a Node Information Entry does not exist for the given NodeID, this command shall return NOT_FOUND.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.12
     */
    export declare class UpdateNodeRequest {
        constructor(values?: Partial<UpdateNodeRequest>);
        nodeId: NodeId;
        friendlyName: string;
    };

    /**
     * This command shall be used to remove a node from the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * NodeID represents the unique identifier for the node to be removed from the Joint Fabric Datastore Cluster.
     *
     * If a Node Information Entry does not exist for the given NodeID, this command shall return NOT_FOUND.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.13
     */
    export declare class RemoveNodeRequest {
        constructor(values?: Partial<RemoveNodeRequest>);
        nodeId: NodeId;
    };

    /**
     * This command shall be used to update the state of an endpoint for a node in the Joint Fabric Datastore Cluster of
     * the accessing fabric.
     *
     * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore Cluster.
     *
     * NodeID represents the unique identifier for the node to which the endpoint belongs.
     *
     * If an Endpoint Information Entry does not exist for the given NodeID and EndpointID, this command shall return
     * NOT_FOUND.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.14
     */
    export declare class UpdateEndpointForNodeRequest {
        constructor(values?: Partial<UpdateEndpointForNodeRequest>);
        endpointId: EndpointNumber;
        nodeId: NodeId;
        friendlyName: string;
    };

    /**
     * This command shall be used to add a Group ID to an endpoint for a node in the Joint Fabric Datastore Cluster of
     * the accessing fabric.
     *
     * GroupID represents the unique identifier for the group to be added to the endpoint.
     *
     * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore Cluster.
     *
     * NodeID represents the unique identifier for the node to which the endpoint belongs.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. Confirm that an Endpoint Information Entry exists for the given NodeID and EndpointID, and if not, return
     *      NOT_FOUND.
     *
     *   2. Ensure the Group Key List for the Node Information Entry with the given NodeID includes the KeySet for the
     *      given Group ID. If it does not:
     *
     *     a. Add an entry for the KeySet of the given Group ID to the Group Key List for the Node. The new entry’s
     *        status shall be set to Pending.
     *
     *     b. Add a Group Key Entry for this KeySet to the given Node ID.
     *
     *       i. If this succeeds, update the new KeySet entry in the Datastore to Committed.
     *
     *       ii. If not successful, the pending change shall be applied in a subsequent Node Refresh.
     *
     *   3. Ensure the Group List for the Endpoint Information Entry with the given NodeID and EndpointID includes an
     *      entry for the given Group. If it does not:
     *
     *     a. Add a Group entry for the given Group ID to the Group List for the Endpoint and Node. The new entry’s
     *        status shall be set to Pending.
     *
     *     b. Add this Group entry to the given Endpoint ID on the given Node ID.
     *
     *       i. If this succeeds, update the new Group entry in the Datastore to Committed.
     *
     *       ii. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
     *           error shall be handled in a subsequent Node Refresh.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.15
     */
    export declare class AddGroupIdToEndpointForNodeRequest {
        constructor(values?: Partial<AddGroupIdToEndpointForNodeRequest>);
        nodeId: NodeId;
        endpointId: EndpointNumber;
        groupId: GroupId;
    };

    /**
     * This command shall be used to remove a Group ID from an endpoint for a node in the Joint Fabric Datastore Cluster
     * of the accessing fabric.
     *
     * GroupID represents the unique identifier for the group to be removed from the endpoint.
     *
     * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore Cluster.
     *
     * NodeID represents the unique identifier for the node to which the endpoint belongs.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. Confirm that an Endpoint Information Entry exists for the given NodeID and EndpointID, and if not, return
     *      NOT_FOUND.
     *
     *   2. Ensure the Group List for the Endpoint Information Entry with the given NodeID and EndpointID does not
     *      include an entry for the given Group. If it does:
     *
     *     a. Update the status to DeletePending of the Group entry for the given Group ID in the Group List.
     *
     *     b. Remove this Group entry for the given Endpoint ID on the given Node ID.
     *
     *       i. If this succeeds, remove the Group entry for the given Group ID in the Group List for this NodeID and
     *          EndpointID in the Datastore.
     *
     *       ii. If not successful, the pending change shall be applied in a subsequent Node Refresh.
     *
     *   3. Ensure the Group Key List for the Node Information Entry with the given NodeID does not include the KeySet
     *      for the given Group ID. If it does:
     *
     *     a. Update the status to DeletePending for the entry for the KeySet of the given Group ID in the Node Group
     *        Key List.
     *
     *     b. Remove the Group Key Entry for this KeySet from the given Node ID.
     *
     *       i. If this succeeds, remove the KeySet entry for the given Node ID.
     *
     *       ii. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
     *           error shall be handled in a subsequent Node Refresh.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.16
     */
    export declare class RemoveGroupIdFromEndpointForNodeRequest {
        constructor(values?: Partial<RemoveGroupIdFromEndpointForNodeRequest>);
        nodeId: NodeId;
        endpointId: EndpointNumber;
        groupId: GroupId;
    };

    /**
     * This command shall be used to add a binding to an endpoint for a node in the Joint Fabric Datastore Cluster of
     * the accessing fabric.
     *
     * Binding represents the binding to be added to the endpoint.
     *
     * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore Cluster.
     *
     * NodeID represents the unique identifier for the node to which the endpoint belongs.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. Confirm that an Endpoint Information Entry exists for the given NodeID and EndpointID, and if not, return
     *      NOT_FOUND.
     *
     *   2. Ensure the Binding List for the Node Information Entry with the given NodeID includes the given Binding. If
     *      it does not:
     *
     *     a. Add the Binding to the Binding List for the Node Information Entry for the given NodeID. The new entry’s
     *        status shall be set to Pending.
     *
     *     b. Add this Binding to the given Node ID.
     *
     *       i. If this succeeds, update the new Binding in the Datastore to Committed.
     *
     *       ii. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
     *           error shall be handled in a subsequent Node Refresh.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.17
     */
    export declare class AddBindingToEndpointForNodeRequest {
        constructor(values?: Partial<AddBindingToEndpointForNodeRequest>);
        nodeId: NodeId;
        endpointId: EndpointNumber;
        binding: DatastoreBindingTarget;
    };

    /**
     * This command shall be used to remove a binding from an endpoint for a node in the Joint Fabric Datastore Cluster
     * of the accessing fabric.
     *
     * ListID represents the unique identifier for the binding entry in the Datastore’s EndpointBindingList attribute to
     * be removed from the endpoint.
     *
     * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore Cluster.
     *
     * NodeID represents the unique identifier for the node to which the endpoint belongs.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. Confirm that an Endpoint Information Entry exists for the given NodeID and EndpointID, and if not, return
     *      NOT_FOUND.
     *
     *   2. Ensure the Binding List for the Node Information Entry with the given NodeID does not include an entry with
     *      the given ListID. If it does:
     *
     *     a. Update the status to DeletePending for the given Binding in the Binding List.
     *
     *     b. Remove this Binding from the given Node ID.
     *
     *       i. If this succeeds, remove the given Binding from the Binding List.
     *
     *       ii. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
     *           error shall be handled in a subsequent Node Refresh.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.18
     */
    export declare class RemoveBindingFromEndpointForNodeRequest {
        constructor(values?: Partial<RemoveBindingFromEndpointForNodeRequest>);
        listId: number;
        endpointId: EndpointNumber;
        nodeId: NodeId;
    };

    /**
     * This command shall be used to add an ACL to a node in the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * NodeID represents the unique identifier for the node to which the ACL is to be added.
     *
     * ACLEntry represents the ACL to be added to the Joint Fabric Datastore Cluster.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. Confirm that a Node Information Entry exists for the given NodeID, and if not, return NOT_FOUND.
     *
     *   2. Ensure the ACL List for the given NodeID includes the given ACLEntry. If it does not:
     *
     *     a. Add the ACLEntry to the ACL List for the given NodeID. The new entry’s status shall be set to Pending.
     *
     *     b. Add this ACLEntry to the given Node ID.
     *
     *       i. If this succeeds, update the new ACLEntry in the Datastore to Committed.
     *
     *       ii. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
     *           error shall be handled in a subsequent Node Refresh.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.19
     */
    export declare class AddAclToNodeRequest {
        constructor(values?: Partial<AddAclToNodeRequest>);
        nodeId: NodeId;
        aclEntry: DatastoreAccessControlEntry;
    };

    /**
     * This command shall be used to remove an ACL from a node in the Joint Fabric Datastore Cluster of the accessing
     * fabric.
     *
     * ListID represents the unique identifier for the DatastoreACLEntryStruct to be removed from the Datastore’s list
     * of DatastoreACLEntry.
     *
     * NodeID represents the unique identifier for the node from which the ACL is to be removed.
     *
     * Upon receipt of this command, the Datastore shall:
     *
     *   1. Confirm that a Node Information Entry exists for the given NodeID, and if not, return NOT_FOUND.
     *
     *   2. Ensure the ACL List for the given NodeID does not include the given ACLEntry. If it does:
     *
     *     a. Update the status to DeletePending for the given ACLEntry in the ACL List.
     *
     *     b. Remove this ACLEntry from the given Node ID.
     *
     *       i. If this succeeds, remove the given ACLEntry from the Node ACL List.
     *
     *       ii. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
     *           error shall be handled in a subsequent Node Refresh.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.7.20
     */
    export declare class RemoveAclFromNodeRequest {
        constructor(values?: Partial<RemoveAclFromNodeRequest>);
        listId: number;
        nodeId: NodeId;
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.1
     */
    export enum DatastoreState {
        /**
         * Target device operation is pending
         */
        Pending = 0,

        /**
         * Target device operation has been committed
         */
        Committed = 1,

        /**
         * Target device delete operation is pending
         */
        DeletePending = 2,

        /**
         * Target device operation has failed
         */
        CommitFailed = 3
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.4
     */
    export enum DatastoreAccessControlEntryPrivilege {
        /**
         * Can read and observe all (except Access Control Cluster)
         */
        View = 1,

        /**
         * @deprecated
         */
        ProxyView = 2,

        /**
         * View privileges, and can perform the primary function of this Node (except Access Control Cluster)
         */
        Operate = 3,

        /**
         * Operate privileges, and can modify persistent configuration of this Node (except Access Control Cluster)
         */
        Manage = 4,

        /**
         * Manage privileges, and can observe and modify the Access Control Cluster
         */
        Administer = 5
    }

    /**
     * The DatastoreBindingTargetStruct represents a Binding on a specific Node (identified by the
     * DatastoreEndpointBindingEntryStruct) which is managed by the Datastore. Only bindings on a specific Node that are
     * fabric-scoped to the Joint Fabric are managed by the Datastore. As a result, references to nodes and groups are
     * specific to the Joint Fabric.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.6
     */
    export declare class DatastoreBindingTarget {
        constructor(values?: Partial<DatastoreBindingTarget>);

        /**
         * This field is the binding’s remote target node ID. If the Endpoint field is present, this field shall be
         * present.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.6.1
         */
        node?: NodeId;

        /**
         * This field is the binding’s target group ID that represents remote endpoints. If the Endpoint field is
         * present, this field shall NOT be present.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.6.2
         */
        group?: GroupId;

        /**
         * This field is the binding’s remote endpoint that the local endpoint is bound to. If the Group field is
         * present, this field shall NOT be present.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.6.3
         */
        endpoint?: EndpointNumber;

        /**
         * This field is the binding’s cluster ID (client & server) on the local and target endpoint(s). If this field
         * is present, the client cluster shall also exist on this endpoint (with this Binding cluster). If this field
         * is present, the target shall be this cluster on the target endpoint(s).
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.5.6.4
         */
        cluster?: ClusterId;
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.10
     */
    export enum DatastoreAccessControlEntryAuthMode {
        /**
         * Passcode authenticated session
         */
        Pase = 1,

        /**
         * Certificate authenticated session
         */
        Case = 2,

        /**
         * Group authenticated session
         */
        Group = 3
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.11
     */
    export declare class DatastoreAccessControlTarget {
        constructor(values?: Partial<DatastoreAccessControlTarget>);
        cluster: ClusterId | null;
        endpoint: EndpointNumber | null;
        deviceType: DeviceTypeId | null;
    };

    /**
     * The DatastoreAccessControlEntryStruct represents an ACL on a specific Node (identified by the
     * DatastoreACLEntryStruct) which is managed by the Datastore. Only ACLs on a specific Node that are fabric-scoped
     * to the Joint Fabric are managed by the Datastore. As a result, references to nodes and groups are specific to the
     * Joint Fabric.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.12
     */
    export declare class DatastoreAccessControlEntry {
        constructor(values?: Partial<DatastoreAccessControlEntry>);
        privilege: DatastoreAccessControlEntryPrivilege;
        authMode: DatastoreAccessControlEntryAuthMode;
        subjects: SubjectId[] | null;
        targets: DatastoreAccessControlTarget[] | null;
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.16
     */
    export enum DatastoreGroupKeySecurityPolicy {
        /**
         * Message counter synchronization using trust-first
         */
        TrustFirst = 0
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.24.5.17
     */
    export enum DatastoreGroupKeyMulticastPolicy {
        /**
         * Indicates filtering of multicast messages for a specific Group ID
         */
        PerGroupId = 0,

        /**
         * Indicates not filtering of multicast messages
         */
        AllNodes = 1
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
     * @deprecated Use {@link JointFabricDatastore}.
     */
    export const Cluster: typeof JointFabricDatastore;

    /**
     * @deprecated Use {@link JointFabricDatastore}.
     */
    export const Complete: typeof JointFabricDatastore;

    export const Typing: JointFabricDatastore;
}

/**
 * @deprecated Use {@link JointFabricDatastore}.
 */
export declare const JointFabricDatastoreCluster: typeof JointFabricDatastore;

export interface JointFabricDatastore extends ClusterTyping {
    Attributes: JointFabricDatastore.Attributes;
    Commands: JointFabricDatastore.Commands;
    Components: JointFabricDatastore.Components;
}
