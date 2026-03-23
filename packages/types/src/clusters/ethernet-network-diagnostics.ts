/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { EthernetNetworkDiagnostics as EthernetNetworkDiagnosticsModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the EthernetNetworkDiagnostics cluster.
 */
export namespace EthernetNetworkDiagnostics {
    /**
     * {@link EthernetNetworkDiagnostics} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the current nominal, usable speed at the top of the physical layer of the Node. A value of null
             * shall indicate that the interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.1
             */
            readonly phyRate?: PhyRate | null;

            /**
             * Indicates if the Node is currently utilizing the full-duplex operating mode. A value of null shall
             * indicate that the interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.2
             */
            readonly fullDuplex?: boolean | null;

            /**
             * Indicates the value of the Carrier Detect control signal present on the ethernet network interface. A
             * value of null shall indicate that the interface is not currently configured or operational.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.8
             */
            readonly carrierDetect?: boolean | null;

            /**
             * Indicates the duration of time, in minutes, that it has been since the ethernet network interface has
             * reset for any reason.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.9
             */
            readonly timeSinceReset?: number | bigint;
        }
    }

    /**
     * {@link EthernetNetworkDiagnostics} supports these elements if it supports feature "PacketCounts".
     */
    export namespace PacketCountsComponent {
        export interface Attributes {
            /**
             * Indicates the number of packets that have been received on the ethernet network interface. The attribute
             * shall be reset to 0 upon a reboot of the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.3
             */
            readonly packetRxCount: number | bigint;

            /**
             * Indicates the number of packets that have been successfully transferred on the ethernet network
             * interface. The attribute shall be reset to 0 upon a reboot of the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.4
             */
            readonly packetTxCount: number | bigint;
        }
    }

    /**
     * {@link EthernetNetworkDiagnostics} supports these elements if it supports feature "ErrorCounts".
     */
    export namespace ErrorCountsComponent {
        export interface Attributes {
            /**
             * Indicates the number of failed packet transmissions that have occurred on the ethernet network interface.
             * The attribute shall be reset to 0 upon a reboot of the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.5
             */
            readonly txErrCount: number | bigint;

            /**
             * Indicates the number of collisions that have occurred while attempting to transmit a packet on the
             * ethernet network interface. The attribute shall be reset to 0 upon a reboot of the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.6
             */
            readonly collisionCount: number | bigint;

            /**
             * Indicates the number of packets dropped either at ingress or egress, due to lack of buffer memory to
             * retain all packets on the ethernet network interface. The attribute shall be reset to 0 upon a reboot of
             * the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.6.7
             */
            readonly overrunCount: number | bigint;
        }
    }

    /**
     * {@link EthernetNetworkDiagnostics} supports these elements if it supports feature "PacketCountsOrErrorCounts".
     */
    export namespace PacketCountsOrErrorCountsComponent {
        export interface Commands {
            /**
             * This command is used to reset the count attributes.
             *
             * Reception of this command shall reset the following attributes to 0:
             *
             *   - PacketRxCount
             *
             *   - PacketTxCount
             *
             *   - TxErrCount
             *
             *   - CollisionCount
             *
             *   - OverrunCount
             *
             * @see {@link MatterSpecification.v142.Core} § 11.16.7.1
             */
            resetCounts(): MaybePromise;
        }
    }

    /**
     * Attributes that may appear in {@link EthernetNetworkDiagnostics}.
     *
     * Optional properties represent attributes that devices are not required to support. Device support for attributes
     * may also be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the current nominal, usable speed at the top of the physical layer of the Node. A value of null
         * shall indicate that the interface is not currently configured or operational.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.1
         */
        readonly phyRate: PhyRate | null;

        /**
         * Indicates if the Node is currently utilizing the full-duplex operating mode. A value of null shall indicate
         * that the interface is not currently configured or operational.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.2
         */
        readonly fullDuplex: boolean | null;

        /**
         * Indicates the value of the Carrier Detect control signal present on the ethernet network interface. A value
         * of null shall indicate that the interface is not currently configured or operational.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.8
         */
        readonly carrierDetect: boolean | null;

        /**
         * Indicates the duration of time, in minutes, that it has been since the ethernet network interface has reset
         * for any reason.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.9
         */
        readonly timeSinceReset: number | bigint;

        /**
         * Indicates the number of packets that have been received on the ethernet network interface. The attribute
         * shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.3
         */
        readonly packetRxCount: number | bigint;

        /**
         * Indicates the number of packets that have been successfully transferred on the ethernet network interface.
         * The attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.4
         */
        readonly packetTxCount: number | bigint;

        /**
         * Indicates the number of failed packet transmissions that have occurred on the ethernet network interface. The
         * attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.5
         */
        readonly txErrCount: number | bigint;

        /**
         * Indicates the number of collisions that have occurred while attempting to transmit a packet on the ethernet
         * network interface. The attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.6
         */
        readonly collisionCount: number | bigint;

        /**
         * Indicates the number of packets dropped either at ingress or egress, due to lack of buffer memory to retain
         * all packets on the ethernet network interface. The attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.7
         */
        readonly overrunCount: number | bigint;
    }

    export interface Commands extends PacketCountsOrErrorCountsComponent.Commands {}

    export type Components = [
        { flags: {}, attributes: Base.Attributes },
        { flags: { packetCounts: true }, attributes: PacketCountsComponent.Attributes },
        { flags: { errorCounts: true }, attributes: ErrorCountsComponent.Attributes },
        { flags: { packetCounts: true }, commands: PacketCountsOrErrorCountsComponent.Commands },
        { flags: { errorCounts: true }, commands: PacketCountsOrErrorCountsComponent.Commands }
    ];

    export type Features = "PacketCounts" | "ErrorCounts";

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

    export const id = ClusterId(0x37);
    export const name = "EthernetNetworkDiagnostics" as const;
    export const revision = 1;
    export const schema = EthernetNetworkDiagnosticsModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof EthernetNetworkDiagnostics;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `EthernetNetworkDiagnostics` instead of
     * `EthernetNetworkDiagnostics.Complete`)
     */
    export type Complete = typeof EthernetNetworkDiagnostics;

    export declare const Complete: Complete;
    export declare const Typing: EthernetNetworkDiagnostics;
}

ClusterNamespace.define(EthernetNetworkDiagnostics);
export type EthernetNetworkDiagnosticsCluster = EthernetNetworkDiagnostics.Cluster;
export const EthernetNetworkDiagnosticsCluster = EthernetNetworkDiagnostics.Cluster;
export interface EthernetNetworkDiagnostics extends ClusterTyping { Attributes: EthernetNetworkDiagnostics.Attributes; Commands: EthernetNetworkDiagnostics.Commands; Features: EthernetNetworkDiagnostics.Features; Components: EthernetNetworkDiagnostics.Components }
