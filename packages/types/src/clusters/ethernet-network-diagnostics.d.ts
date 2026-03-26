/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the EthernetNetworkDiagnostics cluster.
 *
 * The Ethernet Network Diagnostics Cluster provides a means to acquire standardized diagnostics metrics that may be
 * used by a Node to assist a user or Administrator in diagnosing potential problems. The Ethernet Network Diagnostics
 * Cluster attempts to centralize all metrics that are relevant to a potential Ethernet connection to a Node.
 *
 * @see {@link MatterSpecification.v142.Core} § 11.16
 */
export declare namespace EthernetNetworkDiagnostics {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0037;

    /**
     * Textual cluster identifier.
     */
    export const name: "EthernetNetworkDiagnostics";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the EthernetNetworkDiagnostics cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link EthernetNetworkDiagnostics} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the current nominal, usable speed at the top of the physical layer of the Node. A value of null
         * shall indicate that the interface is not currently configured or operational.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.1
         */
        phyRate?: PhyRate | null;

        /**
         * Indicates if the Node is currently utilizing the full-duplex operating mode. A value of null shall indicate
         * that the interface is not currently configured or operational.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.2
         */
        fullDuplex?: boolean | null;

        /**
         * Indicates the value of the Carrier Detect control signal present on the ethernet network interface. A value
         * of null shall indicate that the interface is not currently configured or operational.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.8
         */
        carrierDetect?: boolean | null;

        /**
         * Indicates the duration of time, in minutes, that it has been since the ethernet network interface has reset
         * for any reason.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.9
         */
        timeSinceReset?: number | bigint;
    }

    /**
     * {@link EthernetNetworkDiagnostics} supports these elements if it supports feature "PacketCounts".
     */
    export interface PacketCountsAttributes {
        /**
         * Indicates the number of packets that have been received on the ethernet network interface. The attribute
         * shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.3
         */
        packetRxCount: number | bigint;

        /**
         * Indicates the number of packets that have been successfully transferred on the ethernet network interface.
         * The attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.4
         */
        packetTxCount: number | bigint;
    }

    /**
     * {@link EthernetNetworkDiagnostics} supports these elements if it supports feature "ErrorCounts".
     */
    export interface ErrorCountsAttributes {
        /**
         * Indicates the number of failed packet transmissions that have occurred on the ethernet network interface. The
         * attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.5
         */
        txErrCount: number | bigint;

        /**
         * Indicates the number of collisions that have occurred while attempting to transmit a packet on the ethernet
         * network interface. The attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.6
         */
        collisionCount: number | bigint;

        /**
         * Indicates the number of packets dropped either at ingress or egress, due to lack of buffer memory to retain
         * all packets on the ethernet network interface. The attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.7
         */
        overrunCount: number | bigint;
    }

    /**
     * Attributes that may appear in {@link EthernetNetworkDiagnostics}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the current nominal, usable speed at the top of the physical layer of the Node. A value of null
         * shall indicate that the interface is not currently configured or operational.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.1
         */
        phyRate: PhyRate | null;

        /**
         * Indicates if the Node is currently utilizing the full-duplex operating mode. A value of null shall indicate
         * that the interface is not currently configured or operational.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.2
         */
        fullDuplex: boolean | null;

        /**
         * Indicates the value of the Carrier Detect control signal present on the ethernet network interface. A value
         * of null shall indicate that the interface is not currently configured or operational.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.8
         */
        carrierDetect: boolean | null;

        /**
         * Indicates the duration of time, in minutes, that it has been since the ethernet network interface has reset
         * for any reason.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.9
         */
        timeSinceReset: number | bigint;

        /**
         * Indicates the number of packets that have been received on the ethernet network interface. The attribute
         * shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.3
         */
        packetRxCount: number | bigint;

        /**
         * Indicates the number of packets that have been successfully transferred on the ethernet network interface.
         * The attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.4
         */
        packetTxCount: number | bigint;

        /**
         * Indicates the number of failed packet transmissions that have occurred on the ethernet network interface. The
         * attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.5
         */
        txErrCount: number | bigint;

        /**
         * Indicates the number of collisions that have occurred while attempting to transmit a packet on the ethernet
         * network interface. The attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.6
         */
        collisionCount: number | bigint;

        /**
         * Indicates the number of packets dropped either at ingress or egress, due to lack of buffer memory to retain
         * all packets on the ethernet network interface. The attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.16.6.7
         */
        overrunCount: number | bigint;
    }

    /**
     * {@link EthernetNetworkDiagnostics} supports these elements if it supports feature "PacketCountsOrErrorCounts".
     */
    export interface PacketCountsOrErrorCountsCommands {
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

    /**
     * Commands that may appear in {@link EthernetNetworkDiagnostics}.
     */
    export interface Commands extends PacketCountsOrErrorCountsCommands {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes },
        { flags: { packetCounts: true }, attributes: PacketCountsAttributes },
        { flags: { errorCounts: true }, attributes: ErrorCountsAttributes },
        { flags: { packetCounts: true }, commands: PacketCountsOrErrorCountsCommands },
        { flags: { errorCounts: true }, commands: PacketCountsOrErrorCountsCommands }
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

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link EthernetNetworkDiagnostics}.
     */
    export const Cluster: typeof EthernetNetworkDiagnostics;

    /**
     * @deprecated Use {@link EthernetNetworkDiagnostics}.
     */
    export const Complete: typeof EthernetNetworkDiagnostics;

    export const Typing: EthernetNetworkDiagnostics;
}

/**
 * @deprecated Use {@link EthernetNetworkDiagnostics}.
 */
export declare const EthernetNetworkDiagnosticsCluster: typeof EthernetNetworkDiagnostics;

export interface EthernetNetworkDiagnostics extends ClusterTyping {
    Attributes: EthernetNetworkDiagnostics.Attributes;
    Commands: EthernetNetworkDiagnostics.Commands;
    Features: EthernetNetworkDiagnostics.Features;
    Components: EthernetNetworkDiagnostics.Components;
}
