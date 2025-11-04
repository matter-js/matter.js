/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, Command, TlvNoResponse, OptionalAttribute, OptionalEvent } from "../cluster/Cluster.js";
import { TlvUInt64, TlvUInt16, TlvUInt32, TlvEnum, TlvUInt8, TlvInt8 } from "../tlv/TlvNumber.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { AccessLevel } from "#model";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvString, TlvByteString } from "../tlv/TlvString.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ThreadNetworkDiagnostics {
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
         * The Node acts as an End Device without RX- off-when-idle sleepy radio behavior.
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
    export const TlvNeighborTable = TlvObject({
        /**
         * This field shall specify the IEEE 802.15.4 extended address for the neighboring Node. The uint64 value is
         * composed by taking the 8 octets of the extended address EUI-64 and treating them as a big-endian integer. For
         * example, octet string (in hexadecimal, from first octet to last) 00112233AABBCCDD would lead to a value of
         * 0x00112233AABBCCDD.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.1
         */
        extAddress: TlvField(0, TlvUInt64),

        /**
         * This field shall specify the duration of time, in seconds, since a frame has been received from the
         * neighboring Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.2
         */
        age: TlvField(1, TlvUInt32),

        /**
         * This field shall specify the RLOC16 of the neighboring Node. The uint16 value is composed by taking the two
         * RLOC16 and treating the octet string as if it was encoding a big-endian integer. For example, octet string
         * (in hexadecimal, from first octet to last) 44AA would lead to a value of 0x44AA.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.3
         */
        rloc16: TlvField(2, TlvUInt16),

        /**
         * This field shall specify the number of link layer frames that have been received from the neighboring node.
         * This field shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.4
         */
        linkFrameCounter: TlvField(3, TlvUInt32),

        /**
         * This field shall specify the number of Mesh Link Establishment frames that have been received from the
         * neighboring node. This field shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.5
         */
        mleFrameCounter: TlvField(4, TlvUInt32),

        /**
         * This field shall specify the implementation specific mix of IEEE 802.15.4 PDU receive quality indicators,
         * scaled from 0 to 255.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.6
         */
        lqi: TlvField(5, TlvUInt8),

        /**
         * This field SHOULD specify the average RSSI across all received frames from the neighboring Node since the
         * receiving Node’s last reboot. If there is no known received frames this field SHOULD have the value of null.
         * This field shall have the units of dBm, having the range -128 dBm to 0 dBm.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.7
         */
        averageRssi: TlvField(6, TlvNullable(TlvInt8.bound({ max: 0 }))),

        /**
         * This field shall specify the RSSI of the most recently received frame from the neighboring Node. If there is
         * no known last received frame the LastRssi field SHOULD have the value of null. This field shall have the
         * units of dBm, having the range -128 dBm to 0 dBm.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.8
         */
        lastRssi: TlvField(7, TlvNullable(TlvInt8.bound({ max: 0 }))),

        /**
         * This field shall specify the percentage of received frames from the neighboring Node that have resulted in
         * errors.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.9
         */
        frameErrorRate: TlvField(8, TlvUInt8.bound({ max: 100 })),

        /**
         * This field shall specify the percentage of received messages from the neighboring Node that have resulted in
         * errors.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.10
         */
        messageErrorRate: TlvField(9, TlvUInt8.bound({ max: 100 })),

        /**
         * This field shall specify if the neighboring Node is capable of receiving frames while the Node is in an idle
         * state.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.11
         */
        rxOnWhenIdle: TlvField(10, TlvBoolean),

        /**
         * This field shall specify if the neighboring Node is a full Thread device.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.12
         */
        fullThreadDevice: TlvField(11, TlvBoolean),

        /**
         * This field shall specify if the neighboring Node requires the full Network Data. If set to False, the
         * neighboring Node only requires the stable Network Data.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.13
         */
        fullNetworkData: TlvField(12, TlvBoolean),

        /**
         * This field shall specify if the neighboring Node is a direct child of the Node reporting the NeighborTable
         * attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.4.14
         */
        isChild: TlvField(13, TlvBoolean)
    });

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.4
     */
    export interface NeighborTable extends TypeFromSchema<typeof TlvNeighborTable> {}

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.5
     */
    export const TlvRouteTable = TlvObject({
        /**
         * This field shall specify the IEEE 802.15.4 extended address for the Node for which this route table entry
         * corresponds. The uint64 value is composed by taking the 8 octets of the extended address EUI- 64 and treating
         * them as a big-endian integer. For example, octet string (in hexadecimal, from first octet to last)
         * 00112233AABBCCDD would lead to a value of 0x00112233AABBCCDD.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.1
         */
        extAddress: TlvField(0, TlvUInt64),

        /**
         * This field shall specify the RLOC16 for the Node for which this route table entry corresponds. The uint16
         * value is composed by taking the two RLOC16 and treating the octet string as if it was encoding a big-endian
         * integer. For example, octet string (in hexadecimal, from first octet to last) 44AA would lead to a value of
         * 0x44AA.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.2
         */
        rloc16: TlvField(1, TlvUInt16),

        /**
         * This field shall specify the Router ID for the Node for which this route table entry corresponds.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.3
         */
        routerId: TlvField(2, TlvUInt8),

        /**
         * This field shall specify the Router ID for the next hop in the route to the Node for which this route table
         * entry corresponds.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.4
         */
        nextHop: TlvField(3, TlvUInt8),

        /**
         * This Field shall specify the cost of the route to the Node for which this route table entry corresponds.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.5
         */
        pathCost: TlvField(4, TlvUInt8),

        /**
         * This field shall specify the implementation specific mix of IEEE 802.15.4 PDU receive quality indicators,
         * scaled from 0 to 255, from the perspective of the Node reporting the neighbor table.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.6
         */
        lqiIn: TlvField(5, TlvUInt8),

        /**
         * This field shall specify the implementation specific mix of IEEE 802.15.4 PDU receive quality indicators,
         * scaled from 0 to 255, from the perspective of the Node specified within the NextHop field.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.7
         */
        lqiOut: TlvField(6, TlvUInt8),

        /**
         * This field shall specify the duration of time, in seconds, since a frame has been received from the Node for
         * which this route table entry corresponds.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.8
         */
        age: TlvField(7, TlvUInt8),

        /**
         * This field shall specify if the router ID as defined within the RouterId field has been allocated.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.9
         */
        allocated: TlvField(8, TlvBoolean),

        /**
         * This field shall specify if a link has been established to the Node for which this route table entry
         * corresponds.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.5.10
         */
        linkEstablished: TlvField(9, TlvBoolean)
    });

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.5
     */
    export interface RouteTable extends TypeFromSchema<typeof TlvRouteTable> {}

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.6
     */
    export const TlvSecurityPolicy = TlvObject({
        /**
         * This field shall specify the interval of time, in hours, that Thread security keys are rotated. Null when
         * there is no dataset configured.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.6.1
         */
        rotationTime: TlvField(0, TlvUInt16),

        /**
         * This field shall specify the flags as specified in Thread 1.3.0 section 8.10.1.15. Null when there is no
         * dataset configured.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.6.2
         */
        flags: TlvField(1, TlvUInt16)
    });

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.6
     */
    export interface SecurityPolicy extends TypeFromSchema<typeof TlvSecurityPolicy> {}

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.7
     */
    export const TlvOperationalDatasetComponents = TlvObject({
        /**
         * This field shall be True if the Node has an active timestamp present, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.1
         */
        activeTimestampPresent: TlvField(0, TlvBoolean),

        /**
         * This field shall be True if the Node has a pending timestamp is present, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.2
         */
        pendingTimestampPresent: TlvField(1, TlvBoolean),

        /**
         * This field shall be True if the Node has the Thread master key, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.3
         */
        masterKeyPresent: TlvField(2, TlvBoolean),

        /**
         * This field shall be True if the Node has the Thread network’s name, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.4
         */
        networkNamePresent: TlvField(3, TlvBoolean),

        /**
         * This field shall be True if the Node has an extended Pan ID, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.5
         */
        extendedPanIdPresent: TlvField(4, TlvBoolean),

        /**
         * This field shall be True if the Node has the mesh local prefix, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.6
         */
        meshLocalPrefixPresent: TlvField(5, TlvBoolean),

        /**
         * This field shall be True if the Node has the Thread network delay set, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.7
         */
        delayPresent: TlvField(6, TlvBoolean),

        /**
         * This field shall be True if the Node has a Pan ID, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.8
         */
        panIdPresent: TlvField(7, TlvBoolean),

        /**
         * This field shall be True if the Node has configured an operational channel for the Thread network, else
         * False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.9
         */
        channelPresent: TlvField(8, TlvBoolean),

        /**
         * This field shall be True if the Node has been configured with the Thread network Pskc, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.10
         */
        pskcPresent: TlvField(9, TlvBoolean),

        /**
         * This field shall be True if the Node has been configured with the Thread network security policies, else
         * False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.11
         */
        securityPolicyPresent: TlvField(10, TlvBoolean),

        /**
         * This field shall be True if the Node has available a mask of available channels, else False.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.5.7.12
         */
        channelMaskPresent: TlvField(11, TlvBoolean)
    });

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.14.5.7
     */
    export interface OperationalDatasetComponents extends TypeFromSchema<typeof TlvOperationalDatasetComponents> {}

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

    /**
     * Body of the ThreadNetworkDiagnostics connectionStatus event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.14.8.2
     */
    export const TlvConnectionStatusEvent = TlvObject({ connectionStatus: TlvField(0, TlvEnum<ConnectionStatus>()) });

    /**
     * Body of the ThreadNetworkDiagnostics connectionStatus event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.14.8.2
     */
    export interface ConnectionStatusEvent extends TypeFromSchema<typeof TlvConnectionStatusEvent> {}

    /**
     * Body of the ThreadNetworkDiagnostics networkFaultChange event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.14.8.1
     */
    export const TlvNetworkFaultChangeEvent = TlvObject({
        /**
         * This field shall represent the set of faults currently detected, as per Section 11.14.5.1, “NetworkFaultEnum
         * Type”.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.8.1.1
         */
        current: TlvField(0, TlvArray(TlvEnum<NetworkFault>(), { maxLength: 4 })),

        /**
         * This field shall represent the set of faults detected prior to this change event, as per Section 11.14.5.1,
         * “NetworkFaultEnum Type”.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.14.8.1.2
         */
        previous: TlvField(1, TlvArray(TlvEnum<NetworkFault>(), { maxLength: 4 }))
    });

    /**
     * Body of the ThreadNetworkDiagnostics networkFaultChange event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.14.8.1
     */
    export interface NetworkFaultChangeEvent extends TypeFromSchema<typeof TlvNetworkFaultChangeEvent> {}

    /**
     * A ThreadNetworkDiagnosticsCluster supports these elements if it supports feature ErrorCounts.
     */
    export const ErrorCountsComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the number of packets dropped either at ingress or egress, due to lack of buffer memory to
             * retain all packets on the ethernet network interface. The OverrunCount attribute shall be reset to 0 upon
             * a reboot of the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.7
             */
            overrunCount: Attribute(0x6, TlvUInt64, { omitChanges: true, default: 0 })
        },

        commands: {
            /**
             * This command is used to reset the count attributes.
             *
             * Reception of this command shall reset the following attributes to 0:
             *
             *   • OverrunCount
             *
             * Upon completion, this command shall send a status code of SUCCESS back to the initiator.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.7.1
             */
            resetCounts: Command(0x0, TlvNoArguments, 0x0, TlvNoResponse, { invokeAcl: AccessLevel.Manage })
        }
    });

    /**
     * A ThreadNetworkDiagnosticsCluster supports these elements if it supports feature MleCounts.
     */
    export const MleCountsComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the number of times the Node entered the OT_DEVICE_ROLE_DETACHED role as specified within the
             * Thread specification. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.15
             */
            detachedRoleCount: OptionalAttribute(0xe, TlvUInt16, { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of times the Node entered the OT_DEVICE_ROLE_CHILD role as specified within the
             * Thread specification. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.16
             */
            childRoleCount: OptionalAttribute(0xf, TlvUInt16, { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of times the Node entered the OT_DEVICE_ROLE_ROUTER role as specified within the
             * Thread specification. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.17
             */
            routerRoleCount: OptionalAttribute(0x10, TlvUInt16, { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of times the Node entered the OT_DEVICE_ROLE_LEADER role as specified within the
             * Thread specification. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.18
             */
            leaderRoleCount: OptionalAttribute(0x11, TlvUInt16, { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of attempts that have been made to attach to a Thread network while the Node was
             * detached from all Thread networks. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.19
             */
            attachAttemptCount: OptionalAttribute(0x12, TlvUInt16, { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of times that the Thread network that the Node is connected to has changed its
             * Partition ID. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.20
             */
            partitionIdChangeCount: OptionalAttribute(0x13, TlvUInt16, { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of times a Node has attempted to attach to a different Thread partition that it has
             * determined is better than the partition it is currently attached to. This value shall only be reset upon
             * a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.21
             */
            betterPartitionAttachAttemptCount: OptionalAttribute(0x14, TlvUInt16, { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of times a Node has changed its parent. This value shall only be reset upon a Node
             * reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.22
             */
            parentChangeCount: OptionalAttribute(0x15, TlvUInt16, { omitChanges: true, default: 0 })
        }
    });

    /**
     * A ThreadNetworkDiagnosticsCluster supports these elements if it supports feature MacCounts.
     */
    export const MacCountsComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the total number of unique MAC frame transmission requests. The attribute shall only be
             * incremented by 1 for each MAC transmission request regardless of the amount of CCA failures, CSMA-CA
             * attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.23
             */
            txTotalCount: OptionalAttribute(0x16, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique unicast MAC frame transmission requests. The attribute shall only be
             * incremented by 1 for each unicast MAC transmission request regardless of the amount of CCA failures,
             * CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.24
             */
            txUnicastCount: OptionalAttribute(0x17, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique broadcast MAC frame transmission requests. The attribute shall only
             * be incremented by 1 for each broadcast MAC transmission request regardless of the amount of CCA failures,
             * CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.25
             */
            txBroadcastCount: OptionalAttribute(0x18, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique MAC frame transmission requests with requested acknowledgment. The
             * attribute shall only be incremented by 1 for each MAC transmission request with requested acknowledgment
             * regardless of the amount of CCA failures, CSMA-CA attempts, or retransmissions. This value shall only be
             * reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.26
             */
            txAckRequestedCount: OptionalAttribute(0x19, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique MAC frame transmission requests that were acked. The attribute shall
             * only be incremented by 1 for each MAC transmission request that is acked regardless of the amount of CCA
             * failures, CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.27
             */
            txAckedCount: OptionalAttribute(0x1a, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique MAC frame transmission requests without requested acknowledgment.
             * The attribute shall only be incremented by 1 for each MAC transmission request that is does not request
             * acknowledgement regardless of the amount of CCA failures, CSMA-CA attempts, or retransmissions.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.28
             */
            txNoAckRequestedCount: OptionalAttribute(0x1b, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique MAC Data frame transmission requests. The attribute shall only be
             * incremented by 1 for each MAC Data frame transmission request regardless of the amount of CCA failures,
             * CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.29
             */
            txDataCount: OptionalAttribute(0x1c, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique MAC Data Poll frame transmission requests. The attribute shall only
             * be incremented by 1 for each MAC Data Poll frame transmission request regardless of the amount of CCA
             * failures, CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.30
             */
            txDataPollCount: OptionalAttribute(0x1d, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique MAC Beacon frame transmission requests. The attribute shall only be
             * incremented by 1 for each MAC Beacon frame transmission request regardless of the amount of CCA failures,
             * CSMA-CA attempts, or retransmissions.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.31
             */
            txBeaconCount: OptionalAttribute(0x1e, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique MAC Beacon Request frame transmission requests. The attribute shall
             * only be incremented by 1 for each MAC Beacon Request frame transmission request regardless of the amount
             * of CCA failures, CSMA-CA attempts, or retransmissions. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.32
             */
            txBeaconRequestCount: OptionalAttribute(0x1f, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique MAC frame transmission requests that are not counted by any other
             * attribute. The attribute shall only be incremented by 1 for each MAC frame transmission request
             * regardless of the amount of CCA failures, CSMA-CA attempts, or retransmissions. This value shall only be
             * reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.33
             */
            txOtherCount: OptionalAttribute(0x20, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of MAC retransmission attempts. The attribute shall only be incremented by 1
             * for each retransmission attempt that may be triggered by lack of acknowledgement, CSMA/CA failure, or
             * other type of transmission error. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.34
             */
            txRetryCount: OptionalAttribute(0x21, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique MAC transmission packets that meet maximal retry limit for direct
             * packets. The attribute shall only be incremented by 1 for each unique MAC transmission packets that meets
             * the maximal retry limit for direct packets. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.35
             */
            txDirectMaxRetryExpiryCount: OptionalAttribute(0x22, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique MAC transmission packets that meet maximal retry limit for indirect
             * packets. The attribute shall only be incremented by 1 for each unique MAC transmission packets that meets
             * the maximal retry limit for indirect packets. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.36
             */
            txIndirectMaxRetryExpiryCount: OptionalAttribute(0x23, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of CCA failures. The TxErrCcaCount attribute shall only be incremented by 1
             * for each instance of a CCA failure. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.37
             */
            txErrCcaCount: OptionalAttribute(0x24, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique MAC transmission request failures caused by an abort error. The
             * attribute shall only be incremented by 1 for each unique MAC transmission request failure caused by an
             * abort error.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.38
             */
            txErrAbortCount: OptionalAttribute(0x25, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of unique MAC transmission request failures caused by an error as the result
             * of a busy channel (a CSMA/CA fail). The attribute shall only be incremented by 1 for each unique MAC
             * transmission request failure caused by a busy channel such as a CSMA/CA failure.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.39
             */
            txErrBusyChannelCount: OptionalAttribute(0x26, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC frames. This value shall only be reset upon a Node
             * reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.40
             */
            rxTotalCount: OptionalAttribute(0x27, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique unicast MAC frames. This value shall only be reset upon a
             * Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.41
             */
            rxUnicastCount: OptionalAttribute(0x28, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique broadcast MAC frames. This value shall only be reset upon a
             * Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.42
             */
            rxBroadcastCount: OptionalAttribute(0x29, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC Data frames. This value shall only be reset upon a Node
             * reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.43
             */
            rxDataCount: OptionalAttribute(0x2a, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC Data Poll frames. This value shall only be reset upon a
             * Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.44
             */
            rxDataPollCount: OptionalAttribute(0x2b, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC Beacon frames. This value shall only be reset upon a
             * Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.45
             */
            rxBeaconCount: OptionalAttribute(0x2c, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC Beacon Request frames. This value shall only be reset
             * upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.46
             */
            rxBeaconRequestCount: OptionalAttribute(0x2d, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC frame requests that are not counted by any other
             * attribute. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.47
             */
            rxOtherCount: OptionalAttribute(0x2e, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of
             * MAC filtering. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.48
             */
            rxAddressFilteredCount: OptionalAttribute(0x2f, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of a
             * destination address check. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.49
             */
            rxDestAddrFilteredCount: OptionalAttribute(0x30, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received MAC frame requests that have been dropped as a result of being a
             * duplicate of a previously received MAC frame request. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.50
             */
            rxDuplicatedCount: OptionalAttribute(0x31, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of
             * missing or malformed frame contents. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.51
             */
            rxErrNoFrameCount: OptionalAttribute(0x32, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of
             * originating from an unknown neighbor device. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.52
             */
            rxErrUnknownNeighborCount: OptionalAttribute(0x33, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of
             * containing an invalid source address. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.53
             */
            rxErrInvalidSrcAddrCount: OptionalAttribute(0x34, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of an
             * error with the security of the received frame. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.54
             */
            rxErrSecCount: OptionalAttribute(0x35, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of an
             * error with the FCS of the received frame. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.55
             */
            rxErrFcsCount: OptionalAttribute(0x36, TlvUInt32, { omitChanges: true, default: 0 }),

            /**
             * Indicates the total number of received unique MAC frame requests that have been dropped as a result of an
             * error that is not counted by any other attribute. This value shall only be reset upon a Node reboot.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.56
             */
            rxErrOtherCount: OptionalAttribute(0x37, TlvUInt32, { omitChanges: true, default: 0 })
        }
    });

    /**
     * These elements and properties are present in all ThreadNetworkDiagnostics clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x35,
        name: "ThreadNetworkDiagnostics",
        revision: 3,

        features: {
            /**
             * Server supports the counts for the number of received and transmitted packets on the Thread interface.
             */
            packetCounts: BitFlag(0),

            /**
             * Server supports the counts for the number of errors that have occurred during the reception and
             * transmission of packets on the Thread interface.
             */
            errorCounts: BitFlag(1),

            /**
             * Server supports the counts for various MLE layer happenings.
             */
            mleCounts: BitFlag(2),

            /**
             * Server supports the counts for various MAC layer happenings.
             */
            macCounts: BitFlag(3)
        },

        attributes: {
            /**
             * Indicates the 802.15.4 channel number configured on the Node’s Thread interface (that is, the Active
             * Operational Dataset’s current Channel value). A value of null shall indicate that the Thread interface is
             * not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.1
             */
            channel: Attribute(0x0, TlvNullable(TlvUInt16)),

            /**
             * Indicates the role that this Node has within the routing of messages through the Thread network, as
             * defined by RoutingRoleEnum. The potential roles are defined in the following table. A value of null shall
             * indicate that the Thread interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.2
             */
            routingRole: Attribute(0x1, TlvNullable(TlvEnum<RoutingRole>())),

            /**
             * Indicates a human-readable (displayable) name for the Thread network that the Node has been configured to
             * join to. A value of null shall indicate that the Thread interface is not currently configured or
             * operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.3
             */
            networkName: Attribute(0x2, TlvNullable(TlvString.bound({ maxLength: 16 }))),

            /**
             * Indicates the 16-bit identifier of the Node on the Thread network. A value of null shall indicate that
             * the Thread interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.4
             */
            panId: Attribute(0x3, TlvNullable(TlvUInt16)),

            /**
             * Indicates the unique 64-bit identifier of the Node on the Thread network. A value of null shall indicate
             * that the Thread interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.5
             */
            extendedPanId: Attribute(0x4, TlvNullable(TlvUInt64)),

            /**
             * Indicates the mesh-local IPv6 prefix for the Thread network that the Node has been configured to join to.
             * A value of null shall indicate that the Thread interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.6
             */
            meshLocalPrefix: Attribute(0x5, TlvNullable(TlvByteString)),

            /**
             * Indicates the current list of Nodes that comprise the neighbor table on the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.8
             */
            neighborTable: Attribute(0x7, TlvArray(TlvNeighborTable), { default: [] }),

            /**
             * Indicates the current list of router capable Nodes for which routes have been established.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.9
             */
            routeTable: Attribute(0x8, TlvArray(TlvRouteTable), { default: [] }),

            /**
             * Indicates the Thread Leader Partition Id for the Thread network to which the Node is joined. Null if not
             * attached to a Thread network.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.10
             */
            partitionId: Attribute(0x9, TlvNullable(TlvUInt32)),

            /**
             * Indicates the Thread Leader Weight used when operating in the Leader role. Null if not attached to a
             * Thread network.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.11
             */
            weighting: Attribute(0xa, TlvNullable(TlvUInt16.bound({ max: 255 }))),

            /**
             * Indicates the full Network Data Version the Node currently uses. Null if not attached to a Thread
             * network.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.12
             */
            dataVersion: Attribute(0xb, TlvNullable(TlvUInt16.bound({ max: 255 }))),

            /**
             * Indicates the Network Data Version for the stable subset of data the Node currently uses. Null if not
             * attached to a Thread network.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.13
             */
            stableDataVersion: Attribute(0xc, TlvNullable(TlvUInt16.bound({ max: 255 }))),

            /**
             * Indicates the 8-bit LeaderRouterId the Node shall attempt to utilize upon becoming a router or leader on
             * the Thread network. Null if not attached to a Thread network.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.14
             */
            leaderRouterId: Attribute(0xd, TlvNullable(TlvUInt8.bound({ max: 62 }))),

            /**
             * Null when there is no dataset configured.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.57
             */
            activeTimestamp: OptionalAttribute(0x38, TlvNullable(TlvUInt64), { default: 0 }),

            /**
             * Null when there is no dataset configured.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.58
             */
            pendingTimestamp: OptionalAttribute(0x39, TlvNullable(TlvUInt64), { default: 0 }),

            /**
             * Null when there is no dataset configured.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.59
             */
            delay: OptionalAttribute(0x3a, TlvNullable(TlvUInt32), { default: 0 }),

            /**
             * Indicates the current security policies for the Thread partition to which a Node is connected. Null when
             * there is no dataset configured.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.60
             */
            securityPolicy: Attribute(0x3b, TlvNullable(TlvSecurityPolicy)),

            /**
             * Indicates the channels within channel page 0, in the 2.4GHz ISM band. The channels are represented in
             * most significant bit order, with bit value 1 meaning selected, bit value 0 meaning unselected. For
             * example, the most significant bit of the left-most byte indicates channel
             *
             * 0. If channel 0 and channel 10 are selected, the mask would be: 80 20 00 00. Null when there is no
             * dataset configured.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.61
             */
            channelPage0Mask: Attribute(0x3c, TlvNullable(TlvByteString.bound({ length: 4 }))),

            /**
             * Indicates a collection of flags to indicate the presence of various operationally acquired values.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.62
             */
            operationalDatasetComponents: Attribute(0x3d, TlvNullable(TlvOperationalDatasetComponents)),

            /**
             * @see {@link MatterSpecification.v142.Core} § 11.14.6
             */
            activeNetworkFaultsList: Attribute(
                0x3e,
                TlvArray(TlvEnum<NetworkFault>(), { maxLength: 4 }),
                { default: [] }
            ),

            /**
             * Indicates the IEEE 802.15.4 extended address for the Node. A value of null shall indicate that the
             * extended address is not yet known. The uint64 value is composed by taking the 8 octets of the extended
             * address EUI-64 and treating them as a big-endian integer. For example, octet string (in hexadecimal, from
             * first octet to last) 00112233AABBCCDD would lead to a value of 0x00112233AABBCCDD.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.64
             */
            extAddress: Attribute(0x3f, TlvNullable(TlvUInt64)),

            /**
             * Indicates the RLOC16 of the Node. A value of null shall indicate that the Thread interface is not
             * currently configured or operational. The uint16 value is composed by taking the two RLOC16 and treating
             * the octet string as if it was encoding a big-endian integer. For example, octet string (in hexadecimal,
             * from first octet to last) 44AA would lead to a value of 0x44AA.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.6.65
             */
            rloc16: Attribute(0x40, TlvNullable(TlvUInt16))
        },

        events: {
            /**
             * The ConnectionStatus Event shall indicate that a Node’s connection status to a Thread network has
             * changed.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.8.2
             */
            connectionStatus: OptionalEvent(0x0, Priority.Info, TlvConnectionStatusEvent),

            /**
             * The NetworkFaultChange Event shall indicate a change in the set of network faults currently detected by
             * the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.14.8.1
             */
            networkFaultChange: OptionalEvent(0x1, Priority.Info, TlvNetworkFaultChangeEvent)
        },

        /**
         * This metadata controls which ThreadNetworkDiagnosticsCluster elements matter.js activates for specific
         * feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { errorCounts: true }, component: ErrorCountsComponent },
            { flags: { mleCounts: true }, component: MleCountsComponent },
            { flags: { macCounts: true }, component: MacCountsComponent }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * The Thread Network Diagnostics Cluster provides a means to acquire standardized diagnostics metrics that may be
     * used by a Node to assist a user or Administrator in diagnosing potential problems. The Thread Network Diagnostics
     * Cluster attempts to centralize all metrics that are relevant to a potential Thread radio running on a Node.
     *
     * ThreadNetworkDiagnosticsCluster supports optional features that you can enable with the
     * ThreadNetworkDiagnosticsCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.14
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const ERRCNT = { errorCounts: true };
    const MLECNT = { mleCounts: true };
    const MACCNT = { macCounts: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            overrunCount: MutableCluster.AsConditional(
                ErrorCountsComponent.attributes.overrunCount,
                { mandatoryIf: [ERRCNT] }
            ),
            detachedRoleCount: MutableCluster.AsConditional(
                MleCountsComponent.attributes.detachedRoleCount,
                { optionalIf: [MLECNT] }
            ),
            childRoleCount: MutableCluster.AsConditional(
                MleCountsComponent.attributes.childRoleCount,
                { optionalIf: [MLECNT] }
            ),
            routerRoleCount: MutableCluster.AsConditional(
                MleCountsComponent.attributes.routerRoleCount,
                { optionalIf: [MLECNT] }
            ),
            leaderRoleCount: MutableCluster.AsConditional(
                MleCountsComponent.attributes.leaderRoleCount,
                { optionalIf: [MLECNT] }
            ),
            attachAttemptCount: MutableCluster.AsConditional(
                MleCountsComponent.attributes.attachAttemptCount,
                { optionalIf: [MLECNT] }
            ),
            partitionIdChangeCount: MutableCluster.AsConditional(
                MleCountsComponent.attributes.partitionIdChangeCount,
                { optionalIf: [MLECNT] }
            ),
            betterPartitionAttachAttemptCount: MutableCluster.AsConditional(
                MleCountsComponent.attributes.betterPartitionAttachAttemptCount,
                { optionalIf: [MLECNT] }
            ),
            parentChangeCount: MutableCluster.AsConditional(
                MleCountsComponent.attributes.parentChangeCount,
                { optionalIf: [MLECNT] }
            ),
            txTotalCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txTotalCount,
                { optionalIf: [MACCNT] }
            ),
            txUnicastCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txUnicastCount,
                { optionalIf: [MACCNT] }
            ),
            txBroadcastCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txBroadcastCount,
                { optionalIf: [MACCNT] }
            ),
            txAckRequestedCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txAckRequestedCount,
                { optionalIf: [MACCNT] }
            ),
            txAckedCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txAckedCount,
                { optionalIf: [MACCNT] }
            ),
            txNoAckRequestedCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txNoAckRequestedCount,
                { optionalIf: [MACCNT] }
            ),
            txDataCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txDataCount,
                { optionalIf: [MACCNT] }
            ),
            txDataPollCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txDataPollCount,
                { optionalIf: [MACCNT] }
            ),
            txBeaconCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txBeaconCount,
                { optionalIf: [MACCNT] }
            ),
            txBeaconRequestCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txBeaconRequestCount,
                { optionalIf: [MACCNT] }
            ),
            txOtherCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txOtherCount,
                { optionalIf: [MACCNT] }
            ),
            txRetryCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txRetryCount,
                { optionalIf: [MACCNT] }
            ),
            txDirectMaxRetryExpiryCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txDirectMaxRetryExpiryCount,
                { optionalIf: [MACCNT] }
            ),
            txIndirectMaxRetryExpiryCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txIndirectMaxRetryExpiryCount,
                { optionalIf: [MACCNT] }
            ),
            txErrCcaCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txErrCcaCount,
                { optionalIf: [MACCNT] }
            ),
            txErrAbortCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txErrAbortCount,
                { optionalIf: [MACCNT] }
            ),
            txErrBusyChannelCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.txErrBusyChannelCount,
                { optionalIf: [MACCNT] }
            ),
            rxTotalCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxTotalCount,
                { optionalIf: [MACCNT] }
            ),
            rxUnicastCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxUnicastCount,
                { optionalIf: [MACCNT] }
            ),
            rxBroadcastCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxBroadcastCount,
                { optionalIf: [MACCNT] }
            ),
            rxDataCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxDataCount,
                { optionalIf: [MACCNT] }
            ),
            rxDataPollCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxDataPollCount,
                { optionalIf: [MACCNT] }
            ),
            rxBeaconCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxBeaconCount,
                { optionalIf: [MACCNT] }
            ),
            rxBeaconRequestCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxBeaconRequestCount,
                { optionalIf: [MACCNT] }
            ),
            rxOtherCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxOtherCount,
                { optionalIf: [MACCNT] }
            ),
            rxAddressFilteredCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxAddressFilteredCount,
                { optionalIf: [MACCNT] }
            ),
            rxDestAddrFilteredCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxDestAddrFilteredCount,
                { optionalIf: [MACCNT] }
            ),
            rxDuplicatedCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxDuplicatedCount,
                { optionalIf: [MACCNT] }
            ),
            rxErrNoFrameCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxErrNoFrameCount,
                { optionalIf: [MACCNT] }
            ),
            rxErrUnknownNeighborCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxErrUnknownNeighborCount,
                { optionalIf: [MACCNT] }
            ),
            rxErrInvalidSrcAddrCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxErrInvalidSrcAddrCount,
                { optionalIf: [MACCNT] }
            ),
            rxErrSecCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxErrSecCount,
                { optionalIf: [MACCNT] }
            ),
            rxErrFcsCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxErrFcsCount,
                { optionalIf: [MACCNT] }
            ),
            rxErrOtherCount: MutableCluster.AsConditional(
                MacCountsComponent.attributes.rxErrOtherCount,
                { optionalIf: [MACCNT] }
            )
        },

        commands: {
            resetCounts: MutableCluster.AsConditional(
                ErrorCountsComponent.commands.resetCounts,
                { mandatoryIf: [ERRCNT] }
            )
        },

        events: Cluster.events
    });

    /**
     * This cluster supports all ThreadNetworkDiagnostics features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type ThreadNetworkDiagnosticsCluster = ThreadNetworkDiagnostics.Cluster;
export const ThreadNetworkDiagnosticsCluster = ThreadNetworkDiagnostics.Cluster;
ClusterRegistry.register(ThreadNetworkDiagnostics.Complete);
