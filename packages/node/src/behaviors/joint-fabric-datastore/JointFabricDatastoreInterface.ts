/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { JointFabricDatastore } from "#clusters/joint-fabric-datastore";

export namespace JointFabricDatastoreInterface {
    export interface Base {
        /**
         * This command shall be used to add a KeySet to the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * GroupKeySet represents the KeySet to be added to the Joint Fabric Datastore Cluster. Upon receipt of this
         * command, the Datastore shall:
         *
         *   1. Ensure there are no KeySets in the KeySetList attribute with the given GroupKeySetID.
         *
         *   2. If a match is found, return CONSTRAINT_ERROR.
         *
         *   3. Add the Epoch Key Entry for the KeySet to the KeySetList attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.1
         */
        addKeySet(request: JointFabricDatastore.AddKeySetRequest): MaybePromise;

        /**
         * This command shall be used to update a KeySet in the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * GroupKeySet represents the KeySet to be updated in the Joint Fabric Datastore Cluster. Upon receipt of this
         * command, the Datastore shall:
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
        updateKeySet(request: JointFabricDatastore.UpdateKeySetRequest): MaybePromise;

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
        removeKeySet(request: JointFabricDatastore.RemoveKeySetRequest): MaybePromise;

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
        addGroup(request: JointFabricDatastore.AddGroupRequest): MaybePromise;

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
         *       1. Update the GroupIDList Entry in the Datastore with the new values and Status
         *
         * ### Pending
         *
         * 2. Update the Groups on the given Node with the new values.
         *
         *   1. If the update succeeds, set the Status to Committed on the GroupIDList Entry in the Datastore.
         *
         *   2. If not successful, the pending change shall be applied in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.5
         */
        updateGroup(request: JointFabricDatastore.UpdateGroupRequest): MaybePromise;

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
        removeGroup(request: JointFabricDatastore.RemoveGroupRequest): MaybePromise;

        /**
         * This command shall be used to add an admin to the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * NodeID, FriendlyName, VendorID and ICAC represent the admin to be added to the Joint Fabric Datastore
         * Cluster.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.7
         */
        addAdmin(request: JointFabricDatastore.AddAdminRequest): MaybePromise;

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
        updateAdmin(request: JointFabricDatastore.UpdateAdminRequest): MaybePromise;

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
        removeAdmin(request: JointFabricDatastore.RemoveAdminRequest): MaybePromise;

        /**
         * The command shall be used to add a node to the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * NodeID represents the node to be added to the Joint Fabric Datastore Cluster. Upon receipt of this command,
         * the Datastore shall:
         *
         *   1. Update CommissioningStatusEntry of the Node Information Entry with the given NodeID to Pending.
         *
         * If a Node Information Entry exists for the given NodeID, this command shall return INVALID_CONSTRAINT.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.10
         */
        addPendingNode(request: JointFabricDatastore.AddPendingNodeRequest): MaybePromise;

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
        refreshNode(request: JointFabricDatastore.RefreshNodeRequest): MaybePromise;

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
        updateNode(request: JointFabricDatastore.UpdateNodeRequest): MaybePromise;

        /**
         * This command shall be used to remove a node from the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * NodeID represents the unique identifier for the node to be removed from the Joint Fabric Datastore Cluster.
         *
         * If a Node Information Entry does not exist for the given NodeID, this command shall return NOT_FOUND.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.24.7.13
         */
        removeNode(request: JointFabricDatastore.RemoveNodeRequest): MaybePromise;

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
        updateEndpointForNode(request: JointFabricDatastore.UpdateEndpointForNodeRequest): MaybePromise;

        /**
         * This command shall be used to add a Group ID to an endpoint for a node in the Joint Fabric Datastore Cluster
         * of the accessing fabric.
         *
         * GroupID represents the unique identifier for the group to be added to the endpoint.
         *
         * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * NodeID represents the unique identifier for the node to which the endpoint belongs. Upon receipt of this
         * command, the Datastore shall:
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
        addGroupIdToEndpointForNode(request: JointFabricDatastore.AddGroupIdToEndpointForNodeRequest): MaybePromise;

        /**
         * This command shall be used to remove a Group ID from an endpoint for a node in the Joint Fabric Datastore
         * Cluster of the accessing fabric.
         *
         * GroupID represents the unique identifier for the group to be removed from the endpoint.
         *
         * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * NodeID represents the unique identifier for the node to which the endpoint belongs. Upon receipt of this
         * command, the Datastore shall:
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
        removeGroupIdFromEndpointForNode(request: JointFabricDatastore.RemoveGroupIdFromEndpointForNodeRequest): MaybePromise;

        /**
         * This command shall be used to add a binding to an endpoint for a node in the Joint Fabric Datastore Cluster
         * of the accessing fabric.
         *
         * Binding represents the binding to be added to the endpoint.
         *
         * EndpointID represents the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * NodeID represents the unique identifier for the node to which the endpoint belongs. Upon receipt of this
         * command, the Datastore shall:
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
        addBindingToEndpointForNode(request: JointFabricDatastore.AddBindingToEndpointForNodeRequest): MaybePromise;

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
         * NodeID represents the unique identifier for the node to which the endpoint belongs. Upon receipt of this
         * command, the Datastore shall:
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
        removeBindingFromEndpointForNode(request: JointFabricDatastore.RemoveBindingFromEndpointForNodeRequest): MaybePromise;

        /**
         * This command shall be used to add an ACL to a node in the Joint Fabric Datastore Cluster of the accessing
         * fabric.
         *
         * NodeID represents the unique identifier for the node to which the ACL is to be added. ACLEntry represents the
         * ACL to be added to the Joint Fabric Datastore Cluster.
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
        addAclToNode(request: JointFabricDatastore.AddAclToNodeRequest): MaybePromise;

        /**
         * This command shall be used to remove an ACL from a node in the Joint Fabric Datastore Cluster of the
         * accessing fabric.
         *
         * ListID represents the unique identifier for the DatastoreACLEntryStruct to be removed from the Datastore’s
         * list of DatastoreACLEntry.
         *
         * NodeID represents the unique identifier for the node from which the ACL is to be removed. Upon receipt of
         * this command, the Datastore shall:
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
        removeAclFromNode(request: JointFabricDatastore.RemoveAclFromNodeRequest): MaybePromise;
    }
}

export type JointFabricDatastoreInterface = { components: [{ flags: {}, methods: JointFabricDatastoreInterface.Base }] };
