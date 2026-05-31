/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "Groupcast", pics: "GC", xref: "core§11.27",

        details: "The Groupcast Cluster defines a unified, simpler, and more scalable mechanism for configuring, " +
            "managing, and using groups in Matter. It is designed to replace the legacy Groups cluster, " +
            "addressing long-standing limitations that have made group configuration complex and inconsistently " +
            "supported across devices and ecosystems." +
            "\n" +
            "The Groupcast Cluster consolidates group-related functionality that was previously distributed " +
            "across multiple clusters into a single, coherent model for membership, addressing, key management, " +
            "and ACL permissions. It introduces the usage of a unique, IANA-defined multicast address, usable by " +
            "all groups, improving support for devices with limited multicast address capacity. The cluster also " +
            "defines a streamlined key management and access control model that reduces storage requirements and " +
            "simplifies controller logic, while remaining compatible with existing security concepts." +
            "\n" +
            "In addition, the Groupcast Cluster explicitly supports specialization of device roles, allowing " +
            "endpoints to operate as group senders, receivers, or both. This enables low-power and " +
            "resource-constrained devices to participate in group communication without incurring unnecessary " +
            "state or processing overhead. Together, these design elements provide a clearer and more " +
            "interoperable basis for group functionality and form the replacement for the legacy Groups cluster." +
            "\n" +
            "> [!NOTE]" +
            "\n" +
            "> NOTE: Support for Groupcast cluster is provisional.",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "core§11.27.4",

                children: [
                    {
                        tag: "field", name: "LN", xref: "core§11.27.4.1",
                        details: "This feature indicates that the device can join one or more Groupcast groups and receive multicast " +
                            "messages targeted to those groups."
                    },

                    {
                        tag: "field", name: "SD", xref: "core§11.27.4.2",
                        details: "This feature indicates the ability to send multicast messages to one or more targeted groups of " +
                            "nodes to which it belongs. Being a sender does not imply the ability to listen to messages sent to " +
                            "those multicast addresses."
                    },

                    { tag: "field", name: "PGA", details: "Supports PerGroup multicast addresses." }
                ]
            },

            {
                tag: "attribute", name: "Membership", xref: "core§11.27.6.1",

                details: "Indicates the list of groups memberships currently active on the node." +
                    "\n" +
                    "Each entry specifies the group ID and the list of the endpoints that participate in that group, as " +
                    "well as policy for that group." +
                    "\n" +
                    "For any single fabric, the server shall limit the total number of GroupIDs used across all entries " +
                    "in the Membership attribute to no more than half (rounded down) of the MaxMembershipCount value." +
                    "\n" +
                    "If processing a command would cause this per-fabric limit to be exceeded, then the resource " +
                    "exhaustion behavior of the associated command shall apply." +
                    "\n" +
                    "Since every MembershipStruct entry only supports up to 255 endpoints in the case where the Listener " +
                    "feature is enabled in the FeatureMap, there may be situations where the server has to employ more " +
                    "than one entry to represent the full list of joined endpoints in the list. In those cases:" +
                    "\n" +
                    "  - The entries associated with such a group shall be consecutive." +
                    "\n" +
                    "  - These entries shall be identical in all fields except the Endpoints field." +
                    "\n" +
                    "  - These entries shall NOT have any intersection of EndpointID values between their Endpoints " +
                    "field." +
                    "\n" +
                    "  - The maximum number of entries over which a group membership is split shall NOT be more than the " +
                    "minimum number of entries needed to fully encode the Endpoints list while respecting that no " +
                    "entry has more than 255 Endpoints listed." +
                    "\n" +
                    "  - Therefore, the maximum number of entries for that group shall be ceil(length(Endpoints) / 255)." +
                    "\n" +
                    "The actual number of entries in the list across all fabrics shall be at most " +
                    "ceil(num_endpoints_in_node / 255) * MaxMembershipCount." +
                    "\n" +
                    "For example, if a Group 123 is joined on endpoints 1 through 300 (i.e. a large group on a large " +
                    "bridge), the following Membership list contents would both be valid examples, and there may be more " +
                    "valid entries matching the rules." +
                    "\n" +
                    "The following examples would be ILLEGAL:"
            },

            {
                tag: "attribute", name: "MaxMembershipCount", xref: "core§11.27.6.2",

                details: "Indicates the maximum number of Groups which can be joined and appear in entries of the Membership " +
                    "attribute." +
                    "\n" +
                    "This attribute does not specify the maximum number of list entries in the Membership attribute list, " +
                    "but rather the maximum number of different GroupID values which can appear across all entries of the " +
                    "list."
            },

            {
                tag: "attribute", name: "MaxMcastAddrCount", xref: "core§11.27.6.3",

                details: "Indicates the maximum number of unique multicast addresses the node can support. The value of this " +
                    "attribute shall be at least 1, to support the IANA Assigned IPv6 Multicast Address." +
                    "\n" +
                    "When the PerGroup feature is supported, this attribute SHOULD be equal to MaxMembershipCount. " +
                    "However, the value may be less than MaxMembershipCount. When the PerGroup feature is supported, the " +
                    "value of this attribute shall be at least 4."
            },

            {
                tag: "attribute", name: "UsedMcastAddrCount", xref: "core§11.27.6.4",
                details: "Indicates the number of unique multicast addresses currently in use by the Groupcast cluster. This " +
                    "count shall include the IANA Assigned IPv6 Multicast Address if at least one group is configured to " +
                    "use the IanaAddr policy. This count shall include one unique multicast address for each group " +
                    "configured to use the PerGroup policy. The value of this attribute shall NOT exceed " +
                    "MaxMcastAddrCount."
            },

            {
                tag: "attribute", name: "FabricUnderTest", xref: "core§11.27.6.5",

                details: "Indicates the FabricIndex of the fabric currently testing the Groupcast feature with the " +
                    "GroupcastTesting command." +
                    "\n" +
                    "The last accessing fabric to have invoked a successful TestGroupcast command that caused testing " +
                    "mode to be engaged shall be the value indicated." +
                    "\n" +
                    "Otherwise, if Groupcast testing is currently disabled, this attribute shall have a value of zero, " +
                    "which is the invalid FabricIndex value." +
                    "\n" +
                    "This attribute shall be set to zero when the server initializes."
            },

            {
                tag: "event", name: "GroupcastTesting", xref: "core§11.27.8.1",
                details: "This event shall be generated during Groupcast testing processing after invocation of the " +
                    "GroupcastTesting command, under the conditions stated in that command's Effect on Receipt section. " +
                    "Some of the fields may be present or absent depending of the test mode involved." +
                    "\n" +
                    "This event shall contain the following fields:",

                children: [
                    {
                        tag: "field", name: "SourceIpAddress", xref: "core§11.27.8.1.1",
                        details: "This field, if present, shall be set to the source IPv6 address obtained from the UDP datagram of " +
                            "the groupcast message."
                    },
                    {
                        tag: "field", name: "DestinationIpAddress", xref: "core§11.27.8.1.2",
                        details: "This field, if present, shall be set to the destination IPv6 group address obtained from the UDP " +
                            "datagram of a groupcast message."
                    },

                    {
                        tag: "field", name: "GroupId", xref: "core§11.27.8.1.3",
                        details: "This field, if present, shall be set to the GroupID associated with the groupcast message. This " +
                            "represents the initial Group ID that led to InvokeRequest processing, the Group ID from the request, " +
                            "or the Group ID used for message transmission."
                    },

                    {
                        tag: "field", name: "EndpointId", xref: "core§11.27.8.1.4",
                        details: "This field, if present, shall be set to the concrete path's endpoint ID derived from the processed " +
                            "request."
                    },
                    {
                        tag: "field", name: "ClusterId", xref: "core§11.27.8.1.5",
                        details: "This field, if present, shall be set to the concrete path's cluster ID derived from the processed " +
                            "request."
                    },
                    {
                        tag: "field", name: "ElementId", xref: "core§11.27.8.1.6",
                        details: "This field, if present, shall be set to the concrete path's element ID (Command ID or Attribute ID) " +
                            "derived from the processed request."
                    },

                    {
                        tag: "field", name: "AccessAllowed", xref: "core§11.27.8.1.7",
                        details: "This field, if present, shall indicate whether the Groupcast sender was allowed to invoke the " +
                            "command by Access Control, in this Node. The value shall be set to true if the request was allowed, " +
                            "and false otherwise."
                    },

                    {
                        tag: "field", name: "GroupcastTestResult", xref: "core§11.27.8.1.8",
                        details: "This field shall indicate the outcome of the groupcast operation or the specific error encountered. " +
                            "The value shall be one of the values defined in GroupcastTestResultEnum."
                    }
                ]
            },

            {
                tag: "command", name: "JoinGroup", xref: "core§11.27.7.1",

                details: "This command shall be used to instruct the server to join a multicast group. It provides a " +
                    "comprehensive way to add all information required to create a new group in one command. This command " +
                    "shall be used to create a new GroupID or to add specified endpoints to an existing GroupID. This " +
                    "command may also be used to change the OperationalGroupKey associated with an existing GroupID, but " +
                    "if this is the only operation desired, the UpdateGroupKey command SHOULD be used instead. This " +
                    "command shall be used following the rules defined in Groupcast Key Management section." +
                    "\n" +
                    "This command shall have the following data fields subject to the listed conformance.",

                children: [
                    {
                        tag: "field", name: "GroupId", xref: "core§11.27.7.1.1",
                        details: "This field shall indicate the destination group to which the server is to be added."
                    },

                    {
                        tag: "field", name: "Endpoints", xref: "core§11.27.7.1.2",
                        details: "This field shall indicate the list of endpoints that shall receive this multicast group's messages. " +
                            "When joining a group as a Sender only, this field shall be empty. For Listeners, this field shall " +
                            "list at least 1 endpoint and up to 20 endpoints. The RootEndpoint (Endpoint 0) shall never be " +
                            "included in the Endpoints list as groupcast commands shall not interact with clusters on the " +
                            "RootEndpoint."
                    },

                    {
                        tag: "field", name: "KeySetId", xref: "core§11.27.7.1.3",

                        details: "This field shall indicate the value used to identify the OperationalGroupKey used for this group." +
                            "\n" +
                            "This field is generated by the administrator in any manner it deems appropriate, ensuring that there " +
                            "is no collision within the fabric. Some examples may include but are not limited to:" +
                            "\n" +
                            "  - Truncated Key Hash" +
                            "\n" +
                            "  - Randomly Generated Value" +
                            "\n" +
                            "  - Key creation count" +
                            "\n" +
                            "    > [!NOTE]" +
                            "\n" +
                            "    > NOTE: This field represents maps to the GroupKeySetID as defined in the Group Key Management " +
                            "cluster."
                    },

                    {
                        tag: "field", name: "Key", xref: "core§11.27.7.1.4",

                        details: "This field shall indicate the value used to derive the OperationalGroupKey." +
                            "\n" +
                            "This key shall be new for the group, with a unique KeySetID that does not exist on the node yet. " +
                            "When a new key is added using this field, a GroupKeySetStruct shall be added automatically to the " +
                            "Group Key Management cluster with the following entries:" +
                            "\n" +
                            "  - GroupKeySetID = KeySetID field" +
                            "\n" +
                            "  - GroupKeySecurityPolicy = TrustFirst" +
                            "\n" +
                            "  - EpochKey0 = Key" +
                            "\n" +
                            "  - EpochStartTime0 = 1" +
                            "\n" +
                            "  - EpochKey1 = null" +
                            "\n" +
                            "  - EpochStartTime1 = null" +
                            "\n" +
                            "  - EpochKey2 = null" +
                            "\n" +
                            "  - EpochStartTime2 = null The derived OperationalGroupKey shall be persistently stored for the " +
                            "lifetime of the group; however, the InputKey itself shall NOT be stored. This field may be " +
                            "omitted to join endpoints to an existing GroupID or to associate the group to a different, " +
                            "pre-existing KeySetID."
                    },

                    {
                        tag: "field", name: "UseAuxiliaryAcl", xref: "core§11.27.7.1.5",
                        details: "When this field is present and set to true, necessary AuxiliaryACL entries shall be generated in the " +
                            "Access Control Cluster referring to each endpoint in the group identified by the given GroupID. When " +
                            "this field is present and set to false, all previously auto-generated AuxiliaryACL entries for the " +
                            "endpoints in this group shall be removed. If this field is omitted, there shall NOT be any change. " +
                            "See the Effect on Receipt section of this command for more detail."
                    },

                    {
                        tag: "field", name: "ReplaceEndpoints", xref: "core§11.27.7.1.6",
                        details: "This field shall indicate whether the Endpoints list of the membership is replaced by the command's " +
                            "Endpoints field, or whether those endpoints are added to the existing membership. See Section " +
                            "11.27.7.1.7, \"Effect on Receipt\"."
                    },

                    {
                        tag: "field", name: "McastAddrPolicy", xref: "core§11.27.7.1.8",
                        details: "This field shall indicate the IPv6 Multicast Address that shall be used by the group. If omitted, " +
                            "the group shall use the IANA-assigned Multicast Address."
                    }
                ]
            },

            {
                tag: "command", name: "LeaveGroup", xref: "core§11.27.7.2",
                details: "This command shall allow a maintainer to request that the server withdraws itself or specific " +
                    "endpoints from a specific group or from all groups of this client's fabric." +
                    "\n" +
                    "This command shall have the following data fields subject to the listed conformance.",

                children: [
                    {
                        tag: "field", name: "GroupId", xref: "core§11.27.7.2.1",
                        details: "This field shall indicate the group affected by this command. The unspecified GroupID 0 shall " +
                            "indicate that all groups on the node for this fabric are affected by the command."
                    },

                    {
                        tag: "field", name: "Endpoints", xref: "core§11.27.7.2.2",
                        details: "This field shall indicate a list of endpoints that shall leave the group identified by the GroupID " +
                            "field. See 4. Omitting this field indicates that the server shall remove itself completely from the " +
                            "group identified by the GroupID field. See 5."
                    }
                ]
            },

            {
                tag: "command", name: "LeaveGroupResponse", xref: "core§11.27.7.3",
                details: "This command shall allow the server to inform the client about the result of the LeaveGroup command." +
                    "\n" +
                    "This command shall have the following data fields subject to the listed conformance.",

                children: [
                    {
                        tag: "field", name: "GroupId", xref: "core§11.27.7.3.1",
                        details: "This field shall indicate the group affected by the LeaveGroup command. The value of this field " +
                            "shall be the same value as the GroupID field in the LeaveGroup command triggering the response."
                    },

                    {
                        tag: "field", name: "Endpoints", xref: "core§11.27.7.3.2",

                        details: "This field shall indicate a list of endpoints that were removed from the group identified by the " +
                            "GroupID field. Endpoints listed in the Endpoints field of the LeaveGroup command that were not " +
                            "members of the affected group shall be excluded from this response." +
                            "\n" +
                            "This field shall be an empty list if any of the following conditions is true: The Endpoints list " +
                            "size exceeds the maximum constraint. The GroupID field is 0, indicating multiple groups were " +
                            "affected, resulting in ambiguous Endpoints list content."
                    }
                ]
            },

            {
                tag: "command", name: "UpdateGroupKey", xref: "core§11.27.7.4",
                details: "This command shall allow a fabric administrator to update the OperationalGroupKey associated with " +
                    "the existing group identified by GroupID, which is already joined. This command shall be used " +
                    "following the rules defined in Groupcast Key Management section." +
                    "\n" +
                    "This command shall have the following data fields subject to the listed conformance.",

                children: [
                    {
                        tag: "field", name: "GroupId", xref: "core§11.27.7.4.1",
                        details: "This field shall indicate the destination group for which the operational key is being updated."
                    },

                    {
                        tag: "field", name: "KeySetId", xref: "core§11.27.7.4.2",

                        details: "This field shall indicate the value used to identify the operational group key used for this group." +
                            "\n" +
                            "This field is generated by the administrator in any manner it deems appropriate, ensuring that there " +
                            "is no collision within the fabric. Some examples may include but are not limited to:" +
                            "\n" +
                            "  - Truncated Key Hash with deduplication such as Cuckoo Hashing" +
                            "\n" +
                            "  - Randomly Generated Value" +
                            "\n" +
                            "  - Key creation count"
                    },

                    {
                        tag: "field", name: "Key", xref: "core§11.27.7.4.3",
                        details: "This field shall indicate the 128-bit InputKey used to derive the OperationalGroupKey for the " +
                            "specified GroupID (per Operational Group Key Derivation). The derived OperationalGroupKey shall be " +
                            "persistently stored for the lifetime of the group; however, the InputKey itself shall NOT be stored."
                    }
                ]
            },

            {
                tag: "command", name: "ConfigureAuxiliaryAcl", xref: "core§11.27.7.5",
                details: "This command shall allow an Administrator to enable or disable the generation of AuxiliaryACL " +
                    "entries in the Access Control Cluster based on the groups joined (see Groupcast Auxiliary ACL " +
                    "Handling)." +
                    "\n" +
                    "This command shall have the following data fields subject to the listed conformance.",

                children: [
                    {
                        tag: "field", name: "GroupId", xref: "core§11.27.7.5.1",
                        details: "This field shall indicate the group for which Auxiliary ACL entry generation state will be " +
                            "enabled/disabled."
                    },

                    {
                        tag: "field", name: "UseAuxiliaryAcl", xref: "core§11.27.7.5.2",

                        details: "This field shall indicate if Auxiliary ACL entries shall be generated or removed." +
                            "\n" +
                            "If the field is set to true, necessary AuxiliaryACL entries shall be generated in the Access Control " +
                            "Cluster referring to each endpoint in the group identified by the given GroupID. Otherwise, if the " +
                            "field is set to false, all previously auto-generated AuxiliaryACL entries for the endpoints in this " +
                            "group shall be removed."
                    }
                ]
            },

            {
                tag: "command", name: "GroupcastTesting", xref: "core§11.27.7.6",
                details: "This command shall allow an Administrator to configure test modes that allow validation of Groupcast " +
                    "communication." +
                    "\n" +
                    "This command shall have the following data fields subject to the listed conformance.",

                children: [
                    {
                        tag: "field", name: "TestOperation", xref: "core§11.27.7.6.1",
                        details: "This field shall identify the type of TestOperation to execute. See Effect on Receipt."
                    },

                    {
                        tag: "field", name: "DurationSeconds", xref: "core§11.27.7.6.2",
                        details: "This field shall indicate the time duration in seconds for the test operation until all testing " +
                            "operations reverts to a disabled state." +
                            "\n" +
                            "This field is ignored when the TestOperation field has a value of DisableTesting."
                    }
                ]
            },

            {
                tag: "datatype", name: "MulticastAddrPolicyEnum", xref: "core§11.27.5.1",

                children: [
                    {
                        tag: "field", name: "IanaAddr",
                        description: "Indicates group uses the IANA-assigned multicast address (default)",
                        xref: "core§11.27.5.1.1",

                        details: "The Multicast Address of the group shall be the IANA Assigned IPv6 Multicast Address." +
                            "\n" +
                            "The IanaAddr method minimizes the number of multicast addresses to which a node must subscribe, " +
                            "reducing the state it must maintain. This approach comes at the cost of receiving multicast traffic " +
                            "for all groups that use this policy, potentially from any fabric. The node will then filter this " +
                            "traffic at the message layer by attempting decryption with its available group keys. Due to various " +
                            "network infrastructure scalability limits, such as the maximum number of MPL registrations a Border " +
                            "Router can support, a controller SHOULD default to configure all groups to use the AllNodes address."
                    },

                    {
                        tag: "field", name: "PerGroup",
                        description: "Group uses multicast address scoped to Fabric ID and Group ID",
                        xref: "core§11.27.5.1.2",

                        details: "The 16-bit Group Identifier of the Multicast Address shall be the Group ID of the group." +
                            "\n" +
                            "The PerGroupID multicast address policy maximizes network-layer filtering, ensuring that a node only " +
                            "receives multicast traffic for groups to which it has subscribed. This method requires a node to " +
                            "join a unique multicast group for each (fabric, group) combination that uses this policy. This " +
                            "method SHOULD be reserved for the following purposes: . Use by groups with listener members that " +
                            "require extra filtering at the network layer, such as low power devices. . Use by groups with " +
                            "members that include legacy listeners running a version 2 or earlier of this cluster. Controllers " +
                            "SHOULD limit the number of groups that use this policy within a network environment to account for " +
                            "infrastructure limits mentioned above."
                    }
                ]
            },

            {
                tag: "datatype", name: "GroupcastTestingEnum", xref: "core§11.27.5.2",
                details: "See the GroupcastTesting command for a description of these operations.",
                children: [
                    { tag: "field", name: "DisableTesting", description: "Disable all test event generation" },
                    { tag: "field", name: "EnableListenerTesting", description: "Enable Listener test event generation" },
                    { tag: "field", name: "EnableSenderTesting", description: "Enable Sender test event generation" }
                ]
            },

            {
                tag: "datatype", name: "GroupcastTestResultEnum", xref: "core§11.27.5.3",

                children: [
                    { tag: "field", name: "Success", description: "There was no failure" },
                    {
                        tag: "field", name: "GeneralError",
                        description: "Other error during processing not otherwise covered"
                    },
                    {
                        tag: "field", name: "MessageReplay",
                        description: "Message counter was <= counter from last received"
                    },
                    { tag: "field", name: "FailedAuth", description: "Message authentication failed" },
                    { tag: "field", name: "NoAvailableKey", description: "No key was found to process the message" },
                    {
                        tag: "field", name: "SendFailure",
                        description: "Issue with attempting to send a multicast IPv6 message"
                    }
                ]
            },

            {
                tag: "datatype", name: "MembershipStruct", xref: "core§11.27.5.4",

                children: [
                    {
                        tag: "field", name: "GroupId", xref: "core§11.27.5.4.1",
                        details: "This field shall indicate an identifier for the multicast group within the fabric. Group Identifier " +
                            "is a 16-bit value that shall be assigned by the administrator when the group is created."
                    },

                    {
                        tag: "field", name: "Endpoints", xref: "core§11.27.5.4.2",

                        details: "This field shall indicate a list of endpoint numbers that are members of the multicast group. This " +
                            "field is only relevant for Listeners. The content of this field shall be considered in Request Path " +
                            "Expansion when processing the relevant Interaction for the received Groupcast message for the " +
                            "associated GroupID. When the device is acting as a Listener as member of the group, the Endpoints " +
                            "field shall list at least one endpoint and shall NOT contain more than 255 endpoints." +
                            "\n" +
                            "If both the Listener and Sender bits are set in the FeatureMap attribute, then the list may be " +
                            "either empty or missing, until such time that the JoinGroup command is done with a non-empty " +
                            "Endpoints field. With these FeatureMap bits both set, the empty or missing list indicates that the " +
                            "group is joined for sending, but since there are not endpoints available in the group membership, no " +
                            "group messages will be possible to receive."
                    },

                    {
                        tag: "field", name: "KeySetId", xref: "core§11.27.5.4.3",

                        details: "This field shall indicate the value used to identify the group operational key used for this group." +
                            "\n" +
                            "This field maps directly to the GroupKeySetID as defined in the Group Key Management cluster. This " +
                            "field is provided by the administrator with the provided Key within the JoinGroup or UpdateGroupKey " +
                            "commands. This field shall be used by administrators of the fabric to determine if the server has " +
                            "the correct group operational key for their group. If not, the administrator may update the GroupKey " +
                            "using the UpdateGroupKey command to recover communication."
                    },

                    {
                        tag: "field", name: "HasAuxiliaryAcl", xref: "core§11.27.5.4.4",
                        details: "This field shall indicate if AuxiliaryACL entries are to be generated. The field shall be set to " +
                            "true if the group membership was configured to cause AuxiliaryACL entries to be generated, or false " +
                            "otherwise. See Groupcast Auxiliary ACL Handling for the handling of this field." +
                            "\n" +
                            "See also the ConfigureAuxiliaryACL command."
                    },

                    {
                        tag: "field", name: "McastAddrPolicy", xref: "core§11.27.5.4.5",
                        details: "This field shall indicate how the IPv6 Multicast Address shall be constructed for this group."
                    }
                ]
            }
        ]
    }
);
