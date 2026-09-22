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
    WiFiNetworkManagementServer as BaseWiFiNetworkManagementServer
} from "../behaviors/wi-fi-network-management/WiFiNetworkManagementServer.js";
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
 * A Network Infrastructure Manager provides interfaces that allow for the management of the Wi-Fi, Thread, and Ethernet
 * networks underlying a Matter deployment, realizing the Star Network Topology described in MatterCore.
 *
 * Examples of physical devices that implement the Matter Network Infrastructure Manager device type include Wi-Fi
 * gateway routers.
 *
 * Relevant hardware and software requirements for Network Infrastructure Manager devices are defined in Section 15.3.6,
 * "Other Requirements" and within the clusters mandated by this device type.
 *
 * A Network Infrastructure Manager device may be managed by a service associated with the device vendor, for example,
 * an Internet Service Provider. Sometimes this managing service will have policies that require the use of the Managed
 * Device feature of the Access Control Cluster (see Section 15.3.4.1, "ManagedAclAllowed Condition"). Consequently,
 * Commissioners of this device type should be aware of this feature and its use.
 *
 * ### Other Requirements
 *
 * The Network Infrastructure Manager shall implement a bridged Wi-Fi / Ethernet hub network, enabling IPv6 connectivity
 * between Matter Nodes across transports.
 *
 * The Network Infrastructure Manager shall support IP communication with at least 300 Matter devices on this network.
 * If the Network Infrastructure Manager operates a DHCPv4 server, then it SHOULD be configured by default with a subnet
 * mask and DHCP pool size that allow for at least 300 devices.
 *
 * > [!NOTE]
 *
 * > NOTE: This recommendation is meant to avoid IPv4 address exhaustion if a large number of devices request IPv4
 *   addresses e.g. for non-Matter traffic.
 *
 * #### Ethernet Requirements
 *
 * The device shall provide an Ethernet LAN interface that is part of the bridged hub network.
 *
 * The Root Node endpoint of the device may include a Network Commissioning cluster associated with this Ethernet
 * interface.
 *
 * #### Wi-Fi Requirements
 *
 * The device shall support the operation of an IEEE 802.11 Wi-Fi network (ESS) and provide access to the SSID and
 * credentials of this network via the Wi-Fi Network Management cluster. The mechanisms by which this network is
 * configured are outside the scope of this specification. The device shall support concurrently operating BSSs for this
 * ESS in the 2.4 GHz and 5 GHz frequency bands; it may support operating additional BSSs for this ESS in other
 * frequency bands such as 6 GHz or sub-1 GHz. All BSSs in this ESS shall be part of the bridged hub network, i.e.
 * bridged to each other and to the Ethernet interface.
 *
 * The device may support operating additional Wi-Fi networks (e.g. a "guest network"); the requirements above do not
 * apply to any such additional networks.
 *
 * The device SHOULD NOT include any Network Commissioning cluster instances associated with the Wi-Fi Access Point
 * interface.
 *
 * The device shall be certified by the Wi-Fi Alliance in the Access Point role for Wi-Fi 6 or above. It shall
 * additionally be certified in the Access Point role for Wi-Fi 6E if it supports operating in the 6 GHz band, and for
 * Wi-Fi HaLow if it supports operating in the sub-1 GHz band.
 *
 * To support the efficient operation of the network generally, and for low-power stations in particular, the Network
 * Infrastructure Manager shall support, and upon (or before) Matter commissioning shall enable, the following Wi-Fi
 * features:
 *
 *   - Extended Sleep Time with a sleep time support up to at least 60 minutes, which includes the following IEEE 802.11
 *     features:
 *
 *   - Basic Service Set (BSS) Max Idle Period
 *
 *   - dot11BSSMaxIdlePeriodIndicationByNonAPSTA
 *
 *   - IPv6 Proxy Neighbor Discovery Protocol (NDP) including IPv6 duplicate address detection
 *
 *   - IPv4 Proxy Address Resolution Protocol (ARP)
 *
 *   - 802.11 WNM Sleep Mode with GTK/IGTK/BIGTK update support
 *
 * The device shall support at least 100 simultaneous Wi-Fi associations - irrespective of the distribution of the
 * Matter Wi-Fi devices over the supported bands; all Matter Wi-Fi devices could be on the same band. This includes
 * associations of low-power Matter Wi-Fi devices that are asleep for a long time.
 *
 * > [!NOTE]
 *
 * > NOTE: For the case of in-field upgrades of pre-Matter Wi-Fi access points, an exemption (simultaneous association
 *   requirement reduced to 64) can be requested when applying for Matter certification, e.g. in case of Wi-Fi chipset
 *   limitations (see the Alliance Certification Policy).
 *
 * #### Thread Requirements
 *
 * The Network Infrastructure Manager device shall be certified by the Thread Group as Built on Thread: Border Router
 * based on Thread 1.4.0 or above.
 *
 * The device shall implement a Thread Border Router as described by the Thread specification, and provide connectivity
 * between the Thread network and the Wi-Fi / Ethernet hub network. The Thread Interface associated with the Border
 * Router shall be exposed via the Thread Border Router Management cluster.
 *
 * The Thread Network Diagnostics cluster included on the endpoint shall be the instance corresponding to the Thread
 * Interface associated with the Border Router functionality.
 *
 * The device SHOULD NOT include any Network Commissioning cluster instances associated with the Thread Border Router.
 *
 * The Network Infrastructure Manager device shall support working as a Thread Parent for a minimum of 64 Thread
 * Children simultaneously in any combination of Children End Device types. The Network Infrastructure Manager device
 * shall support operating as a Thread Border Router in any Thread Network with up to 150 Thread nodes.
 *
 * #### Discovery and Commissioning
 *
 * A Network Infrastructure Manager device SHOULD implement Extended Discovery in order to be discoverable by entities
 * on the local IP network, even when not in Commissioning Mode, and SHOULD populate the optional device type subtype
 * (e.g., _T144) to allow for filtering of discovery results to find only Nodes that match the Network Infrastructure
 * Manager device type (see Commissioning Subtypes).
 *
 * A Network Infrastructure Manager SHOULD populate the following DNS-SD TXT record key/value pairs in the
 * Commissionable Node Discovery response: Commissioning Pairing Hint, and Commissioning Pairing Instruction so that the
 * Commissioner can guide the user through the steps needed to put the Commissionee into Commissioning Mode. If the
 * Network Infrastructure Manager provides its own app or website which includes a UX for putting the device into
 * Commissioning Mode, then the device SHOULD populate the Commissioning VID/PID key/value pair and SHOULD set bit 1 of
 * the Pairing Hint (Device Manufacturer URL), so that the Commissioner can utilize the URL specified in the
 * CommissioningCustomFlowUrl of the DeviceModel schema entry indexed by the Vendor ID and Product ID in the Distributed
 * Compliance Ledger and utilize flows described in Custom Commissioning Flow to redirect the user to a custom app or
 * website specified by the device vendor, and receive the user back following the callback flow which contains the
 * onboarding payload. This flow is described in detail in the Initiating Commissioning section of the Matter Core
 * specification, under the User Journey titled User-Initiated Beacon Detection, Already Commissioned Device.
 *
 * @see {@link MatterSpecification.v16.Device} § 15.3
 */
