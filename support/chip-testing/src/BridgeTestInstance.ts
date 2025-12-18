/**
 * @licensepart
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, Environment, ServerNode, StorageService } from "@matter/main";
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
        Environment.default.get(StorageService).factory = (_namespace: string) => this.config.storage;

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
                    manufacturingDate: "20210101",
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

        const bridgedLight = new Endpoint(DimmableLightDevice.with(BridgedDeviceBasicInformationServer), {
            id: "onoff-3",
            number: 3,
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
                manufacturingDate: "20210101",
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

        const aggregator = new Endpoint(AggregatorEndpoint, { id: "aggregator", number: 1 });

        await serverNode.add(aggregator);

        await aggregator.add(bridgedLight);

        return serverNode;
    }
}
