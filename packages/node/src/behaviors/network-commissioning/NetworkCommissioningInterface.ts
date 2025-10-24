/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { NetworkCommissioning } from "#clusters/network-commissioning";

export namespace NetworkCommissioningInterface {
    export interface WiFiNetworkInterfaceOrThreadNetworkInterface {
        /**
         * This command is used to scan for available networks on the network interface associated with the cluster
         * instance.
         *
         * This command shall scan on the Cluster instance’s associated network interface for either of:
         *
         *   • All available networks (non-directed scanning)
         *
         *   • Specific networks (directed scanning)
         *
         * Scanning for available networks detects all networks of the type corresponding to the cluster server
         * instance’s associated network interface that are possible to join, such as all visible Wi-Fi access points
         * for Wi-Fi cluster server instances, all Thread PANs for Thread cluster server instances, within bounds of the
         * maximum response size.
         *
         * Scanning for a specific network (i.e. directed scanning) takes place if a network identifier (e.g. Wi-Fi
         * SSID) is provided in the command arguments. Directed scanning shall restrict the result set to the specified
         * network only.
         *
         * If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe
         * Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
         *
         * The client shall NOT expect the server to be done scanning and have responded with ScanNetworksResponse
         * before ScanMaxTimeSeconds seconds have elapsed. Enough transport time affordances for retries SHOULD be
         * expected before a client determines the operation to have timed-out.
         *
         * This command shall fail with a status code of BUSY if the server determines that it will fail to reliably
         * send a response due to changes of networking interface configuration at runtime for the interface over which
         * the command was invoked, or if it is currently unable to proceed with such an operation.
         *
         * For Wi-Fi-supporting servers (WI feature) the server shall always honor directed scans, and attempt to
         * provide all matching BSSID which are reachable on the bands which would otherwise be attempted if a
         * ConnectNetwork having the specified SSID were to take place. This command is useful for clients to determine
         * reachability capabilities as seen by the server’s own radios.
         *
         * For Wi-Fi-supporting servers the server shall always scan on all bands supported by the interface associated
         * with the cluster instance on which the command was invoked.
         *
         * If the command was invoked over the same link whose configuration is managed by a given server cluster
         * instance, there may be an impact on other communication from the invoking client, as well as other clients,
         * while the network interface is processing the scan. Clients SHOULD NOT use this command unless actively in
         * the process of re-configuring network connectivity.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.9.7.1
         */
        scanNetworks(request: NetworkCommissioning.ScanNetworksRequest): MaybePromise<NetworkCommissioning.ScanNetworksResponse>;

        /**
         * This command is used to remove a network configuration on the network interface associated with the cluster
         * instance.
         *
         * This command shall remove the network configuration from the Cluster if there was already a network
         * configuration with the same NetworkID. The relative order of the entries in the Networks attribute shall
         * remain unchanged, except for the removal of the requested network configuration.
         *
         * If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe
         * Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
         *
         * If the Networks attribute does not contain a matching entry, the command shall immediately respond with
         * NetworkConfigResponse having NetworkingStatus status field set to NetworkIdNotFound.
         *
         * On success, the NetworkConfigResponse command shall have its NetworkIndex field set to the 0- based index of
         * the entry in the Networks attribute that was just removed, and a NetworkingStatus status field set to
         * Success.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.9.7.6
         */
        removeNetwork(request: NetworkCommissioning.RemoveNetworkRequest): MaybePromise<NetworkCommissioning.NetworkConfigResponse>;