export interface NetworkInfrastructureManagerDevice extends Identity<typeof NetworkInfrastructureManagerDeviceDefinition> {}

export namespace NetworkInfrastructureManagerRequirements {
    /**
     * The ThreadNetworkDiagnostics cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThreadNetworkDiagnosticsServer} for convenience.
     */
    export const ThreadNetworkDiagnosticsServer = BaseThreadNetworkDiagnosticsServer;

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
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            ThreadNetworkDiagnostics: ThreadNetworkDiagnosticsServer,
            WiFiNetworkManagement: WiFiNetworkManagementServer,
            ThreadBorderRouterManagement: ThreadBorderRouterManagementServer,
            ThreadNetworkDirectory: ThreadNetworkDirectoryServer
        }
    };
}

export const NetworkInfrastructureManagerDeviceDefinition = MutableEndpoint({
    name: "NetworkInfrastructureManager",
    deviceType: 0x90,
    deviceRevision: 2,
    requirements: NetworkInfrastructureManagerRequirements,

    behaviors: SupportedBehaviors(
        NetworkInfrastructureManagerRequirements.server.mandatory.ThreadNetworkDiagnostics,
        NetworkInfrastructureManagerRequirements.server.mandatory.WiFiNetworkManagement,
        NetworkInfrastructureManagerRequirements.server.mandatory.ThreadBorderRouterManagement,
        NetworkInfrastructureManagerRequirements.server.mandatory.ThreadNetworkDirectory
    )
});

Object.freeze(NetworkInfrastructureManagerDeviceDefinition);
export const NetworkInfrastructureManagerDevice: NetworkInfrastructureManagerDevice = NetworkInfrastructureManagerDeviceDefinition;
