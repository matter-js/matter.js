/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, Command, TlvNoResponse, OptionalAttribute, OptionalEvent } from "../cluster/Cluster.js";
import { TlvUInt32, TlvUInt64, TlvEnum, TlvUInt16, TlvInt8 } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvByteString } from "../tlv/TlvString.js";
import { Priority } from "../globals/Priority.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace WiFiNetworkDiagnostics {
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
     * Body of the WiFiNetworkDiagnostics disconnection event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.15.8.1
     */
    export const TlvDisconnectionEvent = TlvObject({
        /**
         * This field shall contain the Reason Code field value for the Disassociation or Deauthentication event that
         * caused the disconnection and the value shall align with Table 9-49 "Reason codes" of IEEE 802.11-2020.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.8.1.1
         */
        reasonCode: TlvField(0, TlvUInt16)
    });

    /**
     * Body of the WiFiNetworkDiagnostics disconnection event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.15.8.1
     */
    export interface DisconnectionEvent extends TypeFromSchema<typeof TlvDisconnectionEvent> {}

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
     * Body of the WiFiNetworkDiagnostics associationFailure event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.15.8.2
     */
    export const TlvAssociationFailureEvent = TlvObject({
        /**
         * The Status field shall be set to a value from the AssociationFailureCauseEnum.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.8.2.1
         */
        associationFailureCause: TlvField(0, TlvEnum<AssociationFailureCause>()),

        /**
         * The Status field shall be set to the Status Code value that was present in the last frame related to
         * association where Status Code was not equal to zero and which caused the failure of a last trial attempt, if
         * this last failure was due to one of the following Management frames:
         *
         *   • Association Response (Type 0, Subtype 1)
         *
         *   • Reassociation Response (Type 0, Subtype 3)
         *
         *   • Authentication (Type 0, Subtype 11)
         *
         * Table 9-50 "Status codes" of IEEE 802.11-2020 contains a description of all values possible.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.15.8.2.2
         */
        status: TlvField(1, TlvUInt16)
    });

    /**
     * Body of the WiFiNetworkDiagnostics associationFailure event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.15.8.2
     */
    export interface AssociationFailureEvent extends TypeFromSchema<typeof TlvAssociationFailureEvent> {}

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
     * Body of the WiFiNetworkDiagnostics connectionStatus event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.15.8.3
     */
    export const TlvConnectionStatusEvent = TlvObject({ connectionStatus: TlvField(0, TlvEnum<ConnectionStatus>()) });

    /**
     * Body of the WiFiNetworkDiagnostics connectionStatus event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.15.8.3
     */
    export interface ConnectionStatusEvent extends TypeFromSchema<typeof TlvConnectionStatusEvent> {}

    /**
     * A WiFiNetworkDiagnosticsCluster supports these elements if it supports feature ErrorCounts.
     */
    export const ErrorCountsComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the count of the number of missed beacons the Node has detected. If the Node does not have an
             * ability to count beacons expected and not received, this value may remain set to zero.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.6
             */
            beaconLostCount: Attribute(0x5, TlvNullable(TlvUInt32), { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of packets dropped either at ingress or egress, due to lack of buffer memory to
             * retain all packets on the network interface. The attribute shall be reset to 0 upon a reboot of the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.13
             */
            overrunCount: Attribute(0xc, TlvNullable(TlvUInt64), { omitChanges: true, default: 0 })
        },

        commands: {
            /**
             * This command is used to reset the count attributes.
             *
             * Reception of this command shall reset the following attributes to 0:
             *
             *   • BeaconLostCount
             *
             *   • BeaconRxCount
             *
             *   • PacketMulticastRxCount
             *
             *   • PacketMulticastTxCount
             *
             *   • PacketUnicastRxCount
             *
             *   • PacketUnicastTxCount
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.7.1
             */
            resetCounts: Command(0x0, TlvNoArguments, 0x0, TlvNoResponse)
        }
    });

    /**
     * A WiFiNetworkDiagnosticsCluster supports these elements if it supports feature PacketCounts.
     */
    export const PacketCountsComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the count of the number of received beacons. The total number of expected beacons that could
             * have been received during the interval since association SHOULD match the sum of BeaconRxCount and
             * BeaconLostCount. If the Node does not have an ability to report count of beacons received, this value may
             * remain set to zero.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.7
             */
            beaconRxCount: Attribute(0x6, TlvNullable(TlvUInt32), { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of multicast packets received by the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.8
             */
            packetMulticastRxCount: Attribute(0x7, TlvNullable(TlvUInt32), { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of multicast packets transmitted by the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.9
             */
            packetMulticastTxCount: Attribute(0x8, TlvNullable(TlvUInt32), { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of unicast packets received by the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.10
             */
            packetUnicastRxCount: Attribute(0x9, TlvNullable(TlvUInt32), { omitChanges: true, default: 0 }),

            /**
             * Indicates the number of unicast packets transmitted by the Node.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.11
             */
            packetUnicastTxCount: Attribute(0xa, TlvNullable(TlvUInt32), { omitChanges: true, default: 0 })
        }
    });

    /**
     * These elements and properties are present in all WiFiNetworkDiagnostics clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x36,
        name: "WiFiNetworkDiagnostics",
        revision: 1,

        features: {
            /**
             * Node makes available the counts for the number of received and transmitted packets on the Wi-Fi
             * interface.
             */
            packetCounts: BitFlag(0),

            /**
             * Node makes available the counts for the number of errors that have occurred during the reception and
             * transmission of packets on the Wi-Fi interface.
             */
            errorCounts: BitFlag(1)
        },

        attributes: {
            /**
             * Indicates the BSSID for which the Wi-Fi network the Node is currently connected.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.1
             */
            bssid: Attribute(0x0, TlvNullable(TlvByteString.bound({ length: 6 })), { default: null }),

            /**
             * Indicates the current type of Wi-Fi security used.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.2
             */
            securityType: Attribute(0x1, TlvNullable(TlvEnum<SecurityType>()), { default: null }),

            /**
             * Indicates the current IEEE 802.11 standard version in use by the Node, per the table below.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.3
             */
            wiFiVersion: Attribute(0x2, TlvNullable(TlvEnum<WiFiVersion>()), { default: null }),

            /**
             * Indicates the channel that Wi-Fi communication is currently operating on.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.4
             */
            channelNumber: Attribute(0x3, TlvNullable(TlvUInt16), { default: null }),

            /**
             * Indicates the current RSSI of the Node’s Wi-Fi radio in dBm.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.5
             */
            rssi: Attribute(
                0x4,
                TlvNullable(TlvInt8.bound({ min: -120, max: 0 })),
                { omitChanges: true, default: null }
            ),

            /**
             * Indicates the current maximum PHY rate of transfer of data in bits-per-second.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.6.12
             */
            currentMaxRate: OptionalAttribute(0xb, TlvNullable(TlvUInt64), { omitChanges: true, default: 0 })
        },

        events: {
            /**
             * The Disconnection Event shall indicate that a Node’s Wi-Fi connection has been disconnected as a result
             * of de-authenticated or dis-association and indicates the reason.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.8.1
             */
            disconnection: OptionalEvent(0x0, Priority.Info, TlvDisconnectionEvent),

            /**
             * The AssociationFailure event shall indicate that a Node has attempted to connect, or reconnect, to a
             * Wi-Fi access point, but is unable to successfully associate or authenticate, after exhausting all
             * internal retries of its supplicant.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.8.2
             */
            associationFailure: OptionalEvent(0x1, Priority.Info, TlvAssociationFailureEvent),

            /**
             * The ConnectionStatus Event shall indicate that a Node’s connection status to a Wi-Fi network has changed.
             * Connected, in this context, shall mean that a Node acting as a Wi-Fi station is successfully associated
             * to a Wi-Fi Access Point.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.15.8.3
             */
            connectionStatus: OptionalEvent(0x2, Priority.Info, TlvConnectionStatusEvent)
        },

        /**
         * This metadata controls which WiFiNetworkDiagnosticsCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { errorCounts: true }, component: ErrorCountsComponent },
            { flags: { packetCounts: true }, component: PacketCountsComponent }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * The Wi-Fi Network Diagnostics Cluster provides a means to acquire standardized diagnostics metrics that may be
     * used by a Node to assist a user or Administrator in diagnosing potential problems. The Wi-Fi Network Diagnostics
     * Cluster attempts to centralize all metrics that are relevant to a potential Wi-Fi radio running on a Node.
     *
     * WiFiNetworkDiagnosticsCluster supports optional features that you can enable with the
     * WiFiNetworkDiagnosticsCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.15
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const ERRCNT = { errorCounts: true };
    const PKTCNT = { packetCounts: true };

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
            beaconLostCount: MutableCluster.AsConditional(
                ErrorCountsComponent.attributes.beaconLostCount,
                { mandatoryIf: [ERRCNT] }
            ),
            beaconRxCount: MutableCluster.AsConditional(
                PacketCountsComponent.attributes.beaconRxCount,
                { mandatoryIf: [PKTCNT] }
            ),
            packetMulticastRxCount: MutableCluster.AsConditional(
                PacketCountsComponent.attributes.packetMulticastRxCount,
                { mandatoryIf: [PKTCNT] }
            ),
            packetMulticastTxCount: MutableCluster.AsConditional(
                PacketCountsComponent.attributes.packetMulticastTxCount,
                { mandatoryIf: [PKTCNT] }
            ),
            packetUnicastRxCount: MutableCluster.AsConditional(
                PacketCountsComponent.attributes.packetUnicastRxCount,
                { mandatoryIf: [PKTCNT] }
            ),
            packetUnicastTxCount: MutableCluster.AsConditional(
                PacketCountsComponent.attributes.packetUnicastTxCount,
                { mandatoryIf: [PKTCNT] }
            ),
            overrunCount: MutableCluster.AsConditional(
                ErrorCountsComponent.attributes.overrunCount,
                { mandatoryIf: [ERRCNT] }
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
     * This cluster supports all WiFiNetworkDiagnostics features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type WiFiNetworkDiagnosticsCluster = WiFiNetworkDiagnostics.Cluster;
export const WiFiNetworkDiagnosticsCluster = WiFiNetworkDiagnostics.Cluster;
ClusterRegistry.register(WiFiNetworkDiagnostics.Complete);
