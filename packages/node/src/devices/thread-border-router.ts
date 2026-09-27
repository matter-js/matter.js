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
 * ### Device Type Requirements
 *
 * If a Thread Border Router endpoint supports the Secondary Network Interface device type, then
 *
 *   - The Thread Border Router Management cluster and the Network Commissioning Cluster shall reflect the same
 *     underlying network configuration, i.e. changes made via either cluster shall also be reflected in the other.
 *
 *   - The MaxNetworks attribute in the Network Commissioning Cluster shall have a value of 1.
 *
 * ### Other Requirements
 *
 * The device shall implement a Thread Border Router as described by the Thread specification, and provide connectivity
 * between the Thread network and a hub network when connected via a functioning adjacent infrastructure link.
 *
 * The Thread Interface associated with the Border Router shall be exposed via the Thread Border Router Management
 * cluster.
 *
 * The device may include a Network Commissioning cluster instance associated with the Wi-Fi or Ethernet adjacent
 * infrastructure link interface on its Root Node. It SHOULD NOT include a Network Commissioning cluster instance
 * associated with the Thread interface of the Border Router on its Root Node.
 *
 * #### Thread Requirements
 *
 * A device exposing the Thread Border Router device type shall be certified by the Thread Group as Built on Thread:
 * Border Router based on Thread 1.4.0 or above.
 *
 * The device shall implement a Thread Border Router as described by the Thread specification, and provide connectivity
 * between the Thread network and the Wi-Fi / Ethernet hub network. The Thread Interface associated with the Border
 * Router shall be exposed via the Thread Border Router Management cluster.
 *
 * The Thread Border Router device shall support working as a Thread Parent for a minimum of 64 Thread Children
 * simultaneously in any combination of Children End Device types. The Thread Border Router device shall support
 * operating as a Thread Border Router in any Thread Network with up to 150 Thread nodes.
 *
 * ### Cluster Usage
 *
 * This section describes how to control and monitor the operation of a Thread Border Router.
 *
 * The Thread Border Router Device Type provides the Thread Border Router Management Cluster with the goal of ensuring a
 * seamless user experience when adding a new Border Router to form a new Thread network or join an existing one. This
 * section presents informative configuration sequences that a Fabric Admin can set up to improve coverage and Internet
 * access redundancy for Thread networks using the Thread Border Router device type. Four use cases are covered:
 *
 *   - Initial configuration of a Thread Border Router when no PAN exists
 *
 *   - Joining an existing PAN
 *
 *   - Sharing an existing PAN
 *
 *   - Moving to a new PAN
 *
 * #### Initial configuration of Thread Border Router
 *
 * In this use case, there is initially no PAN at the user's home. The user installs a Matter certified Thread Border
 * Router to use Thread connectivity for their Matter devices.
 *
 * After installation, the PAN configured by Admin A on the Thread Border Router is used to install the Thread Matter
 * device on Fabric A.
 *
 * #### Joining an existing PAN
 *
 * In this use case, there is already a PAN in the user's home that is managed by a Fabric A with TBR1 (e.g. as a result
 * of the above sequence diagram applied previously between Admin 1 and TBR1). The user installs a Matter-certified
 * Thread Border Router (TBR2) to extend the Thread coverage and Internet access redundancy of Thread networks for their
 * Matter devices.
 *
 * After installation, a single Thread PAN is shared by all Border Routers.
 *
 * #### Share an existing PAN
 *
 * In this use case, there is already a PAN in the user's home that is managed by Fabric A with TBR1 (e.g. as a result
 * of the above sequence diagram applied previously between Admin 1 and TBR1). The user wants to use the Thread
 * connectivity provided by the Matter-certified Thread Border Router managed by Fabric A with Fabric B to share its
 * connectivity.
 *
 * After the installation, the Thread PAN is shared by Fabric A and B.
 *
 * > [!NOTE]
 *
 * > NOTE: The user must use the Multiple Fabrics feature process between Fabrics A and B to commission the Thread
 *   Border Router from Fabric A to Fabric B.
 *
 * #### Merging to a new PAN
 *
 * This use case is a specific configuration where the user already has 2 PANs. One is managed by a Fabric A through a
 * Matter Thread Border Router (TBR1) and the other is managed by a Fabric B through another Matter Thread Border Router
 * (TBR2).
 *
 * The user wishes to merge the existing Thread connectivity provided by the two Matter certified Thread Border Routers
 * to share their connectivity to extend the Thread coverage and Internet access redundancy of the Thread networks for
 * their Matter devices.
 *
 * After installation, the Thread PAN is shared between Fabrics A and B.
 *
 * Note 1 : Activation of the pending dataset is Thread stack dependent and propagation of the new dataset to all Matter
 * devices may fail, for example if devices are disconnected during the process.
 *
 * Note 2 : This configuration should remain very rare if the previous installations followed the previous use cases.
 *
 * @see {@link MatterSpecification.v16.Device} § 15.4
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
