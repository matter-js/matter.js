/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkCommissioningServer } from "#behaviors/network-commissioning";
import { OnOffLightDevice } from "#devices/on-off-light";
import { ServerNode } from "#node/ServerNode.js";
import {
    asError,
    Bytes,
    ChannelType,
    Crypto,
    MatterError,
    MockCrypto,
    NoResponseTimeoutError,
    Seconds,
} from "@matter/general";
import { MockServerNode, MockSite } from "@matter/node/testing";
import { ClientInteraction, ControllerCommissioningFlow, ControllerCommissioningFlowOptions } from "@matter/protocol";
import { StatusResponse } from "@matter/types";
import { NetworkCommissioning } from "@matter/types/clusters/network-commissioning";

const networkCalls = new Array<string>();
let scanTimesOut = false;

class RejectingWifiServer extends NetworkCommissioningServer.with("WiFiNetworkInterface") {
    override initialize() {
        this.state.maxNetworks = 1;
        this.state.scanMaxTimeSeconds = 20;
        this.state.connectMaxTimeSeconds = 40;
        this.state.supportedWiFiBands = [NetworkCommissioning.WiFiBand["2G4"]];
    }

    override scanNetworks(): NetworkCommissioning.ScanNetworksResponse {
        networkCalls.push("wifi");
        throw new StatusResponse.FailureError();
    }

    override addOrUpdateWiFiNetwork({
        ssid,
    }: NetworkCommissioning.AddOrUpdateWiFiNetworkRequest): NetworkCommissioning.NetworkConfigResponse {
        networkCalls.push("add");
        this.state.networks = [{ networkId: ssid, connected: true }];
        return { networkingStatus: NetworkCommissioning.NetworkCommissioningStatus.Success, networkIndex: 0 };
    }
}

class RejectingWifiServerFailingAdd extends RejectingWifiServer {
    override addOrUpdateWiFiNetwork(): NetworkCommissioning.NetworkConfigResponse {
        networkCalls.push("add");
        return { networkingStatus: NetworkCommissioning.NetworkCommissioningStatus.OutOfRange };
    }
}

class RejectingThreadServer extends NetworkCommissioningServer.with("ThreadNetworkInterface") {
    override initialize() {
        this.state.maxNetworks = 1;
        this.state.scanMaxTimeSeconds = 20;
        this.state.connectMaxTimeSeconds = 40;
        this.state.threadVersion = 4;
        this.state.supportedThreadFeatures = { isFullThreadDevice: true };
    }

    override scanNetworks(): NetworkCommissioning.ScanNetworksResponse {
        networkCalls.push("thread");
        throw new StatusResponse.FailureError();
    }

    override addOrUpdateThreadNetwork(): NetworkCommissioning.NetworkConfigResponse {
        networkCalls.push("add");
        this.state.networks = [{ networkId: Bytes.fromHex("0102030405060708"), connected: true }];
        return { networkingStatus: NetworkCommissioning.NetworkCommissioningStatus.Success, networkIndex: 0 };
    }
}

class NetworkStepPassed extends MatterError {}

/**
 * Presents the PASE channel as BLE, because the flow only configures the operational network on a BLE commissioning
 * channel.  With {@link scanTimesOut} set, ScanNetworks fails as if the device never answered.
 */
