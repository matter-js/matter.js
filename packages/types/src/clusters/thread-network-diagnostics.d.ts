/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { Bytes, MaybePromise } from "@matter/general";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ThreadNetworkDiagnostics as ThreadNetworkDiagnosticsModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the ThreadNetworkDiagnostics cluster.
 */
export declare namespace ThreadNetworkDiagnostics {
    /**
     * {@link ThreadNetworkDiagnostics} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the 802.15.4 channel number configured on the Node’s Thread interface (that is, the Active
             * Operational Dataset’s current Channel value). A value of null shall indicate that the Thread interface is
             * not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.1
             */
            readonly channel: number | null;

            /**
             * Indicates the role that this Node has within the routing of messages through the Thread network, as
             * defined by RoutingRoleEnum. The potential roles are defined in the following table. A value of null shall
             * indicate that the Thread interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.2
             */
            readonly routingRole: RoutingRole | null;

            /**
             * Indicates a human-readable (displayable) name for the Thread network that the Node has been configured to
             * join to. A value of null shall indicate that the Thread interface is not currently configured or
             * operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.3
             */
            readonly networkName: string | null;

            /**
             * Indicates the 16-bit identifier of the Node on the Thread network. A value of null shall indicate that
             * the Thread interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.4
             */
            readonly panId: number | null;

            /**
             * Indicates the unique 64-bit identifier of the Node on the Thread network. A value of null shall indicate
             * that the Thread interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.5
             */
            readonly extendedPanId: number | bigint | null;

            /**
             * Indicates the mesh-local IPv6 prefix for the Thread network that the Node has been configured to join to.
             * A value of null shall indicate that the Thread interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.6
             */
            readonly meshLocalPrefix: Bytes | null;

            /**
             * Indicates the current list of Nodes that comprise the neighbor table on the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.8
             */
            readonly neighborTable: NeighborTable[];

            /**
             * Indicates the current list of router capable Nodes for which routes have been established.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.9
             */
            readonly routeTable: RouteTable[];

            /**
             * Indicates the Thread Leader Partition Id for the Thread network to which the Node is joined. Null if not
             * attached to a Thread network.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.10
             */
            readonly partitionId: number | null;

            /**
             * Indicates the Thread Leader Weight used when operating in the Leader role. Null if not attached to a
             * Thread network.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.11
             */
            readonly weighting: number | null;

            /**
             * Indicates the full Network Data Version the Node currently uses. Null if not attached to a Thread
             * network.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.12
             */
            readonly dataVersion: number | null;

            /**
             * Indicates the Network Data Version for the stable subset of data the Node currently uses. Null if not
             * attached to a Thread network.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.13
             */
            readonly stableDataVersion: number | null;

            /**
             * Indicates the 8-bit LeaderRouterId the Node shall attempt to utilize upon becoming a router or leader on
             * the Thread network. Null if not attached to a Thread network.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.14
             */
            readonly leaderRouterId: number | null;

            /**
             * Indicates the current security policies for the Thread partition to which a Node is connected. Null when
             * there is no dataset configured.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.60
             */
            readonly securityPolicy: SecurityPolicy | null;

            /**
             * Indicates the channels within channel page 0, in the 2.4GHz ISM band. The channels are represented in
             * most significant bit order, with bit value 1 meaning selected, bit value 0 meaning unselected. For
             * example, the most significant bit of the left-most byte indicates channel 0. If channel 0 and channel 10
             * are selected, the mask would be: 80 20 00 00. Null when there is no dataset configured.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.61
             */
            readonly channelPage0Mask: Bytes | null;

            /**
             * Indicates a collection of flags to indicate the presence of various operationally acquired values.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.62
             */
            readonly operationalDatasetComponents: OperationalDatasetComponents | null;

            /**
             * @see {@link MatterSpecification.v142.Core} § 11.14.6
             */
            readonly activeNetworkFaultsList: NetworkFault[];

