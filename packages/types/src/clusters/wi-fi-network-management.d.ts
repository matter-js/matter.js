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
 * Definitions for the WiFiNetworkManagement cluster.
 *
 * This cluster provides an interface for getting information about the Wi-Fi network that a Network Infrastructure
 * Manager device type provides. Privileged nodes within the same fabric as a Network Infrastructure Manager can use
 * these interfaces to request information related to the Wi-Fi Network such as SSID and Passphrase.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 10.2
 */
export declare namespace WiFiNetworkManagement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0451;

    /**
     * Textual cluster identifier.
     */
    export const name: "WiFiNetworkManagement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the WiFiNetworkManagement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link WiFiNetworkManagement} always supports these elements.
     */
    export interface BaseAttributes {
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
        ssid: Bytes | null;

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
        passphraseSurrogate: number | bigint | null;
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
        ssid: Bytes | null;

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
        passphraseSurrogate: number | bigint | null;
    }

    /**
     * {@link WiFiNetworkManagement} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to request the current WPA-Personal passphrase or PSK associated with the Wi-Fi network
         * provided by this device.
         *
         * If the command is not executed via a CASE session, the command shall be rejected with a status of
         * UNSUPPORTED_ACCESS.
         *
         * If no primary Wi-Fi network is available (the SSID attribute is null), the command shall be rejected with a
         * status of INVALID_IN_STATE.
         *
         * Otherwise a NetworkPassphraseResponse shall be generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.2.5.1
         */
        networkPassphraseRequest(): MaybePromise<NetworkPassphraseResponse>;
    }

    /**
     * Commands that may appear in {@link WiFiNetworkManagement}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];

    /**
     * This command shall be generated in response to a NetworkPassphraseRequest command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 10.2.5.2
     */
    export declare class NetworkPassphraseResponse {
        constructor(values?: Partial<NetworkPassphraseResponse>);

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
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * @deprecated Use {@link WiFiNetworkManagement}.
     */
    export const Cluster: typeof WiFiNetworkManagement;

    /**
     * @deprecated Use {@link WiFiNetworkManagement}.
     */
    export const Complete: typeof WiFiNetworkManagement;

    export const Typing: WiFiNetworkManagement;
}

/**
 * @deprecated Use {@link WiFiNetworkManagement}.
 */
export declare const WiFiNetworkManagementCluster: typeof WiFiNetworkManagement;

export interface WiFiNetworkManagement extends ClusterTyping {
    Attributes: WiFiNetworkManagement.Attributes;
    Commands: WiFiNetworkManagement.Commands;
    Components: WiFiNetworkManagement.Components;
}
