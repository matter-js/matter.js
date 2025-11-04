/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    WiFiNetworkManagementServer as BaseWiFiNetworkManagementServer
} from "../behaviors/wi-fi-network-management/WiFiNetworkManagementServer.js";
import {
    ThreadBorderRouterManagementServer as BaseThreadBorderRouterManagementServer
} from "../behaviors/thread-border-router-management/ThreadBorderRouterManagementServer.js";
import {
    ThreadNetworkDirectoryServer as BaseThreadNetworkDirectoryServer
} from "../behaviors/thread-network-directory/ThreadNetworkDirectoryServer.js";
import {
    ThreadNetworkDiagnosticsServer as BaseThreadNetworkDiagnosticsServer
} from "../behaviors/thread-network-diagnostics/ThreadNetworkDiagnosticsServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Network Infrastructure Manager provides interfaces that allow for the management of the Wi-Fi, Thread, and Ethernet
 * networks underlying a Matter deployment, realizing the Star Network Topology described in [MatterCore].
 *
 * Examples of physical devices that implement the Matter Network Infrastructure Manager device type include Wi-Fi
 * gateway routers.
 *
 * Relevant hardware and software requirements for Network Infrastructure Manager devices are defined in Section 15.3.6,
 * “Other Requirements” and within the clusters mandated by this device type.
 *
 * A Network Infrastructure Manager device may be managed by a service associated with the device vendor, for example,
 * an Internet Service Provider. Sometimes this managing service will have policies that require the use of the Managed
 * Device feature of the Access Control Cluster (see Section 15.3.5.1, “Access Control MNGD Conformance”). Consequently,
 * Commissioners of this device type should be aware of this feature and its use.
 *
 * @see {@link MatterSpecification.v142.Device} § 15.3
 */
export interface NetworkInfrastructureManagerDevice extends Identity<typeof NetworkInfrastructureManagerDeviceDefinition> {}

export namespace NetworkInfrastructureManagerRequirements {
    /**
     * The WiFiNetworkManagement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WiFiNetworkManagementServer} for convenience.
     */
    export const WiFiNetworkManagementServer = BaseWiFiNetworkManagementServer;

    /**
     * The ThreadBorderRouterManagement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThreadBorderRouterManagementServer} for convenience.
     */
    export const ThreadBorderRouterManagementServer = BaseThreadBorderRouterManagementServer;

    /**
     * The ThreadNetworkDirectory cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThreadNetworkDirectoryServer} for convenience.
     */
    export const ThreadNetworkDirectoryServer = BaseThreadNetworkDirectoryServer;

    /**
     * The ThreadNetworkDiagnostics cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThreadNetworkDiagnosticsServer} for convenience.
     */
    export const ThreadNetworkDiagnosticsServer = BaseThreadNetworkDiagnosticsServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            WiFiNetworkManagement: WiFiNetworkManagementServer,
            ThreadBorderRouterManagement: ThreadBorderRouterManagementServer,
            ThreadNetworkDirectory: ThreadNetworkDirectoryServer,
            ThreadNetworkDiagnostics: ThreadNetworkDiagnosticsServer
        }
    };
}

export const NetworkInfrastructureManagerDeviceDefinition = MutableEndpoint({
    name: "NetworkInfrastructureManager",
    deviceType: 0x90,
    deviceRevision: 2,
    requirements: NetworkInfrastructureManagerRequirements,

    behaviors: SupportedBehaviors(
        NetworkInfrastructureManagerRequirements.server.mandatory.WiFiNetworkManagement,
        NetworkInfrastructureManagerRequirements.server.mandatory.ThreadBorderRouterManagement,
        NetworkInfrastructureManagerRequirements.server.mandatory.ThreadNetworkDirectory,
        NetworkInfrastructureManagerRequirements.server.mandatory.ThreadNetworkDiagnostics
    )
});

export const NetworkInfrastructureManagerDevice: NetworkInfrastructureManagerDevice = NetworkInfrastructureManagerDeviceDefinition;
