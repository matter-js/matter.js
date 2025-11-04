/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "GroupKeyManagement", pics: "GRPKEY", xref: "core§11.2",

    details: "The Group Key Management cluster manages group keys for the node. The cluster is scoped to the node " +
        "and is a singleton for the node. This cluster maintains a list of groups supported by the node. Each " +
        "group list entry supports a single group, with a single group ID and single group key. Duplicate " +
        "groups are not allowed in the list. Additions or removal of a group entry are performed via " +
        "modifications of the list. Such modifications require Administer privilege." +
        "\n" +
        "Each group entry includes a membership list of zero of more endpoints that are members of the group " +
        "on the node. Modification of this membership list is done via the Groups cluster, which is scoped to " +
        "an endpoint. See the Chapter 9, System Model Specification specification for more information on " +
        "groups.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§11.2.4",
            children: [
                { tag: "field", name: "CS", details: "The ability to support CacheAndSync security policy and MCSP." }
            ]
        },

        {
            tag: "attribute", name: "GroupKeyMap", xref: "core§11.2.6.1",
            details: "This attribute is a list of GroupKeyMapStruct entries. Each entry associates a logical Group Id with " +
                "a particular group key set."
        },

        {
            tag: "attribute", name: "GroupTable", xref: "core§11.2.6.2",

            details: "This attribute is a list of GroupInfoMapStruct entries. Each entry provides read-only information " +
                "about how a given logical Group ID maps to a particular set of endpoints, and a name for the group." +
                "\n" +
                "The content of this attribute reflects data managed via the Groups cluster (see AppClusters), and is " +
                "in general terms referred to as the 'node-wide Group Table'." +
                "\n" +
                "The GroupTable shall NOT contain any entry whose GroupInfoMapStruct has an empty Endpoints list. If " +
                "a RemoveGroup or RemoveAllGroups command causes the removal of a group mapping from its last mapped " +
                "endpoint, the entire GroupTable entry for that given GroupId shall be removed."
        },

        {
            tag: "attribute", name: "MaxGroupsPerFabric", xref: "core§11.2.6.3",
            details: "Indicates the maximum number of groups that this node supports per fabric. The value of this " +
                "attribute shall be set to be no less than the required minimum supported groups as specified in " +
                "Section 2.11.1.2, “Group Limits”. The length of the GroupKeyMap and GroupTable list attributes shall " +
                "NOT exceed the value of the MaxGroupsPerFabric attribute multiplied by the number of supported " +
                "fabrics."
        },

        {
            tag: "attribute", name: "MaxGroupKeysPerFabric", xref: "core§11.2.6.4",
            details: "Indicates the maximum number of group key sets this node supports per fabric. The value of this " +
                "attribute shall be set according to the minimum number of group key sets to support as specified in " +
                "Section 2.11.1.2, “Group Limits”."
        },

        {
            tag: "command", name: "KeySetWrite", xref: "core§11.2.7.1",

            details: "This command is used by Administrators to set the state of a given Group Key Set, including " +
                "atomically updating the state of all epoch keys." +
                "\n" +
                "### Effect on Receipt" +
                "\n" +
                "The following validations shall be done against the content of the GroupKeySet field:" +
                "\n" +
                "  • If the EpochKey0 field is null or its associated EpochStartTime0 field is null, then this " +
                "    command shall fail with an INVALID_COMMAND status code responded to the client." +
                "\n" +
                "  • If the EpochKey0 field’s length is not exactly 16 bytes, then this command shall fail with a " +
                "    CONSTRAINT_ERROR status code responded to the client." +
                "\n" +
                "  • If the EpochStartTime0 is set to 0, then this command shall fail with an INVALID_COMMAND status " +
                "    code responded to the client. Note that internally, a GroupKeySetStruct’s EpochStartTime0 may be " +
                "    set to zero, due to the behavior of the AddNOC command which synthesizes a GroupKeySetStruct " +
                "    (see Section 11.18.6.8.1, “IPKValue Field”). However, the value 0 is illegal in the GroupKeySet " +
                "    field sent by a client." +
                "\n" +
                "  • If the EpochKey1 field is not null, then the EpochKey0 field shall NOT be null. Otherwise this " +
                "    command shall fail with an INVALID_COMMAND status code responded to the client." +
                "\n" +
                "  • If the EpochKey1 field is not null, and the field’s length is not exactly 16 bytes, then this " +
                "    command shall fail with a CONSTRAINT_ERROR status code responded to the client." +
                "\n" +
                "  • If the EpochKey1 field is not null, its associated EpochStartTime1 field shall NOT be null and " +
                "    shall contain a later epoch start time than the epoch start time found in the EpochStartTime0 " +
                "    field. Otherwise this command shall fail with an INVALID_COMMAND status code responded to the " +
                "    client." +
                "\n" +
                "  • If exactly one of the EpochKey1 or EpochStartTime1 is null, rather than both being null, or " +
                "    neither being null, then this command shall fail with an INVALID_COMMAND status code responded " +
                "    to the client." +
                "\n" +
                "  • If the EpochKey2 field is not null, then the EpochKey1 and EpochKey0 fields shall NOT be null. " +
                "    Otherwise this command shall fail with an INVALID_COMMAND status code responded to the client." +
                "\n" +
                "  • If the EpochKey2 field is not null, and the field’s length is not exactly 16 bytes, then this " +
                "    command shall fail with a CONSTRAINT_ERROR status code responded to the client." +
                "\n" +
                "  • If the EpochKey2 field is not null, its associated EpochStartTime2 field shall NOT be null and " +
                "    shall contain a later epoch start time than the epoch start time found in the EpochStartTime1 " +
                "    field. Otherwise this command shall fail with an INVALID_COMMAND status code responded to the " +
                "    client." +
                "\n" +
                "  • If exactly one of the EpochKey2 or EpochStartTime2 is null, rather than both being null, or " +
                "    neither being null, then this command shall fail with an INVALID_COMMAND status code responded " +
                "    to the client." +
                "\n" +
                "If there exists a Group Key Set associated with the accessing fabric which has the same " +
                "GroupKeySetID as that provided in the GroupKeySet field, then the contents of that group key set " +
                "shall be replaced. A replacement shall be done by executing the equivalent of entirely removing the " +
                "previous Group Key Set with the given GroupKeySetID, followed by an addition of a Group Key Set with " +
                "the provided configuration. Otherwise, if the GroupKeySetID did not match an existing entry, a new " +
                "Group Key Set associated with the accessing fabric shall be created with the provided data. The " +
                "Group Key Set shall be written to non-volatile storage." +
                "\n" +
                "Upon completion, this command shall send a status code back to the initiator:" +
                "\n" +
                "  • If the Group Key Set was properly installed or updated on the Node, the status code shall be set " +
                "    to SUCCESS." +
                "\n" +
                "  • If there are insufficient resources on the receiver to store an additional Group Key Set, the " +
                "    status code shall be set to RESOURCE_EXHAUSTED (see Section 2.11.1.2, “Group Limits”);" +
                "\n" +
                "  • Otherwise, this status code shall be set to FAILURE."
        },

        {
            tag: "command", name: "KeySetRead", xref: "core§11.2.7.2",

            details: "This command is used by Administrators to read the state of a given Group Key Set." +
                "\n" +
                "### Effect on Receipt" +
                "\n" +
                "If there exists a Group Key Set associated with the accessing fabric which has the same " +
                "GroupKeySetID as that provided in the GroupKeySetID field, then the contents of that Group Key Set " +
                "shall be sent in a KeySetReadResponse command, but with the EpochKey0, EpochKey1 and EpochKey2 " +
                "fields replaced by null." +
                "\n" +
                "Otherwise, if the GroupKeySetID does not refer to a Group Key Set associated with the accessing " +
                "fabric, then this command shall fail with a NOT_FOUND status code."
        },

        {
            tag: "command", name: "KeySetReadResponse", xref: "core§11.2.7.3",
            details: "This command shall be generated in response to the KeySetRead command, if a valid Group Key Set was " +
                "found. It shall contain the configuration of the requested Group Key Set, with the EpochKey0, " +
                "EpochKey1 and EpochKey2 key contents replaced by null."
        },

        {
            tag: "command", name: "KeySetRemove", xref: "core§11.2.7.4",

            details: "This command is used by Administrators to remove all state of a given Group Key Set." +
                "\n" +
                "### Effect on Receipt" +
                "\n" +
                "If there exists a Group Key Set associated with the accessing fabric which has the same " +
                "GroupKeySetID as that provided in the GroupKeySetID field, then the contents of that Group Key Set " +
                "shall be removed, including all epoch keys it contains." +
                "\n" +
                "If there exist any entries for the accessing fabric within the GroupKeyMap attribute that refer to " +
                "the GroupKeySetID just removed, then these entries shall be removed from that list." +
                "\n" +
                "This command shall fail with an INVALID_COMMAND status code back to the initiator if the " +
                "GroupKeySetID being removed is 0, which is the Key Set associated with the Identity Protection Key " +
                "(IPK). The only method to remove the IPK is usage of the RemoveFabric command or any operation which " +
                "causes the equivalent of a RemoveFabric to occur by side-effect." +
                "\n" +
                "This command shall send a SUCCESS status code back to the initiator on success, or NOT_FOUND if the " +
                "GroupKeySetID requested did not exist."
        },

        {
            tag: "command", name: "KeySetReadAllIndices", xref: "core§11.2.7.5",

            details: "This command is used by Administrators to query a list of all Group Key Sets associated with the " +
                "accessing fabric." +
                "\n" +
                "### Effect on Receipt" +
                "\n" +
                "Upon receipt, this command shall iterate all stored GroupKeySetStruct associated with the accessing " +
                "fabric and generate a KeySetReadAllIndicesResponse command containing the list of GroupKeySetID " +
                "values from those structs."
        },

        {
            tag: "command", name: "KeySetReadAllIndicesResponse", xref: "core§11.2.7.6",
            details: "This command shall be generated in response to KeySetReadAllIndices and it shall contain the list of " +
                "GroupKeySetID for all Group Key Sets associated with the scoped Fabric.",

            children: [{
                tag: "field", name: "GroupKeySetIDs", xref: "core§11.2.7.6.1",
                details: "This field references the set of group keys that generate operational group keys for use with the " +
                    "accessing fabric." +
                    "\n" +
                    "Each entry in GroupKeySetIDs is a GroupKeySetID field."
            }]
        },

        {
            tag: "datatype", name: "GroupKeySecurityPolicyEnum", xref: "core§11.2.5.1",

            children: [
                { tag: "field", name: "TrustFirst", description: "Message counter synchronization using trust-first" },
                {
                    tag: "field", name: "CacheAndSync",
                    description: "Message counter synchronization using cache-and-sync"
                }
            ]
        },

        {
            tag: "datatype", name: "GroupKeyMulticastPolicyEnum", xref: "core§11.2.5.2",

            children: [
                {
                    tag: "field", name: "PerGroupId",
                    description: "Indicates filtering of multicast messages for a specific Group ID",
                    xref: "core§11.2.5.2.1",
                    details: "The 16-bit Group Identifier of the Multicast Address shall be the Group ID of the group."
                },

                {
                    tag: "field", name: "AllNodes", description: "Indicates not filtering of multicast messages",
                    xref: "core§11.2.5.2.2",
                    details: "The 16-bit Group Identifier of the Multicast Address shall be 0xFFFF."
                }
            ]
        },

        {
            tag: "datatype", name: "GroupKeyMapStruct", xref: "core§11.2.5.3",

            children: [
                {
                    tag: "field", name: "GroupId", xref: "core§11.2.5.3.1",
                    details: "This field uniquely identifies the group within the scope of the given Fabric."
                },

                {
                    tag: "field", name: "GroupKeySetId", xref: "core§11.2.5.3.2",
                    details: "This field references the set of group keys that generate operational group keys for use with this " +
                        "group, as specified in Section 4.17.3.5.1, “Group Key Set ID”." +
                        "\n" +
                        "A GroupKeyMapStruct shall NOT accept GroupKeySetID of 0, which is reserved for the IPK."
                }
            ]
        },

        {
            tag: "datatype", name: "GroupKeySetStruct", xref: "core§11.2.5.4",

            children: [
                {
                    tag: "field", name: "GroupKeySetId", xref: "core§11.2.5.4.1",
                    details: "This field shall provide the fabric-unique index for the associated group key set, as specified in " +
                        "Section 4.17.3.5.1, “Group Key Set ID”."
                },

                {
                    tag: "field", name: "GroupKeySecurityPolicy", xref: "core§11.2.5.4.2",
                    details: "This field shall provide the security policy for an operational group key set." +
                        "\n" +
                        "When CacheAndSync is not supported in the FeatureMap of this cluster, any action attempting to set " +
                        "CacheAndSync in the GroupKeySecurityPolicy field shall fail with an INVALID_COMMAND error."
                },

                {
                    tag: "field", name: "EpochKey0", xref: "core§11.2.5.4.3",
                    details: "This field, if not null, shall be the root credential used in the derivation of an operational group " +
                        "key for epoch slot 0 of the given group key set. If EpochKey0 is not null, EpochStartTime0 shall NOT " +
                        "be null."
                },

                {
                    tag: "field", name: "EpochStartTime0", xref: "core§11.2.5.4.4",
                    details: "This field, if not null, shall define when EpochKey0 becomes valid as specified by Section 4.17.3, " +
                        "“Epoch Keys”. Units are absolute UTC time in microseconds encoded using the epoch-us representation."
                },

                {
                    tag: "field", name: "EpochKey1", xref: "core§11.2.5.4.5",
                    details: "This field, if not null, shall be the root credential used in the derivation of an operational group " +
                        "key for epoch slot 1 of the given group key set. If EpochKey1 is not null, EpochStartTime1 shall NOT " +
                        "be null."
                },

                {
                    tag: "field", name: "EpochStartTime1", xref: "core§11.2.5.4.6",
                    details: "This field, if not null, shall define when EpochKey1 becomes valid as specified by Section 4.17.3, " +
                        "“Epoch Keys”. Units are absolute UTC time in microseconds encoded using the epoch-us representation."
                },

                {
                    tag: "field", name: "EpochKey2", xref: "core§11.2.5.4.7",
                    details: "This field, if not null, shall be the root credential used in the derivation of an operational group " +
                        "key for epoch slot 2 of the given group key set. If EpochKey2 is not null, EpochStartTime2 shall NOT " +
                        "be null."
                },

                {
                    tag: "field", name: "EpochStartTime2", xref: "core§11.2.5.4.8",
                    details: "This field, if not null, shall define when EpochKey2 becomes valid as specified by Section 4.17.3, " +
                        "“Epoch Keys”. Units are absolute UTC time in microseconds encoded using the epoch-us representation."
                },

                {
                    tag: "field", name: "GroupKeyMulticastPolicy", xref: "core§11.2.5.4.9",

                    details: "This field specifies how the IPv6 Multicast Address shall be formed for groups using this " +
                        "operational group key set." +
                        "\n" +
                        "The PerGroupID method maximizes filtering of multicast messages, so that receiving nodes receive " +
                        "only multicast messages for groups to which they are subscribed." +
                        "\n" +
                        "The AllNodes method minimizes the number of multicast addresses to which a receiver node needs to " +
                        "subscribe." +
                        "\n" +
                        "> [!NOTE]" +
                        "\n" +
                        "> Support for GroupKeyMulticastPolicy is provisional. Correct default behavior is that implied by " +
                        "  value PerGroupID."
                }
            ]
        },

        {
            tag: "datatype", name: "GroupInfoMapStruct", xref: "core§11.2.5.5",

            children: [
                {
                    tag: "field", name: "GroupId", xref: "core§11.2.5.5.1",
                    details: "This field uniquely identifies the group within the scope of the given Fabric."
                },
                {
                    tag: "field", name: "Endpoints", xref: "core§11.2.5.5.2",
                    details: "This field provides the list of Endpoint IDs on the Node to which messages to this group shall be " +
                        "forwarded."
                },
                {
                    tag: "field", name: "GroupName", xref: "core§11.2.5.5.3",
                    details: "This field provides a name for the group. This field shall contain the last GroupName written for a " +
                        "given GroupId on any Endpoint via the Groups cluster."
                }
            ]
        }
    ]
});
