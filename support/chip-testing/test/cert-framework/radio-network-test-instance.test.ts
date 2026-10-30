/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { GeneralCommissioningServer } from "@matter/main/behaviors/general-commissioning";
import { NetworkCommissioning } from "@matter/main/clusters/network-commissioning";
import { DeviceCommissioner } from "@matter/main/protocol";
import { Status, StatusResponseError } from "@matter/main/types";
import { expect } from "chai";
import {
    TestThreadNetworkCommissioningServer,
    TestWiFiNetworkCommissioningServer,
} from "../../src/cluster/TestNetworkCommissioningServer.js";
import {
    RadioNetworkTestInstance,
    ThreadNetworkTestInstance,
    WiFiNetworkTestInstance,
} from "../../src/RadioNetworkTestInstance.js";
import { THREAD_DATASET, THREAD_NETWORK_ID, WIFI_CREDENTIALS, WIFI_SSID } from "../cert/tc-cnet-support.js";

import NetworkingStatus = NetworkCommissioning.NetworkCommissioningStatus;

const OTHER_NETWORK_ID = Bytes.fromString("other-ap");

/** A dataset that carries only a Network Name TLV. */
const DATASET_WITHOUT_EXTENDED_PAN_ID = Bytes.fromHex("030178");

/** An Extended PAN ID TLV with four bytes instead of eight. */
const MALFORMED_DATASET = Bytes.fromHex("020400000000");

/** An Extended PAN ID TLV whose header announces eight bytes but carries one. */
const TRUNCATED_DATASET = Bytes.fromHex("020801");

async function expectFailsafeRequired(promise: Promise<unknown>) {
    const error = await promise.then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(error).instanceOf(StatusResponseError);
    if (error instanceof StatusResponseError) {
        expect(error.code).equal(Status.FailsafeRequired);
    }
}

/**
 * Lets the commands that need an armed fail-safe through. Arming a real one needs a commissioning session; the servers
 * only ask the node's DeviceCommissioner.
 */
function armFailsafe(instance: RadioNetworkTestInstance) {
    instance.node.env.get(DeviceCommissioner).assertFailsafeArmed = () => {};
}

