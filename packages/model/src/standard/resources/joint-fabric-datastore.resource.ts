/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "JointFabricDatastore", pics: "JFDS", xref: "core§11.24",

    details: "The Joint Fabric Datastore Cluster is a cluster that provides a mechanism for the Joint Fabric " +
        "Administrators to manage the set of Nodes, Groups, and Group membership among Nodes in the Joint " +
        "Fabric." +
        "\n" +
        "When an Ecosystem Administrator Node is commissioned onto the Joint Fabric, the Ecosystem " +
        "Administrator Node has no knowledge of what Nodes and Groups are present, or what set-up information " +
        "related to the Joint Fabric is provided by the user. To address lack of knowledge, the Joint Fabric " +
        "Datastore provides the information required for all Ecosystem Administrators to maintain a " +
        "consistent view of the Joint Fabric including Nodes, Groups, settings and privileges." +
        "\n" +
        "The Joint Fabric Datastore contains the access control configuration for the Joint Fabric - the " +
        "groups, the group keys, the group membership (expressed in terms of binding and ACL entries), as " +
        "well as the CAT value and version for each group. This section describes how all changes to the " +
        "Joint Fabric access control configuration are made via the Joint Fabric Datastore: a change is first " +
        "made to the Datastore where the impacted configuration of individual nodes is marked as pending; the " +
        "Datastore is then responsible for propagating the change to all impacted nodes and then updating its " +
        "per-node (and sometimes per-endpoint) pending state to committed." +
        "\n" +
        "The Joint Fabric Datastore cluster server shall only be accessible on a Node which is acting as the " +
        "Joint Fabric Anchor Administrator. When not acting as the Joint Fabric Anchor Administrator, the " +
        "Joint Fabric Datastore cluster shall NOT be accessible." +
        "\n" +
        "The Admin level of access to the Joint Fabric Datastore cluster server shall be limited to JF " +
        "Administrator Nodes identified using the Administrator CAT.",

    children: [
        {
            tag: "attribute", name: "AnchorRootCa", xref: "core§11.24.6.1",
            details: "This shall indicate the Anchor Root CA used to sign all NOC Issuers in the Joint Fabric for the " +
                "accessing fabric. A null value indicates that the Joint Fabric is not yet formed."
        },
        {
            tag: "attribute", name: "AnchorNodeId", xref: "core§11.24.6.2",
            details: "This shall indicate the Node identifier of the Joint Fabric Anchor Root CA for the accessing fabric."
        },
        {
            tag: "attribute", name: "AnchorVendorId", xref: "core§11.24.6.3",
            details: "This shall indicate the Vendor identifier of the Joint Fabric Anchor Root CA for the accessing " +
                "fabric."
        },
        {
            tag: "attribute", name: "FriendlyName", xref: "core§11.24.6.4",
            details: "Friendly name for the accessing fabric."
        },

        {
            tag: "attribute", name: "GroupKeySetList", xref: "core§11.24.6.5",
            details: "This shall indicate the list of DatastoreGroupKeySetStruct used in the Joint Fabric for the " +
                "accessing fabric." +
                "\n" +
                "This attribute shall contain at least one entry, the IPK, which has GroupKeySetID of 0."
        },

        {
            tag: "attribute", name: "GroupList", xref: "core§11.24.6.6",
            details: "This shall indicate the list of groups in the Joint Fabric for the accessing fabric." +
                "\n" +
                "This list shall include, at a minimum, one group with GroupCAT value set to Administrator CAT and " +
                "one group with GroupCAT value set to Anchor CAT."
        },

        {
            tag: "attribute", name: "NodeList", xref: "core§11.24.6.7",
            details: "This shall indicate the list of nodes in the Joint Fabric for the accessing fabric."
        },

        {
            tag: "attribute", name: "AdminList", xref: "core§11.24.6.8",

            details: "This shall indicate the list of administrators in the Joint Fabric for the accessing fabric." +
                "\n" +
                "Only one Administrator may serve as the Anchor Root CA and Anchor Fabric Administrator and shall " +
                "have index value 0. All other Joint Fabric Administrators shall be referenced at index 1 or greater." +
                "\n" +
                "An empty list indicates that the Joint Fabric is not yet formed."
        },

        {
            tag: "attribute", name: "Status", xref: "core§11.24.6.9",

            details: "This shall indicate the current state of the Joint Fabric Datastore Cluster for the accessing " +
                "fabric." +
                "\n" +
                "The value shall be one of the following states:" +
                "\n" +
                "  - Committed - indicates the DataStore is ready for use." +
                "\n" +
                "  - Pending - indicates that the DataStore is not yet ready for use." +
                "\n" +
                "  - DeletePending - indicates that the DataStore is in the process of being transferred to another " +
                "Joint Fabric Anchor Administrator."
        },

        {
            tag: "attribute", name: "EndpointGroupIdList", xref: "core§11.24.6.10",
            details: "This shall indicate the group membership of endpoints in the accessing fabric."
        },
        {
            tag: "attribute", name: "EndpointBindingList", xref: "core§11.24.6.11",
            details: "This shall indicate the binding list for endpoints in the accessing fabric."
        },
        {
            tag: "attribute", name: "NodeKeySetList", xref: "core§11.24.6.12",
            details: "This shall indicate the KeySet entries for nodes in the accessing fabric."
        },
        {
            tag: "attribute", name: "NodeAclList", xref: "core§11.24.6.13",
            details: "This shall indicate the ACL entries for nodes in the accessing fabric."
        },
        {
            tag: "attribute", name: "NodeEndpointList", xref: "core§11.24.6.14",
            details: "This shall indicate the Endpoint entries for nodes in the accessing fabric."
        },

        {
            tag: "command", name: "AddKeySet", xref: "core§11.24.7.1",
            details: "Upon receipt, this shall add a KeySet to the Joint Fabric Datastore Cluster of the accessing fabric.",

            children: [{
                tag: "field", name: "GroupKeySet", xref: "core§11.24.7.1.1",

                details: "This field shall indicate the KeySet to be added to the Joint Fabric Datastore Cluster." +
                    "\n" +
                    "The Datastore shall:" +
                    "\n" +
                    "  1. Ensure there are no KeySets in the KeySetList attribute with the given GroupKeySetID." +
                    "\n" +
                    "  2. If a match is found, then this command shall fail with a CONSTRAINT_ERROR status code." +
                    "\n" +
                    "  3. Add the Epoch Key Entry for the KeySet to the KeySetList attribute."
            }]
        },

        {
            tag: "command", name: "UpdateKeySet", xref: "core§11.24.7.2",
            details: "Upon receipt, this shall update a KeySet in the Joint Fabric Datastore Cluster of the accessing " +
                "fabric.",

            children: [{
                tag: "field", name: "GroupKeySet", xref: "core§11.24.7.2.1",

                details: "This field shall indicate the KeySet to be updated in the Joint Fabric Datastore Cluster." +
                    "\n" +
                    "The Datastore shall:" +
                    "\n" +
                    "  1. Find the Epoch Key Entry for the KeySet in the KeySetList attribute with the given " +
                    "GroupKeySetID, and update any changed fields." +
                    "\n" +
                    "  2. If entry is not found, then this command shall fail with a NOT_FOUND status code." +
                    "\n" +
                    "  3. If any fields are changed as a result of this command:" +
                    "\n" +
                    "  1. Iterate through each DatastoreNodeInformationEntryStruct:" +
                    "\n" +
                    "  1. If the NodeKeySetList contains an entry with the given GroupKeySetID:" +
                    "\n" +
                    "  1. Update the Status on the given DatastoreNodeKeySetEntryStruct tp Pending." +
                    "\n" +
                    "  2. Update the GroupKeySet on the given Node with the new values." +
                    "\n" +
                    "  1. If successful, update the Status on this DatastoreNodeKeySetEntryStruct to Committed." +
                    "\n" +
                    "  2. If not successful, update the State field of the StatusEntry on this " +
                    "DatastoreNodeKeySetEntryStruct to CommitFailed and FailureCode code to the returned error. The " +
                    "pending change shall be applied in a subsequent Node Refresh."
            }]
        },

        {
            tag: "command", name: "RemoveKeySet", xref: "core§11.24.7.3",
            details: "Upon receipt, this shall remove a KeySet from the Joint Fabric Datastore Cluster of the accessing " +
                "fabric.",

            children: [{
                tag: "field", name: "GroupKeySetId", xref: "core§11.24.7.3.1",

                details: "This field shall indicate the unique identifier for the KeySet to be removed from the Joint Fabric " +
                    "Datastore Cluster." +
                    "\n" +
                    "Attempt to remove the IPK, which has GroupKeySetID of 0, shall fail with response CONSTRAINT_ERROR." +
                    "\n" +
                    "The Datastore shall:" +
                    "\n" +
                    "  1. If entry is not found, then this command shall fail with a NOT_FOUND status code." +
                    "\n" +
                    "  2. Ensure there are no Nodes using this KeySet. To do this:" +
                    "\n" +
                    "  1. Iterate through each DatastoreNodeInformationEntryStruct:" +
                    "\n" +
                    "  1. If the NodeKeySetList list contains an entry with the given GroupKeySetID, and the entry does " +
                    "NOT have Status DeletePending, then this command shall fail with a CONSTRAINT_ERROR status " +
                    "code." +
                    "\n" +
                    "  3. Remove the DatastoreGroupKeySetStruct for the given GroupKeySetID from the GroupKeySetList " +
                    "attribute."
            }]
        },

        {
            tag: "command", name: "AddGroup", xref: "core§11.24.7.4",
            details: "Upon receipt, this shall add a group to the Joint Fabric Datastore Cluster of the accessing fabric.",

            children: [
                {
                    tag: "field", name: "GroupId", xref: "core§11.24.7.4.1",
                    details: "This field shall indicate the unique identifier for the group to be added to the Joint Fabric " +
                        "Datastore Cluster."
                },
                {
                    tag: "field", name: "FriendlyName", xref: "core§11.24.7.4.2",
                    details: "This field shall indicate the friendly name for the group."
                },
                {
                    tag: "field", name: "GroupKeySetId", xref: "core§11.24.7.4.3",
                    details: "This field shall indicate the unique identifier for the group key set."
                },

                {
                    tag: "field", name: "GroupCat", xref: "core§11.24.7.4.4",
                    details: "This field shall indicate the CAT value for this group." +
                        "\n" +
                        "GroupCAT values shall fall within the range 1 to 65534. Attempts to add a group with a GroupCAT " +
                        "value of Administrator CAT or Anchor CAT shall fail with CONSTRAINT_ERROR."
                },

                {
                    tag: "field", name: "GroupCatVersion", xref: "core§11.24.7.4.5",
                    details: "This field shall indicate the current version number for this CAT."
                },

                {
                    tag: "field", name: "GroupPermission", xref: "core§11.24.7.4.6",

                    details: "This field shall indicate the permission level associated with ACL entries for this group." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. Ensure there are no Groups in the GroupList attribute with the given GroupID. If a match is " +
                        "found, then this command shall fail with a CONSTRAINT_ERROR status code." +
                        "\n" +
                        "  2. Add the DatastoreGroupInformationEntryStruct for the Group with the given GroupID to the " +
                        "GroupList attribute."
                }
            ]
        },

        {
            tag: "command", name: "UpdateGroup", xref: "core§11.24.7.5",
            details: "Upon receipt, this shall update a group in the Joint Fabric Datastore Cluster of the accessing " +
                "fabric.",

            children: [
                {
                    tag: "field", name: "GroupId", xref: "core§11.24.7.5.1",
                    details: "This field shall indicate the group to be updated in the Joint Fabric Datastore Cluster."
                },
                {
                    tag: "field", name: "FriendlyName", xref: "core§11.24.7.5.2",
                    details: "This field shall indicate the friendly name for the group. NULL values will be ignored (not " +
                        "updated)."
                },
                {
                    tag: "field", name: "GroupKeySetId", xref: "core§11.24.7.5.3",
                    details: "This field shall indicate the unique identifier for the group key set. NULL values will be ignored " +
                        "(not updated)."
                },

                {
                    tag: "field", name: "GroupCat", xref: "core§11.24.7.5.4",

                    details: "This field shall indicate the CAT value for this group. NULL values will be ignored (not updated)." +
                        "\n" +
                        "GroupCAT values shall fall within the range 1 to 65534. Attempts to update the GroupCAT on an " +
                        "existing group which has a GroupCAT value of Administrator CAT or Anchor CAT shall fail with " +
                        "CONSTRAINT_ERROR." +
                        "\n" +
                        "Attempts to set the GroupCAT to Administrator CAT or Anchor CAT shall fail with CONSTRAINT_ERROR."
                },

                {
                    tag: "field", name: "GroupCatVersion", xref: "core§11.24.7.5.5",
                    details: "This field shall indicate the current version number for this CAT. NULL values will be ignored (not " +
                        "updated)."
                },

                {
                    tag: "field", name: "GroupPermission", xref: "core§11.24.7.5.6",

                    details: "This field shall indicate the permission level associated with ACL entries for this group. NULL " +
                        "values will be ignored (not updated)." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. If entry is not found, then this command shall fail with a NOT_FOUND status code." +
                        "\n" +
                        "  2. Update the DatastoreGroupInformationEntryStruct for the Group with the given GroupID to match " +
                        "the non-NULL fields passed in." +
                        "\n" +
                        "  3. If any fields are changed as a result of this command:" +
                        "\n" +
                        "  1. Iterate through each DatastoreNodeInformationEntryStruct:" +
                        "\n" +
                        "  1. If the GroupKeySetID changed:" +
                        "\n" +
                        "  1. Add a DatastoreNodeKeySetEntryStruct with the new GroupKeySetID, and Status set to Pending." +
                        "\n" +
                        "  2. Add this KeySet to the Node." +
                        "\n" +
                        "  1. If successful, Set the Status to Committed for this entry in the NodeKeySetList." +
                        "\n" +
                        "  2. If not successful, Set the Status to CommitFailed and the FailureCode to the returned error. " +
                        "The pending change shall be applied in a subsequent Node Refresh." +
                        "\n" +
                        "  1. If the NodeKeySetList list contains an entry with the previous GroupKeySetID:" +
                        "\n" +
                        "  3. Set the Status set to DeletePending." +
                        "\n" +
                        "  4. Remove this KeySet from the Node." +
                        "\n" +
                        "  1. If successful, Remove this entry from the NodeKeySetList." +
                        "\n" +
                        "  2. If not successful, the pending change shall be applied in a subsequent Node Refresh." +
                        "\n" +
                        "  2. If the GroupCAT, GroupCATVersion or GroupPermission changed:" +
                        "\n" +
                        "  1. If the ACLList contains an entry for this Group, update the ACL List Entry in the Datastore " +
                        "with the new values and Status Pending, update the ACL attribute on the given Node with the new " +
                        "     values. If the update succeeds, set the Status to Committed on the ACLList Entry in the " +
                        "Datastore." +
                        "\n" +
                        "  3. If the FriendlyName changed:" +
                        "\n" +
                        "  1. Iterate through each DatastoreEndpointGroupIDEntryStruct in the EndpointGroupIDList attribute:" +
                        "\n" +
                        "  1. If the DatastoreEndpointGroupIDEntryStruct contains an entry with the given GroupID:" +
                        "\n" +
                        "  1. Update the DatastoreEndpointGroupIDEntryStruct Entry in the Datastore with the new values and " +
                        "Status Pending" +
                        "\n" +
                        "  2. Update the Groups on the given Node with the new values." +
                        "\n" +
                        "  1. If the update succeeds, set the Status to Committed on the GroupIDList Entry in the Datastore." +
                        "\n" +
                        "  2. If not successful, the pending change shall be applied in a subsequent Node Refresh."
                }
            ]
        },

        {
            tag: "command", name: "RemoveGroup", xref: "core§11.24.7.6",
            details: "Upon receipt, this shall remove a group from the Joint Fabric Datastore Cluster of the accessing " +
                "fabric.",

            children: [{
                tag: "field", name: "GroupId", xref: "core§11.24.7.6.1",

                details: "This field shall indicate the unique identifier for the group to be removed from the Joint Fabric " +
                    "Datastore Cluster." +
                    "\n" +
                    "Attempts to remove a group with GroupCAT value set to Administrator CAT or Anchor CAT shall fail " +
                    "with CONSTRAINT_ERROR." +
                    "\n" +
                    "The Datastore shall:" +
                    "\n" +
                    "  1. If entry is not found, then this command shall fail with a NOT_FOUND status code." +
                    "\n" +
                    "  2. Ensure there are no Nodes in this group. To do this:" +
                    "\n" +
                    "  1. Iterate through each DatastoreNodeInformationEntryStruct:" +
                    "\n" +
                    "  1. If the GroupIDList contains an entry with the given GroupID, and the entry does NOT have Status " +
                    "DeletePending, then this command shall fail with a CONSTRAINT_ERROR status code." +
                    "\n" +
                    "  3. Remove the DatastoreGroupInformationEntryStruct for the Group with the given GroupID from the " +
                    "GroupList attribute."
            }]
        },

        {
            tag: "command", name: "AddAdmin", xref: "core§11.24.7.7",
            details: "Upon receipt, this shall add an admin to the Joint Fabric Datastore Cluster of the accessing fabric.",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.7.7.1",
                    details: "This field shall indicate the unique identifier for the admin node."
                },
                {
                    tag: "field", name: "FriendlyName", xref: "core§11.24.7.7.2",
                    details: "This field shall indicate the friendly name for the admin node."
                },
                {
                    tag: "field", name: "VendorId", xref: "core§11.24.7.7.3",
                    details: "This field shall indicate the Vendor ID for the admin node."
                },

                {
                    tag: "field", name: "Icac", xref: "core§11.24.7.7.4",

                    details: "This field shall indicate the ICAC used to issue the NOC." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. Ensure there are no Admins in the AdminList attribute with the given NodeID. If a match is " +
                        "found, then this command shall fail with a CONSTRAINT_ERROR status code." +
                        "\n" +
                        "  2. Add the DatastoreAdministratorInformationEntryStruct for the Admin with the given NodeID to the " +
                        "AdminList attribute."
                }
            ]
        },

        {
            tag: "command", name: "UpdateAdmin", xref: "core§11.24.7.8",
            details: "Upon receipt, this shall update an admin entry in the AdminList attribute.",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.7.8.1",
                    details: "This field shall indicate the admin to be updated in the Joint Fabric Datastore Cluster."
                },
                {
                    tag: "field", name: "FriendlyName", xref: "core§11.24.7.8.2",
                    details: "This field shall indicate the friendly name for the admin node."
                },

                {
                    tag: "field", name: "Icac", xref: "core§11.24.7.8.3",

                    details: "This field shall indicate the ICAC used to issue the NOC." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. Find the entry in the AdminList attribute with the given NodeID, and update any changed fields." +
                        "\n" +
                        "  2. If entry is not found, then this command shall fail with a NOT_FOUND status code."
                }
            ]
        },

        {
            tag: "command", name: "RemoveAdmin", xref: "core§11.24.7.9",
            details: "Upon receipt, this shall remove an admin from the Joint Fabric Datastore Cluster of the accessing " +
                "fabric.",

            children: [{
                tag: "field", name: "NodeId", xref: "core§11.24.7.9.1",

                details: "This field shall indicate the unique identifier for the admin to be removed from the Joint Fabric " +
                    "Datastore Cluster." +
                    "\n" +
                    "The Datastore shall:" +
                    "\n" +
                    "  1. If an entry in the AdminList attribute with the given NodeID is not found, then this command " +
                    "shall fail with a NOT_FOUND status code." +
                    "\n" +
                    "  2. Remove the DatastoreAdministratorInformationEntryStruct for the Admin with the given NodeID " +
                    "from the AdminList attribute."
            }]
        },

        {
            tag: "command", name: "AddPendingNode", xref: "core§11.24.7.10",
            details: "Upon receipt, this shall add a node to the Joint Fabric Datastore Cluster of the accessing fabric.",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.7.10.1",
                    details: "This field shall indicate the node to be added to the Joint Fabric Datastore Cluster."
                },

                {
                    tag: "field", name: "FriendlyName", xref: "core§11.24.7.10.2",

                    details: "This field shall indicate the friendly name for the node." +
                        "\n" +
                        "If a DatastoreNodeInformationEntryStruct exists for the given NodeID, then this command shall fail " +
                        "with a INVALID_CONSTRAINT status code." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. Add an entry for the given NodeID to the NodeList attribute and set the status for the " +
                        "DatastoreNodeInformationEntryStruct to Pending."
                }
            ]
        },

        {
            tag: "command", name: "RefreshNode", xref: "core§11.24.7.11",
            details: "Upon receipt, this shall request that Datastore information relating to a Node of the accessing " +
                "fabric is refreshed.",

            children: [{
                tag: "field", name: "NodeId", xref: "core§11.24.7.11.1",

                details: "This field shall indicate the node for which Datastore information should be refreshed." +
                    "\n" +
                    "The Datastore shall:" +
                    "\n" +
                    "  1. Confirm that a DatastoreNodeInformationEntryStruct exists in the NodeList attribute for the " +
                    "given NodeID, and if not, then this command shall fail with a NOT_FOUND status code." +
                    "\n" +
                    "  2. Update the CommissioningStatusEntry for the DatastoreNodeInformationEntryStruct to Pending." +
                    "\n" +
                    "  3. Ensure the Endpoint List for the DatastoreNodeInformationEntryStruct with the given NodeID " +
                    "matches Endpoint list on the given Node. This involves the following steps:" +
                    "\n" +
                    "  1. Read the PartsList of the Descriptor cluster from the Node." +
                    "\n" +
                    "  2. For each DatastoreEndpointEntryStruct in the NodeEndpointList attribute with the given NodeID " +
                    "that does not match an Endpoint ID in the PartsList, remove the DatastoreEndpointEntryStruct." +
                    "\n" +
                    "  3. For each DatastoreEndpointEntryStruct in the NodeEndpointList attribute with the given NodeID " +
                    "that matches an Endpoint ID in the PartsList:" +
                    "\n" +
                    "  1. Check that each entry in Node's Group List occurs in the EndpointGroupIDList attribute." +
                    "\n" +
                    "  1. Add any missing entries to the EndpointGroupIDList." +
                    "\n" +
                    "  2. For any entries in the EndpointGroupIDList attribute with the given NodeId and EndpointId with " +
                    "Status of Pending:" +
                    "\n" +
                    "  1. Add the corresponding change to the Node's Group List." +
                    "\n" +
                    "  1. If successful, mark the Status to Committed." +
                    "\n" +
                    "  2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. " +
                    "The error shall be handled in a subsequent Node Refresh." +
                    "\n" +
                    "  3. For any entries in the EndpointGroupIDList attribute with the given NodeID and EndpointID with " +
                    "Status of DeletePending:" +
                    "\n" +
                    "  1. If successful, remove the corresponding entry from the Node's Group List." +
                    "\n" +
                    "  2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. " +
                    "The error shall be handled in a subsequent Node Refresh." +
                    "\n" +
                    "  4. For any entries in the EndpointGroupIDList attribute with the given NodeID and EndpointID with " +
                    "Status of CommitFailure:" +
                    "\n" +
                    "  1. A CommitFailure with an unrecoverable FailureCode shall be handled by removing the entry from " +
                    "the GroupIDList." +
                    "\n" +
                    "  2. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a " +
                    "subsequent Node Refresh." +
                    "\n" +
                    "  2. Check that each entry in Node's Binding List occurs in the EndpointBindingList attribute with " +
                    "the given NodeId and EndpointId." +
                    "\n" +
                    "  1. Add any missing entries to the EndpointBindingList attribute." +
                    "\n" +
                    "  2. For any entries in the EndpointBindingList attribute with the given NodeID and EndpointID with " +
                    "Status of Pending:" +
                    "\n" +
                    "  1. Add the corresponding change to the Node's Binding List." +
                    "\n" +
                    "  1. If successful, mark the Status to Committed." +
                    "\n" +
                    "  2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. " +
                    "The error shall be handled in a subsequent Node Refresh." +
                    "\n" +
                    "  3. For any entries in the EndpointBindingList attribute with the given NodeID and EndpointID with " +
                    "Status of DeletePending:" +
                    "\n" +
                    "  1. If successful, remove the corresponding entry from the Node's BindingList." +
                    "\n" +
                    "  2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. " +
                    "The error shall be handled in a subsequent Node Refresh." +
                    "\n" +
                    "  4. For any entries in the EndpointBindingList attribute with the given NodeID and EndpointID with " +
                    "Status of CommitFailure:" +
                    "\n" +
                    "  1. A CommitFailure with an unrecoverable FailureCode shall be handled by removing the entry from " +
                    "the BindingList." +
                    "\n" +
                    "  2. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a " +
                    "subsequent Node Refresh." +
                    "\n" +
                    "  4. Ensure the GroupKeySetList entries with the given NodeID match the Group Keys on the given " +
                    "     Node. This involves the following steps:" +
                    "\n" +
                    "  1. Read the Group Keys from the Node." +
                    "\n" +
                    "  2. For each DatastoreGroupKeySetStruct in the GroupKeySetList attribute for the given NodeID with " +
                    "a Pending Status:" +
                    "\n" +
                    "  1. Add the corresponding DatastoreGroupKeySetStruct to the Node's Group Key list." +
                    "\n" +
                    "  1. If successful, mark the Status to Committed." +
                    "\n" +
                    "  2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. " +
                    "The error shall be handled in a subsequent Node Refresh." +
                    "\n" +
                    "  3. For each DatastoreGroupKeySetStruct in the GroupKeySetList attribute for the given NodeID with " +
                    "a CommitFailure Status:" +
                    "\n" +
                    "  1. A CommitFailure with an unrecoverable FailureCode shall be handled by removing the entry from " +
                    "the GroupKeySetList." +
                    "\n" +
                    "  2. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a " +
                    "subsequent Node Refresh." +
                    "\n" +
                    "  4. All remaining entries in the GroupKeySetList attribute for the given NodeId should be replaced " +
                    "by the remaining entries on the Node." +
                    "\n" +
                    "  5. Ensure the NodeACLList attribute for the given NodeID matches the ACL attribute on the given " +
                    "     Node. This involves the following steps:" +
                    "\n" +
                    "  1. Read the ACL attribute on the Node." +
                    "\n" +
                    "  2. For each DatastoreACLEntryStruct in the ACLList attribute with the given NodeID with a Pending " +
                    "Status:" +
                    "\n" +
                    "  1. Add the corresponding DatastoreACLEntryStruct to the Node's ACL attribute." +
                    "\n" +
                    "  1. If successful, mark the Status to Committed." +
                    "\n" +
                    "  2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. " +
                    "The error shall be handled in a subsequent Node Refresh." +
                    "\n" +
                    "  3. For each DatastoreACLEntryStruct in the ACLList attribute with the given NodeID with a " +
                    "CommitFailure Status:" +
                    "\n" +
                    "  1. A CommitFailure with an unrecoverable FailureCode (i.e. RESOURCE_EXHAUSTED, CONSTRAINT_ERROR) " +
                    "shall be handled by removing the entry from the ACLList." +
                    "\n" +
                    "  2. A CommitFailure with a recoverable FailureCode (i.e. TIMEOUT, BUSY) shall be handle in a " +
                    "subsequent Node Refresh." +
                    "\n" +
                    "  4. All remaining entries in the ACLList should be replaced by the remaining entries on the Node." +
                    "\n" +
                    "  6. Update the CommissioningStatusEntry for the DatastoreNodeInformationEntryStruct to Committed."
            }]
        },

        {
            tag: "command", name: "UpdateNode", xref: "core§11.24.7.12",
            details: "Upon receipt, this shall update the friendly name for a node in the Joint Fabric Datastore Cluster " +
                "of the accessing fabric.",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.7.12.1",
                    details: "This field shall indicate the node to be updated in the Joint Fabric Datastore Cluster."
                },

                {
                    tag: "field", name: "FriendlyName", xref: "core§11.24.7.12.2",

                    details: "This field shall indicate the friendly name for the node." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. If a DatastoreNodeInformationEntryStruct does not exist for the given NodeID in the NodeList " +
                        "attribute, then this command shall fail with a NOT_FOUND status code." +
                        "\n" +
                        "  2. Update the FriendlyName field of the DatastoreNodeInformationEntryStruct with the given NodeID."
                }
            ]
        },

        {
            tag: "command", name: "RemoveNode", xref: "core§11.24.7.13",
            details: "Upon receipt, this shall remove a node from the Joint Fabric Datastore Cluster of the accessing " +
                "fabric.",

            children: [{
                tag: "field", name: "NodeId", xref: "core§11.24.7.13.1",

                details: "This field shall indicate the unique identifier for the node to be removed from the Joint Fabric " +
                    "Datastore Cluster." +
                    "\n" +
                    "The Datastore shall:" +
                    "\n" +
                    "  1. If a DatastoreNodeInformationEntryStruct does not exist for the given NodeID in the NodeList " +
                    "attribute, then this command shall fail with a NOT_FOUND status code." +
                    "\n" +
                    "  2. Remove the DatastoreNodeInformationEntryStruct with the given NodeID from the NodeList " +
                    "attribute."
            }]
        },

        {
            tag: "command", name: "UpdateEndpointForNode", xref: "core§11.24.7.14",
            details: "Upon receipt, this shall update the state of an endpoint for a node in the Joint Fabric Datastore " +
                "Cluster of the accessing fabric.",

            children: [
                {
                    tag: "field", name: "EndpointId", xref: "core§11.24.7.14.1",
                    details: "This field shall indicate the unique identifier for the endpoint to be updated in the Joint Fabric " +
                        "Datastore Cluster."
                },
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.7.14.2",
                    details: "This field shall indicate the unique identifier for the node to which the endpoint belongs."
                },

                {
                    tag: "field", name: "FriendlyName", xref: "core§11.24.7.14.3",

                    details: "This field shall indicate the friendly name for the endpoint." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. If an DatastoreNodeInformationEntryStruct does not exist for the given NodeID and EndpointID in " +
                        "the NodeEndpointList attribute, then this command shall fail with a NOT_FOUND status code." +
                        "\n" +
                        "  2. Update the FriendlyName field of the DatastoreNodeInformationEntryStruct with the given NodeID " +
                        "and EndpointID."
                }
            ]
        },

        {
            tag: "command", name: "AddGroupIdToEndpointForNode", xref: "core§11.24.7.15",
            details: "Upon receipt, this shall add a Group ID to an endpoint for a node in the Joint Fabric Datastore " +
                "Cluster of the accessing fabric.",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.7.15.1",
                    details: "This field shall indicate the unique identifier for the node to which the endpoint belongs."
                },
                {
                    tag: "field", name: "EndpointId", xref: "core§11.24.7.15.2",
                    details: "This field shall indicate the unique identifier for the endpoint to be updated in the Joint Fabric " +
                        "Datastore Cluster."
                },

                {
                    tag: "field", name: "GroupId", xref: "core§11.24.7.15.3",

                    details: "This field shall indicate the unique identifier for the group to be added to the endpoint." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. Confirm that an DatastoreNodeInformationEntryStruct exists for the given NodeID and EndpointID " +
                        "in the NodeEndpointList attribute, and if not, then this command shall fail with a NOT_FOUND " +
                        "status code." +
                        "\n" +
                        "  2. Ensure the Group Key List for the DatastoreNodeInformationEntryStruct with the given NodeID " +
                        "includes the KeySet for the given Group ID. If it does not:" +
                        "\n" +
                        "  1. Add an entry for the KeySet of the given Group ID to the Group Key List for the Node. The new " +
                        "entry's status shall be set to Pending." +
                        "\n" +
                        "  2. Add a Group Key Entry for this KeySet to the given Node ID." +
                        "\n" +
                        "  1. If this succeeds, update the new KeySet entry in the Datastore to Committed." +
                        "\n" +
                        "  2. If not successful, the pending change shall be applied in a subsequent Node Refresh." +
                        "\n" +
                        "  3. Ensure the Group List for the DatastoreNodeInformationEntryStruct with the given NodeID and " +
                        "EndpointID includes an entry for the given Group. If it does not:" +
                        "\n" +
                        "  1. Add a Group entry for the given Group ID to the Group List for the Endpoint and Node. The new " +
                        "entry's status shall be set to Pending." +
                        "\n" +
                        "  2. Add this Group entry to the given Endpoint ID on the given Node ID." +
                        "\n" +
                        "  1. If this succeeds, update the new Group entry in the Datastore to Committed." +
                        "\n" +
                        "  2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. " +
                        "The error shall be handled in a subsequent Node Refresh."
                }
            ]
        },

        {
            tag: "command", name: "RemoveGroupIdFromEndpointForNode", xref: "core§11.24.7.16",
            details: "Upon receipt, this shall remove a Group ID from an endpoint for a node in the Joint Fabric Datastore " +
                "Cluster of the accessing fabric.",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.7.16.1",
                    details: "This field shall indicate the unique identifier for the node to which the endpoint belongs."
                },
                {
                    tag: "field", name: "EndpointId", xref: "core§11.24.7.16.2",
                    details: "This field shall indicate the unique identifier for the endpoint to be updated in the Joint Fabric " +
                        "Datastore Cluster."
                },

                {
                    tag: "field", name: "GroupId", xref: "core§11.24.7.16.3",

                    details: "This field shall indicate the unique identifier for the group to be removed from the endpoint." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. Confirm that an DatastoreNodeInformationEntryStruct exists for the given NodeID and EndpointID " +
                        "in the NodeEndpointList attribute, and if not, then this command shall fail with a NOT_FOUND " +
                        "status code." +
                        "\n" +
                        "  2. Ensure the EndpointGroupIDList entries with the given NodeID and EndpointID does not include an " +
                        "entry for the given Group. If it does:" +
                        "\n" +
                        "  1. Update the status to DeletePending of the Group entry for the given Group ID in the Group List." +
                        "\n" +
                        "  2. Remove this Group entry for the given Endpoint ID on the given Node ID." +
                        "\n" +
                        "  1. If this succeeds, remove the Group entry for the given Group ID in the Group List for this " +
                        "NodeID and EndpointID in the Datastore." +
                        "\n" +
                        "  2. If not successful, the pending change shall be applied in a subsequent Node Refresh." +
                        "\n" +
                        "  3. Ensure the Group Key List for the DatastoreNodeInformationEntryStruct with the given NodeID " +
                        "does not include the KeySet for the given Group ID. If it does:" +
                        "\n" +
                        "  1. Update the status to DeletePending for the entry for the KeySet of the given Group ID in the " +
                        "Node Group Key List." +
                        "\n" +
                        "  2. Remove the Group Key Entry for this KeySet from the given Node ID." +
                        "\n" +
                        "  1. If this succeeds, remove the KeySet entry for the given Node ID." +
                        "\n" +
                        "  2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. " +
                        "The error shall be handled in a subsequent Node Refresh."
                }
            ]
        },

        {
            tag: "command", name: "AddBindingToEndpointForNode", xref: "core§11.24.7.17",
            details: "Upon receipt, this shall add a binding to an endpoint for a node in the Joint Fabric Datastore " +
                "Cluster of the accessing fabric.",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.7.17.1",
                    details: "This field shall indicate the unique identifier for the node to which the endpoint belongs."
                },
                {
                    tag: "field", name: "EndpointId", xref: "core§11.24.7.17.2",
                    details: "This field shall indicate the unique identifier for the endpoint to be updated in the Joint Fabric " +
                        "Datastore Cluster."
                },

                {
                    tag: "field", name: "Binding", xref: "core§11.24.7.17.3",

                    details: "This field shall indicate the binding to be added to the endpoint." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. Confirm that an DatastoreNodeInformationEntryStruct exists for the given NodeID and EndpointID " +
                        "in the NodeEndpointList attribute, and if not, then this command shall fail with a NOT_FOUND " +
                        "status code." +
                        "\n" +
                        "  2. Ensure the Binding List for the DatastoreNodeInformationEntryStruct with the given NodeID " +
                        "includes the given Binding. If it does not:" +
                        "\n" +
                        "  1. Add the DatastoreEndpointBindingEntryStruct entry to the EndpointBindingList attribute for the " +
                        "given NodeID and EndpointID. The new entry's status shall be set to Pending." +
                        "\n" +
                        "  2. Add this Binding to the given Node ID." +
                        "\n" +
                        "  1. If this succeeds, update the new Binding in the Datastore to Committed." +
                        "\n" +
                        "  2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. " +
                        "The error shall be handled in a subsequent Node Refresh."
                }
            ]
        },

        {
            tag: "command", name: "RemoveBindingFromEndpointForNode", xref: "core§11.24.7.18",
            details: "Upon receipt, this shall remove a binding from an endpoint for a node in the Joint Fabric Datastore " +
                "Cluster of the accessing fabric.",

            children: [
                {
                    tag: "field", name: "ListId", xref: "core§11.24.7.18.1",
                    details: "This field shall indicate the unique identifier for the binding entry in the Datastore's " +
                        "EndpointBindingList attribute to be removed from the endpoint."
                },
                {
                    tag: "field", name: "EndpointId", xref: "core§11.24.7.18.2",
                    details: "This field shall indicate the unique identifier for the endpoint to be updated in the Joint Fabric " +
                        "Datastore Cluster."
                },

                {
                    tag: "field", name: "NodeId", xref: "core§11.24.7.18.3",

                    details: "This field shall indicate the unique identifier for the node to which the endpoint belongs." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. Confirm that an DatastoreNodeInformationEntryStruct exists for the given NodeID and EndpointID " +
                        "in the EndpointBindingList attribute, and if not, then this command shall fail with a NOT_FOUND " +
                        "status code." +
                        "\n" +
                        "  2. Ensure the EndpointBindingList entries with the given NodeID does not include an entry with the " +
                        "given ListID. If it does:" +
                        "\n" +
                        "  1. Update the status to DeletePending for the given Binding in the Binding List." +
                        "\n" +
                        "  2. Remove this Binding from the given Node ID." +
                        "\n" +
                        "  1. If this succeeds, remove the given Binding from the Binding List." +
                        "\n" +
                        "  2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. " +
                        "The error shall be handled in a subsequent Node Refresh."
                }
            ]
        },

        {
            tag: "command", name: "AddAclToNode", xref: "core§11.24.7.19",
            details: "Upon receipt, this shall add an ACL to a node in the Joint Fabric Datastore Cluster of the accessing " +
                "fabric.",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.7.19.1",
                    details: "This field shall indicate the unique identifier for the node to which the ACL is to be added."
                },

                {
                    tag: "field", name: "AclEntry", xref: "core§11.24.7.19.2",

                    details: "This field shall indicate the ACL to be added to the Joint Fabric Datastore Cluster." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. Confirm that a DatastoreNodeInformationEntryStruct exists for the given NodeID in the NodeList " +
                        "attribute, and if not, then this command shall fail with a NOT_FOUND status code." +
                        "\n" +
                        "  2. Ensure the ACL List for the given NodeID includes the given ACLEntry. If it does not:" +
                        "\n" +
                        "  1. Add the ACLEntry to the ACL List for the given NodeID. The new entry's status shall be set to " +
                        "Pending." +
                        "\n" +
                        "  2. Add this ACLEntry to the given Node ID." +
                        "\n" +
                        "  1. If this succeeds, update the new ACLEntry in the Datastore to Committed." +
                        "\n" +
                        "  2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. " +
                        "The error shall be handled in a subsequent Node Refresh."
                }
            ]
        },

        {
            tag: "command", name: "RemoveAclFromNode", xref: "core§11.24.7.20",
            details: "Upon receipt, this shall remove an ACL from a node in the Joint Fabric Datastore Cluster of the " +
                "accessing fabric.",

            children: [
                {
                    tag: "field", name: "ListId", xref: "core§11.24.7.20.1",
                    details: "This field shall indicate the unique identifier for the DatastoreACLEntryStruct to be removed from " +
                        "the Datastore's list of DatastoreACLEntry."
                },

                {
                    tag: "field", name: "NodeId", xref: "core§11.24.7.20.2",

                    details: "This field shall indicate the unique identifier for the node from which the ACL is to be removed." +
                        "\n" +
                        "The Datastore shall:" +
                        "\n" +
                        "  1. Confirm that a DatastoreNodeInformationEntryStruct exists for the given NodeID in the NodeList " +
                        "attribute, and if not, then this command shall fail with a NOT_FOUND status code." +
                        "\n" +
                        "  2. Ensure the ACL List for the given NodeID does not include the given ACLEntry. If it does:" +
                        "\n" +
                        "  1. Update the status to DeletePending for the given ACLEntry in the ACL List." +
                        "\n" +
                        "  2. Remove this ACLEntry from the given Node ID." +
                        "\n" +
                        "  1. If this succeeds, remove the given ACLEntry from the Node ACL List." +
                        "\n" +
                        "  2. If not successful, update the Status to CommitFailed and the FailureCode to the returned error. " +
                        "The error shall be handled in a subsequent Node Refresh."
                }
            ]
        },

        {
            tag: "datatype", name: "DatastoreStateEnum", xref: "core§11.24.5.1",

            children: [
                { tag: "field", name: "Pending", description: "Target device operation is pending" },
                { tag: "field", name: "Committed", description: "Target device operation has been committed" },
                { tag: "field", name: "DeletePending", description: "Target device delete operation is pending" },
                { tag: "field", name: "CommitFailed", description: "Target device operation has failed" }
            ]
        },

        {
            tag: "datatype", name: "DatastoreStatusEntryStruct", xref: "core§11.24.5.2",

            children: [
                {
                    tag: "field", name: "State", xref: "core§11.24.5.2.1",
                    details: "This field shall contain the current state of the target device operation."
                },
                {
                    tag: "field", name: "UpdateTimestamp", xref: "core§11.24.5.2.2",
                    details: "This field shall contain the timestamp of the last update."
                },
                {
                    tag: "field", name: "FailureCode", xref: "core§11.24.5.2.3",
                    details: "This field shall contain the Status Code of the last failed operation where the State field is set " +
                        "to CommitFailure."
                }
            ]
        },

        {
            tag: "datatype", name: "DatastoreNodeKeySetEntryStruct", xref: "core§11.24.5.3",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.5.3.1",
                    details: "The unique identifier for the node."
                },
                {
                    tag: "field", name: "StatusEntry", xref: "core§11.24.5.3.3",
                    details: "Indicates whether entry in this list is pending, committed, delete-pending, or commit-failed."
                }
            ]
        },

        {
            tag: "datatype", name: "DatastoreAccessControlEntryPrivilegeEnum", xref: "core§11.24.5.4",

            children: [
                { tag: "field", name: "View", description: "Can read and observe all (except Access Control Cluster)" },
                {
                    tag: "field", name: "Operate",
                    description: "View privileges, and can perform the primary function of this Node (except Access Control Cluster)"
                },
                {
                    tag: "field", name: "Manage",
                    description: "Operate privileges, and can modify persistent configuration of this Node (except Access Control Cluster)"
                },
                {
                    tag: "field", name: "Administer",
                    description: "Manage privileges, and can observe and modify the Access Control Cluster"
                }
            ]
        },

        {
            tag: "datatype", name: "DatastoreGroupInformationEntryStruct", xref: "core§11.24.5.5",

            children: [
                {
                    tag: "field", name: "GroupId", xref: "core§11.24.5.5.1",
                    details: "The unique identifier for the group."
                },
                {
                    tag: "field", name: "FriendlyName", xref: "core§11.24.5.5.2",
                    details: "The friendly name for the group."
                },

                {
                    tag: "field", name: "GroupKeySetId", xref: "core§11.24.5.5.3",

                    details: "The unique identifier for the group key set." +
                        "\n" +
                        "This value may be null when multicast communication is not used for the group. When GroupPermission " +
                        "is Admin or Manage, this value shall be null." +
                        "\n" +
                        "A value of 0 is not allowed since this value is reserved for IPK and the group entry for this value " +
                        "is not managed by the Datastore."
                },

                {
                    tag: "field", name: "GroupCat", xref: "core§11.24.5.5.4",

                    details: "CAT value for this group. This is used for control of individual members of a group (non-broadcast " +
                        "commands)." +
                        "\n" +
                        "Allowable values include the range 0x0000 to 0xEFFF, and the Administrator CAT and Anchor CAT " +
                        "values." +
                        "\n" +
                        "This value may be null when unicast communication is not used for the group."
                },

                {
                    tag: "field", name: "GroupCatVersion", xref: "core§11.24.5.5.5",
                    details: "Current version number for this CAT." +
                        "\n" +
                        "This value shall be null when GroupCAT value is null."
                },

                {
                    tag: "field", name: "GroupPermission", xref: "core§11.24.5.5.6",
                    details: "The permission level associated with ACL entries for this group. There should be only one " +
                        "Administrator group per fabric, and at most one Manage group per Ecosystem (Vendor Entry)."
                }
            ]
        },

        {
            tag: "datatype", name: "DatastoreBindingTargetStruct", xref: "core§11.24.5.6",
            details: "The DatastoreBindingTargetStruct represents a Binding on a specific Node (identified by the " +
                "DatastoreEndpointBindingEntryStruct) which is managed by the Datastore. Only bindings on a specific " +
                "Node that are fabric-scoped to the Joint Fabric are managed by the Datastore. As a result, " +
                "references to nodes and groups are specific to the Joint Fabric.",

            children: [
                {
                    tag: "field", name: "Node", xref: "core§11.24.5.6.1",
                    details: "This field is the binding's remote target node ID. If the Endpoint field is present, this field " +
                        "shall be present."
                },
                {
                    tag: "field", name: "Group", xref: "core§11.24.5.6.2",
                    details: "This field is the binding's target group ID that represents remote endpoints. If the Endpoint field " +
                        "is present, this field shall NOT be present."
                },
                {
                    tag: "field", name: "Endpoint", xref: "core§11.24.5.6.3",
                    details: "This field is the binding's remote endpoint that the local endpoint is bound to. If the Group field " +
                        "is present, this field shall NOT be present."
                },

                {
                    tag: "field", name: "Cluster", xref: "core§11.24.5.6.4",
                    details: "This field is the binding's cluster ID (client & server) on the local and target endpoint(s). If " +
                        "this field is present, the client cluster shall also exist on this endpoint (with this Binding " +
                        "cluster). If this field is present, the target shall be this cluster on the target endpoint(s)."
                }
            ]
        },

        {
            tag: "datatype", name: "DatastoreEndpointBindingEntryStruct", xref: "core§11.24.5.7",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.5.7.1",
                    details: "The unique identifier for the node."
                },
                {
                    tag: "field", name: "EndpointId", xref: "core§11.24.5.7.2",
                    details: "The unique identifier for the endpoint."
                },

                {
                    tag: "field", name: "ListId", xref: "core§11.24.5.7.3",
                    details: "The unique identifier for the entry in the Datastore's EndpointBindingList attribute, which is a " +
                        "list of DatastoreEndpointBindingEntryStruct." +
                        "\n" +
                        "This field is used to uniquely identify an entry in the EndpointBindingList attribute for the " +
                        "purpose of deletion (RemoveBindingFromEndpointForNode Command)."
                },

                { tag: "field", name: "Binding", xref: "core§11.24.5.7.4", details: "The binding target structure." },
                {
                    tag: "field", name: "StatusEntry", xref: "core§11.24.5.7.5",
                    details: "Indicates whether entry in this list is pending, committed, delete-pending, or commit-failed."
                }
            ]
        },

        {
            tag: "datatype", name: "DatastoreEndpointGroupIDEntryStruct", xref: "core§11.24.5.8",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.5.8.1",
                    details: "The unique identifier for the node."
                },
                {
                    tag: "field", name: "EndpointId", xref: "core§11.24.5.8.2",
                    details: "The unique identifier for the endpoint."
                },
                {
                    tag: "field", name: "GroupId", xref: "core§11.24.5.8.3",
                    details: "The unique identifier for the group."
                },
                {
                    tag: "field", name: "StatusEntry", xref: "core§11.24.5.8.4",
                    details: "Indicates whether entry in this list is pending, committed, delete-pending, or commit-failed."
                }
            ]
        },

        {
            tag: "datatype", name: "DatastoreEndpointEntryStruct", xref: "core§11.24.5.9",
            details: "The DatastoreEndpointEntryStruct represents an Endpoint on a specific Node which is managed by the " +
                "Datastore. Only Nodes on the Joint Fabric are managed by the Datastore. As a result, references to " +
                "NodeID are specific to the Joint Fabric.",

            children: [
                {
                    tag: "field", name: "EndpointId", xref: "core§11.24.5.9.1",
                    details: "The unique identifier for the endpoint."
                },
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.5.9.2",
                    details: "The unique identifier for the node."
                },

                {
                    tag: "field", name: "FriendlyName", xref: "core§11.24.5.9.3",

                    details: "This field shall indicate a user-assigned label for this endpoint, as captured by a Joint Fabric " +
                        "Administrator's user interface. By maintaining this value in the Joint Fabric Datastore, all Joint " +
                        "Fabric Administrators can keep these values synchronized. This is particularly useful for complex " +
                        "multi-application endpoint devices (such as appliances) and for endpoints exposed via a Bridge, " +
                        "where individual endpoints might have custom names assigned by the user. For basic devices, only the " +
                        "node-level FriendlyName might be used." +
                        "\n" +
                        "Administrators may keep this field in sync with the NodeLabel field from the Basic Information or " +
                        "Bridged Basic Information clusters."
                }
            ]
        },

        {
            tag: "datatype", name: "DatastoreAccessControlEntryAuthModeEnum", xref: "core§11.24.5.10",
            children: [
                { tag: "field", name: "Pase", description: "Passcode authenticated session" },
                { tag: "field", name: "Case", description: "Certificate authenticated session" },
                { tag: "field", name: "Group", description: "Group authenticated session" }
            ]
        },

        { tag: "datatype", name: "DatastoreAccessControlTargetStruct", xref: "core§11.24.5.11" },

        {
            tag: "datatype", name: "DatastoreAccessControlEntryStruct", xref: "core§11.24.5.12",
            details: "The DatastoreAccessControlEntryStruct represents an ACL on a specific Node (identified by the " +
                "DatastoreACLEntryStruct) which is managed by the Datastore. Only ACLs on a specific Node that are " +
                "fabric-scoped to the Joint Fabric are managed by the Datastore. As a result, references to nodes and " +
                "groups are specific to the Joint Fabric."
        },

        {
            tag: "datatype", name: "DatastoreACLEntryStruct", xref: "core§11.24.5.13",
            details: "The DatastoreACLEntryStruct is a holder for an ACL (DatastoreAccessControlEntryStruct) on a specific " +
                "Node which is managed by the Datastore. Only ACLs on a specific Node that are fabric-scoped to the " +
                "Joint Fabric are managed by the Datastore. As a result, references to nodes and groups are specific " +
                "to the Joint Fabric.",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.5.13.1",
                    details: "The unique identifier for the node."
                },
                {
                    tag: "field", name: "ListId", xref: "core§11.24.5.13.2",
                    details: "The unique identifier for the ACL entry in the Datastore's list of DatastoreACLEntry."
                },
                {
                    tag: "field", name: "AclEntry", xref: "core§11.24.5.13.3",
                    details: "The Access Control Entry structure."
                },
                {
                    tag: "field", name: "StatusEntry", xref: "core§11.24.5.13.4",
                    details: "Indicates whether entry in this list is pending, committed, delete-pending, or commit-failed."
                }
            ]
        },

        {
            tag: "datatype", name: "DatastoreNodeInformationEntryStruct", xref: "core§11.24.5.14",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.5.14.1",
                    details: "The unique identifier for the node."
                },

                {
                    tag: "field", name: "FriendlyName", xref: "core§11.24.5.14.2",

                    details: "This field shall contain a user-assigned label for this node, as captured by a Joint Fabric " +
                        "Administrator's user interface. By maintaining this value in the Joint Fabric Datastore, all Joint " +
                        "Fabric Administrators can keep these values synchronized. This value is not propagated to the node " +
                        "itself." +
                        "\n" +
                        "Administrators may keep this field in sync with the NodeLabel field from the Basic Information or " +
                        "Bridged Basic Information clusters."
                },

                {
                    tag: "field", name: "CommissioningStatusEntry", xref: "core§11.24.5.14.3",
                    details: "Set to Pending prior to completing commissioning, set to Committed after commissioning complete is " +
                        "successful, or set to CommitFailed if commissioning failed with the FailureCode Field set to the " +
                        "error."
                }
            ]
        },

        {
            tag: "datatype", name: "DatastoreAdministratorInformationEntryStruct", xref: "core§11.24.5.15",

            children: [
                {
                    tag: "field", name: "NodeId", xref: "core§11.24.5.15.1",
                    details: "The unique identifier for the node."
                },
                {
                    tag: "field", name: "FriendlyName", xref: "core§11.24.5.15.2",
                    details: "Friendly name for this node which is not propagated to nodes."
                },
                { tag: "field", name: "VendorId", xref: "core§11.24.5.15.3", details: "The Vendor ID for the node." },
                { tag: "field", name: "Icac", xref: "core§11.24.5.15.4", details: "The ICAC used to issue the NOC." }
            ]
        },

        {
            tag: "datatype", name: "DatastoreGroupKeySecurityPolicyEnum", xref: "core§11.24.5.16",
            children: [
                { tag: "field", name: "TrustFirst", description: "Message counter synchronization using trust-first" }
            ]
        },

        {
            tag: "datatype", name: "DatastoreGroupKeyMulticastPolicyEnum", xref: "core§11.24.5.17",

            children: [
                {
                    tag: "field", name: "PerGroupId",
                    description: "Indicates filtering of multicast messages for a specific Group ID"
                },
                { tag: "field", name: "AllNodes", description: "Indicates not filtering of multicast messages" }
            ]
        },

        { tag: "datatype", name: "DatastoreGroupKeySetStruct", xref: "core§11.24.5.18" }
    ]
});
