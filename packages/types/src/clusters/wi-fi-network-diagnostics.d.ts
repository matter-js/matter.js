/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { Bytes, MaybePromise } from "@matter/general";

/**
 * Definitions for the WiFiNetworkDiagnostics cluster.
 *
 * The Wi-Fi Network Diagnostics Cluster provides a means to acquire standardized diagnostics metrics that may be used
 * by a Node to assist a user or Administrator in diagnosing potential problems. The Wi-Fi Network Diagnostics Cluster
 * attempts to centralize all metrics that are relevant to a potential Wi-Fi radio running on a Node.
 *
 * @see {@link MatterSpecification.v142.Core} § 11.15
 */
export declare namespace WiFiNetworkDiagnostics {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0036;

    /**
     * Textual cluster identifier.
     */
    export const name: "WiFiNetworkDiagnostics";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the WiFiNetworkDiagnostics cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link WiFiNetworkDiagnostics} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the BSSID for which the Wi-Fi network the Node is currently connected.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.1
         */
        bssid: Bytes | null;

        /**
         * Indicates the current type of Wi-Fi security used.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.2
         */
        securityType: SecurityType | null;

        /**
         * Indicates the current IEEE 802.11 standard version in use by the Node, per the table below.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.3
         */
        wiFiVersion: WiFiVersion | null;

        /**
         * Indicates the channel that Wi-Fi communication is currently operating on.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.4
         */
        channelNumber: number | null;

        /**
         * Indicates the current RSSI of the Node’s Wi-Fi radio in dBm.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.5
         */
        rssi: number | null;

        /**
         * Indicates the current maximum PHY rate of transfer of data in bits-per-second.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.12
         */
        currentMaxRate?: number | bigint | null;
    }

    /**
     * {@link WiFiNetworkDiagnostics} supports these elements if it supports feature "ErrorCounts".
     */
    export interface ErrorCountsAttributes {
        /**
         * Indicates the count of the number of missed beacons the Node has detected. If the Node does not have an
         * ability to count beacons expected and not received, this value may remain set to zero.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.6
         */
        beaconLostCount: number | null;

        /**
         * Indicates the number of packets dropped either at ingress or egress, due to lack of buffer memory to retain
         * all packets on the network interface. The attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.13
         */
        overrunCount: number | bigint | null;
    }

    /**
     * {@link WiFiNetworkDiagnostics} supports these elements if it supports feature "PacketCounts".
     */
    export interface PacketCountsAttributes {
        /**
         * Indicates the count of the number of received beacons. The total number of expected beacons that could have
         * been received during the interval since association SHOULD match the sum of BeaconRxCount and
         * BeaconLostCount. If the Node does not have an ability to report count of beacons received, this value may
         * remain set to zero.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.7
         */
        beaconRxCount: number | null;

        /**
         * Indicates the number of multicast packets received by the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.8
         */
        packetMulticastRxCount: number | null;

        /**
         * Indicates the number of multicast packets transmitted by the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.9
         */
        packetMulticastTxCount: number | null;

        /**
         * Indicates the number of unicast packets received by the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.10
         */
        packetUnicastRxCount: number | null;

        /**
         * Indicates the number of unicast packets transmitted by the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.11
         */
        packetUnicastTxCount: number | null;
    }

    /**
     * Attributes that may appear in {@link WiFiNetworkDiagnostics}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the BSSID for which the Wi-Fi network the Node is currently connected.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.1
         */
        bssid: Bytes | null;

        /**
         * Indicates the current type of Wi-Fi security used.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.2
         */
        securityType: SecurityType | null;

        /**
         * Indicates the current IEEE 802.11 standard version in use by the Node, per the table below.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.3
         */
        wiFiVersion: WiFiVersion | null;

        /**
         * Indicates the channel that Wi-Fi communication is currently operating on.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.4
         */
        channelNumber: number | null;

        /**
         * Indicates the current RSSI of the Node’s Wi-Fi radio in dBm.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.5
         */
        rssi: number | null;

        /**
         * Indicates the current maximum PHY rate of transfer of data in bits-per-second.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.12
         */
        currentMaxRate: number | bigint | null;

        /**
         * Indicates the count of the number of missed beacons the Node has detected. If the Node does not have an
         * ability to count beacons expected and not received, this value may remain set to zero.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.6
         */
        beaconLostCount: number | null;

        /**
         * Indicates the number of packets dropped either at ingress or egress, due to lack of buffer memory to retain
         * all packets on the network interface. The attribute shall be reset to 0 upon a reboot of the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.13
         */
        overrunCount: number | bigint | null;

        /**
         * Indicates the count of the number of received beacons. The total number of expected beacons that could have
         * been received during the interval since association SHOULD match the sum of BeaconRxCount and
         * BeaconLostCount. If the Node does not have an ability to report count of beacons received, this value may
         * remain set to zero.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.7
         */
        beaconRxCount: number | null;

        /**
         * Indicates the number of multicast packets received by the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.8
         */
        packetMulticastRxCount: number | null;

        /**
         * Indicates the number of multicast packets transmitted by the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.9
         */
        packetMulticastTxCount: number | null;

        /**
         * Indicates the number of unicast packets received by the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.10
         */
        packetUnicastRxCount: number | null;

        /**
         * Indicates the number of unicast packets transmitted by the Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.6.11
         */
        packetUnicastTxCount: number | null;
    }

    /**
     * {@link WiFiNetworkDiagnostics} supports these elements if it supports feature "ErrorCounts".
     */
    export interface ErrorCountsCommands {
        /**
         * This command is used to reset the count attributes.
         *
         * Reception of this command shall reset the following attributes to 0:
         *
         *   - BeaconLostCount
         *
         *   - BeaconRxCount
         *
         *   - PacketMulticastRxCount
         *
         *   - PacketMulticastTxCount
         *
         *   - PacketUnicastRxCount
         *
         *   - PacketUnicastTxCount
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.7.1
         */
        resetCounts(): MaybePromise;
    }

    /**
     * Commands that may appear in {@link WiFiNetworkDiagnostics}.
     */
    export interface Commands extends ErrorCountsCommands {}

    /**
     * {@link WiFiNetworkDiagnostics} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * The Disconnection Event shall indicate that a Node’s Wi-Fi connection has been disconnected as a result of
         * de-authenticated or dis-association and indicates the reason.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.8.1
         */
        disconnection?: DisconnectionEvent;

        /**
         * The AssociationFailure event shall indicate that a Node has attempted to connect, or reconnect, to a Wi-Fi
         * access point, but is unable to successfully associate or authenticate, after exhausting all internal retries
         * of its supplicant.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.8.2
         */
        associationFailure?: AssociationFailureEvent;

        /**
         * The ConnectionStatus Event shall indicate that a Node’s connection status to a Wi-Fi network has changed.
         * Connected, in this context, shall mean that a Node acting as a Wi-Fi station is successfully associated to a
         * Wi-Fi Access Point.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.8.3
         */
        connectionStatus?: ConnectionStatusEvent;
    }

    /**
     * Events that may appear in {@link WiFiNetworkDiagnostics}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * The Disconnection Event shall indicate that a Node’s Wi-Fi connection has been disconnected as a result of
         * de-authenticated or dis-association and indicates the reason.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.8.1
         */
        disconnection: DisconnectionEvent;

        /**
         * The AssociationFailure event shall indicate that a Node has attempted to connect, or reconnect, to a Wi-Fi
         * access point, but is unable to successfully associate or authenticate, after exhausting all internal retries
         * of its supplicant.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.8.2
         */
        associationFailure: AssociationFailureEvent;

        /**
         * The ConnectionStatus Event shall indicate that a Node’s connection status to a Wi-Fi network has changed.
         * Connected, in this context, shall mean that a Node acting as a Wi-Fi station is successfully associated to a
         * Wi-Fi Access Point.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.8.3
         */
        connectionStatus: ConnectionStatusEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, events: BaseEvents },
        { flags: { errorCounts: true }, attributes: ErrorCountsAttributes, commands: ErrorCountsCommands },
        { flags: { packetCounts: true }, attributes: PacketCountsAttributes }
    ];
    export type Features = "PacketCounts" | "ErrorCounts";

    /**
     * These are optional features supported by WiFiNetworkDiagnosticsCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.15.4
     */
    export enum Feature {
        /**
         * PacketCounts (PKTCNT)
         *
         * Node makes available the counts for the number of received and transmitted packets on the Wi-Fi interface.
         */
        PacketCounts = "PacketCounts",

        /**
         * ErrorCounts (ERRCNT)
         *
         * Node makes available the counts for the number of errors that have occurred during the reception and
         * transmission of packets on the Wi-Fi interface.
         */
        ErrorCounts = "ErrorCounts"
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.15.5.1
     */
    export enum SecurityType {
        /**
         * Indicate the usage of an unspecified Wi-Fi security type
         */
        Unspecified = 0,

        /**
         * Indicate the usage of no Wi-Fi security
         */
        None = 1,

        /**
         * Indicate the usage of WEP Wi-Fi security
         */
        Wep = 2,

        /**
         * Indicate the usage of WPA Wi-Fi security
         */
        Wpa = 3,

        /**
         * Indicate the usage of WPA2 Wi-Fi security
         */
        Wpa2 = 4,

        /**
         * Indicate the usage of WPA3 Wi-Fi security
         */
        Wpa3 = 5
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.15.5.2
     */
    export enum WiFiVersion {
        A = 0,
        B = 1,
        G = 2,
        N = 3,

        /**
         * Indicate the network interface is currently using IEEE 802.11ac against the wireless access point.
         */
        Ac = 4,

        /**
         * Indicate the network interface is currently using IEEE 802.11ax against the wireless access point.
         */
        Ax = 5,

        /**
         * Indicate the network interface is currently using IEEE 802.11ah against the wireless access point.
         */
        Ah = 6
    }

    /**
     * The Disconnection Event shall indicate that a Node’s Wi-Fi connection has been disconnected as a result of
     * de-authenticated or dis-association and indicates the reason.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.15.8.1
     */
    export declare class DisconnectionEvent {
        constructor(values?: Partial<DisconnectionEvent>);

        /**
         * This field shall contain the Reason Code field value for the Disassociation or Deauthentication event that
         * caused the disconnection and the value shall align with Table 9-49 "Reason codes" of IEEE 802.11-2020.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.8.1.1
         */
        reasonCode: number;
    };

    /**
     * The AssociationFailure event shall indicate that a Node has attempted to connect, or reconnect, to a Wi-Fi access
     * point, but is unable to successfully associate or authenticate, after exhausting all internal retries of its
     * supplicant.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.15.8.2
     */
    export declare class AssociationFailureEvent {
        constructor(values?: Partial<AssociationFailureEvent>);

        /**
         * The Status field shall be set to a value from the AssociationFailureCauseEnum.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.8.2.1
         */
        associationFailureCause: AssociationFailureCause;

        /**
         * The Status field shall be set to the Status Code value that was present in the last frame related to
         * association where Status Code was not equal to zero and which caused the failure of a last trial attempt, if
         * this last failure was due to one of the following Management frames:
         *
         *   - Association Response (Type 0, Subtype 1)
         *
         *   - Reassociation Response (Type 0, Subtype 3)
         *
         *   - Authentication (Type 0, Subtype 11)
         *
         * Table 9-50 "Status codes" of IEEE 802.11-2020 contains a description of all values possible.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.8.2.2
         */
        status: number;
    };

    /**
     * The ConnectionStatus Event shall indicate that a Node’s connection status to a Wi-Fi network has changed.
     * Connected, in this context, shall mean that a Node acting as a Wi-Fi station is successfully associated to a
     * Wi-Fi Access Point.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.15.8.3
     */
    export declare class ConnectionStatusEvent {
        constructor(values?: Partial<ConnectionStatusEvent>);
        connectionStatus: ConnectionStatus;
    };

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.15.5.3
     */
    export enum AssociationFailureCause {
        /**
         * The reason for the failure is unknown.
         */
        Unknown = 0,

        /**
         * An error occurred during association.
         */
        AssociationFailed = 1,

        /**
         * An error occurred during authentication.
         */
        AuthenticationFailed = 2,

        /**
         * The specified SSID could not be found.
         */
        SsidNotFound = 3
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.15.5.4
     */
    export enum ConnectionStatus {
        /**
         * Indicate the node is connected
         */
        Connected = 0,

        /**
         * Indicate the node is not connected
         */
        NotConnected = 1
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
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link WiFiNetworkDiagnostics}.
     */
    export const Cluster: typeof WiFiNetworkDiagnostics;

    /**
     * @deprecated Use {@link WiFiNetworkDiagnostics}.
     */
    export const Complete: typeof WiFiNetworkDiagnostics;

    export const Typing: WiFiNetworkDiagnostics;
}

/**
 * @deprecated Use {@link WiFiNetworkDiagnostics}.
 */
export declare const WiFiNetworkDiagnosticsCluster: typeof WiFiNetworkDiagnostics;

export interface WiFiNetworkDiagnostics extends ClusterTyping {
    Attributes: WiFiNetworkDiagnostics.Attributes;
    Commands: WiFiNetworkDiagnostics.Commands;
    Events: WiFiNetworkDiagnostics.Events;
    Features: WiFiNetworkDiagnostics.Features;
    Components: WiFiNetworkDiagnostics.Components;
}
