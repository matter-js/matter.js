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
 * @see {@link MatterSpecification.v16.Core} § 11.24
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
     * The cluster revision assigned by {@link MatterSpecification.v16.Cluster}.
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
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.1
         */
        anchorRootCa: Bytes;

        /**
         * This shall indicate the Node identifier of the Joint Fabric Anchor Root CA for the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.2
         */
        anchorNodeId: NodeId;

        /**
         * This shall indicate the Vendor identifier of the Joint Fabric Anchor Root CA for the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.3
         */
        anchorVendorId: VendorId;

        /**
         * Friendly name for the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.4
         */
        friendlyName: string;

        /**
         * This shall indicate the list of DatastoreGroupKeySetStruct used in the Joint Fabric for the accessing fabric.
         *
         * This attribute shall contain at least one entry, the IPK, which has GroupKeySetID of 0.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.5
         */
        groupKeySetList: DatastoreGroupKeySet[];

        /**
         * This shall indicate the list of groups in the Joint Fabric for the accessing fabric.
         *
         * This list shall include, at a minimum, one group with GroupCAT value set to Administrator CAT and one group
         * with GroupCAT value set to Anchor CAT.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.6
         */
        groupList: DatastoreGroupInformationEntry[];

        /**
         * This shall indicate the list of nodes in the Joint Fabric for the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.7
         */
        nodeList: DatastoreNodeInformationEntry[];

        /**
         * This shall indicate the list of administrators in the Joint Fabric for the accessing fabric.
         *
         * Only one Administrator may serve as the Anchor Root CA and Anchor Fabric Administrator and shall have index
         * value 0. All other Joint Fabric Administrators shall be referenced at index 1 or greater.
         *
         * An empty list indicates that the Joint Fabric is not yet formed.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.8
         */
        adminList: DatastoreAdministratorInformationEntry[];

        /**
         * This shall indicate the current state of the Joint Fabric Datastore Cluster for the accessing fabric.
         *
         * The value shall be one of the following states:
         *
         *   - Committed - indicates the DataStore is ready for use.
         *
         *   - Pending - indicates that the DataStore is not yet ready for use.
         *
         *   - DeletePending - indicates that the DataStore is in the process of being transferred to another Joint
         *     Fabric Anchor Administrator.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.9
         */
        status: DatastoreStatusEntry;

        /**
         * This shall indicate the group membership of endpoints in the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.10
         */
        endpointGroupIdList: DatastoreEndpointGroupIdEntry[];

        /**
         * This shall indicate the binding list for endpoints in the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.11
         */
        endpointBindingList: DatastoreEndpointBindingEntry[];

        /**
         * This shall indicate the KeySet entries for nodes in the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.12
         */
        nodeKeySetList: DatastoreNodeKeySetEntry[];

        /**
         * This shall indicate the ACL entries for nodes in the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.13
         */
        nodeAclList: DatastoreAclEntry[];

        /**
         * This shall indicate the Endpoint entries for nodes in the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.14
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
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.1
         */
        anchorRootCa: Bytes;

        /**
         * This shall indicate the Node identifier of the Joint Fabric Anchor Root CA for the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.2
         */
        anchorNodeId: NodeId;

        /**
         * This shall indicate the Vendor identifier of the Joint Fabric Anchor Root CA for the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.3
         */
        anchorVendorId: VendorId;

        /**
         * Friendly name for the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.4
         */
        friendlyName: string;

        /**
         * This shall indicate the list of DatastoreGroupKeySetStruct used in the Joint Fabric for the accessing fabric.
         *
         * This attribute shall contain at least one entry, the IPK, which has GroupKeySetID of 0.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.5
         */
        groupKeySetList: DatastoreGroupKeySet[];

        /**
         * This shall indicate the list of groups in the Joint Fabric for the accessing fabric.
         *
         * This list shall include, at a minimum, one group with GroupCAT value set to Administrator CAT and one group
         * with GroupCAT value set to Anchor CAT.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.6
         */
        groupList: DatastoreGroupInformationEntry[];

        /**
         * This shall indicate the list of nodes in the Joint Fabric for the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.7
         */
        nodeList: DatastoreNodeInformationEntry[];

        /**
         * This shall indicate the list of administrators in the Joint Fabric for the accessing fabric.
         *
         * Only one Administrator may serve as the Anchor Root CA and Anchor Fabric Administrator and shall have index
         * value 0. All other Joint Fabric Administrators shall be referenced at index 1 or greater.
         *
         * An empty list indicates that the Joint Fabric is not yet formed.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.8
         */
        adminList: DatastoreAdministratorInformationEntry[];

        /**
         * This shall indicate the current state of the Joint Fabric Datastore Cluster for the accessing fabric.
         *
         * The value shall be one of the following states:
         *
         *   - Committed - indicates the DataStore is ready for use.
         *
         *   - Pending - indicates that the DataStore is not yet ready for use.
         *
         *   - DeletePending - indicates that the DataStore is in the process of being transferred to another Joint
         *     Fabric Anchor Administrator.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.9
         */
        status: DatastoreStatusEntry;

        /**
         * This shall indicate the group membership of endpoints in the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.10
         */
        endpointGroupIdList: DatastoreEndpointGroupIdEntry[];

        /**
         * This shall indicate the binding list for endpoints in the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.11
         */
        endpointBindingList: DatastoreEndpointBindingEntry[];

        /**
         * This shall indicate the KeySet entries for nodes in the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.12
         */
        nodeKeySetList: DatastoreNodeKeySetEntry[];

        /**
         * This shall indicate the ACL entries for nodes in the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.13
         */
        nodeAclList: DatastoreAclEntry[];

        /**
         * This shall indicate the Endpoint entries for nodes in the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.6.14
         */
        nodeEndpointList: DatastoreEndpointEntry[];
    }

    /**
     * {@link JointFabricDatastore} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Upon receipt, this shall add a KeySet to the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.1
         */
        addKeySet(request: AddKeySetRequest): MaybePromise;

        /**
         * Upon receipt, this shall update a KeySet in the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.2
         */
        updateKeySet(request: UpdateKeySetRequest): MaybePromise;

        /**
         * Upon receipt, this shall remove a KeySet from the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.3
         */
        removeKeySet(request: RemoveKeySetRequest): MaybePromise;

        /**
         * Upon receipt, this shall add a group to the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.4
         */
        addGroup(request: AddGroupRequest): MaybePromise;

        /**
         * Upon receipt, this shall update a group in the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.5
         */
        updateGroup(request: UpdateGroupRequest): MaybePromise;

        /**
         * Upon receipt, this shall remove a group from the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.6
         */
        removeGroup(request: RemoveGroupRequest): MaybePromise;

        /**
         * Upon receipt, this shall add an admin to the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.7
         */
        addAdmin(request: AddAdminRequest): MaybePromise;

        /**
         * Upon receipt, this shall update an admin entry in the AdminList attribute.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.8
         */
        updateAdmin(request: UpdateAdminRequest): MaybePromise;

        /**
         * Upon receipt, this shall remove an admin from the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.9
         */
        removeAdmin(request: RemoveAdminRequest): MaybePromise;

        /**
         * Upon receipt, this shall add a node to the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.10
         */
        addPendingNode(request: AddPendingNodeRequest): MaybePromise;

        /**
         * Upon receipt, this shall request that Datastore information relating to a Node of the accessing fabric is
         * refreshed.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.11
         */
        refreshNode(request: RefreshNodeRequest): MaybePromise;

        /**
         * Upon receipt, this shall update the friendly name for a node in the Joint Fabric Datastore Cluster of the
         * accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.12
         */
        updateNode(request: UpdateNodeRequest): MaybePromise;

        /**
         * Upon receipt, this shall remove a node from the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.13
         */
        removeNode(request: RemoveNodeRequest): MaybePromise;

        /**
         * Upon receipt, this shall update the state of an endpoint for a node in the Joint Fabric Datastore Cluster of
         * the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.14
         */
        updateEndpointForNode(request: UpdateEndpointForNodeRequest): MaybePromise;

        /**
         * Upon receipt, this shall add a Group ID to an endpoint for a node in the Joint Fabric Datastore Cluster of
         * the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.15
         */
        addGroupIdToEndpointForNode(request: AddGroupIdToEndpointForNodeRequest): MaybePromise;

        /**
         * Upon receipt, this shall remove a Group ID from an endpoint for a node in the Joint Fabric Datastore Cluster
         * of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.16
         */
        removeGroupIdFromEndpointForNode(request: RemoveGroupIdFromEndpointForNodeRequest): MaybePromise;

        /**
         * Upon receipt, this shall add a binding to an endpoint for a node in the Joint Fabric Datastore Cluster of the
         * accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.17
         */
        addBindingToEndpointForNode(request: AddBindingToEndpointForNodeRequest): MaybePromise;

        /**
         * Upon receipt, this shall remove a binding from an endpoint for a node in the Joint Fabric Datastore Cluster
         * of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.18
         */
        removeBindingFromEndpointForNode(request: RemoveBindingFromEndpointForNodeRequest): MaybePromise;

        /**
         * Upon receipt, this shall add an ACL to a node in the Joint Fabric Datastore Cluster of the accessing fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.19
         */
        addAclToNode(request: AddAclToNodeRequest): MaybePromise;

        /**
         * Upon receipt, this shall remove an ACL from a node in the Joint Fabric Datastore Cluster of the accessing
         * fabric.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.20
         */
        removeAclFromNode(request: RemoveAclFromNodeRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link JointFabricDatastore}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];

    /**
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.18
     */
    export class DatastoreGroupKeySet {
        constructor(values?: Partial<DatastoreGroupKeySet>);
        groupKeySetId: number;
        groupKeySecurityPolicy: DatastoreGroupKeySecurityPolicy;
        epochKey0: Bytes | null;
        epochStartTime0: number | bigint | null;
        epochKey1: Bytes | null;
        epochStartTime1: number | bigint | null;
        epochKey2: Bytes | null;
        epochStartTime2: number | bigint | null;

        /**
         * @deprecated
         */
        groupKeyMulticastPolicy?: DatastoreGroupKeyMulticastPolicy;
    }

    /**
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.5
     */
    export class DatastoreGroupInformationEntry {
        constructor(values?: Partial<DatastoreGroupInformationEntry>);

        /**
         * The unique identifier for the group.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.5.1
         */
        groupId: number | bigint;

        /**
         * The friendly name for the group.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.5.2
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
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.5.3
         */
        groupKeySetId: number | null;

        /**
         * CAT value for this group. This is used for control of individual members of a group (non-broadcast commands).
         *
         * Allowable values include the range 0x0000 to 0xEFFF, and the Administrator CAT and Anchor CAT values.
         *
         * This value may be null when unicast communication is not used for the group.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.5.4
         */
        groupCat: number | null;

        /**
         * Current version number for this CAT.
         *
         * This value shall be null when GroupCAT value is null.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.5.5
         */
        groupCatVersion: number | null;

        /**
         * The permission level associated with ACL entries for this group. There should be only one Administrator group
         * per fabric, and at most one Manage group per Ecosystem (Vendor Entry).
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.5.6
         */
        groupPermission: DatastoreAccessControlEntryPrivilege;
    }

    /**
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.14
     */
    export class DatastoreNodeInformationEntry {
        constructor(values?: Partial<DatastoreNodeInformationEntry>);

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.14.1
         */
        nodeId: NodeId;

        /**
         * This field shall contain a user-assigned label for this node, as captured by a Joint Fabric Administrator's
         * user interface. By maintaining this value in the Joint Fabric Datastore, all Joint Fabric Administrators can
         * keep these values synchronized. This value is not propagated to the node itself.
         *
         * Administrators may keep this field in sync with the NodeLabel field from the Basic Information or Bridged
         * Basic Information clusters.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.14.2
         */
        friendlyName: string;

        /**
         * Set to Pending prior to completing commissioning, set to Committed after commissioning complete is
         * successful, or set to CommitFailed if commissioning failed with the FailureCode Field set to the error.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.14.3
         */
        commissioningStatusEntry: DatastoreStatusEntry;
    }

    /**
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.15
     */
    export class DatastoreAdministratorInformationEntry {
        constructor(values?: Partial<DatastoreAdministratorInformationEntry>);

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.15.1
         */
        nodeId: NodeId;

        /**
         * Friendly name for this node which is not propagated to nodes.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.15.2
         */
        friendlyName: string;

        /**
         * The Vendor ID for the node.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.15.3
         */
        vendorId: VendorId;

        /**
         * The ICAC used to issue the NOC.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.15.4
         */
        icac: Bytes;
    }

    /**
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.2
     */
    export class DatastoreStatusEntry {
        constructor(values?: Partial<DatastoreStatusEntry>);

        /**
         * This field shall contain the current state of the target device operation.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.2.1
         */
        state: DatastoreState;

        /**
         * This field shall contain the timestamp of the last update.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.2.2
         */
        updateTimestamp: number;

        /**
         * This field shall contain the Status Code of the last failed operation where the State field is set to
         * CommitFailure.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.2.3
         */
        failureCode: Status;
    }

    /**
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.8
     */
    export class DatastoreEndpointGroupIdEntry {
        constructor(values?: Partial<DatastoreEndpointGroupIdEntry>);

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.8.1
         */
        nodeId: NodeId;

        /**
         * The unique identifier for the endpoint.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.8.2
         */
        endpointId: EndpointNumber;

        /**
         * The unique identifier for the group.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.8.3
         */
        groupId: GroupId;

        /**
         * Indicates whether entry in this list is pending, committed, delete-pending, or commit-failed.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.8.4
         */
        statusEntry: DatastoreStatusEntry;
    }

    /**
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.7
     */
    export class DatastoreEndpointBindingEntry {
        constructor(values?: Partial<DatastoreEndpointBindingEntry>);

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.7.1
         */
        nodeId: NodeId;

        /**
         * The unique identifier for the endpoint.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.7.2
         */
        endpointId: EndpointNumber;

        /**
         * The unique identifier for the entry in the Datastore's EndpointBindingList attribute, which is a list of
         * DatastoreEndpointBindingEntryStruct.
         *
         * This field is used to uniquely identify an entry in the EndpointBindingList attribute for the purpose of
         * deletion (RemoveBindingFromEndpointForNode Command).
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.7.3
         */
        listId: number;

        /**
         * The binding target structure.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.7.4
         */
        binding: DatastoreBindingTarget;

        /**
         * Indicates whether entry in this list is pending, committed, delete-pending, or commit-failed.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.7.5
         */
        statusEntry: DatastoreStatusEntry;
    }

    /**
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.3
     */
    export class DatastoreNodeKeySetEntry {
        constructor(values?: Partial<DatastoreNodeKeySetEntry>);

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.3.1
         */
        nodeId: NodeId;

        groupKeySetId: number;

        /**
         * Indicates whether entry in this list is pending, committed, delete-pending, or commit-failed.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.3.3
         */
        statusEntry: DatastoreStatusEntry;
    }

    /**
     * The DatastoreACLEntryStruct is a holder for an ACL (DatastoreAccessControlEntryStruct) on a specific Node which
     * is managed by the Datastore. Only ACLs on a specific Node that are fabric-scoped to the Joint Fabric are managed
     * by the Datastore. As a result, references to nodes and groups are specific to the Joint Fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.13
     */
    export class DatastoreAclEntry {
        constructor(values?: Partial<DatastoreAclEntry>);

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.13.1
         */
        nodeId: NodeId;

        /**
         * The unique identifier for the ACL entry in the Datastore's list of DatastoreACLEntry.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.13.2
         */
        listId: number;

        /**
         * The Access Control Entry structure.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.13.3
         */
        aclEntry: DatastoreAccessControlEntry;

        /**
         * Indicates whether entry in this list is pending, committed, delete-pending, or commit-failed.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.13.4
         */
        statusEntry: DatastoreStatusEntry;
    }

    /**
     * The DatastoreEndpointEntryStruct represents an Endpoint on a specific Node which is managed by the Datastore.
     * Only Nodes on the Joint Fabric are managed by the Datastore. As a result, references to NodeID are specific to
     * the Joint Fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.9
     */
    export class DatastoreEndpointEntry {
        constructor(values?: Partial<DatastoreEndpointEntry>);

        /**
         * The unique identifier for the endpoint.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.9.1
         */
        endpointId: EndpointNumber;

        /**
         * The unique identifier for the node.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.9.2
         */
        nodeId: NodeId;

        /**
         * This field shall indicate a user-assigned label for this endpoint, as captured by a Joint Fabric
         * Administrator's user interface. By maintaining this value in the Joint Fabric Datastore, all Joint Fabric
         * Administrators can keep these values synchronized. This is particularly useful for complex multi-application
         * endpoint devices (such as appliances) and for endpoints exposed via a Bridge, where individual endpoints
         * might have custom names assigned by the user. For basic devices, only the node-level FriendlyName might be
         * used.
         *
         * Administrators may keep this field in sync with the NodeLabel field from the Basic Information or Bridged
         * Basic Information clusters.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.9.3
         */
        friendlyName: string;
    }

    /**
     * Upon receipt, this shall add a KeySet to the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.1
     */
    export class AddKeySetRequest {
        constructor(values?: Partial<AddKeySetRequest>);

        /**
         * This field shall indicate the KeySet to be added to the Joint Fabric Datastore Cluster.
         *
         * The Datastore shall:
         *
         *   1. Ensure there are no KeySets in the KeySetList attribute with the given GroupKeySetID.
         *
         *   2. If a match is found, then this command shall fail with a CONSTRAINT_ERROR status code.
         *
         *   3. Add the Epoch Key Entry for the KeySet to the KeySetList attribute.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.1.1
         */
        groupKeySet: DatastoreGroupKeySet;
    }

    /**
     * Upon receipt, this shall update a KeySet in the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.2
     */
    export class UpdateKeySetRequest {
        constructor(values?: Partial<UpdateKeySetRequest>);

        /**
         * This field shall indicate the KeySet to be updated in the Joint Fabric Datastore Cluster.
         *
         * The Datastore shall:
         *
         *   1. Find the Epoch Key Entry for the KeySet in the KeySetList attribute with the given GroupKeySetID, and
         *      update any changed fields.
         *
         *   2. If entry is not found, then this command shall fail with a NOT_FOUND status code.
         *
         *   3. If any fields are changed as a result of this command:
         *
         *   1. Iterate through each DatastoreNodeInformationEntryStruct:
         *
         *   1. If the NodeKeySetList contains an entry with the given GroupKeySetID:
         *
         *   1. Update the Status on the given DatastoreNodeKeySetEntryStruct tp Pending.
         *
         *   2. Update the GroupKeySet on the given Node with the new values.
         *
         *   1. If successful, update the Status on this DatastoreNodeKeySetEntryStruct to Committed.
         *
         *   2. If not successful, update the State field of the StatusEntry on this DatastoreNodeKeySetEntryStruct to
         *      CommitFailed and FailureCode code to the returned error. The pending change shall be applied in a
         *      subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.2.1
         */
        groupKeySet: DatastoreGroupKeySet;
    }

    /**
     * Upon receipt, this shall remove a KeySet from the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.3
     */
    export class RemoveKeySetRequest {
        constructor(values?: Partial<RemoveKeySetRequest>);

        /**
         * This field shall indicate the unique identifier for the KeySet to be removed from the Joint Fabric Datastore
         * Cluster.
         *
         * Attempt to remove the IPK, which has GroupKeySetID of 0, shall fail with response CONSTRAINT_ERROR.
         *
         * The Datastore shall:
         *
         *   1. If entry is not found, then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Ensure there are no Nodes using this KeySet. To do this:
         *
         *   1. Iterate through each DatastoreNodeInformationEntryStruct:
         *
         *   1. If the NodeKeySetList list contains an entry with the given GroupKeySetID, and the entry does NOT have
         *      Status DeletePending, then this command shall fail with a CONSTRAINT_ERROR status code.
         *
         *   3. Remove the DatastoreGroupKeySetStruct for the given GroupKeySetID from the GroupKeySetList attribute.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.3.1
         */
        groupKeySetId: number;
    }

    /**
     * Upon receipt, this shall add a group to the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.4
     */
    export class AddGroupRequest {
        constructor(values?: Partial<AddGroupRequest>);

        /**
         * This field shall indicate the unique identifier for the group to be added to the Joint Fabric Datastore
         * Cluster.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.4.1
         */
        groupId: GroupId;

        /**
         * This field shall indicate the friendly name for the group.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.4.2
         */
        friendlyName: string;

        /**
         * This field shall indicate the unique identifier for the group key set.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.4.3
         */
        groupKeySetId: number | null;

        /**
         * This field shall indicate the CAT value for this group.
         *
         * GroupCAT values shall fall within the range 1 to 65534. Attempts to add a group with a GroupCAT value of
         * Administrator CAT or Anchor CAT shall fail with CONSTRAINT_ERROR.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.4.4
         */
        groupCat: number | null;

        /**
         * This field shall indicate the current version number for this CAT.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.4.5
         */
        groupCatVersion: number | null;

        /**
         * This field shall indicate the permission level associated with ACL entries for this group.
         *
         * The Datastore shall:
         *
         *   1. Ensure there are no Groups in the GroupList attribute with the given GroupID. If a match is found, then
         *      this command shall fail with a CONSTRAINT_ERROR status code.
         *
         *   2. Add the DatastoreGroupInformationEntryStruct for the Group with the given GroupID to the GroupList
         *      attribute.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.4.6
         */
        groupPermission: DatastoreAccessControlEntryPrivilege;
    }

    /**
     * Upon receipt, this shall update a group in the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.5
     */
    export class UpdateGroupRequest {
        constructor(values?: Partial<UpdateGroupRequest>);

        /**
         * This field shall indicate the group to be updated in the Joint Fabric Datastore Cluster.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.5.1
         */
        groupId: GroupId;

        /**
         * This field shall indicate the friendly name for the group. NULL values will be ignored (not updated).
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.5.2
         */
        friendlyName: string | null;

        /**
         * This field shall indicate the unique identifier for the group key set. NULL values will be ignored (not
         * updated).
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.5.3
         */
        groupKeySetId: number | null;

        /**
         * This field shall indicate the CAT value for this group. NULL values will be ignored (not updated).
         *
         * GroupCAT values shall fall within the range 1 to 65534. Attempts to update the GroupCAT on an existing group
         * which has a GroupCAT value of Administrator CAT or Anchor CAT shall fail with CONSTRAINT_ERROR.
         *
         * Attempts to set the GroupCAT to Administrator CAT or Anchor CAT shall fail with CONSTRAINT_ERROR.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.5.4
         */
        groupCat: number | null;

        /**
         * This field shall indicate the current version number for this CAT. NULL values will be ignored (not updated).
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.5.5
         */
        groupCatVersion: number | null;

        /**
         * This field shall indicate the permission level associated with ACL entries for this group. NULL values will
         * be ignored (not updated).
         *
         * The Datastore shall:
         *
         *   1. If entry is not found, then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Update the DatastoreGroupInformationEntryStruct for the Group with the given GroupID to match the
         *      non-NULL fields passed in.
         *
         *   3. If any fields are changed as a result of this command:
         *
         *   1. Iterate through each DatastoreNodeInformationEntryStruct:
         *
         *   1. If the GroupKeySetID changed:
         *
         *   1. Add a DatastoreNodeKeySetEntryStruct with the new GroupKeySetID, and Status set to Pending.
         *
         *   2. Add this KeySet to the Node.
         *
         *   1. If successful, Set the Status to Committed for this entry in the NodeKeySetList.
         *
         *   2. If not successful, Set the Status to CommitFailed and the FailureCode to the returned error. The pending
         *      change shall be applied in a subsequent Node Refresh.
         *
         *   1. If the NodeKeySetList list contains an entry with the previous GroupKeySetID:
         *
         *   3. Set the Status set to DeletePending.
         *
         *   4. Remove this KeySet from the Node.
         *
         *   1. If successful, Remove this entry from the NodeKeySetList.
         *
         *   2. If not successful, the pending change shall be applied in a subsequent Node Refresh.
         *
         *   2. If the GroupCAT, GroupCATVersion or GroupPermission changed:
         *
         *   1. If the ACLList contains an entry for this Group, update the ACL List Entry in the Datastore with the new
         *      values and Status Pending, update the ACL attribute on the given Node with the new values. If the update
         *      succeeds, set the Status to Committed on the ACLList Entry in the Datastore.
         *
         *   3. If the FriendlyName changed:
         *
         *   1. Iterate through each DatastoreEndpointGroupIDEntryStruct in the EndpointGroupIDList attribute:
         *
         *   1. If the DatastoreEndpointGroupIDEntryStruct contains an entry with the given GroupID:
         *
         *   1. Update the DatastoreEndpointGroupIDEntryStruct Entry in the Datastore with the new values and Status
         *      Pending
         *
         *   2. Update the Groups on the given Node with the new values.
         *
         *   1. If the update succeeds, set the Status to Committed on the GroupIDList Entry in the Datastore.
         *
         *   2. If not successful, the pending change shall be applied in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.5.6
         */
        groupPermission: DatastoreAccessControlEntryPrivilege | null;
    }

    /**
     * Upon receipt, this shall remove a group from the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.6
     */
    export class RemoveGroupRequest {
        constructor(values?: Partial<RemoveGroupRequest>);

        /**
         * This field shall indicate the unique identifier for the group to be removed from the Joint Fabric Datastore
         * Cluster.
         *
         * Attempts to remove a group with GroupCAT value set to Administrator CAT or Anchor CAT shall fail with
         * CONSTRAINT_ERROR.
         *
         * The Datastore shall:
         *
         *   1. If entry is not found, then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Ensure there are no Nodes in this group. To do this:
         *
         *   1. Iterate through each DatastoreNodeInformationEntryStruct:
         *
         *   1. If the GroupIDList contains an entry with the given GroupID, and the entry does NOT have Status
         *      DeletePending, then this command shall fail with a CONSTRAINT_ERROR status code.
         *
         *   3. Remove the DatastoreGroupInformationEntryStruct for the Group with the given GroupID from the GroupList
         *      attribute.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.6.1
         */
        groupId: GroupId;
    }

    /**
     * Upon receipt, this shall add an admin to the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.7
     */
    export class AddAdminRequest {
        constructor(values?: Partial<AddAdminRequest>);

        /**
         * This field shall indicate the unique identifier for the admin node.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.7.1
         */
        nodeId: NodeId;

        /**
         * This field shall indicate the friendly name for the admin node.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.7.2
         */
        friendlyName: string;

        /**
         * This field shall indicate the Vendor ID for the admin node.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.7.3
         */
        vendorId: VendorId;

        /**
         * This field shall indicate the ICAC used to issue the NOC.
         *
         * The Datastore shall:
         *
         *   1. Ensure there are no Admins in the AdminList attribute with the given NodeID. If a match is found, then
         *      this command shall fail with a CONSTRAINT_ERROR status code.
         *
         *   2. Add the DatastoreAdministratorInformationEntryStruct for the Admin with the given NodeID to the
         *      AdminList attribute.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.7.4
         */
        icac: Bytes;
    }

    /**
     * Upon receipt, this shall update an admin entry in the AdminList attribute.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.8
     */
    export class UpdateAdminRequest {
        constructor(values?: Partial<UpdateAdminRequest>);

        /**
         * This field shall indicate the admin to be updated in the Joint Fabric Datastore Cluster.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.8.1
         */
        nodeId: NodeId;

        /**
         * This field shall indicate the friendly name for the admin node.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.8.2
         */
        friendlyName?: string;

        /**
         * This field shall indicate the ICAC used to issue the NOC.
         *
         * The Datastore shall:
         *
         *   1. Find the entry in the AdminList attribute with the given NodeID, and update any changed fields.
         *
         *   2. If entry is not found, then this command shall fail with a NOT_FOUND status code.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.8.3
         */
        icac?: Bytes;
    }

    /**
     * Upon receipt, this shall remove an admin from the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.9
     */
    export class RemoveAdminRequest {
        constructor(values?: Partial<RemoveAdminRequest>);

        /**
         * This field shall indicate the unique identifier for the admin to be removed from the Joint Fabric Datastore
         * Cluster.
         *
         * The Datastore shall:
         *
         *   1. If an entry in the AdminList attribute with the given NodeID is not found, then this command shall fail
         *      with a NOT_FOUND status code.
         *
         *   2. Remove the DatastoreAdministratorInformationEntryStruct for the Admin with the given NodeID from the
         *      AdminList attribute.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.9.1
         */
        nodeId: NodeId;
    }

    /**
     * Upon receipt, this shall add a node to the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.10
     */
    export class AddPendingNodeRequest {
        constructor(values?: Partial<AddPendingNodeRequest>);

        /**
         * This field shall indicate the node to be added to the Joint Fabric Datastore Cluster.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.10.1
         */
        nodeId: NodeId;

        /**
         * This field shall indicate the friendly name for the node.
         *
         * If a DatastoreNodeInformationEntryStruct exists for the given NodeID, then this command shall fail with a
         * INVALID_CONSTRAINT status code.
         *
         * The Datastore shall:
         *
         *   1. Add an entry for the given NodeID to the NodeList attribute and set the status for the
         *      DatastoreNodeInformationEntryStruct to Pending.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.10.2
         */
        friendlyName: string;
    }

    /**
     * Upon receipt, this shall request that Datastore information relating to a Node of the accessing fabric is
     * refreshed.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.11
     */
    export class RefreshNodeRequest {
        constructor(values?: Partial<RefreshNodeRequest>);

        /**
         * This field shall indicate the node for which Datastore information should be refreshed.
         *
         * The Datastore shall:
         *
         *   1. Confirm that a DatastoreNodeInformationEntryStruct exists in the NodeList attribute for the given
         *      NodeID, and if not, then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Update the CommissioningStatusEntry for the DatastoreNodeInformationEntryStruct to Pending.
         *
         *   3. Ensure the Endpoint List for the DatastoreNodeInformationEntryStruct with the given NodeID matches
         *      Endpoint list on the given Node. This involves the following steps:
         *
         *   1. Read the PartsList of the Descriptor cluster from the Node.
         *
         *   2. For each DatastoreEndpointEntryStruct in the NodeEndpointList attribute with the given NodeID that does
         *      not match an Endpoint ID in the PartsList, remove the DatastoreEndpointEntryStruct.
         *
         *   3. For each DatastoreEndpointEntryStruct in the NodeEndpointList attribute with the given NodeID that
         *      matches an Endpoint ID in the PartsList:
         *
         *   1. Check that each entry in Node's Group List occurs in the EndpointGroupIDList attribute.
         *
         *   1. Add any missing entries to the EndpointGroupIDList.
         *
         *   2. For any entries in the EndpointGroupIDList attribute with the given NodeId and EndpointId with Status of
         *      Pending:
         *
         *   1. Add the corresponding change to the Node's Group List.
         *
         *   1. If successful, mark the Status to Committed.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         *   3. For any entries in the EndpointGroupIDList attribute with the given NodeID and EndpointID with Status of
         *      DeletePending:
         *
         *   1. If successful, remove the corresponding entry from the Node's Group List.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         *   4. For any entries in the EndpointGroupIDList attribute with the given NodeID and EndpointID with Status of
         *      CommitFailure:
         *
         *   1. A CommitFailure with an unrecoverable FailureCode shall be handled by removing the entry from the
         *      GroupIDList.
         *
         *   2. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a subsequent Node
         *      Refresh.
         *
         *   2. Check that each entry in Node's Binding List occurs in the EndpointBindingList attribute with the given
         *      NodeId and EndpointId.
         *
         *   1. Add any missing entries to the EndpointBindingList attribute.
         *
         *   2. For any entries in the EndpointBindingList attribute with the given NodeID and EndpointID with Status of
         *      Pending:
         *
         *   1. Add the corresponding change to the Node's Binding List.
         *
         *   1. If successful, mark the Status to Committed.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         *   3. For any entries in the EndpointBindingList attribute with the given NodeID and EndpointID with Status of
         *      DeletePending:
         *
         *   1. If successful, remove the corresponding entry from the Node's BindingList.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         *   4. For any entries in the EndpointBindingList attribute with the given NodeID and EndpointID with Status of
         *      CommitFailure:
         *
         *   1. A CommitFailure with an unrecoverable FailureCode shall be handled by removing the entry from the
         *      BindingList.
         *
         *   2. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a subsequent Node
         *      Refresh.
         *
         *   4. Ensure the GroupKeySetList entries with the given NodeID match the Group Keys on the given Node. This
         *      involves the following steps:
         *
         *   1. Read the Group Keys from the Node.
         *
         *   2. For each DatastoreGroupKeySetStruct in the GroupKeySetList attribute for the given NodeID with a Pending
         *      Status:
         *
         *   1. Add the corresponding DatastoreGroupKeySetStruct to the Node's Group Key list.
         *
         *   1. If successful, mark the Status to Committed.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         *   3. For each DatastoreGroupKeySetStruct in the GroupKeySetList attribute for the given NodeID with a
         *      CommitFailure Status:
         *
         *   1. A CommitFailure with an unrecoverable FailureCode shall be handled by removing the entry from the
         *      GroupKeySetList.
         *
         *   2. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a subsequent Node
         *      Refresh.
         *
         *   4. All remaining entries in the GroupKeySetList attribute for the given NodeId should be replaced by the
         *      remaining entries on the Node.
         *
         *   5. Ensure the NodeACLList attribute for the given NodeID matches the ACL attribute on the given Node. This
         *      involves the following steps:
         *
         *   1. Read the ACL attribute on the Node.
         *
         *   2. For each DatastoreACLEntryStruct in the ACLList attribute with the given NodeID with a Pending Status:
         *
         *   1. Add the corresponding DatastoreACLEntryStruct to the Node's ACL attribute.
         *
         *   1. If successful, mark the Status to Committed.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         *   3. For each DatastoreACLEntryStruct in the ACLList attribute with the given NodeID with a CommitFailure
         *      Status:
         *
         *   1. A CommitFailure with an unrecoverable FailureCode (i.e. RESOURCE_EXHAUSTED, CONSTRAINT_ERROR) shall be
         *      handled by removing the entry from the ACLList.
         *
         *   2. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a subsequent Node
         *      Refresh.
         *
         *   4. All remaining entries in the ACLList should be replaced by the remaining entries on the Node.
         *
         *   6. Update the CommissioningStatusEntry for the DatastoreNodeInformationEntryStruct to Committed.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.11.1
         */
        nodeId: NodeId;
    }

    /**
     * Upon receipt, this shall update the friendly name for a node in the Joint Fabric Datastore Cluster of the
     * accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.12
     */
    export class UpdateNodeRequest {
        constructor(values?: Partial<UpdateNodeRequest>);

        /**
         * This field shall indicate the node to be updated in the Joint Fabric Datastore Cluster.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.12.1
         */
        nodeId: NodeId;

        /**
         * This field shall indicate the friendly name for the node.
         *
         * The Datastore shall:
         *
         *   1. If a DatastoreNodeInformationEntryStruct does not exist for the given NodeID in the NodeList attribute,
         *      then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Update the FriendlyName field of the DatastoreNodeInformationEntryStruct with the given NodeID.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.12.2
         */
        friendlyName: string;
    }

    /**
     * Upon receipt, this shall remove a node from the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.13
     */
    export class RemoveNodeRequest {
        constructor(values?: Partial<RemoveNodeRequest>);

        /**
         * This field shall indicate the unique identifier for the node to be removed from the Joint Fabric Datastore
         * Cluster.
         *
         * The Datastore shall:
         *
         *   1. If a DatastoreNodeInformationEntryStruct does not exist for the given NodeID in the NodeList attribute,
         *      then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Remove the DatastoreNodeInformationEntryStruct with the given NodeID from the NodeList attribute.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.13.1
         */
        nodeId: NodeId;
    }

    /**
     * Upon receipt, this shall update the state of an endpoint for a node in the Joint Fabric Datastore Cluster of the
     * accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.14
     */
    export class UpdateEndpointForNodeRequest {
        constructor(values?: Partial<UpdateEndpointForNodeRequest>);

        /**
         * This field shall indicate the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.14.1
         */
        endpointId: EndpointNumber;

        /**
         * This field shall indicate the unique identifier for the node to which the endpoint belongs.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.14.2
         */
        nodeId: NodeId;

        /**
         * This field shall indicate the friendly name for the endpoint.
         *
         * The Datastore shall:
         *
         *   1. If an DatastoreNodeInformationEntryStruct does not exist for the given NodeID and EndpointID in the
         *      NodeEndpointList attribute, then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Update the FriendlyName field of the DatastoreNodeInformationEntryStruct with the given NodeID and
         *      EndpointID.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.14.3
         */
        friendlyName: string;
    }

    /**
     * Upon receipt, this shall add a Group ID to an endpoint for a node in the Joint Fabric Datastore Cluster of the
     * accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.15
     */
    export class AddGroupIdToEndpointForNodeRequest {
        constructor(values?: Partial<AddGroupIdToEndpointForNodeRequest>);

        /**
         * This field shall indicate the unique identifier for the node to which the endpoint belongs.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.15.1
         */
        nodeId: NodeId;

        /**
         * This field shall indicate the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.15.2
         */
        endpointId: EndpointNumber;

        /**
         * This field shall indicate the unique identifier for the group to be added to the endpoint.
         *
         * The Datastore shall:
         *
         *   1. Confirm that an DatastoreNodeInformationEntryStruct exists for the given NodeID and EndpointID in the
         *      NodeEndpointList attribute, and if not, then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Ensure the Group Key List for the DatastoreNodeInformationEntryStruct with the given NodeID includes the
         *      KeySet for the given Group ID. If it does not:
         *
         *   1. Add an entry for the KeySet of the given Group ID to the Group Key List for the Node. The new entry's
         *      status shall be set to Pending.
         *
         *   2. Add a Group Key Entry for this KeySet to the given Node ID.
         *
         *   1. If this succeeds, update the new KeySet entry in the Datastore to Committed.
         *
         *   2. If not successful, the pending change shall be applied in a subsequent Node Refresh.
         *
         *   3. Ensure the Group List for the DatastoreNodeInformationEntryStruct with the given NodeID and EndpointID
         *      includes an entry for the given Group. If it does not:
         *
         *   1. Add a Group entry for the given Group ID to the Group List for the Endpoint and Node. The new entry's
         *      status shall be set to Pending.
         *
         *   2. Add this Group entry to the given Endpoint ID on the given Node ID.
         *
         *   1. If this succeeds, update the new Group entry in the Datastore to Committed.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.15.3
         */
        groupId: GroupId;
    }

    /**
     * Upon receipt, this shall remove a Group ID from an endpoint for a node in the Joint Fabric Datastore Cluster of
     * the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.16
     */
    export class RemoveGroupIdFromEndpointForNodeRequest {
        constructor(values?: Partial<RemoveGroupIdFromEndpointForNodeRequest>);

        /**
         * This field shall indicate the unique identifier for the node to which the endpoint belongs.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.16.1
         */
        nodeId: NodeId;

        /**
         * This field shall indicate the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.16.2
         */
        endpointId: EndpointNumber;

        /**
         * This field shall indicate the unique identifier for the group to be removed from the endpoint.
         *
         * The Datastore shall:
         *
         *   1. Confirm that an DatastoreNodeInformationEntryStruct exists for the given NodeID and EndpointID in the
         *      NodeEndpointList attribute, and if not, then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Ensure the EndpointGroupIDList entries with the given NodeID and EndpointID does not include an entry
         *      for the given Group. If it does:
         *
         *   1. Update the status to DeletePending of the Group entry for the given Group ID in the Group List.
         *
         *   2. Remove this Group entry for the given Endpoint ID on the given Node ID.
         *
         *   1. If this succeeds, remove the Group entry for the given Group ID in the Group List for this NodeID and
         *      EndpointID in the Datastore.
         *
         *   2. If not successful, the pending change shall be applied in a subsequent Node Refresh.
         *
         *   3. Ensure the Group Key List for the DatastoreNodeInformationEntryStruct with the given NodeID does not
         *      include the KeySet for the given Group ID. If it does:
         *
         *   1. Update the status to DeletePending for the entry for the KeySet of the given Group ID in the Node Group
         *      Key List.
         *
         *   2. Remove the Group Key Entry for this KeySet from the given Node ID.
         *
         *   1. If this succeeds, remove the KeySet entry for the given Node ID.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.16.3
         */
        groupId: GroupId;
    }

    /**
     * Upon receipt, this shall add a binding to an endpoint for a node in the Joint Fabric Datastore Cluster of the
     * accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.17
     */
    export class AddBindingToEndpointForNodeRequest {
        constructor(values?: Partial<AddBindingToEndpointForNodeRequest>);

        /**
         * This field shall indicate the unique identifier for the node to which the endpoint belongs.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.17.1
         */
        nodeId: NodeId;

        /**
         * This field shall indicate the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.17.2
         */
        endpointId: EndpointNumber;

        /**
         * This field shall indicate the binding to be added to the endpoint.
         *
         * The Datastore shall:
         *
         *   1. Confirm that an DatastoreNodeInformationEntryStruct exists for the given NodeID and EndpointID in the
         *      NodeEndpointList attribute, and if not, then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Ensure the Binding List for the DatastoreNodeInformationEntryStruct with the given NodeID includes the
         *      given Binding. If it does not:
         *
         *   1. Add the DatastoreEndpointBindingEntryStruct entry to the EndpointBindingList attribute for the given
         *      NodeID and EndpointID. The new entry's status shall be set to Pending.
         *
         *   2. Add this Binding to the given Node ID.
         *
         *   1. If this succeeds, update the new Binding in the Datastore to Committed.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.17.3
         */
        binding: DatastoreBindingTarget;
    }

    /**
     * Upon receipt, this shall remove a binding from an endpoint for a node in the Joint Fabric Datastore Cluster of
     * the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.18
     */
    export class RemoveBindingFromEndpointForNodeRequest {
        constructor(values?: Partial<RemoveBindingFromEndpointForNodeRequest>);

        /**
         * This field shall indicate the unique identifier for the binding entry in the Datastore's EndpointBindingList
         * attribute to be removed from the endpoint.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.18.1
         */
        listId: number;

        /**
         * This field shall indicate the unique identifier for the endpoint to be updated in the Joint Fabric Datastore
         * Cluster.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.18.2
         */
        endpointId: EndpointNumber;

        /**
         * This field shall indicate the unique identifier for the node to which the endpoint belongs.
         *
         * The Datastore shall:
         *
         *   1. Confirm that an DatastoreNodeInformationEntryStruct exists for the given NodeID and EndpointID in the
         *      EndpointBindingList attribute, and if not, then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Ensure the EndpointBindingList entries with the given NodeID does not include an entry with the given
         *      ListID. If it does:
         *
         *   1. Update the status to DeletePending for the given Binding in the Binding List.
         *
         *   2. Remove this Binding from the given Node ID.
         *
         *   1. If this succeeds, remove the given Binding from the Binding List.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.18.3
         */
        nodeId: NodeId;
    }

    /**
     * Upon receipt, this shall add an ACL to a node in the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.19
     */
    export class AddAclToNodeRequest {
        constructor(values?: Partial<AddAclToNodeRequest>);

        /**
         * This field shall indicate the unique identifier for the node to which the ACL is to be added.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.19.1
         */
        nodeId: NodeId;

        /**
         * This field shall indicate the ACL to be added to the Joint Fabric Datastore Cluster.
         *
         * The Datastore shall:
         *
         *   1. Confirm that a DatastoreNodeInformationEntryStruct exists for the given NodeID in the NodeList
         *      attribute, and if not, then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Ensure the ACL List for the given NodeID includes the given ACLEntry. If it does not:
         *
         *   1. Add the ACLEntry to the ACL List for the given NodeID. The new entry's status shall be set to Pending.
         *
         *   2. Add this ACLEntry to the given Node ID.
         *
         *   1. If this succeeds, update the new ACLEntry in the Datastore to Committed.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.19.2
         */
        aclEntry: DatastoreAccessControlEntry;
    }

    /**
     * Upon receipt, this shall remove an ACL from a node in the Joint Fabric Datastore Cluster of the accessing fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.7.20
     */
    export class RemoveAclFromNodeRequest {
        constructor(values?: Partial<RemoveAclFromNodeRequest>);

        /**
         * This field shall indicate the unique identifier for the DatastoreACLEntryStruct to be removed from the
         * Datastore's list of DatastoreACLEntry.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.20.1
         */
        listId: number;

        /**
         * This field shall indicate the unique identifier for the node from which the ACL is to be removed.
         *
         * The Datastore shall:
         *
         *   1. Confirm that a DatastoreNodeInformationEntryStruct exists for the given NodeID in the NodeList
         *      attribute, and if not, then this command shall fail with a NOT_FOUND status code.
         *
         *   2. Ensure the ACL List for the given NodeID does not include the given ACLEntry. If it does:
         *
         *   1. Update the status to DeletePending for the given ACLEntry in the ACL List.
         *
         *   2. Remove this ACLEntry from the given Node ID.
         *
         *   1. If this succeeds, remove the given ACLEntry from the Node ACL List.
         *
         *   2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. The
         *      error shall be handled in a subsequent Node Refresh.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.7.20.2
         */
        nodeId: NodeId;
    }

    /**
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.1
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
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.4
     */
    export enum DatastoreAccessControlEntryPrivilege {
        /**
         * Can read and observe all (except Access Control Cluster)
         */
        View = 1,

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
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.3
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
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.4
     */
    export enum DatastoreGroupKeySecurityPolicy {
        /**
         * Message counter synchronization using trust-first
         */
        TrustFirst = 0
    }

    /**
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.5
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
     * The DatastoreBindingTargetStruct represents a Binding on a specific Node (identified by the
     * DatastoreEndpointBindingEntryStruct) which is managed by the Datastore. Only bindings on a specific Node that are
     * fabric-scoped to the Joint Fabric are managed by the Datastore. As a result, references to nodes and groups are
     * specific to the Joint Fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.6
     */
    export class DatastoreBindingTarget {
        constructor(values?: Partial<DatastoreBindingTarget>);

        /**
         * This field is the binding's remote target node ID. If the Endpoint field is present, this field shall be
         * present.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.6.1
         */
        node?: NodeId;

        /**
         * This field is the binding's target group ID that represents remote endpoints. If the Endpoint field is
         * present, this field shall NOT be present.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.6.2
         */
        group?: GroupId;

        /**
         * This field is the binding's remote endpoint that the local endpoint is bound to. If the Group field is
         * present, this field shall NOT be present.
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.6.3
         */
        endpoint?: EndpointNumber;

        /**
         * This field is the binding's cluster ID (client & server) on the local and target endpoint(s). If this field
         * is present, the client cluster shall also exist on this endpoint (with this Binding cluster). If this field
         * is present, the target shall be this cluster on the target endpoint(s).
         *
         * @see {@link MatterSpecification.v16.Core} § 11.24.5.6.4
         */
        cluster?: ClusterId;
    }

    /**
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.13
     */
    export class DatastoreAccessControlTarget {
        constructor(values?: Partial<DatastoreAccessControlTarget>);
        cluster: ClusterId | null;
        endpoint: EndpointNumber | null;
        deviceType: DeviceTypeId | null;
    }

    /**
     * The DatastoreAccessControlEntryStruct represents an ACL on a specific Node (identified by the
     * DatastoreACLEntryStruct) which is managed by the Datastore. Only ACLs on a specific Node that are fabric-scoped
     * to the Joint Fabric are managed by the Datastore. As a result, references to nodes and groups are specific to the
     * Joint Fabric.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.24.5.12
     */
    export class DatastoreAccessControlEntry {
        constructor(values?: Partial<DatastoreAccessControlEntry>);
        privilege: DatastoreAccessControlEntryPrivilege;
        authMode: DatastoreAccessControlEntryAuthMode;
        subjects: SubjectId[] | null;
        targets: DatastoreAccessControlTarget[] | null;
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
