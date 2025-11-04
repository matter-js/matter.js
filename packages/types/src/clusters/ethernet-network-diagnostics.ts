/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, Command, TlvNoResponse, OptionalAttribute } from "../cluster/Cluster.js";
import { TlvUInt64, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { AccessLevel } from "#model";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace EthernetNetworkDiagnostics {
    /**
     * These are optional features supported by EthernetNetworkDiagnosticsCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.16.4
     */
    export enum Feature {
        /**
         * PacketCounts (PKTCNT)
         *
         * Node makes available the counts for the number of received and transmitted packets on the ethernet interface.
         */
        PacketCounts = "PacketCounts",

        /**
         * ErrorCounts (ERRCNT)
         *
         * Node makes available the counts for the number of errors that have occurred during the reception and
         * transmission of packets on the ethernet interface.
         */
        ErrorCounts = "ErrorCounts"
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.16.5.1
     */
    export enum PhyRate {
        /**
         * PHY rate is 10Mbps
         */
        Rate10M = 0,

        /**
         * PHY rate is 100Mbps
         */
        Rate100M = 1,

        /**
         * PHY rate is 1Gbps
         */
        Rate1G = 2,

        /**
         * PHY rate is 2.5Gbps
         */
        Rate25G = 3,

        /**
         * PHY rate is 5Gbps
         */
        Rate5G = 4,

        /**
         * PHY rate is 10Gbps
         */
        Rate10G = 5,

        /**
         * PHY rate is 40Gbps
         */
        Rate40G = 6,

        /**
         * PHY rate is 100Gbps
         */
        Rate100G = 7,

        /**
         * PHY rate is 200Gbps
         */
        Rate200G = 8,

        /**
         * PHY rate is 400Gbps
         */
        Rate400G = 9
    }

    /**
     * A EthernetNetworkDiagnosticsCluster supports these elements if it supports feature PacketCounts.
     */
    export const PacketCountsComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the number of packets that have been received on the ethernet network interface. The attribute
             * shall be reset to 0 upon a reboot of the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.3
             */
            packetRxCount: Attribute(0x2, TlvUInt64, { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of packets that have been successfully transferred on the ethernet network
             * interface. The attribute shall be reset to 0 upon a reboot of the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.4
             */
            packetTxCount: Attribute(0x3, TlvUInt64, { omitChanges: true, default: 0 })
        }
    });

    /**
     * A EthernetNetworkDiagnosticsCluster supports these elements if it supports feature ErrorCounts.
     */
    export const ErrorCountsComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the number of failed packet transmissions that have occurred on the ethernet network interface.
             * The attribute shall be reset to 0 upon a reboot of the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.5
             */
            txErrCount: Attribute(0x4, TlvUInt64, { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of collisions that have occurred while attempting to transmit a packet on the
             * ethernet network interface. The attribute shall be reset to 0 upon a reboot of the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.6
             */
            collisionCount: Attribute(0x5, TlvUInt64, { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of packets dropped either at ingress or egress, due to lack of buffer memory to
             * retain all packets on the ethernet network interface. The attribute shall be reset to 0 upon a reboot of
             * the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.7
             */
            overrunCount: Attribute(0x6, TlvUInt64, { omitChanges: true, default: 0 })
        }
    });

    /**
     * A EthernetNetworkDiagnosticsCluster supports these elements if it supports features PacketCounts or ErrorCounts.
     */
    export const PacketCountsOrErrorCountsComponent = MutableCluster.Component({
        commands: {
            /**
             * This command is used to reset the count attributes.
             *
             * Reception of this command shall reset the following attributes to 0:
             *
             *   • PacketRxCount
             *
             *   • PacketTxCount
             *
             *   • TxErrCount
             *
             *   • CollisionCount
             *
             *   • OverrunCount
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.7.1
             */
            resetCounts: Command(0x0, TlvNoArguments, 0x0, TlvNoResponse, { invokeAcl: AccessLevel.Manage })
        }
    });

    /**
     * These elements and properties are present in all EthernetNetworkDiagnostics clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x37,
        name: "EthernetNetworkDiagnostics",
        revision: 1,

        features: {
            /**
             * Node makes available the counts for the number of received and transmitted packets on the ethernet
             * interface.
             */
            packetCounts: BitFlag(0),

            /**
             * Node makes available the counts for the number of errors that have occurred during the reception and
             * transmission of packets on the ethernet interface.
             */
            errorCounts: BitFlag(1)
        },

        attributes: {
            /**
             * Indicates the current nominal, usable speed at the top of the physical layer of the Node. A value of null
             * shall indicate that the interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.1
             */
            phyRate: OptionalAttribute(0x0, TlvNullable(TlvEnum<PhyRate>()), { default: null }),

            /**
             * Indicates if the Node is currently utilizing the full-duplex operating mode. A value of null shall
             * indicate that the interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.2
             */
            fullDuplex: OptionalAttribute(0x1, TlvNullable(TlvBoolean), { default: null }),

            /**
             * Indicates the value of the Carrier Detect control signal present on the ethernet network interface. A
             * value of null shall indicate that the interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.8
             */
            carrierDetect: OptionalAttribute(0x7, TlvNullable(TlvBoolean), { omitChanges: true, default: null }),

            /**
             * Indicates the duration of time, in minutes, that it has been since the ethernet network interface has
             * reset for any reason.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.9
             */
            timeSinceReset: OptionalAttribute(0x8, TlvUInt64, { omitChanges: true, default: 0 })
        },

        /**
         * This metadata controls which EthernetNetworkDiagnosticsCluster elements matter.js activates for specific
         * feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { packetCounts: true }, component: PacketCountsComponent },
            { flags: { errorCounts: true }, component: ErrorCountsComponent },
            { flags: { packetCounts: true }, component: PacketCountsOrErrorCountsComponent },
            { flags: { errorCounts: true }, component: PacketCountsOrErrorCountsComponent }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * The Ethernet Network Diagnostics Cluster provides a means to acquire standardized diagnostics metrics that may be
     * used by a Node to assist a user or Administrator in diagnosing potential problems. The Ethernet Network
     * Diagnostics Cluster attempts to centralize all metrics that are relevant to a potential Ethernet connection to a
     * Node.
     *
     * EthernetNetworkDiagnosticsCluster supports optional features that you can enable with the
     * EthernetNetworkDiagnosticsCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.16
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const PKTCNT = { packetCounts: true };
    const ERRCNT = { errorCounts: true };

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
            packetRxCount: MutableCluster.AsConditional(
                PacketCountsComponent.attributes.packetRxCount,
                { mandatoryIf: [PKTCNT] }
            ),
            packetTxCount: MutableCluster.AsConditional(
                PacketCountsComponent.attributes.packetTxCount,
                { mandatoryIf: [PKTCNT] }
            ),
            txErrCount: MutableCluster.AsConditional(
                ErrorCountsComponent.attributes.txErrCount,
                { mandatoryIf: [ERRCNT] }
            ),
            collisionCount: MutableCluster.AsConditional(
                ErrorCountsComponent.attributes.collisionCount,
                { mandatoryIf: [ERRCNT] }
            ),
            overrunCount: MutableCluster.AsConditional(
                ErrorCountsComponent.attributes.overrunCount,
                { mandatoryIf: [ERRCNT] }
            )
        },

        commands: {
            resetCounts: MutableCluster.AsConditional(
                PacketCountsOrErrorCountsComponent.commands.resetCounts,
                { mandatoryIf: [PKTCNT, ERRCNT] }
            )
        }
    });

    /**
     * This cluster supports all EthernetNetworkDiagnostics features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type EthernetNetworkDiagnosticsCluster = EthernetNetworkDiagnostics.Cluster;
export const EthernetNetworkDiagnosticsCluster = EthernetNetworkDiagnostics.Cluster;
ClusterRegistry.register(EthernetNetworkDiagnostics.Complete);
