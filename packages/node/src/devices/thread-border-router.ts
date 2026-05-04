/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    ThreadNetworkDiagnosticsServer as BaseThreadNetworkDiagnosticsServer
} from "../behaviors/thread-network-diagnostics/ThreadNetworkDiagnosticsServer.js";
import {
    ThreadBorderRouterManagementServer as BaseThreadBorderRouterManagementServer
} from "../behaviors/thread-border-router-management/ThreadBorderRouterManagementServer.js";
import {
    ThreadNetworkDirectoryServer as BaseThreadNetworkDirectoryServer
} from "../behaviors/thread-network-directory/ThreadNetworkDirectoryServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Thread Border Router device type provides interfaces for querying and configuring the associated Thread network.
 *
 * Instances of physical devices categorized as Thread Border Routers encompass standalone Thread Border Routers,
 * conventional application devices like smart speakers, media streamers, and lighting fixtures equipped with a Thread
 * Border Router, as well as Wi-Fi Routers incorporating Thread Border Router functionality.
 *
 * The necessary hardware and software prerequisites are detailed within the clusters that are mandated by this device
 * type.
 *
 * @see {@link MatterSpecification.v151.Device} § 15.4
 */
export interface ThreadBorderRouterDevice extends Identity<typeof ThreadBorderRouterDeviceDefinition> {}

export namespace ThreadBorderRouterRequirements {
    /**
     * The ThreadNetworkDiagnostics cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThreadNetworkDiagnosticsServer} for convenience.
     */
    export const ThreadNetworkDiagnosticsServer = BaseThreadNetworkDiagnosticsServer;

    /**
     * The ThreadBorderRouterManagement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThreadBorderRouterManagementServer} for convenience.
     */
    export const ThreadBorderRouterManagementServer = BaseThreadBorderRouterManagementServer;

    /**
     * The ThreadNetworkDirectory cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThreadNetworkDirectoryServer} for convenience.
     */
    export const ThreadNetworkDirectoryServer = BaseThreadNetworkDirectoryServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            ThreadNetworkDiagnostics: ThreadNetworkDiagnosticsServer,
            ThreadBorderRouterManagement: ThreadBorderRouterManagementServer
        },
        optional: { ThreadNetworkDirectory: ThreadNetworkDirectoryServer }
    };
}

export const ThreadBorderRouterDeviceDefinition = MutableEndpoint({
    name: "ThreadBorderRouter",
    deviceType: 0x91,
    deviceRevision: 2,
    requirements: ThreadBorderRouterRequirements,
    behaviors: SupportedBehaviors(
        ThreadBorderRouterRequirements.server.mandatory.ThreadNetworkDiagnostics,
        ThreadBorderRouterRequirements.server.mandatory.ThreadBorderRouterManagement
    )
});

Object.freeze(ThreadBorderRouterDeviceDefinition);
export const ThreadBorderRouterDevice: ThreadBorderRouterDevice = ThreadBorderRouterDeviceDefinition;
