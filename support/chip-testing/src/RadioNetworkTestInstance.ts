/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, Node, ServerNode } from "@matter/main";
import { BasicInformation, NetworkCommissioning } from "@matter/main/clusters";
import { OnOffLightDevice } from "@matter/main/devices/on-off-light";
import { DeviceTypeId, EndpointNumber, VendorId } from "@matter/main/types";
import {
    TestThreadNetworkCommissioningServer,
    TestWiFiNetworkCommissioningServer,
} from "./cluster/TestNetworkCommissioningServer.js";
import { NodeTestInstance } from "./NodeTestInstance.js";

/** The Thread version a Thread 1.3 device reports. */
const THREAD_VERSION = 4;

/** How many network configurations the TH keeps. */
const MAX_NETWORKS = 4;

/**
 * A light whose root endpoint configures a Wi-Fi or Thread network, the TH of the Network Commissioning DUT-client
 * cases. chip's apps in the harness image are built without Wi-Fi and Thread, so only matter.js provides this TH.
 *
 * The node runs on the host's own network whatever the DUT configures; see {@link TestWiFiNetworkCommissioningServer}.
 */
export abstract class RadioNetworkTestInstance extends NodeTestInstance {
    protected abstract createRootNode(options: RadioNodeOptions): Promise<ServerNode>;

    async setupServer(): Promise<ServerNode> {
        const node = await this.createRootNode({
            id: this.id,
            environment: this.env,
            network: {
                port: this.config.port ?? 5540,
            },
            commissioning: {
                passcode: this.config.passcode ?? 20202021,
                discriminator: this.config.discriminator ?? 3840,
            },
            productDescription: {
                name: this.appName,
                deviceType: DeviceTypeId(OnOffLightDevice.deviceType),
            },
            basicInformation: {
                vendorName: "Binford",
                vendorId: VendorId(0xfff1),
                nodeLabel: "",
                productName: "MorePowerPro 6100 Radio Light",
                productLabel: "MorePowerPro 6100 Radio Light",
                productId: 0x8001,
                serialNumber: "9999-9999-9999",
                manufacturingDate: "20200101",
                partNumber: "123456",
                productUrl: "https://test.com",
                uniqueId: "node-matter-unique",
                localConfigDisabled: false,
                productAppearance: {
                    finish: BasicInformation.ProductFinish.Satin,
                    primaryColor: BasicInformation.Color.Purple,
                },
                reachable: true,
            },
        });
        await node.add(new Endpoint(OnOffLightDevice, { number: EndpointNumber(1) }));
        return node;
    }
}

/** The options both radio variants share. */
type RadioNodeOptions = Node.Options<ServerNode.RootEndpoint>;

/** The `wifi-network` TH: Wi-Fi network configuration on the root endpoint. */
export class WiFiNetworkTestInstance extends RadioNetworkTestInstance {
    static override id = "wifi-network-6100";

    protected createRootNode(options: RadioNodeOptions) {
        return ServerNode.create(ServerNode.RootEndpoint.with(TestWiFiNetworkCommissioningServer), {
            ...options,
            networkCommissioning: {
                maxNetworks: MAX_NETWORKS,
                interfaceEnabled: true,
                networks: [],
                scanMaxTimeSeconds: 1,
                connectMaxTimeSeconds: 1,
                supportedWiFiBands: [NetworkCommissioning.WiFiBand["2G4"]],
            },
        });
    }
}

/** The `thread-network` TH: Thread network configuration on the root endpoint. */
export class ThreadNetworkTestInstance extends RadioNetworkTestInstance {
    static override id = "thread-network-6100";

    protected createRootNode(options: RadioNodeOptions) {
        return ServerNode.create(ServerNode.RootEndpoint.with(TestThreadNetworkCommissioningServer), {
            ...options,
            networkCommissioning: {
                maxNetworks: MAX_NETWORKS,
                interfaceEnabled: true,
                networks: [],
                scanMaxTimeSeconds: 1,
                connectMaxTimeSeconds: 1,
                supportedThreadFeatures: { isRouterCapable: true },
                threadVersion: THREAD_VERSION,
            },
        });
    }
}
