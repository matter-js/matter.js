/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "GroupKeyManagement", pics: "GRPKEY", xref: "core§11.2",

    details: "The Group Key Management cluster manages shared symmetric keys for the node. The cluster is scoped " +
        "to the node and is a singleton for the node. This cluster maintains a list of groups supported by " +
        "the node. Each group list entry supports a single group, with a single group ID and single group " +
        "key. Duplicate groups are not allowed in the list. Additions or removal of a group entry are " +
        "performed via modifications of the list. Such modifications require Administer privilege." +
        "\n" +
        "Each group entry includes a membership list of zero of more endpoints that are members of the group " +
        "on the node. Modification of this membership list is done via the Groups cluster, which is scoped to " +
        "an endpoint. See the Chapter 9, System Model Specification specification for more information on " +
        "groups.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§11.2.4",

            children: [
                {
                    tag: "field", name: "CS", xref: "core§11.2.4.1",
                    details: "The CacheAndSync security policy has been provisional since Matter v1.0."
                },

                {
                    tag: "field", name: "GCAST", xref: "core§11.2.4.2",

                    details: "When set, group management and group key mapping is done using the Section 11.27, \"Groupcast " +
                        "Cluster\"." +
                        "\n" +
                        "If the Groupcast cluster is present on the Root Node endpoint, then this feature bit shall be set." +
                        "\n" +
                        "When this feature map bit is set, this cluster SHOULD be used solely for key management as the " +
                        "Groupcast cluster offers more direct and long-term supported methods of managing group key mapping."
                }
            ]
        },

        {
            tag: "attribute", name: "GroupKeyMap", xref: "core§11.2.6.1",

            details: "If the GCAST feature bit is set in the FeatureMap attribute, the following rules apply to the " +
                "accessing Fabric:" +
                "\n" +
                "  - When Groupcast is adopted (the GroupcastAdoption entry has GroupcastAdopted set to true):" +
                "\n" +
                "  - This attribute shall be empty." +
                "\n" +
                "  - Any attempt to write to this attribute shall fail with an INVALID_IN_STATE status code." +
                "\n" +
                "  - Otherwise (Groupcast is not adopted or the entry is missing):" +
                "\n" +
                "  - This attribute shall contain the Group Key Set mappings derived from the Groupcast cluster's " +
                "Membership attribute (one mapping per group per fabric)." +
                "\n" +
                "  - GroupKeyMapStruct entry updates shall cause the associated Groupcast cluster's Membership " +
                "attribute (by GroupID) to be updated with the provided GroupKeySetID. If an entry is missing for " +
                "a given GroupID in the GroupKeyMap, which exists in the Groupcast cluster's Membership attribute " +
                "for a given fabric, then the Groupcast cluster's membership attribute shall use placeholder " +
                "value 65535 for the KeySetID. While this KeySetID is technically valid, administrators SHOULD " +
                "avoid allocating it for actual usage to avoid value aliasing for this field." +
                "\n" +
                "This attribute is a list of GroupKeyMapStruct entries. Each entry associates a logical Group Id with " +
                "a particular group key set."
        },

        {
            tag: "attribute", name: "GroupTable", xref: "core§11.2.6.2",

            details: "If the GCAST feature is set in the FeatureMap:" +
                "\n" +
                "  - If the GroupcastAdoption attribute has an entry for the accessing Fabric and that entry has the " +
                "GroupcastAdopted field set to true, then this field shall be empty." +
                "\n" +
                "  - Else this attribute shall contain the Group mappings computed in equivalence to the Groupcast " +
                "cluster's Membership attribute (one mapping per group per fabric)." +
                "\n" +
                "This attribute is a list of GroupInfoMapStruct entries. Each entry provides read-only information " +
                "about how a given logical Group ID maps to a particular set of endpoints, and a name for the group. " +
                "The content of this attribute reflects data managed via the Groups cluster (see " +
                "[[AppClusters]](#ref_AppClusters)), and is in general terms referred to as the 'node-wide Group " +
                "Table'." +
                "\n" +
                "The GroupTable shall NOT contain any entry whose GroupInfoMapStruct has an empty Endpoints list. If " +
                "a RemoveGroup or RemoveAllGroups command causes the removal of a group mapping from its last mapped " +
                "endpoint, the entire GroupTable entry for that given GroupId shall be removed."
        },

        {
            tag: "attribute", name: "MaxGroupsPerFabric", xref: "core§11.2.6.3",

            details: "If the Groupcast support is enabled (GCAST feature is set), this shall be set to 0 indicating group " +
                "management is done using the Groupcast cluster and not the legacy Groups cluster." +
                "\n" +
                "Indicates the maximum number of legacy groups that this node supports per fabric. For legacy usage, " +
                "the value of this attribute shall be set to be no less than the required minimum supported groups as " +
                "specified in Section 2.11.1.2, \"Group Limits\"." +
                "\n" +
                "The length of the GroupKeyMap and GroupTable list attributes shall NOT exceed the value of the " +
                "MaxGroupsPerFabric attribute multiplied by the number of supported fabrics."
        },

        {
            tag: "attribute", name: "MaxGroupKeysPerFabric", xref: "core§11.2.6.4",
            details: "Indicates the maximum number of group key sets this node supports per fabric. The value of this " +
                "attribute shall be set according to the minimum number of group key sets to support as specified in " +
                "Section 2.11.1.2, \"Group Limits\"."
        },

        {
            tag: "attribute", name: "GroupcastAdoption", xref: "core§11.2.6.5",

            details: "Indicates whether the accessing fabric claims to have migrated to Groupcast." +
                "\n" +
                "When a Fabric's entry has the GroupcastAdopted field set to true, the behavior of the GroupKeyMap " +
                "and GroupTable attributes will change (see description of respective attributes)." +
                "\n" +
                "There shall NOT be more than 1 entry per fabric in this attribute." +
                "\n" +
                "If a Fabric has not yet written an entry for themselves, the server shall act as if that Fabric had " +
                "written an entry with GroupcastAdopted set to false, even if not present in the list."
        },

        {
            tag: "command", name: "KeySetWrite", xref: "core§11.2.7.1",
            details: "This command is used by Administrators to set the state of a given Group Key Set, including " +
                "atomically updating the state of all epoch keys."
        },
        {
            tag: "command", name: "KeySetRead", xref: "core§11.2.7.2",
            details: "This command is used by Administrators to read the state of a given Group Key Set."
        },

        {
            tag: "command", name: "KeySetReadResponse", xref: "core§11.2.7.3",
            details: "This command shall be generated in response to the KeySetRead command, if a valid Group Key Set was " +
                "found. It shall contain the configuration of the requested Group Key Set, with the EpochKey0, " +
                "EpochKey1 and EpochKey2 key contents replaced by null."
        },

        {
            tag: "command", name: "KeySetRemove", xref: "core§11.2.7.4",
            details: "This command is used by Administrators to remove all state of a given Group Key Set."
        },
        {
            tag: "command", name: "KeySetReadAllIndices", xref: "core§11.2.7.5",
            details: "This command is used by Administrators to query a list of all Group Key Sets associated with the " +
                "accessing fabric."
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
                        "group, as specified in Section 4.17.3.5.1, \"Group Key Set ID\"." +
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
                        "Section 4.17.3.5.1, \"Group Key Set ID\"."
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
                    details: "This field, if not null, shall be the InputKey used in the derivation of an OperationalGroupKey for " +
                        "epoch slot 0 of the given group key set. The derived OperationalGroupKey shall be persistently " +
                        "stored for the lifetime of the derived key; however, the InputKey itself shall NOT be stored. If " +
                        "EpochKey0 is not null, EpochStartTime0 shall NOT be null."
                },

                {
                    tag: "field", name: "EpochStartTime0", xref: "core§11.2.5.4.4",
                    details: "This field, if not null, shall define when EpochKey0 becomes valid as specified by Section 4.17.3, " +
                        "\"Epoch Keys\". Units are absolute UTC time in microseconds encoded using the epoch-us representation."
                },

                {
                    tag: "field", name: "EpochKey1", xref: "core§11.2.5.4.5",
                    details: "This field, if not null, shall be the InputKey used in the derivation of an OperationalGroupKey for " +
                        "epoch slot 1 of the given group key set. The derived OperationalGroupKey shall be persistently " +
                        "stored for the lifetime of the derived key; however, the InputKey itself shall NOT be stored. If " +
                        "EpochKey1 is not null, EpochStartTime1 shall NOT be null."
                },

                {
                    tag: "field", name: "EpochStartTime1", xref: "core§11.2.5.4.6",
                    details: "This field, if not null, shall define when EpochKey1 becomes valid as specified by Section 4.17.3, " +
                        "\"Epoch Keys\". Units are absolute UTC time in microseconds encoded using the epoch-us representation."
                },

                {
                    tag: "field", name: "EpochKey2", xref: "core§11.2.5.4.7",

                    details: "If the GCAST feature bit is set in the FeatureMap, this field shall be null, unless the " +
                        "GroupKeySetId is 0 (the Identity Protection Key)." +
                        "\n" +
                        "This field, if not null, shall be the InputKey used in the derivation of an OperationalGroupKey for " +
                        "epoch slot 2 of the given group key set. The derived OperationalGroupKey shall be persistently " +
                        "stored for the lifetime of the derived key; however, the InputKey itself shall NOT be stored. If " +
                        "EpochKey2 is not null, EpochStartTime2 shall NOT be null."
                },

                {
                    tag: "field", name: "EpochStartTime2", xref: "core§11.2.5.4.8",
                    details: "If the GCAST feature bit is set in the FeatureMap, this field shall be null, unless the " +
                        "GroupKeySetId is 0 (the Identity Protection Key)." +
                        "\n" +
                        "This field, if not null, shall define when EpochKey2 becomes valid as specified by Section 4.17.3, " +
                        "\"Epoch Keys\". Units are absolute UTC time in microseconds encoded using the epoch-us representation."
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
        },

        {
            tag: "datatype", name: "GroupcastAdoptionStruct", xref: "core§11.2.5.6",
            children: [{
                tag: "field", name: "GroupcastAdopted", xref: "core§11.2.5.6.1",
                details: "This field shall indicate whether Groupcast was adopted by the associated Fabric's administrators."
            }]
        }
    ]
});
