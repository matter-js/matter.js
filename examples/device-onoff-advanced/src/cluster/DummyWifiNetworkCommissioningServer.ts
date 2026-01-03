/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { GeneralCommissioningBehavior } from "@matter/main/behaviors/general-commissioning";
import { NetworkCommissioningBehavior } from "@matter/main/behaviors/network-commissioning";
import { NetworkCommissioning } from "@matter/main/clusters/network-commissioning";
import { DeviceAdvertiser, DeviceCommissioner } from "@matter/main/protocol";

const firstNetworkId = new Uint8Array(32);

/**
 * This represents a Dummy version of a Wifi Network Commissioning Cluster Server without real Wifi related logic, beside
 * returning some values provided as CLI parameters. This dummy implementation is only there for tests/as showcase for BLE
 * commissioning of a device.
 */
export class DummyWifiNetworkCommissioningServer extends NetworkCommissioningBehavior.with(
    NetworkCommissioning.Feature.WiFiNetworkInterface,
) {
    override scanNetworks({ ssid, breadcrumb }: NetworkCommissioning.ScanNetworksRequest) {
        console.log(
            `---> scanNetworks called on NetworkCommissioning cluster: ${ssid ? Bytes.toHex(ssid) : undefined} ${breadcrumb}`,
        );

        // Simulate successful scan
        if (breadcrumb !== undefined) {
            const generalCommissioningCluster = this.agent.get(GeneralCommissioningBehavior);
            generalCommissioningCluster.state.breadcrumb = breadcrumb;
        }

        const networkingStatus = NetworkCommissioning.NetworkCommissioningStatus.Success;
        this.state.lastNetworkingStatus = networkingStatus;

        return {
            networkingStatus,
            wiFiScanResults: [
                {
                    security: {
                        unencrypted: false,
                        wep: false,
                        wpaPersonal: false,
                        wpa2Personal: true,
                        wpa3Personal: true,
                    },
                    ssid: ssid || Bytes.fromString(this.env.vars.get("ble.wifi.scanSsid", "TestSSID")), // Set a valid existing local Wi-Fi SSID here
                    bssid: Bytes.fromString(this.env.vars.get("ble.wifi.scanBssid", "00:00:00:00:00:00")),
                    channel: 1,
                },
            ],
        };
    }

    override addOrUpdateWiFiNetwork({
        ssid,
        credentials,
        breadcrumb,
    }: NetworkCommissioning.AddOrUpdateWiFiNetworkRequest) {
        console.log(
            `---> addOrUpdateWiFiNetwork called on NetworkCommissioning cluster: ${Bytes.toHex(ssid)} ${Bytes.toHex(credentials)} ${breadcrumb}`,
        );

        this.env
            .get(DeviceCommissioner)
            .assertFailsafeArmed("Failsafe timer needs to be armed to add or update networks.");

        // Simulate successful add or update
        if (breadcrumb !== undefined) {
            const generalCommissioningCluster = this.agent.get(GeneralCommissioningBehavior);
            generalCommissioningCluster.state.breadcrumb = breadcrumb;
        }

        const networkingStatus = NetworkCommissioning.NetworkCommissioningStatus.Success;
        this.state.lastNetworkingStatus = networkingStatus;
        this.state.lastNetworkId = firstNetworkId;

        return {
            networkingStatus,
            networkIndex: 0,
        };
    }

    override removeNetwork({ networkId, breadcrumb }: NetworkCommissioning.RemoveNetworkRequest) {
        console.log(
            `---> removeNetwork called on NetworkCommissioning cluster: ${Bytes.toHex(networkId)} ${breadcrumb}`,
        );

        this.env
            .get(DeviceCommissioner)
            .assertFailsafeArmed("Failsafe timer needs to be armed to add or update networks.");

        // Simulate successful add or update
        if (breadcrumb !== undefined) {
            const generalCommissioningCluster = this.agent.get(GeneralCommissioningBehavior);
            generalCommissioningCluster.state.breadcrumb = breadcrumb;
        }

        const networkingStatus = NetworkCommissioning.NetworkCommissioningStatus.Success;
        this.state.lastNetworkingStatus = networkingStatus;
        this.state.lastNetworkId = firstNetworkId;

        return {
            networkingStatus,
            networkIndex: 0,
        };
    }

    override async connectNetwork({ networkId, breadcrumb }: NetworkCommissioning.ConnectNetworkRequest) {
        console.log(
            `---> connectNetwork called on NetworkCommissioning cluster: ${Bytes.toHex(networkId)} ${breadcrumb}`,
        );

        this.env
            .get(DeviceCommissioner)
            .assertFailsafeArmed("Failsafe timer needs to be armed to add or update networks.");

        // Simulate successful connection
        if (breadcrumb !== undefined) {
            const generalCommissioningCluster = this.agent.get(GeneralCommissioningBehavior);
            generalCommissioningCluster.state.breadcrumb = breadcrumb;
        }

        this.state.networks[0].connected = true;

        const networkingStatus = NetworkCommissioning.NetworkCommissioningStatus.Success;
        this.state.lastNetworkingStatus = networkingStatus;
        this.state.lastNetworkId = firstNetworkId;
        this.state.lastConnectErrorValue = null;

        // Announce operational in IP network
        this.env.get(DeviceAdvertiser).restartAdvertisement();

        return {
            networkingStatus,
            errorValue: null,
        };
    }

    override reorderNetwork({ networkId, networkIndex, breadcrumb }: NetworkCommissioning.ReorderNetworkRequest) {
        console.log(
            `---> reorderNetwork called on NetworkCommissioning cluster: ${Bytes.toHex(networkId)} ${networkIndex} ${breadcrumb}`,
        );

        // Simulate successful connection
        if (breadcrumb !== undefined) {
            const generalCommissioningCluster = this.agent.get(GeneralCommissioningBehavior);
            generalCommissioningCluster.state.breadcrumb = breadcrumb;
        }

        const networkingStatus = NetworkCommissioning.NetworkCommissioningStatus.Success;
        this.state.lastNetworkingStatus = networkingStatus;

        return {
            networkingStatus,
            networkIndex: 0,
        };
    }
}
