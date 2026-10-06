/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralCommissioningServer } from "#behaviors/general-commissioning";
import { NetworkCommissioningServer } from "#behaviors/network-commissioning";
import { OnOffLightDevice } from "#devices/on-off-light";
import { ServerNode } from "#node/ServerNode.js";
import {
    asError,
    Bytes,
    ChannelType,
    Crypto,
    MatterError,
    MaybePromise,
    Minutes,
    MockCrypto,
    Seconds,
    Time,
} from "@matter/general";
import { MockServerNode, MockSite } from "@matter/node/testing";
import {
    ClientInteraction,
    ControllerCommissioningFlow,
    ControllerCommissioningFlowOptions,
    PeerUnresponsiveError,
} from "@matter/protocol";
import { StatusResponse } from "@matter/types";
import { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";
import { NetworkCommissioning } from "@matter/types/clusters/network-commissioning";

const networkCalls = new Array<string>();

/** Failsafe each ArmFailSafe leaves on the device, when it arrived, and how many network commands came before it. */
const failsafeArms = new Array<{ at: number; end: number; afterNetworkCalls: number }>();

/**
 * Whether the PASE channel still reports BLE once the flow registered its steps.  On BLE the flow re-arms the failsafe
 * every 25 s, which keeps any failsafe alive.
 */
let bleAfterSetup = true;
const setUpInteractions = new WeakSet<ClientInteraction>();

/**
 * Replaces sending ScanNetworks; what it throws is what the flow sees.
 */
let interceptScan: ((interaction: ClientInteraction) => Promise<void>) | undefined;

class RecordingGeneralCommissioningServer extends GeneralCommissioningServer {
    override armFailSafe(request: GeneralCommissioning.ArmFailSafeRequest) {
        const at = Time.nowMs;
        failsafeArms.push({
            at,
            end: at + Seconds(request.expiryLengthSeconds),
            afterNetworkCalls: networkCalls.length,
        });
        return super.armFailSafe(request);
    }
}

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
    }: NetworkCommissioning.AddOrUpdateWiFiNetworkRequest): MaybePromise<NetworkCommissioning.NetworkConfigResponse> {
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

class SlowWifiServer extends NetworkCommissioningServer.with("WiFiNetworkInterface") {
    override initialize() {
        this.state.maxNetworks = 1;
        this.state.scanMaxTimeSeconds = 20;
        this.state.connectMaxTimeSeconds = 40;
        this.state.supportedWiFiBands = [NetworkCommissioning.WiFiBand["2G4"]];
    }

    override async scanNetworks(): Promise<NetworkCommissioning.ScanNetworksResponse> {
        networkCalls.push("wifi");
        await Time.sleep("slow scan", Seconds(90));
        return { networkingStatus: NetworkCommissioning.NetworkCommissioningStatus.Success, wiFiScanResults: [] };
    }

    override addOrUpdateWiFiNetwork({
        ssid,
    }: NetworkCommissioning.AddOrUpdateWiFiNetworkRequest): NetworkCommissioning.NetworkConfigResponse {
        networkCalls.push("add");
        this.state.networks = [{ networkId: ssid, connected: true }];
        return { networkingStatus: NetworkCommissioning.NetworkCommissioningStatus.Success, networkIndex: 0 };
    }
}

class SlowAddWifiServer extends RejectingWifiServer {
    override async addOrUpdateWiFiNetwork(
        request: NetworkCommissioning.AddOrUpdateWiFiNetworkRequest,
    ): Promise<NetworkCommissioning.NetworkConfigResponse> {
        await Time.sleep("slow add", Seconds(27));
        return super.addOrUpdateWiFiNetwork(request);
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
 * channel.  Applies {@link interceptScan} to ScanNetworks.
 */
function asBleChannel(interaction: ClientInteraction) {
    return new Proxy(interaction, {
        get(target, property) {
            if (property === "channelType") {
                return bleAfterSetup || !setUpInteractions.has(target) ? ChannelType.BLE : target.channelType;
            }
            if (property === "invoke" && interceptScan !== undefined) {
                const intercept = interceptScan;
                return async function* (...args: Parameters<ClientInteraction["invoke"]>) {
                    const isScan = args[0].invokeRequests.some(
                        ({ commandPath: { clusterId, commandId } }) =>
                            clusterId === NetworkCommissioning.id &&
                            commandId === NetworkCommissioning.commands.scanNetworks.id,
                    );
                    if (isScan) {
                        await intercept(target);
                        return;
                    }
                    yield* target.invoke(...args);
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
        setUpInteractions.add(interaction);
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
        failsafeArms.length = 0;
        bleAfterSetup = true;
        interceptScan = undefined;
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

    it("continues WiFi setup when the device answers the scan too late", async () => {
        const error = await commissionAndCaptureError(
            site => site.addNode(MockServerNode.RootEndpoint.with(SlowWifiServer), { device: OnOffLightDevice }),
            {
                wifiNetwork: { wifiSsid: "TestNet", wifiCredentials: "secret" },
            },
        );

        expect(networkCalls).deep.equals(["wifi", "add"]);
        expect(error).instanceOf(NetworkStepPassed);
    });

    it("ends commissioning when the device does not acknowledge the scan", async () => {
        interceptScan = async () => {
            throw new PeerUnresponsiveError();
        };
        const error = await commissionAndCaptureError(
            site => site.addNode(MockServerNode.RootEndpoint.with(RejectingWifiServer), { device: OnOffLightDevice }),
            {
                wifiNetwork: { wifiSsid: "TestNet", wifiCredentials: "secret" },
            },
        );

        expect(networkCalls).deep.equals([]);
        expect(PeerUnresponsiveError.of(error)).instanceOf(PeerUnresponsiveError);
    });

    it("commissions over a PASE session that suppresses peer loss", async () => {
        const suppressPeerLoss = new Array<boolean | undefined>();
        interceptScan = async interaction => {
            suppressPeerLoss.push(interaction.session?.suppressPeerLoss);
            throw new StatusResponse.FailureError();
        };
        await commissionAndCaptureError(
            site => site.addNode(MockServerNode.RootEndpoint.with(RejectingWifiServer), { device: OnOffLightDevice }),
            {
                wifiNetwork: { wifiSsid: "TestNet", wifiCredentials: "secret" },
            },
        );

        expect(suppressPeerLoss).deep.equals([true]);
    });

    it("arms the failsafe beyond the wait for a scan response", async () => {
        bleAfterSetup = false;
        await commissionAndCaptureError(
            site =>
                site.addNode(MockServerNode.RootEndpoint.with(SlowWifiServer, RecordingGeneralCommissioningServer), {
                    device: OnOffLightDevice,
                }),
            {
                wifiNetwork: { wifiSsid: "TestNet", wifiCredentials: "secret" },
            },
        );

        const scanArm = failsafeArms.filter(({ afterNetworkCalls }) => afterNetworkCalls === 0).at(-1);
        const nextArm = failsafeArms.find(({ afterNetworkCalls }) => afterNetworkCalls > 0);
        expect(scanArm).not.undefined;
        expect(nextArm).not.undefined;
        if (scanArm === undefined || nextArm === undefined) {
            return;
        }
        expect(nextArm.at - scanArm.at).greaterThan(Seconds(60));
        expect(scanArm.end - nextArm.at).greaterThanOrEqual(Seconds(5));
    });

    it("re-arms the failsafe on BLE without shortening a longer one", async () => {
        await commissionAndCaptureError(
            site =>
                site.addNode(MockServerNode.RootEndpoint.with(SlowAddWifiServer, RecordingGeneralCommissioningServer), {
                    device: OnOffLightDevice,
                }),
            {
                wifiNetwork: { wifiSsid: "TestNet", wifiCredentials: "secret" },
            },
        );

        // The periodic re-arms are the ones while the add is still running
        const connectIndex = failsafeArms.findIndex(({ at, end }) => end - at > Minutes(5));
        expect(connectIndex).greaterThan(-1);
        const periodicArms = failsafeArms
            .slice(connectIndex + 1)
            .filter(({ afterNetworkCalls }) => !networkCalls.slice(0, afterNetworkCalls).includes("add"));
        expect(periodicArms.length).greaterThan(0);
        for (const { end } of periodicArms) {
            expect(end).greaterThanOrEqual(failsafeArms[connectIndex].end - Seconds(1));
        }
    });
});