describe("RadioNetworkTestInstance", () => {
    describe("Wi-Fi", () => {
        let instance: WiFiNetworkTestInstance;

        beforeEach(async () => {
            instance = new WiFiNetworkTestInstance({ commandPipeFactory: async () => {} });
            await instance.initialize();
        });

        afterEach(async () => {
            await instance.close();
        });

        async function act<T>(run: (server: TestWiFiNetworkCommissioningServer) => T) {
            return await instance.node.act(async agent => run(agent.get(TestWiFiNetworkCommissioningServer)));
        }

        it("declares only the Wi-Fi feature on the root endpoint", () => {
            expect(instance.node.featuresOf(TestWiFiNetworkCommissioningServer)).deep.include({
                wiFiNetworkInterface: true,
                threadNetworkInterface: false,
                ethernetNetworkInterface: false,
            });
        });

        it("scans without a fail-safe, finds no network and sets the Breadcrumb", async () => {
            const response = await act(server => server.scanNetworks({ breadcrumb: 7 }));

            expect(response).deep.equal({ networkingStatus: NetworkingStatus.Success, wiFiScanResults: [] });
            expect(instance.node.stateOf(GeneralCommissioningServer).breadcrumb).equal(7);
        });

        it("refuses to add, connect or remove a network without a fail-safe", async () => {
            await expectFailsafeRequired(
                act(server => server.addOrUpdateWiFiNetwork({ ssid: WIFI_SSID, credentials: WIFI_CREDENTIALS })),
            );
            await expectFailsafeRequired(act(server => server.connectNetwork({ networkId: WIFI_SSID })));
            await expectFailsafeRequired(act(server => server.removeNetwork({ networkId: WIFI_SSID })));
        });

        describe("with an armed fail-safe", () => {
            beforeEach(() => {
                armFailsafe(instance);
            });

            function add(ssid: Bytes, breadcrumb?: number) {
                return act(server =>
                    server.addOrUpdateWiFiNetwork({ ssid, credentials: WIFI_CREDENTIALS, breadcrumb }),
                );
            }

            function state() {
                return instance.node.stateOf(TestWiFiNetworkCommissioningServer);
            }

            function breadcrumb() {
                return instance.node.stateOf(GeneralCommissioningServer).breadcrumb;
            }

            it("appends a new network, sets the last status and ID and the Breadcrumb", async () => {
                await add(OTHER_NETWORK_ID, 1);
                const response = await add(WIFI_SSID, 3);

                expect(response).deep.equal({ networkingStatus: NetworkingStatus.Success, networkIndex: 1 });
                expect(state().networks).deep.equal([
                    { networkId: OTHER_NETWORK_ID, connected: false },
                    { networkId: WIFI_SSID, connected: false },
                ]);
                expect(state().lastNetworkingStatus).equal(NetworkingStatus.Success);
                expect(Bytes.areEqual(state().lastNetworkId ?? new Uint8Array(), WIFI_SSID)).equal(true);
                expect(breadcrumb()).equal(3);
            });

            it("updates a network it has in place", async () => {
                await add(OTHER_NETWORK_ID);
                await add(WIFI_SSID);
                const response = await add(WIFI_SSID);

                expect(response).deep.equal({ networkingStatus: NetworkingStatus.Success, networkIndex: 1 });
                expect(state().networks).length(2);
            });

            it("answers BoundsExceeded past MaxNetworks and keeps the Breadcrumb", async () => {
                for (let i = 0; i < state().maxNetworks; i++) {
                    await add(Bytes.fromString(`ap-${i}`), 1);
                }
                const response = await add(WIFI_SSID, 9);

                expect(response).deep.equal({ networkingStatus: NetworkingStatus.BoundsExceeded });
                expect(state().networks).length(state().maxNetworks);
                expect(breadcrumb()).equal(1);
            });

            it("does not change the Breadcrumb for a command without one", async () => {
                await add(OTHER_NETWORK_ID, 2);
                await add(WIFI_SSID);

                expect(breadcrumb()).equal(2);
            });

            it("removes a network and answers its former index", async () => {
                await add(OTHER_NETWORK_ID);
                await add(WIFI_SSID);
                const response = await act(server =>
                    server.removeNetwork({ networkId: OTHER_NETWORK_ID, breadcrumb: 6 }),
                );

                expect(response).deep.equal({ networkingStatus: NetworkingStatus.Success, networkIndex: 0 });
                expect(state().networks).deep.equal([{ networkId: WIFI_SSID, connected: false }]);
                expect(breadcrumb()).equal(6);
            });

            it("answers NetworkIdNotFound when it removes a network it does not have", async () => {
                await add(WIFI_SSID, 3);
                const response = await act(server =>
                    server.removeNetwork({ networkId: OTHER_NETWORK_ID, breadcrumb: 6 }),
                );

                expect(response).deep.equal({ networkingStatus: NetworkingStatus.NetworkIdNotFound });
                expect(state().networks).length(1);
                expect(breadcrumb()).equal(3);
            });

            it("connects to one network and marks only that one connected", async () => {
                await add(WIFI_SSID);
                await add(OTHER_NETWORK_ID);
                await act(server => server.connectNetwork({ networkId: OTHER_NETWORK_ID }));
                const response = await act(server => server.connectNetwork({ networkId: WIFI_SSID, breadcrumb: 4 }));

                expect(response).deep.equal({ networkingStatus: NetworkingStatus.Success, errorValue: null });
                expect(state().networks.map(({ connected }) => connected)).deep.equal([true, false]);
                expect(state().lastNetworkingStatus).equal(NetworkingStatus.Success);
                expect(breadcrumb()).equal(4);
            });

            it("answers NetworkIdNotFound when it connects to a network it does not have", async () => {
                await add(WIFI_SSID, 3);
                const response = await act(server =>
                    server.connectNetwork({ networkId: OTHER_NETWORK_ID, breadcrumb: 4 }),
                );

                expect(response).deep.equal({ networkingStatus: NetworkingStatus.NetworkIdNotFound, errorValue: null });
                expect(state().networks.map(({ connected }) => connected)).deep.equal([false]);
                expect(state().lastNetworkingStatus).equal(NetworkingStatus.NetworkIdNotFound);
                expect(breadcrumb()).equal(3);
            });
        });

        describe("ReorderNetwork", () => {
            beforeEach(async () => {
                await instance.node.setStateOf(TestWiFiNetworkCommissioningServer, {
                    networks: [
                        { networkId: OTHER_NETWORK_ID, connected: false },
                        { networkId: WIFI_SSID, connected: false },
                    ],
                });
            });

            function networkIds() {
                return instance.node
                    .stateOf(TestWiFiNetworkCommissioningServer)
                    .networks.map(({ networkId }) => Bytes.toString(networkId));
            }

            it("moves the network to the index and sets the Breadcrumb", async () => {
                const response = await act(server =>
                    server.reorderNetwork({ networkId: WIFI_SSID, networkIndex: 0, breadcrumb: 5 }),
                );

                expect(response).deep.equal({ networkingStatus: NetworkingStatus.Success, networkIndex: 0 });
                expect(networkIds()).deep.equal(["matter-th-ap", "other-ap"]);
                expect(instance.node.stateOf(GeneralCommissioningServer).breadcrumb).equal(5);
            });

            it("answers NetworkIdNotFound for a network it does not have", async () => {
                const response = await act(server =>
                    server.reorderNetwork({ networkId: Bytes.fromString("unknown"), networkIndex: 0, breadcrumb: 5 }),
                );

                expect(response).deep.equal({ networkingStatus: NetworkingStatus.NetworkIdNotFound });
                expect(networkIds()).deep.equal(["other-ap", "matter-th-ap"]);
                expect(instance.node.stateOf(GeneralCommissioningServer).breadcrumb).equal(0);
            });

            it("answers OutOfRange for an index past the end of the list", async () => {
                const response = await act(server =>
                    server.reorderNetwork({ networkId: WIFI_SSID, networkIndex: 2, breadcrumb: 5 }),
                );

                expect(response).deep.equal({ networkingStatus: NetworkingStatus.OutOfRange });
                expect(networkIds()).deep.equal(["other-ap", "matter-th-ap"]);
                expect(instance.node.stateOf(TestWiFiNetworkCommissioningServer).lastNetworkingStatus).equal(
                    NetworkingStatus.OutOfRange,
                );
            });
        });
    });

    describe("Thread", () => {
        let instance: ThreadNetworkTestInstance;

        beforeEach(async () => {
            instance = new ThreadNetworkTestInstance({ commandPipeFactory: async () => {} });
            await instance.initialize();
        });

        afterEach(async () => {
            await instance.close();
        });

        async function act<T>(run: (server: TestThreadNetworkCommissioningServer) => T) {
            return await instance.node.act(async agent => run(agent.get(TestThreadNetworkCommissioningServer)));
        }

        it("declares only the Thread feature on the root endpoint", () => {
            expect(instance.node.featuresOf(TestThreadNetworkCommissioningServer)).deep.include({
                wiFiNetworkInterface: false,
                threadNetworkInterface: true,
                ethernetNetworkInterface: false,
            });
        });

        it("scans without a fail-safe, finds no network and sets the Breadcrumb", async () => {
            const response = await act(server => server.scanNetworks({ breadcrumb: 1 }));

            expect(response).deep.equal({ networkingStatus: NetworkingStatus.Success, threadScanResults: [] });
            expect(instance.node.stateOf(GeneralCommissioningServer).breadcrumb).equal(1);
        });

        it("refuses to add a network without a fail-safe", async () => {
            await expectFailsafeRequired(
                act(server => server.addOrUpdateThreadNetwork({ operationalDataset: THREAD_DATASET })),
            );
        });

        describe("with an armed fail-safe", () => {
            beforeEach(() => {
                armFailsafe(instance);
            });

            function networkIds() {
                return instance.node
                    .stateOf(TestThreadNetworkCommissioningServer)
                    .networks.map(({ networkId }) => Bytes.toHex(networkId));
            }

            it("names the network by the Extended PAN ID of the dataset", async () => {
                const response = await act(server =>
                    server.addOrUpdateThreadNetwork({ operationalDataset: THREAD_DATASET, breadcrumb: 3 }),
                );

                expect(response).deep.equal({ networkingStatus: NetworkingStatus.Success, networkIndex: 0 });
                expect(networkIds()).deep.equal([Bytes.toHex(THREAD_NETWORK_ID)]);
            });

            for (const [what, dataset] of [
                ["has no Extended PAN ID", DATASET_WITHOUT_EXTENDED_PAN_ID],
                ["is malformed", MALFORMED_DATASET],
                ["is truncated", TRUNCATED_DATASET],
            ] as const) {
                it(`answers OutOfRange for a dataset that ${what}`, async () => {
                    const response = await act(server =>
                        server.addOrUpdateThreadNetwork({ operationalDataset: dataset, breadcrumb: 3 }),
                    );

                    expect(response).deep.include({ networkingStatus: NetworkingStatus.OutOfRange });
                    expect(networkIds()).deep.equal([]);
                    expect(instance.node.stateOf(GeneralCommissioningServer).breadcrumb).equal(0);
                });
            }
        });
    });
});
