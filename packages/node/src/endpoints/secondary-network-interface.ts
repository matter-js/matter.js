/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    NetworkCommissioningServer as BaseNetworkCommissioningServer
} from "../behaviors/network-commissioning/NetworkCommissioningServer.js";
import {
    EthernetNetworkDiagnosticsServer as BaseEthernetNetworkDiagnosticsServer
} from "../behaviors/ethernet-network-diagnostics/EthernetNetworkDiagnosticsServer.js";
import {
    WiFiNetworkDiagnosticsServer as BaseWiFiNetworkDiagnosticsServer
} from "../behaviors/wi-fi-network-diagnostics/WiFiNetworkDiagnosticsServer.js";
import {
    ThreadNetworkDiagnosticsServer as BaseThreadNetworkDiagnosticsServer
} from "../behaviors/thread-network-diagnostics/ThreadNetworkDiagnosticsServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { DeviceClassification } from "#model";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Secondary Network Interface device provides an additional network interface supported by the Node, supplementing
 * the primary interface hosted by the Root Node endpoint.
 *
 * A Node supporting multiple network interfaces shall include the primary interface on the Root Node endpoint, along
 * with secondary interfaces on other endpoints. The priorities of these network interfaces are determined by the order
 * of their endpoints, where interfaces with smaller endpoint numbers are higher priority.
 *
 * SecondaryNetworkInterfaceEndpoint requires NetworkCommissioning cluster but NetworkCommissioning is not added by
 * default because you must select the features your device supports. You can add manually using
 * SecondaryNetworkInterfaceEndpoint.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 2.8
 */
export interface SecondaryNetworkInterfaceEndpoint extends Identity<typeof SecondaryNetworkInterfaceEndpointDefinition> {}

export namespace SecondaryNetworkInterfaceRequirements {
    /**
     * The NetworkCommissioning cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link NetworkCommissioningServer} for convenience.
     */
    export const NetworkCommissioningServer = BaseNetworkCommissioningServer;

    /**
     * The EthernetNetworkDiagnostics cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link EthernetNetworkDiagnosticsServer} for convenience.
     */
    export const EthernetNetworkDiagnosticsServer = BaseEthernetNetworkDiagnosticsServer;

    /**
     * The WiFiNetworkDiagnostics cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link WiFiNetworkDiagnosticsServer} for convenience.
     */
    export const WiFiNetworkDiagnosticsServer = BaseWiFiNetworkDiagnosticsServer;

    /**
     * The ThreadNetworkDiagnostics cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThreadNetworkDiagnosticsServer} for convenience.
     */
    export const ThreadNetworkDiagnosticsServer = BaseThreadNetworkDiagnosticsServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { NetworkCommissioning: NetworkCommissioningServer },
        optional: {
            EthernetNetworkDiagnostics: EthernetNetworkDiagnosticsServer,
            WiFiNetworkDiagnostics: WiFiNetworkDiagnosticsServer,
            ThreadNetworkDiagnostics: ThreadNetworkDiagnosticsServer
        }
    };
}

export const SecondaryNetworkInterfaceEndpointDefinition = MutableEndpoint({
    name: "SecondaryNetworkInterface",
    deviceType: 0x19,
    deviceRevision: 1,
    deviceClass: DeviceClassification.Utility,
    requirements: SecondaryNetworkInterfaceRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(SecondaryNetworkInterfaceEndpointDefinition);
export const SecondaryNetworkInterfaceEndpoint: SecondaryNetworkInterfaceEndpoint = SecondaryNetworkInterfaceEndpointDefinition;
