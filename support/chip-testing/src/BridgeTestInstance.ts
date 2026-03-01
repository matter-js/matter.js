/**
 * @licensepart
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { AdministratorCommissioningServer } from "@matter/main/behaviors/administrator-commissioning";
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information";
import { NetworkCommissioningServer } from "@matter/main/behaviors/network-commissioning";
import { AdministratorCommissioning, BasicInformation, NetworkCommissioning } from "@matter/main/clusters";
import { DimmableLightDevice } from "@matter/main/devices/dimmable-light";
import { AggregatorEndpoint } from "@matter/main/endpoints/aggregator";
import { DeviceTypeId, VendorId } from "@matter/main/types";
import { NodeTestInstance } from "./NodeTestInstance.js";

export class BridgeTestInstance extends NodeTestInstance {
    static override id = "bridgeford-6100";

    serverNode: ServerNode | undefined;

    override async initialize() {
        await this.activateCommandPipe("bridge");
        await super.initialize();
    }

    async setupServer(): Promise<ServerNode> {
        const networkId = new Uint8Array(32);

        const serverNode = await ServerNode.create(
            ServerNode.RootEndpoint.with(
                // We upgrade the AdminCommissioningCluster to also allow Basic Commissioning, so we can use for more testcases
                AdministratorCommissioningServer.with("Basic"),
                // Set the correct Ethernet netwerk Commissioning cluster
                NetworkCommissioningServer.with("EthernetNetworkInterface"),
            ),
            {
                id: this.id,
                environment: this.env,
                network: {
                    port: 5540,
                    //advertiseOnStartup: false,
                },
                commissioning: {
                    passcode: this.config.passcode ?? 20202021,
                    discriminator: this.config.discriminator ?? 3840,
                },
                productDescription: {
                    name: this.appName,
                    deviceType: DeviceTypeId(0x0101),
                },
                basicInformation: {
                    vendorName: "Binford",
                    vendorId: VendorId(0xfff1),
                    nodeLabel: "",
                    productName: "MorePowerBridge 6200",
                    productLabel: "MorePowerBridge 6200",
                    productId: 0x8001,
                    serialNumber: `9999-9999-9999`,
                    manufacturingDate: "20200101",
                    partNumber: "123456",
                    productUrl: "https://test.com",
                    uniqueId: `node-matter-unique`,
                    localConfigDisabled: false,
                    productAppearance: {
                        finish: BasicInformation.ProductFinish.Satin,
                        primaryColor: BasicInformation.Color.Purple,
                    },
                    reachable: true,
                },
                administratorCommissioning: {
                    windowStatus: AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen,
                },
                groupKeyManagement: {
                    maxGroupsPerFabric: 50,
                },
                networkCommissioning: {
                    maxNetworks: 1,
                    interfaceEnabled: true,
                    lastConnectErrorValue: 0,
                    lastNetworkId: networkId,
                    lastNetworkingStatus: NetworkCommissioning.NetworkCommissioningStatus.Success,
                    networks: [{ networkId: networkId, connected: true }],
                },
            },
        );

        const aggregator = new Endpoint(AggregatorEndpoint, { id: "aggregator", number: 1 });

        await serverNode.add(aggregator);

        await aggregator.add(this.createBridgedLight(3));

        // For RR 1.1
        await aggregator.add(this.createBridgedLight(4));
        await aggregator.add(this.createBridgedLight(5));
        await aggregator.add(this.createBridgedLight(6));
        await aggregator.add(this.createBridgedLight(7));
        await aggregator.add(this.createBridgedLight(8));
        await aggregator.add(this.createBridgedLight(9));
        await aggregator.add(this.createBridgedLight(10));
        await aggregator.add(this.createBridgedLight(11));
        await aggregator.add(this.createBridgedLight(12));
        await aggregator.add(this.createBridgedLight(13));
        await aggregator.add(this.createBridgedLight(14));

        return serverNode;
    }

    createBridgedLight(id: number) {
        return new Endpoint(DimmableLightDevice.with(BridgedDeviceBasicInformationServer), {
            id: `onoff-${id}`,
            number: id,
            bridgedDeviceBasicInformation: {
                vendorName: "Vendorname",
                vendorId: VendorId(0xfff1),
                nodeLabel: "",
                productName: "Productname",
                productLabel: "Productlabel",
                serialNumber: `node-matter`,
                hardwareVersion: 1,
                hardwareVersionString: "1.0",
                softwareVersion: 1,
                softwareVersionString: "1.0",
                manufacturingDate: "20200101",
                partNumber: "123456",
                productUrl: "https://test.com",
                reachable: true,
                uniqueId: `node-matter-unique`,
                productAppearance: {
                    finish: BasicInformation.ProductFinish.Satin,
                    primaryColor: BasicInformation.Color.Purple,
                },
            },
        });
    }
}