        /**
         * This command is used to connect to a network on the network interface associated with the cluster instance.
         *
         * This command shall attempt to connect to a network whose configuration was previously added by either the
         * AddOrUpdateWiFiNetwork or AddOrUpdateThreadNetwork commands. Network is identified by its NetworkID.
         *
         * This command shall fail with a BUSY status code returned to the initiator if the server is currently unable
         * to proceed with such an operation, such as if it is currently attempting to connect in the background, or is
         * already proceeding with a prior ConnectNetwork.
         *
         * If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe
         * Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
         *
         * Before connecting to the new network, the Node shall disconnect the operational network connections managed
         * by any other Network Commissioning cluster instances (whether under the Root Node or a Secondary Network
         * Interface), where those connections are not represented by an entry in the Networks attribute of the
         * corresponding cluster instance. This ensures that an Administrator or Commissioner can reliably reconfigure
         * the operational network connection of a device that has one or more Secondary Network interfaces, for example
         * by removing the active network configuration from one cluster instance, followed by adding a new
         * configuration and calling ConnectNetwork on a different cluster instance.
         *
         * Success or failure of this command shall be communicated by the ConnectNetworkResponse command, unless some
         * data model validations caused a FAILURE status to be sent prior to finishing execution of the command. The
         * ConnectNetworkResponse shall indicate the value Success in the NetworkingStatus field on successful
         * connection. On failure to connect, the ConnectNetworkResponse shall contain an appropriate NetworkingStatus,
         * DebugText and ErrorValue indicating the reason for failure.
         *
         * The amount of time needed to determine successful or failing connectivity on the cluster server’s associated
         * interface is provided by the ConnectMaxTimeSeconds attribute. Clients shall NOT consider the connection to
         * have timed-out until at least that duration has taken place. For non-concurrent commissioning situations, the
         * client SHOULD allow additional margin of time to account for its delay in executing operational discovery of
         * the Node once it is connected to the new network.
         *
         * On successful connection, the entry associated with the given Network configuration in the Networks attribute
         * shall indicate its Connected field set to true, and all other entries, if any exist, shall indicate their
         * Connected field set to false.
         *
         * On failure to connect, the entry associated with the given Network configuration in the Networks attribute
         * shall indicate its Connected field set to false.
         *
         * The precedence order of any entry subject to ConnectNetwork shall NOT change within the Networks attribute.
         *
         * Even after successfully connecting to a network, the configuration shall revert to the prior state of
         * configuration if the CommissioningComplete command (see Section 11.10.7.6, “CommissioningComplete Command”)
         * is not successfully invoked before expiry of the Fail-Safe timer.
         *
         * When non-concurrent commissioning is being used by a Commissioner or Administrator, the
         * ConnectNetworkResponse shall be sent with the NetworkingStatus field set to Success prior to closing the
         * commissioning channel, even if not yet connected to the operational network, unless the device would be
         * incapable of joining that network, in which case the usual failure path described in the prior paragraphs
         * shall be followed. Once the commissioning channel is closed, the operational channel will be started. It is
         * possible that the only method to determine success of the operation is operational discovery of the Node on
         * the new operational network. Therefore, before invoking the ConnectNetwork command, the client SHOULD
         * re-invoke the Arm Fail-Safe command with a duration that meets the following:
         *
         *   1. Sufficient time to meet the minimum required time (see Section 11.9.6.4, “ConnectMaxTimeSeconds
         *      Attribute”) that may be taken by the server to connect to the desired network.
         *
         *   2. Sufficient time to account for possible message-layer retries when a response is requested.
         *
         *   3. Sufficient time to allow operational discovery on the new network by a Commissioner or Administrator.
         *
         *   4. Sufficient time to establish a CASE session after operational discovery
         *
         *   5. Not so long that, in error situations, the delay to reverting back to being discoverable for
         *      commissioning with a previous configuration would cause significant user-perceived delay.
         *
         * Note as well that the CommissioningTimeout duration provided in a prior OpenCommissioningWindow or
         * OpenBasicCommissioningWindow command may impact the total time available to proceed with error recovery after
         * a connection failure.
         *
         * The LastNetworkingStatus, LastNetworkID and LastConnectErrorValue attributes may assist the client in
         * determining the reason for a failure after reconnecting over a Commissioning channel, especially in
         * non-concurrent commissioning situations.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.9.7.8
         */
        connectNetwork(request: NetworkCommissioning.ConnectNetworkRequest): MaybePromise<NetworkCommissioning.ConnectNetworkResponse>;

        /**
         * This command is used to re-order the network configuration list.
         *
         * This command shall set the specific order of the network configuration selected by its NetworkID in the
         * Networks attribute to match the position given by NetworkIndex.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.9.7.10
         */
        reorderNetwork(request: NetworkCommissioning.ReorderNetworkRequest): MaybePromise<NetworkCommissioning.NetworkConfigResponse>;
    }

    export interface WiFiNetworkInterface {
        /**
         * This command is used to add or update a Wi-Fi network configuration.
         *
         * This command shall be used to add or modify Wi-Fi network configurations.
         *
         * If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe
         * Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
         *
         * The Credentials associated with the network are not readable after execution of this command, as they do not
         * appear in the Networks attribute, for security reasons.
         *
         * If this command contains a ClientIdentifier, and the Networks list does not contain an entry with a matching
         * ClientIdentifier, then this command shall fail with a status of NOT_FOUND.
         *
         * See Section 11.9.7.5, “Common processing of AddOrUpdateWiFiNetwork and AddOrUpdateThreadNetwork” for behavior
         * of addition/update.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.9.7.3
         */
        addOrUpdateWiFiNetwork(request: NetworkCommissioning.AddOrUpdateWiFiNetworkRequest): MaybePromise<NetworkCommissioning.NetworkConfigResponse>;
    }

    export interface ThreadNetworkInterface {
        /**
         * This command is used to add or update a Thread network configuration.
         *
         * This command shall be used to add or modify Thread network configurations.
         *
         * If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe
         * Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
         *
         * See Section 11.9.7.5, “Common processing of AddOrUpdateWiFiNetwork and AddOrUpdateThreadNetwork” for behavior
         * of addition/update.
         *
         * The XPAN ID in the OperationalDataset serves as the NetworkID for the network configuration to be added or
         * updated.
         *
         * If the Networks attribute does not contain an entry with the same NetworkID as the one provided in the
         * OperationalDataset, the operation shall be considered an addition, otherwise, it shall be considered an
         * update.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.9.7.4
         */
        addOrUpdateThreadNetwork(request: NetworkCommissioning.AddOrUpdateThreadNetworkRequest): MaybePromise<NetworkCommissioning.NetworkConfigResponse>;
    }
}

export type NetworkCommissioningInterface = {
    components: [
        {
            flags: { wiFiNetworkInterface: true },
            methods: NetworkCommissioningInterface.WiFiNetworkInterfaceOrThreadNetworkInterface
        },
        {
            flags: { threadNetworkInterface: true },
            methods: NetworkCommissioningInterface.WiFiNetworkInterfaceOrThreadNetworkInterface
        },
        { flags: { wiFiNetworkInterface: true }, methods: NetworkCommissioningInterface.WiFiNetworkInterface },
        { flags: { threadNetworkInterface: true }, methods: NetworkCommissioningInterface.ThreadNetworkInterface }
    ]
};
