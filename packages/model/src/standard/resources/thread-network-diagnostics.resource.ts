/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ThreadNetworkDiagnostics", classification: "node", pics: "DGTHREAD",
    xref: "core§11.14",
    details: "The Thread Network Diagnostics Cluster provides a means to acquire standardized diagnostics metrics " +
        "that may be used by a Node to assist a user or Administrator in diagnosing potential problems. The " +
        "Thread Network Diagnostics Cluster attempts to centralize all metrics that are relevant to a " +
        "potential Thread radio running on a Node.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§11.14.4",

            children: [
                {
                    tag: "field", name: "PKTCNT",
                    details: "Server supports the counts for the number of received and transmitted packets on the Thread " +
                        "interface."
                },
                {
                    tag: "field", name: "ERRCNT",
                    details: "Server supports the counts for the number of errors that have occurred during the reception and " +
                        "transmission of packets on the Thread interface."
                },
                {
                    tag: "field", name: "MLECNT",
                    details: "Server supports the counts for various MLE layer happenings."
                },
                {
                    tag: "field", name: "MACCNT",
                    details: "Server supports the counts for various MAC layer happenings."
                }
            ]
        },

        {
            tag: "attribute", name: "Channel", xref: "core§11.14.6.1",
            details: "Indicates the 802.15.4 channel number configured on the Node’s Thread interface (that is, the Active " +
                "Operational Dataset’s current Channel value). A value of null shall indicate that the Thread " +
                "interface is not currently configured or operational."
        },

        {
            tag: "attribute", name: "RoutingRole", xref: "core§11.14.6.2",
            details: "Indicates the role that this Node has within the routing of messages through the Thread network, as " +
                "defined by RoutingRoleEnum. The potential roles are defined in the following table. A value of null " +
                "shall indicate that the Thread interface is not currently configured or operational."
        },

        {
            tag: "attribute", name: "NetworkName", xref: "core§11.14.6.3",
            details: "Indicates a human-readable (displayable) name for the Thread network that the Node has been " +
                "configured to join to. A value of null shall indicate that the Thread interface is not currently " +
                "configured or operational."
        },

        {
            tag: "attribute", name: "PanId", xref: "core§11.14.6.4",
            details: "Indicates the 16-bit identifier of the Node on the Thread network. A value of null shall indicate " +
                "that the Thread interface is not currently configured or operational."
        },
        {
            tag: "attribute", name: "ExtendedPanId", xref: "core§11.14.6.5",
            details: "Indicates the unique 64-bit identifier of the Node on the Thread network. A value of null shall " +
                "indicate that the Thread interface is not currently configured or operational."
        },

        {
            tag: "attribute", name: "MeshLocalPrefix", xref: "core§11.14.6.6",
            details: "Indicates the mesh-local IPv6 prefix for the Thread network that the Node has been configured to " +
                "join to. A value of null shall indicate that the Thread interface is not currently configured or " +
                "operational."
        },

        {
            tag: "attribute", name: "OverrunCount", xref: "core§11.14.6.7",
            details: "Indicates the number of packets dropped either at ingress or egress, due to lack of buffer memory to " +
                "retain all packets on the ethernet network interface. The OverrunCount attribute shall be reset to 0 " +
                "upon a reboot of the Node."
        },

        {
            tag: "attribute", name: "NeighborTable", xref: "core§11.14.6.8",
            details: "Indicates the current list of Nodes that comprise the neighbor table on the Node."
        },
        {
            tag: "attribute", name: "RouteTable", xref: "core§11.14.6.9",
            details: "Indicates the current list of router capable Nodes for which routes have been established."
        },
        {
            tag: "attribute", name: "PartitionId", xref: "core§11.14.6.10",
            details: "Indicates the Thread Leader Partition Id for the Thread network to which the Node is joined. Null if " +
                "not attached to a Thread network."
        },
        {
            tag: "attribute", name: "Weighting", xref: "core§11.14.6.11",
            details: "Indicates the Thread Leader Weight used when operating in the Leader role. Null if not attached to a " +
                "Thread network."
        },
        {
            tag: "attribute", name: "DataVersion", xref: "core§11.14.6.12",
            details: "Indicates the full Network Data Version the Node currently uses. Null if not attached to a Thread " +
                "network."
        },
        {
            tag: "attribute", name: "StableDataVersion", xref: "core§11.14.6.13",
            details: "Indicates the Network Data Version for the stable subset of data the Node currently uses. Null if " +
                "not attached to a Thread network."
        },
        {
            tag: "attribute", name: "LeaderRouterId", xref: "core§11.14.6.14",
            details: "Indicates the 8-bit LeaderRouterId the Node shall attempt to utilize upon becoming a router or " +
                "leader on the Thread network. Null if not attached to a Thread network."
        },
        {
            tag: "attribute", name: "DetachedRoleCount", xref: "core§11.14.6.15",
            details: "Indicates the number of times the Node entered the OT_DEVICE_ROLE_DETACHED role as specified within " +
                "the Thread specification. This value shall only be reset upon a Node reboot."
        },
        {
            tag: "attribute", name: "ChildRoleCount", xref: "core§11.14.6.16",
            details: "Indicates the number of times the Node entered the OT_DEVICE_ROLE_CHILD role as specified within the " +
                "Thread specification. This value shall only be reset upon a Node reboot."
        },
        {
            tag: "attribute", name: "RouterRoleCount", xref: "core§11.14.6.17",
            details: "Indicates the number of times the Node entered the OT_DEVICE_ROLE_ROUTER role as specified within " +
                "the Thread specification. This value shall only be reset upon a Node reboot."
        },
        {
            tag: "attribute", name: "LeaderRoleCount", xref: "core§11.14.6.18",
            details: "Indicates the number of times the Node entered the OT_DEVICE_ROLE_LEADER role as specified within " +
                "the Thread specification. This value shall only be reset upon a Node reboot."
        },
        {
            tag: "attribute", name: "AttachAttemptCount", xref: "core§11.14.6.19",
            details: "Indicates the number of attempts that have been made to attach to a Thread network while the Node " +
                "was detached from all Thread networks. This value shall only be reset upon a Node reboot."
        },
        {
            tag: "attribute", name: "PartitionIdChangeCount", xref: "core§11.14.6.20",
            details: "Indicates the number of times that the Thread network that the Node is connected to has changed its " +
                "Partition ID. This value shall only be reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "BetterPartitionAttachAttemptCount", xref: "core§11.14.6.21",
            details: "Indicates the number of times a Node has attempted to attach to a different Thread partition that it " +
                "has determined is better than the partition it is currently attached to. This value shall only be " +
                "reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "ParentChangeCount", xref: "core§11.14.6.22",
            details: "Indicates the number of times a Node has changed its parent. This value shall only be reset upon a " +
                "Node reboot."
        },

        {
            tag: "attribute", name: "TxTotalCount", xref: "core§11.14.6.23",
            details: "Indicates the total number of unique MAC frame transmission requests. The attribute shall only be " +
                "incremented by 1 for each MAC transmission request regardless of the amount of CCA failures, CSMA-CA " +
                "attempts, or retransmissions. This value shall only be reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "TxUnicastCount", xref: "core§11.14.6.24",
            details: "Indicates the total number of unique unicast MAC frame transmission requests. The attribute shall " +
                "only be incremented by 1 for each unicast MAC transmission request regardless of the amount of CCA " +
                "failures, CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "TxBroadcastCount", xref: "core§11.14.6.25",
            details: "Indicates the total number of unique broadcast MAC frame transmission requests. The attribute shall " +
                "only be incremented by 1 for each broadcast MAC transmission request regardless of the amount of CCA " +
                "failures, CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "TxAckRequestedCount", xref: "core§11.14.6.26",
            details: "Indicates the total number of unique MAC frame transmission requests with requested acknowledgment. " +
                "The attribute shall only be incremented by 1 for each MAC transmission request with requested " +
                "acknowledgment regardless of the amount of CCA failures, CSMA-CA attempts, or retransmissions. This " +
                "value shall only be reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "TxAckedCount", xref: "core§11.14.6.27",
            details: "Indicates the total number of unique MAC frame transmission requests that were acked. The attribute " +
                "shall only be incremented by 1 for each MAC transmission request that is acked regardless of the " +
                "amount of CCA failures, CSMA-CA attempts, or retransmissions. This value shall only be reset upon a " +
                "Node reboot."
        },

        {
            tag: "attribute", name: "TxNoAckRequestedCount", xref: "core§11.14.6.28",
            details: "Indicates the total number of unique MAC frame transmission requests without requested " +
                "acknowledgment. The attribute shall only be incremented by 1 for each MAC transmission request that " +
                "is does not request acknowledgement regardless of the amount of CCA failures, CSMA-CA attempts, or " +
                "retransmissions."
        },

        {
            tag: "attribute", name: "TxDataCount", xref: "core§11.14.6.29",
            details: "Indicates the total number of unique MAC Data frame transmission requests. The attribute shall only " +
                "be incremented by 1 for each MAC Data frame transmission request regardless of the amount of CCA " +
                "failures, CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "TxDataPollCount", xref: "core§11.14.6.30",
            details: "Indicates the total number of unique MAC Data Poll frame transmission requests. The attribute shall " +
                "only be incremented by 1 for each MAC Data Poll frame transmission request regardless of the amount " +
                "of CCA failures, CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node " +
                "reboot."
        },

        {
            tag: "attribute", name: "TxBeaconCount", xref: "core§11.14.6.31",
            details: "Indicates the total number of unique MAC Beacon frame transmission requests. The attribute shall " +
                "only be incremented by 1 for each MAC Beacon frame transmission request regardless of the amount of " +
                "CCA failures, CSMA-CA attempts, or retransmissions."
        },

        {
            tag: "attribute", name: "TxBeaconRequestCount", xref: "core§11.14.6.32",
            details: "Indicates the total number of unique MAC Beacon Request frame transmission requests. The attribute " +
                "shall only be incremented by 1 for each MAC Beacon Request frame transmission request regardless of " +
                "the amount of CCA failures, CSMA-CA attempts, or retransmissions. This value shall only be reset " +
                "upon a Node reboot."
        },

        {
            tag: "attribute", name: "TxOtherCount", xref: "core§11.14.6.33",
            details: "Indicates the total number of unique MAC frame transmission requests that are not counted by any " +
                "other attribute. The attribute shall only be incremented by 1 for each MAC frame transmission " +
                "request regardless of the amount of CCA failures, CSMA-CA attempts, or retransmissions. This value " +
                "shall only be reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "TxRetryCount", xref: "core§11.14.6.34",
            details: "Indicates the total number of MAC retransmission attempts. The attribute shall only be incremented " +
                "by 1 for each retransmission attempt that may be triggered by lack of acknowledgement, CSMA/CA " +
                "failure, or other type of transmission error. This value shall only be reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "TxDirectMaxRetryExpiryCount", xref: "core§11.14.6.35",
            details: "Indicates the total number of unique MAC transmission packets that meet maximal retry limit for " +
                "direct packets. The attribute shall only be incremented by 1 for each unique MAC transmission " +
                "packets that meets the maximal retry limit for direct packets. This value shall only be reset upon a " +
                "Node reboot."
        },

        {
            tag: "attribute", name: "TxIndirectMaxRetryExpiryCount", xref: "core§11.14.6.36",
            details: "Indicates the total number of unique MAC transmission packets that meet maximal retry limit for " +
                "indirect packets. The attribute shall only be incremented by 1 for each unique MAC transmission " +
                "packets that meets the maximal retry limit for indirect packets. This value shall only be reset upon " +
                "a Node reboot."
        },

        {
            tag: "attribute", name: "TxErrCcaCount", xref: "core§11.14.6.37",
            details: "Indicates the total number of CCA failures. The TxErrCcaCount attribute shall only be incremented by " +
                "1 for each instance of a CCA failure. This value shall only be reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "TxErrAbortCount", xref: "core§11.14.6.38",
            details: "Indicates the total number of unique MAC transmission request failures caused by an abort error. The " +
                "attribute shall only be incremented by 1 for each unique MAC transmission request failure caused by " +
                "an abort error."
        },

        {
            tag: "attribute", name: "TxErrBusyChannelCount", xref: "core§11.14.6.39",
            details: "Indicates the total number of unique MAC transmission request failures caused by an error as the " +
                "result of a busy channel (a CSMA/CA fail). The attribute shall only be incremented by 1 for each " +
                "unique MAC transmission request failure caused by a busy channel such as a CSMA/CA failure."
        },

        {
            tag: "attribute", name: "RxTotalCount", xref: "core§11.14.6.40",
            details: "Indicates the total number of received unique MAC frames. This value shall only be reset upon a Node " +
                "reboot."
        },
        {
            tag: "attribute", name: "RxUnicastCount", xref: "core§11.14.6.41",
            details: "Indicates the total number of received unique unicast MAC frames. This value shall only be reset " +
                "upon a Node reboot."
        },
        {
            tag: "attribute", name: "RxBroadcastCount", xref: "core§11.14.6.42",
            details: "Indicates the total number of received unique broadcast MAC frames. This value shall only be reset " +
                "upon a Node reboot."
        },
        {
            tag: "attribute", name: "RxDataCount", xref: "core§11.14.6.43",
            details: "Indicates the total number of received unique MAC Data frames. This value shall only be reset upon a " +
                "Node reboot."
        },
        {
            tag: "attribute", name: "RxDataPollCount", xref: "core§11.14.6.44",
            details: "Indicates the total number of received unique MAC Data Poll frames. This value shall only be reset " +
                "upon a Node reboot."
        },
        {
            tag: "attribute", name: "RxBeaconCount", xref: "core§11.14.6.45",
            details: "Indicates the total number of received unique MAC Beacon frames. This value shall only be reset upon " +
                "a Node reboot."
        },
        {
            tag: "attribute", name: "RxBeaconRequestCount", xref: "core§11.14.6.46",
            details: "Indicates the total number of received unique MAC Beacon Request frames. This value shall only be " +
                "reset upon a Node reboot."
        },
        {
            tag: "attribute", name: "RxOtherCount", xref: "core§11.14.6.47",
            details: "Indicates the total number of received unique MAC frame requests that are not counted by any other " +
                "attribute. This value shall only be reset upon a Node reboot."
        },
        {
            tag: "attribute", name: "RxAddressFilteredCount", xref: "core§11.14.6.48",
            details: "Indicates the total number of received unique MAC frame requests that have been dropped as a result " +
                "of MAC filtering. This value shall only be reset upon a Node reboot."
        },
        {
            tag: "attribute", name: "RxDestAddrFilteredCount", xref: "core§11.14.6.49",
            details: "Indicates the total number of received unique MAC frame requests that have been dropped as a result " +
                "of a destination address check. This value shall only be reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "RxDuplicatedCount", xref: "core§11.14.6.50",
            details: "Indicates the total number of received MAC frame requests that have been dropped as a result of " +
                "being a duplicate of a previously received MAC frame request. This value shall only be reset upon a " +
                "Node reboot."
        },

        {
            tag: "attribute", name: "RxErrNoFrameCount", xref: "core§11.14.6.51",
            details: "Indicates the total number of received unique MAC frame requests that have been dropped as a result " +
                "of missing or malformed frame contents. This value shall only be reset upon a Node reboot."
        },
        {
            tag: "attribute", name: "RxErrUnknownNeighborCount", xref: "core§11.14.6.52",
            details: "Indicates the total number of received unique MAC frame requests that have been dropped as a result " +
                "of originating from an unknown neighbor device. This value shall only be reset upon a Node reboot."
        },
        {
            tag: "attribute", name: "RxErrInvalidSrcAddrCount", xref: "core§11.14.6.53",
            details: "Indicates the total number of received unique MAC frame requests that have been dropped as a result " +
                "of containing an invalid source address. This value shall only be reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "RxErrSecCount", xref: "core§11.14.6.54",
            details: "Indicates the total number of received unique MAC frame requests that have been dropped as a result " +
                "of an error with the security of the received frame. This value shall only be reset upon a Node " +
                "reboot."
        },

        {
            tag: "attribute", name: "RxErrFcsCount", xref: "core§11.14.6.55",
            details: "Indicates the total number of received unique MAC frame requests that have been dropped as a result " +
                "of an error with the FCS of the received frame. This value shall only be reset upon a Node reboot."
        },

        {
            tag: "attribute", name: "RxErrOtherCount", xref: "core§11.14.6.56",
            details: "Indicates the total number of received unique MAC frame requests that have been dropped as a result " +
                "of an error that is not counted by any other attribute. This value shall only be reset upon a Node " +
                "reboot."
        },

        {
            tag: "attribute", name: "ActiveTimestamp", xref: "core§11.14.6.57",
            details: "Null when there is no dataset configured."
        },
        {
            tag: "attribute", name: "PendingTimestamp", xref: "core§11.14.6.58",
            details: "Null when there is no dataset configured."
        },
        {
            tag: "attribute", name: "Delay", xref: "core§11.14.6.59",
            details: "Null when there is no dataset configured."
        },
        {
            tag: "attribute", name: "SecurityPolicy", xref: "core§11.14.6.60",
            details: "Indicates the current security policies for the Thread partition to which a Node is connected. Null " +
                "when there is no dataset configured."
        },

        {
            tag: "attribute", name: "ChannelPage0Mask", xref: "core§11.14.6.61",

            details: "Indicates the channels within channel page 0, in the 2.4GHz ISM band. The channels are represented " +
                "in most significant bit order, with bit value 1 meaning selected, bit value 0 meaning unselected. " +
                "For example, the most significant bit of the left-most byte indicates channel" +
                "\n" +
                "0. If channel 0 and channel 10 are selected, the mask would be: 80 20 00 00. Null when there is no " +
                "dataset configured."
        },

        {
            tag: "attribute", name: "OperationalDatasetComponents", xref: "core§11.14.6.62",
            details: "Indicates a collection of flags to indicate the presence of various operationally acquired values."
        },
        { tag: "attribute", name: "ActiveNetworkFaultsList", xref: "core§11.14.6" },

        {
            tag: "attribute", name: "ExtAddress", xref: "core§11.14.6.64",
            details: "Indicates the IEEE 802.15.4 extended address for the Node. A value of null shall indicate that the " +
                "extended address is not yet known. The uint64 value is composed by taking the 8 octets of the " +
                "extended address EUI-64 and treating them as a big-endian integer. For example, octet string (in " +
                "hexadecimal, from first octet to last) 00112233AABBCCDD would lead to a value of 0x00112233AABBCCDD."
        },

        {
            tag: "attribute", name: "Rloc16", xref: "core§11.14.6.65",
            details: "Indicates the RLOC16 of the Node. A value of null shall indicate that the Thread interface is not " +
                "currently configured or operational. The uint16 value is composed by taking the two RLOC16 and " +
                "treating the octet string as if it was encoding a big-endian integer. For example, octet string (in " +
                "hexadecimal, from first octet to last) 44AA would lead to a value of 0x44AA."
        },

        {
            tag: "event", name: "ConnectionStatus", xref: "core§11.14.8.2",
            details: "The ConnectionStatus Event shall indicate that a Node’s connection status to a Thread network has " +
                "changed."
        },

        {
            tag: "event", name: "NetworkFaultChange", xref: "core§11.14.8.1",
            details: "The NetworkFaultChange Event shall indicate a change in the set of network faults currently detected " +
                "by the Node.",

            children: [
                {
                    tag: "field", name: "Current", xref: "core§11.14.8.1.1",
                    details: "This field shall represent the set of faults currently detected, as per Section 11.14.5.1, " +
                        "“NetworkFaultEnum Type”."
                },
                {
                    tag: "field", name: "Previous", xref: "core§11.14.8.1.2",
                    details: "This field shall represent the set of faults detected prior to this change event, as per Section " +
                        "11.14.5.1, “NetworkFaultEnum Type”."
                }
            ]
        },

        {
            tag: "command", name: "ResetCounts", xref: "core§11.14.7.1",

            details: "This command is used to reset the count attributes." +
                "\n" +
                "Reception of this command shall reset the following attributes to 0:" +
                "\n" +
                "  • OverrunCount" +
                "\n" +
                "Upon completion, this command shall send a status code of SUCCESS back to the initiator."
        },

        {
            tag: "datatype", name: "NetworkFaultEnum", xref: "core§11.14.5.1",

            children: [
                { tag: "field", name: "Unspecified", description: "Indicates an unspecified fault." },
                { tag: "field", name: "LinkDown", description: "Indicates the Thread link is down." },
                {
                    tag: "field", name: "HardwareFailure",
                    description: "Indicates there has been Thread hardware failure."
                },
                { tag: "field", name: "NetworkJammed", description: "Indicates the Thread network is jammed." }
            ]
        },

        {
            tag: "datatype", name: "ConnectionStatusEnum", xref: "core§11.14.5.2",
            children: [
                { tag: "field", name: "Connected", description: "Node is connected" },
                { tag: "field", name: "NotConnected", description: "Node is not connected" }
            ]
        },

        {
            tag: "datatype", name: "RoutingRoleEnum", xref: "core§11.14.5.3",

            children: [
                { tag: "field", name: "Unspecified", description: "Unspecified routing role." },
                {
                    tag: "field", name: "Unassigned",
                    description: "The Node does not currently have a role as a result of the Thread interface not currently being configured or operational."
                },
                {
                    tag: "field", name: "SleepyEndDevice",
                    description: "The Node acts as a Sleepy End Device with RX-off-when-idle sleepy radio behavior."
                },
                {
                    tag: "field", name: "EndDevice",
                    description: "The Node acts as an End Device without RX- off-when-idle sleepy radio behavior."
                },
                { tag: "field", name: "Reed", description: "The Node acts as an Router Eligible End Device." },
                { tag: "field", name: "Router", description: "The Node acts as a Router Device." },
                { tag: "field", name: "Leader", description: "The Node acts as a Leader Device." }
            ]
        },

        {
            tag: "datatype", name: "NeighborTableStruct", xref: "core§11.14.5.4",

            children: [
                {
                    tag: "field", name: "ExtAddress", xref: "core§11.14.5.4.1",
                    details: "This field shall specify the IEEE 802.15.4 extended address for the neighboring Node. The uint64 " +
                        "value is composed by taking the 8 octets of the extended address EUI-64 and treating them as a " +
                        "big-endian integer. For example, octet string (in hexadecimal, from first octet to last) " +
                        "00112233AABBCCDD would lead to a value of 0x00112233AABBCCDD."
                },

                {
                    tag: "field", name: "Age", xref: "core§11.14.5.4.2",
                    details: "This field shall specify the duration of time, in seconds, since a frame has been received from the " +
                        "neighboring Node."
                },

                {
                    tag: "field", name: "Rloc16", xref: "core§11.14.5.4.3",
                    details: "This field shall specify the RLOC16 of the neighboring Node. The uint16 value is composed by taking " +
                        "the two RLOC16 and treating the octet string as if it was encoding a big-endian integer. For " +
                        "example, octet string (in hexadecimal, from first octet to last) 44AA would lead to a value of " +
                        "0x44AA."
                },

                {
                    tag: "field", name: "LinkFrameCounter", xref: "core§11.14.5.4.4",
                    details: "This field shall specify the number of link layer frames that have been received from the " +
                        "neighboring node. This field shall be reset to 0 upon a reboot of the Node."
                },
                {
                    tag: "field", name: "MleFrameCounter", xref: "core§11.14.5.4.5",
                    details: "This field shall specify the number of Mesh Link Establishment frames that have been received from " +
                        "the neighboring node. This field shall be reset to 0 upon a reboot of the Node."
                },
                {
                    tag: "field", name: "Lqi", xref: "core§11.14.5.4.6",
                    details: "This field shall specify the implementation specific mix of IEEE 802.15.4 PDU receive quality " +
                        "indicators, scaled from 0 to 255."
                },

                {
                    tag: "field", name: "AverageRssi", xref: "core§11.14.5.4.7",
                    details: "This field SHOULD specify the average RSSI across all received frames from the neighboring Node " +
                        "since the receiving Node’s last reboot. If there is no known received frames this field SHOULD have " +
                        "the value of null. This field shall have the units of dBm, having the range -128 dBm to 0 dBm."
                },

                {
                    tag: "field", name: "LastRssi", xref: "core§11.14.5.4.8",
                    details: "This field shall specify the RSSI of the most recently received frame from the neighboring Node. If " +
                        "there is no known last received frame the LastRssi field SHOULD have the value of null. This field " +
                        "shall have the units of dBm, having the range -128 dBm to 0 dBm."
                },

                {
                    tag: "field", name: "FrameErrorRate", xref: "core§11.14.5.4.9",
                    details: "This field shall specify the percentage of received frames from the neighboring Node that have " +
                        "resulted in errors."
                },
                {
                    tag: "field", name: "MessageErrorRate", xref: "core§11.14.5.4.10",
                    details: "This field shall specify the percentage of received messages from the neighboring Node that have " +
                        "resulted in errors."
                },
                {
                    tag: "field", name: "RxOnWhenIdle", xref: "core§11.14.5.4.11",
                    details: "This field shall specify if the neighboring Node is capable of receiving frames while the Node is in " +
                        "an idle state."
                },
                {
                    tag: "field", name: "FullThreadDevice", xref: "core§11.14.5.4.12",
                    details: "This field shall specify if the neighboring Node is a full Thread device."
                },
                {
                    tag: "field", name: "FullNetworkData", xref: "core§11.14.5.4.13",
                    details: "This field shall specify if the neighboring Node requires the full Network Data. If set to False, " +
                        "the neighboring Node only requires the stable Network Data."
                },
                {
                    tag: "field", name: "IsChild", xref: "core§11.14.5.4.14",
                    details: "This field shall specify if the neighboring Node is a direct child of the Node reporting the " +
                        "NeighborTable attribute."
                }
            ]
        },

        {
            tag: "datatype", name: "RouteTableStruct", xref: "core§11.14.5.5",

            children: [
                {
                    tag: "field", name: "ExtAddress", xref: "core§11.14.5.5.1",
                    details: "This field shall specify the IEEE 802.15.4 extended address for the Node for which this route table " +
                        "entry corresponds. The uint64 value is composed by taking the 8 octets of the extended address EUI- " +
                        "64 and treating them as a big-endian integer. For example, octet string (in hexadecimal, from first " +
                        "octet to last) 00112233AABBCCDD would lead to a value of 0x00112233AABBCCDD."
                },

                {
                    tag: "field", name: "Rloc16", xref: "core§11.14.5.5.2",
                    details: "This field shall specify the RLOC16 for the Node for which this route table entry corresponds. The " +
                        "uint16 value is composed by taking the two RLOC16 and treating the octet string as if it was " +
                        "encoding a big-endian integer. For example, octet string (in hexadecimal, from first octet to last) " +
                        "44AA would lead to a value of 0x44AA."
                },

                {
                    tag: "field", name: "RouterId", xref: "core§11.14.5.5.3",
                    details: "This field shall specify the Router ID for the Node for which this route table entry corresponds."
                },
                {
                    tag: "field", name: "NextHop", xref: "core§11.14.5.5.4",
                    details: "This field shall specify the Router ID for the next hop in the route to the Node for which this " +
                        "route table entry corresponds."
                },
                {
                    tag: "field", name: "PathCost", xref: "core§11.14.5.5.5",
                    details: "This Field shall specify the cost of the route to the Node for which this route table entry " +
                        "corresponds."
                },
                {
                    tag: "field", name: "LqiIn", xref: "core§11.14.5.5.6",
                    details: "This field shall specify the implementation specific mix of IEEE 802.15.4 PDU receive quality " +
                        "indicators, scaled from 0 to 255, from the perspective of the Node reporting the neighbor table."
                },

                {
                    tag: "field", name: "LqiOut", xref: "core§11.14.5.5.7",
                    details: "This field shall specify the implementation specific mix of IEEE 802.15.4 PDU receive quality " +
                        "indicators, scaled from 0 to 255, from the perspective of the Node specified within the NextHop " +
                        "field."
                },

                {
                    tag: "field", name: "Age", xref: "core§11.14.5.5.8",
                    details: "This field shall specify the duration of time, in seconds, since a frame has been received from the " +
                        "Node for which this route table entry corresponds."
                },
                {
                    tag: "field", name: "Allocated", xref: "core§11.14.5.5.9",
                    details: "This field shall specify if the router ID as defined within the RouterId field has been allocated."
                },
                {
                    tag: "field", name: "LinkEstablished", xref: "core§11.14.5.5.10",
                    details: "This field shall specify if a link has been established to the Node for which this route table entry " +
                        "corresponds."
                }
            ]
        },

        {
            tag: "datatype", name: "SecurityPolicy", xref: "core§11.14.5.6",

            children: [
                {
                    tag: "field", name: "RotationTime", xref: "core§11.14.5.6.1",
                    details: "This field shall specify the interval of time, in hours, that Thread security keys are rotated. Null " +
                        "when there is no dataset configured."
                },
                {
                    tag: "field", name: "Flags", xref: "core§11.14.5.6.2",
                    details: "This field shall specify the flags as specified in Thread 1.3.0 section 8.10.1.15. Null when there " +
                        "is no dataset configured."
                }
            ]
        },

        {
            tag: "datatype", name: "OperationalDatasetComponents", xref: "core§11.14.5.7",

            children: [
                {
                    tag: "field", name: "ActiveTimestampPresent", xref: "core§11.14.5.7.1",
                    details: "This field shall be True if the Node has an active timestamp present, else False."
                },
                {
                    tag: "field", name: "PendingTimestampPresent", xref: "core§11.14.5.7.2",
                    details: "This field shall be True if the Node has a pending timestamp is present, else False."
                },
                {
                    tag: "field", name: "MasterKeyPresent", xref: "core§11.14.5.7.3",
                    details: "This field shall be True if the Node has the Thread master key, else False."
                },
                {
                    tag: "field", name: "NetworkNamePresent", xref: "core§11.14.5.7.4",
                    details: "This field shall be True if the Node has the Thread network’s name, else False."
                },
                {
                    tag: "field", name: "ExtendedPanIdPresent", xref: "core§11.14.5.7.5",
                    details: "This field shall be True if the Node has an extended Pan ID, else False."
                },
                {
                    tag: "field", name: "MeshLocalPrefixPresent", xref: "core§11.14.5.7.6",
                    details: "This field shall be True if the Node has the mesh local prefix, else False."
                },
                {
                    tag: "field", name: "DelayPresent", xref: "core§11.14.5.7.7",
                    details: "This field shall be True if the Node has the Thread network delay set, else False."
                },
                {
                    tag: "field", name: "PanIdPresent", xref: "core§11.14.5.7.8",
                    details: "This field shall be True if the Node has a Pan ID, else False."
                },
                {
                    tag: "field", name: "ChannelPresent", xref: "core§11.14.5.7.9",
                    details: "This field shall be True if the Node has configured an operational channel for the Thread network, " +
                        "else False."
                },
                {
                    tag: "field", name: "PskcPresent", xref: "core§11.14.5.7.10",
                    details: "This field shall be True if the Node has been configured with the Thread network Pskc, else False."
                },
                {
                    tag: "field", name: "SecurityPolicyPresent", xref: "core§11.14.5.7.11",
                    details: "This field shall be True if the Node has been configured with the Thread network security policies, " +
                        "else False."
                },
                {
                    tag: "field", name: "ChannelMaskPresent", xref: "core§11.14.5.7.12",
                    details: "This field shall be True if the Node has available a mask of available channels, else False."
                }
            ]
        }
    ]
});
