/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Bytes, MaybePromise } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { WiFiNetworkManagement as WiFiNetworkManagementModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the WiFiNetworkManagement cluster.
 */
export namespace WiFiNetworkManagement {
    /**
     * {@link WiFiNetworkManagement} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the SSID of the primary Wi-Fi network provided by this device.
             *
             * A value of null shall indicate that no primary Wi-Fi network is available (e.g. because the Wi-Fi network
             * has not yet been configured by the user).
             *
             * > [!NOTE]
             *
             * > The SSID in Wi-Fi is a collection of 1-32 bytes, the text encoding of which is not specified.
             *   Implementations must be careful to support transferring these byte strings without requiring a
             *   particular encoding. The most common encoding is UTF-8, however this is just a convention. Some
             *   configurations may use Latin-1 or other character sets.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.2.4.1
             */
            readonly ssid: Bytes | null;

            /**
             * This attribute shall contain an arbitrary numeric value; this value shall increase whenever the
             * passphrase or PSK associated with the primary Wi-Fi network provided by this device changes.
             *
             * A value of null shall indicate that no primary Wi-Fi network is available.
             *
             * Clients can subscribe to this attribute or compare its value to a locally cached copy to detect if a
             * cached passphrase value has become stale.
             *
             * It is recommended that servers implement this attribute as either a timestamp or a counter. When
             * implemented as a counter it SHOULD be initialized with a random value.
             *
             * > [!NOTE]
             *
             * > The passphrase itself is not exposed as an attribute to avoid its unintentional retrieval or caching by
             *   clients that use wildcard reads or otherwise routinely read all available attributes. It can be
             *   retrieved using the NetworkPassphraseRequest command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.2.4.2
             */
            readonly passphraseSurrogate: number | bigint | null;
        }

        export interface Commands {
            /**
             * This command is used to request the current WPA-Personal passphrase or PSK associated with the Wi-Fi
             * network provided by this device.
             *
             * If the command is not executed via a CASE session, the command shall be rejected with a status of
             * UNSUPPORTED_ACCESS.
             *
             * If no primary Wi-Fi network is available (the SSID attribute is null), the command shall be rejected with
             * a status of INVALID_IN_STATE.
             *
             * Otherwise a NetworkPassphraseResponse shall be generated.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.2.5.1
             */
            networkPassphraseRequest(): MaybePromise<NetworkPassphraseResponse>;
        }
    }

    /**
     * Attributes that may appear in {@link WiFiNetworkManagement}.
     */
    export interface Attributes {
        /**
         * Indicates the SSID of the primary Wi-Fi network provided by this device.
         *
         * A value of null shall indicate that no primary Wi-Fi network is available (e.g. because the Wi-Fi network has
         * not yet been configured by the user).
         *
         * > [!NOTE]
         *
         * > The SSID in Wi-Fi is a collection of 1-32 bytes, the text encoding of which is not specified.
         *   Implementations must be careful to support transferring these byte strings without requiring a particular
         *   encoding. The most common encoding is UTF-8, however this is just a convention. Some configurations may use
         *   Latin-1 or other character sets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.2.4.1
         */
        readonly ssid: Bytes | null;

        /**
         * This attribute shall contain an arbitrary numeric value; this value shall increase whenever the passphrase or
         * PSK associated with the primary Wi-Fi network provided by this device changes.
         *
         * A value of null shall indicate that no primary Wi-Fi network is available.
         *
         * Clients can subscribe to this attribute or compare its value to a locally cached copy to detect if a cached
         * passphrase value has become stale.
         *
         * It is recommended that servers implement this attribute as either a timestamp or a counter. When implemented
         * as a counter it SHOULD be initialized with a random value.
         *
         * > [!NOTE]
         *
         * > The passphrase itself is not exposed as an attribute to avoid its unintentional retrieval or caching by
         *   clients that use wildcard reads or otherwise routinely read all available attributes. It can be retrieved
         *   using the NetworkPassphraseRequest command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.2.4.2
         */
        readonly passphraseSurrogate: number | bigint | null;
    }

    export interface Commands extends Base.Commands {}
    export type Components = [{ flags: {}, attributes: Base.Attributes, commands: Base.Commands }];

    /**
     * This command shall be generated in response to a NetworkPassphraseRequest command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 10.2.5.2
     */
    export interface NetworkPassphraseResponse {
        /**
         * This field shall indicate the current WPA-Personal passphrase or PSK associated with the primary Wi-Fi
         * network provided by this device, in one of the following formats:
         *
         *   - 8..63 bytes: WPA/WPA2/WPA3 passphrase.
         *
         *   - 64 bytes: WPA/WPA2/WPA3 raw hex PSK. Each byte shall be a ASCII hexadecimal digit.
         *
         * This matches the formats defined for WPA networks by the Credentials field in the Network Commissioning
         * cluster (see [MatterCore]).
         *
         * > [!NOTE]
         *
         * > WPA3-Personal permits passphrases shorter than 8 or longer than 63 characters, however the Network
         *   Commissioning cluster does not currently support configuring Matter devices to connect to operational
         *   networks utilizing such a passphrase.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.2.5.2.1
         */
        passphrase: Bytes;
    }

    export const id = ClusterId(0x451);
    export const name = "WiFiNetworkManagement" as const;
    export const revision = 1;
    export const schema = WiFiNetworkManagementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export type Cluster = typeof WiFiNetworkManagement;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `WiFiNetworkManagement` instead of
     * `WiFiNetworkManagement.Complete`)
     */
    export type Complete = typeof WiFiNetworkManagement;

    export declare const Complete: Complete;
    export declare const Typing: WiFiNetworkManagement;
}

ClusterNamespace.define(WiFiNetworkManagement);
export type WiFiNetworkManagementCluster = WiFiNetworkManagement.Cluster;
export const WiFiNetworkManagementCluster = WiFiNetworkManagement.Cluster;
export interface WiFiNetworkManagement extends ClusterTyping { Attributes: WiFiNetworkManagement.Attributes; Commands: WiFiNetworkManagement.Commands; Components: WiFiNetworkManagement.Components }