function asBleChannel(interaction: ClientInteraction) {
    return new Proxy(interaction, {
        get(target, property) {
            if (property === "channelType") {
                return ChannelType.BLE;
            }
            if (property === "invoke" && scanTimesOut) {
                return (...args: Parameters<ClientInteraction["invoke"]>) => {
                    const isScan = args[0].invokeRequests.some(
                        ({ commandPath: { clusterId, commandId } }) =>
                            clusterId === NetworkCommissioning.id &&
                            commandId === NetworkCommissioning.commands.scanNetworks.id,
                    );
                    if (isScan) {
                        throw new NoResponseTimeoutError("ScanNetworks timed out");
                    }
                    return target.invoke(...args);
                };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
}

/**
 * Runs only the steps up to and including network configuration, then throws a sentinel so a rejected commission()
 * proves the network step completed.
 */
class StopAfterNetworkFlow extends ControllerCommissioningFlow {
    constructor(...[interaction, ...rest]: ConstructorParameters<typeof ControllerCommissioningFlow>) {
        super(asBleChannel(interaction), ...rest);
    }

    override async executeCommissioning() {
        const keep = new Set([
            "GetInitialData",
            "GeneralCommissioning.ArmFailsafe",
            "GeneralCommissioning.ConfigureRegulatoryInformation",
            "NetworkCommissioning.Wifi",
            "NetworkCommissioning.Thread",
        ]);
        for (let i = this.commissioningSteps.length - 1; i >= 0; i--) {
            if (!keep.has(this.commissioningSteps[i].name)) {
                this.commissioningSteps.splice(i, 1);
            }
        }
        await super.executeCommissioning();
        throw new NetworkStepPassed();
    }
}

describe("ScanNetworks rejection during commissioning", () => {
    before(() => {
        MockTime.init();
    });

    beforeEach(() => {
        networkCalls.length = 0;
        scanTimesOut = false;
    });

    function enableEntropy(controller: ServerNode, device: ServerNode) {
        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;
    }

    async function commissionAndCaptureError(
        addDevice: (site: MockSite) => Promise<ServerNode>,
        network: Pick<ControllerCommissioningFlowOptions, "wifiNetwork" | "threadNetwork">,
    ) {
        const site = new MockSite();
        try {
            const controller = await site.addController();
            const node = await addDevice(site);
            if (!controller.lifecycle.isOnline) {
                await controller.start();
            }
            enableEntropy(controller, node);

            const { passcode, discriminator } = node.state.commissioning;

            let caught: Error | undefined;
            await MockTime.resolve(
                controller.peers
                    .commission({
                        passcode,
                        discriminator,
                        commissioningFlowImpl: StopAfterNetworkFlow,
                        timeout: Seconds(90),
                        ...network,
                    })
                    .catch(error => {
                        caught = asError(error);
                    }),
                { macrotasks: true },
            );

            return caught;
        } finally {
            await site.close();
        }
    }

    it("continues WiFi setup when the device rejects the scan with a status", async () => {
        const error = await commissionAndCaptureError(
            site => site.addNode(MockServerNode.RootEndpoint.with(RejectingWifiServer), { device: OnOffLightDevice }),
            {
                wifiNetwork: { wifiSsid: "TestNet", wifiCredentials: "secret" },
            },
        );

        expect(networkCalls).deep.equals(["wifi", "add"]);
        expect(error).instanceOf(NetworkStepPassed);
    });

    it("continues Thread setup when the device rejects the scan with a status", async () => {
        const error = await commissionAndCaptureError(
            site => site.addNode(MockServerNode.RootEndpoint.with(RejectingThreadServer), { device: OnOffLightDevice }),
            {
                // MeshCoP dataset carrying only a NETWORK_NAME TLV = "MyNet"
                threadNetwork: { operationalDataset: "03054d794e6574" },
            },
        );

        expect(networkCalls).deep.equals(["thread", "add"]);
        expect(error).instanceOf(NetworkStepPassed);
    });

    it("names the rejected scan when adding the network fails afterwards", async () => {
        const error = await commissionAndCaptureError(
            site =>
                site.addNode(MockServerNode.RootEndpoint.with(RejectingWifiServerFailingAdd), {
                    device: OnOffLightDevice,
                }),
            {
                wifiNetwork: { wifiSsid: "TestNet", wifiCredentials: "secret" },
            },
        );

        expect(networkCalls).deep.equals(["wifi", "add"]);
        expect(error?.message).contains("scan failed: Failure (code 1)");
    });

    it("still ends commissioning when the scan gets no answer", async () => {
        scanTimesOut = true;
        const error = await commissionAndCaptureError(
            site => site.addNode(MockServerNode.RootEndpoint.with(RejectingWifiServer), { device: OnOffLightDevice }),
            {
                wifiNetwork: { wifiSsid: "TestNet", wifiCredentials: "secret" },
            },
        );

        expect(networkCalls).deep.equals([]);
        expect(NoResponseTimeoutError.of(error)).instanceOf(NoResponseTimeoutError);
    });
});
