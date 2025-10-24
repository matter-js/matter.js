/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, Command } from "../cluster/Cluster.js";
import { TlvByteString } from "../tlv/TlvString.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvUInt64 } from "../tlv/TlvNumber.js";
import { AccessLevel } from "#model";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace WiFiNetworkManagement {
    /**
     * This command shall be generated in response to a NetworkPassphraseRequest command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.2.5.2
     */
    export const TlvNetworkPassphraseResponse = TlvObject({
        /**
         * This field shall indicate the current WPA-Personal passphrase or PSK associated with the primary Wi-Fi
         * network provided by this device, in one of the following formats:
         *
         *   • 8..63 bytes: WPA/WPA2/WPA3 passphrase.
         *
         *   • 64 bytes: WPA/WPA2/WPA3 raw hex PSK. Each byte shall be a ASCII hexadecimal digit.
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
         * @see {@link MatterSpecification.v141.Cluster} § 10.2.5.2.1
         */
        passphrase: TlvField(0, TlvByteString.bound({ maxLength: 64 }))
    });

    /**
     * This command shall be generated in response to a NetworkPassphraseRequest command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.2.5.2
     */
    export interface NetworkPassphraseResponse extends TypeFromSchema<typeof TlvNetworkPassphraseResponse> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x451,
        name: "WiFiNetworkManagement",
        revision: 1,

        attributes: {
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
             * @see {@link MatterSpecification.v141.Cluster} § 10.2.4.1
             */
            ssid: Attribute(
                0x0,
                TlvNullable(TlvByteString.bound({ minLength: 1, maxLength: 32 })),
                { persistent: true }
            ),

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
             * @see {@link MatterSpecification.v141.Cluster} § 10.2.4.2
             */
            passphraseSurrogate: Attribute(
                0x1,
                TlvNullable(TlvUInt64),
                { persistent: true, readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            )
        },

        commands: {
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
             * @see {@link MatterSpecification.v141.Cluster} § 10.2.5.1
             */
            networkPassphraseRequest: Command(
                0x0,
                TlvNoArguments,
                0x1,
                TlvNetworkPassphraseResponse,
                { invokeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * This cluster provides an interface for getting information about the Wi-Fi network that a Network Infrastructure
     * Manager device type provides. Privileged nodes within the same fabric as a Network Infrastructure Manager can use
     * these interfaces to request information related to the Wi-Fi Network such as SSID and Passphrase.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.2
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type WiFiNetworkManagementCluster = WiFiNetworkManagement.Cluster;
export const WiFiNetworkManagementCluster = WiFiNetworkManagement.Cluster;
ClusterRegistry.register(WiFiNetworkManagement.Complete);