            /**
             * Indicates the IEEE 802.15.4 extended address for the Node. A value of null shall indicate that the
             * extended address is not yet known. The uint64 value is composed by taking the 8 octets of the extended
             * address EUI-64 and treating them as a big-endian integer. For example, octet string (in hexadecimal, from
             * first octet to last) 00112233AABBCCDD would lead to a value of 0x00112233AABBCCDD.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.64
             */
            readonly extAddress: number | bigint | null;

            /**
             * Indicates the RLOC16 of the Node. A value of null shall indicate that the Thread interface is not
             * currently configured or operational. The uint16 value is composed by taking the two RLOC16 and treating
             * the octet string as if it was encoding a big-endian integer. For example, octet string (in hexadecimal,
             * from first octet to last) 44AA would lead to a value of 0x44AA.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.65
             */
            readonly rloc16: number | null;

            /**
             * Null when there is no dataset configured.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.57
             */
            readonly activeTimestamp?: number | bigint | null;

            /**
             * Null when there is no dataset configured.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.58
             */
            readonly pendingTimestamp?: number | bigint | null;

            /**
             * Null when there is no dataset configured.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.59
             */
            readonly delay?: number | null;
        }

        export interface Events {
            /**
             * The ConnectionStatus Event shall indicate that a Node’s connection status to a Thread network has
             * changed.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.8.2
             */
            connectionStatus?: ConnectionStatusEvent;

            /**
             * The NetworkFaultChange Event shall indicate a change in the set of network faults currently detected by
             * the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.8.1
             */
            networkFaultChange?: NetworkFaultChangeEvent;
        }
    }

    /**
     * {@link ThreadNetworkDiagnostics} supports these elements if it supports feature "ErrorCounts".
     */
    export namespace ErrorCountsComponent {
        export interface Attributes {
            /**
             * Indicates the number of packets dropped either at ingress or egress, due to lack of buffer memory to
             * retain all packets on the ethernet network interface. The OverrunCount attribute shall be reset to 0 upon
             * a reboot of the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.7
             */
            readonly overrunCount: number | bigint;
        }

        export interface Commands {
            /**
             * This command is used to reset the count attributes.
             *
             * Reception of this command shall reset the following attributes to 0:
             *
             *   - OverrunCount
             *
             * Upon completion, this command shall send a status code of SUCCESS back to the initiator.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.7.1
             */
            resetCounts(): MaybePromise;
        }
    }

    /**
     * {@link ThreadNetworkDiagnostics} supports these elements if it supports feature "MleCounts".
     */
    export namespace MleCountsComponent {
        export interface Attributes {
            /**
             * Indicates the number of times the Node entered the OT_DEVICE_ROLE_DETACHED role as specified within the
             * Thread specification. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.15
             */
            readonly detachedRoleCount?: number;

            /**
             * Indicates the number of times the Node entered the OT_DEVICE_ROLE_CHILD role as specified within the
             * Thread specification. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.16
             */
            readonly childRoleCount?: number;

            /**
             * Indicates the number of times the Node entered the OT_DEVICE_ROLE_ROUTER role as specified within the
             * Thread specification. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.17
             */
            readonly routerRoleCount?: number;

            /**
             * Indicates the number of times the Node entered the OT_DEVICE_ROLE_LEADER role as specified within the
             * Thread specification. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.18
             */
            readonly leaderRoleCount?: number;

            /**
             * Indicates the number of attempts that have been made to attach to a Thread network while the Node was
             * detached from all Thread networks. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.19
             */
            readonly attachAttemptCount?: number;

            /**
             * Indicates the number of times that the Thread network that the Node is connected to has changed its
             * Partition ID. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.20
             */
            readonly partitionIdChangeCount?: number;

            /**
             * Indicates the number of times a Node has attempted to attach to a different Thread partition that it has
             * determined is better than the partition it is currently attached to. This value shall only be reset upon
             * a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.21
             */
            readonly betterPartitionAttachAttemptCount?: number;

            /**
             * Indicates the number of times a Node has changed its parent. This value shall only be reset upon a Node
             * reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.22
             */
            readonly parentChangeCount?: number;
        }
    }

    /**
     * {@link ThreadNetworkDiagnostics} supports these elements if it supports feature "MacCounts".
     */
    export namespace MacCountsComponent {
        export interface Attributes {
            /**
             * Indicates the total number of unique MAC frame transmission requests. The attribute shall only be
             * incremented by 1 for each MAC transmission request regardless of the amount of CCA failures, CSMA-CA
             * attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.23
             */
            readonly txTotalCount?: number;

            /**
             * Indicates the total number of unique unicast MAC frame transmission requests. The attribute shall only be
             * incremented by 1 for each unicast MAC transmission request regardless of the amount of CCA failures,
             * CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.24
             */
            readonly txUnicastCount?: number;

            /**
             * Indicates the total number of unique broadcast MAC frame transmission requests. The attribute shall only
             * be incremented by 1 for each broadcast MAC transmission request regardless of the amount of CCA failures,
             * CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.25
             */
            readonly txBroadcastCount?: number;

            /**
             * Indicates the total number of unique MAC frame transmission requests with requested acknowledgment. The
             * attribute shall only be incremented by 1 for each MAC transmission request with requested acknowledgment
             * regardless of the amount of CCA failures, CSMA-CA attempts, or retransmissions. This value shall only be
             * reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.26
             */
            readonly txAckRequestedCount?: number;

            /**
             * Indicates the total number of unique MAC frame transmission requests that were acked. The attribute shall
             * only be incremented by 1 for each MAC transmission request that is acked regardless of the amount of CCA
             * failures, CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.27
             */
            readonly txAckedCount?: number;

            /**
             * Indicates the total number of unique MAC frame transmission requests without requested acknowledgment.
             * The attribute shall only be incremented by 1 for each MAC transmission request that is does not request
             * acknowledgement regardless of the amount of CCA failures, CSMA-CA attempts, or retransmissions.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.28
             */
            readonly txNoAckRequestedCount?: number;

            /**
             * Indicates the total number of unique MAC Data frame transmission requests. The attribute shall only be
             * incremented by 1 for each MAC Data frame transmission request regardless of the amount of CCA failures,
             * CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.29
             */
            readonly txDataCount?: number;

            /**
             * Indicates the total number of unique MAC Data Poll frame transmission requests. The attribute shall only
             * be incremented by 1 for each MAC Data Poll frame transmission request regardless of the amount of CCA
             * failures, CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.30
             */
            readonly txDataPollCount?: number;

            /**
             * Indicates the total number of unique MAC Beacon frame transmission requests. The attribute shall only be
             * incremented by 1 for each MAC Beacon frame transmission request regardless of the amount of CCA failures,
             * CSMA-CA attempts, or retransmissions.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.31
             */
            readonly txBeaconCount?: number;

            /**
             * Indicates the total number of unique MAC Beacon Request frame transmission requests. The attribute shall
             * only be incremented by 1 for each MAC Beacon Request frame transmission request regardless of the amount
             * of CCA failures, CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.32
             */
            readonly txBeaconRequestCount?: number;

            /**
             * Indicates the total number of unique MAC frame transmission requests that are not counted by any other
             * attribute. The attribute shall only be incremented by 1 for each MAC frame transmission request
             * regardless of the amount of CCA failures, CSMA-CA attempts, or retransmissions. This value shall only be
             * reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.33
             */
            readonly txOtherCount?: number;

            /**
             * Indicates the total number of MAC retransmission attempts. The attribute shall only be incremented by 1
             * for each retransmission attempt that may be triggered by lack of acknowledgement, CSMA/CA failure, or
             * other type of transmission error. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.34
             */
            readonly txRetryCount?: number;

            /**
             * Indicates the total number of unique MAC transmission packets that meet maximal retry limit for direct
             * packets. The attribute shall only be incremented by 1 for each unique MAC transmission packets that meets
             * the maximal retry limit for direct packets. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.35
             */
            readonly txDirectMaxRetryExpiryCount?: number;

            /**
             * Indicates the total number of unique MAC transmission packets that meet maximal retry limit for indirect
             * packets. The attribute shall only be incremented by 1 for each unique MAC transmission packets that meets
             * the maximal retry limit for indirect packets. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.36
             */
            readonly txIndirectMaxRetryExpiryCount?: number;

            /**
             * Indicates the total number of CCA failures. The TxErrCcaCount attribute shall only be incremented by 1
             * for each instance of a CCA failure. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.37
             */
            readonly txErrCcaCount?: number;

            /**
             * Indicates the total number of unique MAC transmission request failures caused by an abort error. The
             * attribute shall only be incremented by 1 for each unique MAC transmission request failure caused by an
             * abort error.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.38
             */
            readonly txErrAbortCount?: number;

            /**
             * Indicates the total number of unique MAC transmission request failures caused by an error as the result
             * of a busy channel (a CSMA/CA fail). The attribute shall only be incremented by 1 for each unique MAC
             * transmission request failure caused by a busy channel such as a CSMA/CA failure.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.39
             */
            readonly txErrBusyChannelCount?: number;

            /**
             * Indicates the total number of received unique MAC frames. This value shall only be reset upon a Node
             * reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.40
             */
            readonly rxTotalCount?: number;

            /**
             * Indicates the total number of received unique unicast MAC frames. This value shall only be reset upon a
             * Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.41
             */
            readonly rxUnicastCount?: number;

            /**
             * Indicates the total number of received unique broadcast MAC frames. This value shall only be reset upon a
             * Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.42
             */
            readonly rxBroadcastCount?: number;

            /**
             * Indicates the total number of received unique MAC Data frames. This value shall only be reset upon a Node
             * reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.43
             */
            readonly rxDataCount?: number;

            /**
             * Indicates the total number of received unique MAC Data Poll frames. This value shall only be reset upon a
             * Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.44
             */
            readonly rxDataPollCount?: number;

            /**
             * Indicates the total number of received unique MAC Beacon frames. This value shall only be reset upon a
             * Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.45
             */
            readonly rxBeaconCount?: number;

            /**
             * Indicates the total number of received unique MAC Beacon Request frames. This value shall only be reset
             * upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.46
             */
            readonly rxBeaconRequestCount?: number;

            /**
             * Indicates the total number of received unique MAC frame requests that are not counted by any other
             * attribute. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.47
             */
            readonly rxOtherCount?: number;

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of
             * MAC filtering. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.48
             */
            readonly rxAddressFilteredCount?: number;

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of a
             * destination address check. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.49
             */
            readonly rxDestAddrFilteredCount?: number;

            /**
             * Indicates the total number of received MAC frame requests that have been dropped as a result of being a
             * duplicate of a previously received MAC frame request. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.50
             */
            readonly rxDuplicatedCount?: number;

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of
             * missing or malformed frame contents. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.51
             */
            readonly rxErrNoFrameCount?: number;

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of
             * originating from an unknown neighbor device. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.52
             */
            readonly rxErrUnknownNeighborCount?: number;

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of
             * containing an invalid source address. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.53
             */
            readonly rxErrInvalidSrcAddrCount?: number;

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of an
             * error with the security of the received frame. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.54
             */
            readonly rxErrSecCount?: number;

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of an
             * error with the FCS of the received frame. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.55
             */
            readonly rxErrFcsCount?: number;

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of an
             * error that is not counted by any other attribute. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.56
             */
            readonly rxErrOtherCount?: number;
        }
    }

    export interface Attributes extends Base.Attributes, Partial<ErrorCountsComponent.Attributes>, Partial<MleCountsComponent.Attributes>, Partial<MacCountsComponent.Attributes> {}
    export interface Commands extends ErrorCountsComponent.Commands {}
    export interface Events extends Base.Events {}

    export type Components = [
        { flags: {}, attributes: Base.Attributes, events: Base.Events },
        {
            flags: { errorCounts: true },
            attributes: ErrorCountsComponent.Attributes,
            commands: ErrorCountsComponent.Commands
        },
        { flags: { mleCounts: true }, attributes: MleCountsComponent.Attributes },
        { flags: { macCounts: true }, attributes: MacCountsComponent.Attributes }
    ];

    export type Features = "PacketCounts" | "ErrorCounts" | "MleCounts" | "MacCounts";

    /**
     * These are optional features supported by ThreadNetworkDiagnosticsCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.14.4
     */
    export enum Feature {
        /**
         * PacketCounts (PKTCNT)
         *
         * Server supports the counts for the number of received and transmitted packets on the Thread interface.
         */
        PacketCounts = "PacketCounts",

        /**
         * ErrorCounts (ERRCNT)
         *
         * Server supports the counts for the number of errors that have occurred during the reception and transmission
         * of packets on the Thread interface.
         */
        ErrorCounts = "ErrorCounts",

        /**
         * MleCounts (MLECNT)
         *
         * Server supports the counts for various MLE layer happenings.
         */
        MleCounts = "MleCounts",

        /**
         * MacCounts (MACCNT)
         *
         * Server supports the counts for various MAC layer happenings.
         */
        MacCounts = "MacCounts"
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.3
     */
    export enum RoutingRole {
        /**
         * Unspecified routing role.
         */
        Unspecified = 0,

        /**
         * The Node does not currently have a role as a result of the Thread interface not currently being configured or
         * operational.
         */
        Unassigned = 1,

        /**
         * The Node acts as a Sleepy End Device with RX-off-when-idle sleepy radio behavior.
         */
        SleepyEndDevice = 2,

        /**
         * The Node acts as an End Device without RX-off-when-idle sleepy radio behavior.
         */
        EndDevice = 3,

        /**
         * The Node acts as an Router Eligible End Device.
         */
        Reed = 4,

        /**
         * The Node acts as a Router Device.
         */
        Router = 5,

        /**
         * The Node acts as a Leader Device.
         */
        Leader = 6
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.4
     */
    export interface NeighborTable {
        /**
         * This field shall specify the IEEE 802.15.4 extended address for the neighboring Node. The uint64 value is
         * composed by taking the 8 octets of the extended address EUI-64 and treating them as a big-endian integer. For
         * example, octet string (in hexadecimal, from first octet to last) 00112233AABBCCDD would lead to a value of
         * 0x00112233AABBCCDD.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.1
         */
        extAddress: number | bigint;

        /**
         * This field shall specify the duration of time, in seconds, since a frame has been received from the
         * neighboring Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.2
         */
        age: number;

        /**
         * This field shall specify the RLOC16 of the neighboring Node. The uint16 value is composed by taking the two
         * RLOC16 and treating the octet string as if it was encoding a big-endian integer. For example, octet string
         * (in hexadecimal, from first octet to last) 44AA would lead to a value of 0x44AA.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.3
         */
        rloc16: number;

        /**
         * This field shall specify the number of link layer frames that have been received from the neighboring node.
         * This field shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.4
         */
        linkFrameCounter: number;

        /**
         * This field shall specify the number of Mesh Link Establishment frames that have been received from the
         * neighboring node. This field shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.5
         */
        mleFrameCounter: number;

        /**
         * This field shall specify the implementation specific mix of IEEE 802.15.4 PDU receive quality indicators,
         * scaled from 0 to 255.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.6
         */
        lqi: number;

        /**
         * This field SHOULD specify the average RSSI across all received frames from the neighboring Node since the
         * receiving Node’s last reboot. If there is no known received frames this field SHOULD have the value of null.
         * This field shall have the units of dBm, having the range -128 dBm to 0 dBm.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.7
         */
        averageRssi: number | null;

        /**
         * This field shall specify the RSSI of the most recently received frame from the neighboring Node. If there is
         * no known last received frame the LastRssi field SHOULD have the value of null. This field shall have the
         * units of dBm, having the range -128 dBm to 0 dBm.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.8
         */
        lastRssi: number | null;

        /**
         * This field shall specify the percentage of received frames from the neighboring Node that have resulted in
         * errors.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.9
         */
        frameErrorRate: number;

        /**
         * This field shall specify the percentage of received messages from the neighboring Node that have resulted in
         * errors.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.10
         */
        messageErrorRate: number;

        /**
         * This field shall specify if the neighboring Node is capable of receiving frames while the Node is in an idle
         * state.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.11
         */
        rxOnWhenIdle: boolean;

        /**
         * This field shall specify if the neighboring Node is a full Thread device.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.12
         */
        fullThreadDevice: boolean;

        /**
         * This field shall specify if the neighboring Node requires the full Network Data. If set to False, the
         * neighboring Node only requires the stable Network Data.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.13
         */
        fullNetworkData: boolean;

        /**
         * This field shall specify if the neighboring Node is a direct child of the Node reporting the NeighborTable
         * attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.14
         */
        isChild: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.5
     */
    export interface RouteTable {
        /**
         * This field shall specify the IEEE 802.15.4 extended address for the Node for which this route table entry
         * corresponds. The uint64 value is composed by taking the 8 octets of the extended address EUI-64 and treating
         * them as a big-endian integer. For example, octet string (in hexadecimal, from first octet to last)
         * 00112233AABBCCDD would lead to a value of 0x00112233AABBCCDD.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.1
         */
        extAddress: number | bigint;

        /**
         * This field shall specify the RLOC16 for the Node for which this route table entry corresponds. The uint16
         * value is composed by taking the two RLOC16 and treating the octet string as if it was encoding a big-endian
         * integer. For example, octet string (in hexadecimal, from first octet to last) 44AA would lead to a value of
         * 0x44AA.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.2
         */
        rloc16: number;

        /**
         * This field shall specify the Router ID for the Node for which this route table entry corresponds.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.3
         */
        routerId: number;

        /**
         * This field shall specify the Router ID for the next hop in the route to the Node for which this route table
         * entry corresponds.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.4
         */
        nextHop: number;

        /**
         * This Field shall specify the cost of the route to the Node for which this route table entry corresponds.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.5
         */
        pathCost: number;

        /**
         * This field shall specify the implementation specific mix of IEEE 802.15.4 PDU receive quality indicators,
         * scaled from 0 to 255, from the perspective of the Node reporting the neighbor table.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.6
         */
        lqiIn: number;

        /**
         * This field shall specify the implementation specific mix of IEEE 802.15.4 PDU receive quality indicators,
         * scaled from 0 to 255, from the perspective of the Node specified within the NextHop field.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.7
         */
        lqiOut: number;

        /**
         * This field shall specify the duration of time, in seconds, since a frame has been received from the Node for
         * which this route table entry corresponds.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.8
         */
        age: number;

        /**
         * This field shall specify if the router ID as defined within the RouterId field has been allocated.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.9
         */
        allocated: boolean;

        /**
         * This field shall specify if a link has been established to the Node for which this route table entry
         * corresponds.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.10
         */
        linkEstablished: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.6
     */
    export interface SecurityPolicy {
        /**
         * This field shall specify the interval of time, in hours, that Thread security keys are rotated. Null when
         * there is no dataset configured.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.6.1
         */
        rotationTime: number;

        /**
         * This field shall specify the flags as specified in Thread 1.3.0 section 8.10.1.15. Null when there is no
         * dataset configured.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.6.2
         */
        flags: number;
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.7
     */
    export interface OperationalDatasetComponents {
        /**
         * This field shall be True if the Node has an active timestamp present, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.1
         */
        activeTimestampPresent: boolean;

        /**
         * This field shall be True if the Node has a pending timestamp is present, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.2
         */
        pendingTimestampPresent: boolean;

        /**
         * This field shall be True if the Node has the Thread master key, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.3
         */
        masterKeyPresent: boolean;

        /**
         * This field shall be True if the Node has the Thread network’s name, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.4
         */
        networkNamePresent: boolean;

        /**
         * This field shall be True if the Node has an extended Pan ID, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.5
         */
        extendedPanIdPresent: boolean;

        /**
         * This field shall be True if the Node has the mesh local prefix, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.6
         */
        meshLocalPrefixPresent: boolean;

        /**
         * This field shall be True if the Node has the Thread network delay set, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.7
         */
        delayPresent: boolean;

        /**
         * This field shall be True if the Node has a Pan ID, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.8
         */
        panIdPresent: boolean;

        /**
         * This field shall be True if the Node has configured an operational channel for the Thread network, else
         * False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.9
         */
        channelPresent: boolean;

        /**
         * This field shall be True if the Node has been configured with the Thread network Pskc, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.10
         */
        pskcPresent: boolean;

        /**
         * This field shall be True if the Node has been configured with the Thread network security policies, else
         * False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.11
         */
        securityPolicyPresent: boolean;

        /**
         * This field shall be True if the Node has available a mask of available channels, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.12
         */
        channelMaskPresent: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.1
     */
    export enum NetworkFault {
        /**
         * Indicates an unspecified fault.
         */
        Unspecified = 0,

        /**
         * Indicates the Thread link is down.
         */
        LinkDown = 1,

        /**
         * Indicates there has been Thread hardware failure.
         */
        HardwareFailure = 2,

        /**
         * Indicates the Thread network is jammed.
         */
        NetworkJammed = 3
    }

    /**
     * The ConnectionStatus Event shall indicate that a Node’s connection status to a Thread network has changed.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.14.8.2
     */
    export interface ConnectionStatusEvent {
        connectionStatus: ConnectionStatus;
    }

    /**
     * The NetworkFaultChange Event shall indicate a change in the set of network faults currently detected by the Node.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.14.8.1
     */
    export interface NetworkFaultChangeEvent {
        /**
         * This field shall represent the set of faults currently detected, as per Section 11.14.5.1, “NetworkFaultEnum
         * Type”.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.8.1.1
         */
        current: NetworkFault[];

        /**
         * This field shall represent the set of faults detected prior to this change event, as per Section 11.14.5.1,
         * “NetworkFaultEnum Type”.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.8.1.2
         */
        previous: NetworkFault[];
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.2
     */
    export enum ConnectionStatus {
        /**
         * Node is connected
         */
        Connected = 0,

        /**
         * Node is not connected
         */
        NotConnected = 1
    }

    export const id: ClusterId;
    export const name: "ThreadNetworkDiagnostics";
    export const revision: 3;
    export const schema: typeof ThreadNetworkDiagnosticsModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export const commands: CommandObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export const events: EventObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof ThreadNetworkDiagnostics;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ThreadNetworkDiagnostics` instead of
     * `ThreadNetworkDiagnostics.Complete`)
     */
    export const Complete: typeof ThreadNetworkDiagnostics;

    export const Typing: ThreadNetworkDiagnostics;
}

export declare const ThreadNetworkDiagnosticsCluster: typeof ThreadNetworkDiagnostics;
export interface ThreadNetworkDiagnostics extends ClusterTyping { Attributes: ThreadNetworkDiagnostics.Attributes; Commands: ThreadNetworkDiagnostics.Commands; Events: ThreadNetworkDiagnostics.Events; Features: ThreadNetworkDiagnostics.Features; Components: ThreadNetworkDiagnostics.Components }
