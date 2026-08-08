/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration tests for the BLE proxy pipeline: the consumer stack (`ProxyBle` and friends) driving
 * `BleProxyHandler` against a `BleProxyTestClient` speaking the wire protocol over a mock transport.
 */

import { Millis, MockWsConnection, Seconds, Time, type Observable } from "@matter/general";
import type { BleProxyConnection } from "../src/BleProxyConnection.js";
import { BleProxyHandler } from "../src/BleProxyHandler.js";
import { BinaryFrameOpcode, BleProxyCommand } from "../src/BleProxyProtocol.js";
import { ProxyBle } from "../src/ProxyBle.js";
import type { ProxyBleCentralInterface, ProxyBleChannel } from "../src/ProxyBleChannel.js";
import { ProxyBleClient } from "../src/ProxyBleClient.js";
import { BleProxyTestClient } from "./support/BleProxyTestClient.js";
import { MockBleDevice } from "./support/MockBleDevice.js";

/** Discovery loops in `BleScanner` always run for the full timeout, so keep it short. */
const DISCOVERY_TIMEOUT = Millis(500);

/** Separates the BTP handshake indication from the WriteAndSubscribe response, the non-racing ordering. */
const INDICATION_DELAY = Millis(30);

function nextEmit<Args extends unknown[]>(observable: Observable<Args>): Promise<void> {
    return new Promise<void>(resolve => observable.once(() => resolve()));
}

describe("BLE Proxy Integration", function () {
    this.timeout(10_000);

    let handler: BleProxyHandler;
    let connection: BleProxyConnection;
    let testClient: BleProxyTestClient;
    const pendingSends = new Array<Promise<void>>();

    beforeEach(async () => {
        handler = new BleProxyHandler();
        const pair = MockWsConnection();
        connection = handler.accept(pair.server);
        testClient = new BleProxyTestClient();
        await testClient.connect(pair.client);
    });

    afterEach(async () => {
        await Promise.all(pendingSends);
        pendingSends.length = 0;
        await testClient.close();
        await handler.close();
    });

    describe("handshake", () => {
        it("should complete handshake and report connected", () => {
            expect(handler.connected).to.be.true;
        });
    });

    describe("scanning", () => {
        it("should send start_scan and stop_scan commands", async () => {
            const proxyBle = new ProxyBle(handler);
            const mockDevice = new MockBleDevice({ discriminator: 3840, vendorId: 0xfff1, productId: 0x8000 });

            testClient.onCommand(BleProxyCommand.StartScan, async () => {
                await testClient.sendEvent("device_discovered", mockDevice.discoveredEventData);
            });

            const devices = await proxyBle.scanner.findCommissionableDevicesContinuously(
                {},
                () => {},
                DISCOVERY_TIMEOUT,
            );

            expect(devices.length).to.be.greaterThanOrEqual(1);
            expect(devices[0].deviceIdentifier).to.equal(mockDevice.address);

            const commandNames = testClient.receivedCommands.map(c => c.command);
            expect(commandNames).to.include("start_scan");
            expect(commandNames).to.include("stop_scan");
        });

        it("should match by discriminator", async () => {
            const proxyBle = new ProxyBle(handler);
            const mockDevice = new MockBleDevice({ discriminator: 1234, vendorId: 0xfff1, productId: 0x8000 });

            testClient.onCommand(BleProxyCommand.StartScan, async () => {
                await testClient.sendEvent("device_discovered", mockDevice.discoveredEventData);
            });

            const devices = await proxyBle.scanner.findCommissionableDevicesContinuously(
                { longDiscriminator: 1234 },
                () => {},
                DISCOVERY_TIMEOUT,
            );

            expect(devices.length).to.equal(1);
            expect(devices[0].D).to.equal(1234);
        });

        it("should return empty when no matching device found", async () => {
            const proxyBle = new ProxyBle(handler);
            const mockDevice = new MockBleDevice({ discriminator: 5678, vendorId: 0xfff1, productId: 0x8000 });

            testClient.onCommand(BleProxyCommand.StartScan, async () => {
                await testClient.sendEvent("device_discovered", mockDevice.discoveredEventData);
            });

            const devices = await proxyBle.scanner.findCommissionableDevicesContinuously(
                { longDiscriminator: 9999 },
                () => {},
                DISCOVERY_TIMEOUT,
            );

            expect(devices.length).to.equal(0);
        });

        it("stopScanning clears hub scan intent even after a transient scanStopped", async () => {
            const client = new ProxyBleClient(handler);
            try {
                await client.startScanning();
                await testClient.waitForCommand("start_scan");

                // A transient all-clients-stopped resets the client's scan flag via the hub's scanStopped
                const scanStopped = nextEmit(handler.scanStopped);
                await testClient.sendEvent("scan_stopped", { reason: "transient" });
                await scanStopped;

                // stopScanning must still reach the hub, otherwise its scan intent lingers
                const stopPromise = testClient.waitForCommand("stop_scan");
                await client.stopScanning();
                const cmd = await stopPromise;
                expect(cmd.command).to.equal("stop_scan");
            } finally {
                client.close();
            }
        });
    });

    describe("openChannel BTP handshake", () => {
        const C1_UUID = "18EE2EF5-263D-4559-959F-4F9C429F9D11";
        const C2_UUID = "18EE2EF5-263D-4559-959F-4F9C429F9D12";

        /**
         * Wire up the command handlers for the full openChannel flow, with the BTP handshake response frame sent
         * after the WriteAndSubscribe response.
         */
        const wireBtpFlow = (mockDevice: MockBleDevice, connectionHandle = 1, mtu = 247) => {
            testClient.onCommand(BleProxyCommand.Connect, async () => ({
                connection_handle: connectionHandle,
                mtu,
            }));
            testClient.onCommand(BleProxyCommand.DiscoverServices, async () => ({
                services: mockDevice.services,
            }));
            testClient.onCommand(BleProxyCommand.DiscoverCharacteristics, async () => ({
                characteristics: mockDevice.characteristics,
            }));
            testClient.onCommand(BleProxyCommand.WriteAndSubscribe, async () => {
                pendingSends.push(
                    Time.sleep("btp handshake indication", INDICATION_DELAY).then(() =>
                        testClient.sendBinaryFrame(
                            BinaryFrameOpcode.Notification,
                            connectionHandle,
                            mockDevice.generateBtpHandshakeResponse(),
                        ),
                    ),
                );
                return {};
            });
        };

        /** Discover the mock device on the proxy scanner so openChannel can resolve it. */
        const discoverDevice = async (proxyBle: ProxyBle, mockDevice: MockBleDevice): Promise<void> => {
            testClient.onCommand(BleProxyCommand.StartScan, async () => {
                await testClient.sendEvent("device_discovered", mockDevice.discoveredEventData);
            });
            await proxyBle.scanner.findCommissionableDevicesContinuously({}, () => {}, DISCOVERY_TIMEOUT);
        };

        it("should complete BTP handshake and return a connected channel", async () => {
            const proxyBle = new ProxyBle(handler);
            const mockDevice = new MockBleDevice({ discriminator: 3840, vendorId: 0xfff1, productId: 0x8000 });

            await discoverDevice(proxyBle, mockDevice);
            wireBtpFlow(mockDevice);

            const central = proxyBle.centralInterface as ProxyBleCentralInterface;
            // matter.js installs an onData listener before opening channels
            central.onData(() => {});

            const channel = (await central.openChannel({
                type: "ble",
                peripheralAddress: mockDevice.address,
            })) as ProxyBleChannel;

            expect(channel.connected).to.be.true;
            expect(channel.name).to.equal(`ble-proxy://${mockDevice.address}`);

            const commandNames = testClient.receivedCommands.map(c => c.command);
            expect(commandNames).to.include("connect");
            expect(commandNames).to.include("discover_services");
            expect(commandNames).to.include("discover_characteristics");
            expect(commandNames).to.include("write_and_subscribe");

            const comboCmd = testClient.receivedCommands.find(c => c.command === "write_and_subscribe");
            const comboArgs = comboCmd?.args as { write_uuid: string; subscribe_uuid: string } | undefined;
            expect(comboArgs?.write_uuid).to.equal(C1_UUID);
            expect(comboArgs?.subscribe_uuid).to.equal(C2_UUID);

            await channel.close();
        });

        it("should complete handshake when the indication arrives before the WriteAndSubscribe response", async () => {
            const proxyBle = new ProxyBle(handler);
            const mockDevice = new MockBleDevice({ discriminator: 4242, vendorId: 0xfff1, productId: 0x8000 });

            await discoverDevice(proxyBle, mockDevice);

            testClient.onCommand(BleProxyCommand.Connect, async () => ({ connection_handle: 1, mtu: 247 }));
            testClient.onCommand(BleProxyCommand.DiscoverServices, async () => ({ services: mockDevice.services }));
            testClient.onCommand(BleProxyCommand.DiscoverCharacteristics, async () => ({
                characteristics: mockDevice.characteristics,
            }));
            // Emit the indication before returning the command result, so the binary frame reaches the hub ahead of
            // the WriteAndSubscribe reply — the ordering that breaks commissioning if the observer is late
            testClient.onCommand(BleProxyCommand.WriteAndSubscribe, async () => {
                await testClient.sendBinaryFrame(
                    BinaryFrameOpcode.Notification,
                    1,
                    mockDevice.generateBtpHandshakeResponse(),
                );
                return {};
            });

            const central = proxyBle.centralInterface as ProxyBleCentralInterface;
            central.onData(() => {});

            const channel = (await central.openChannel({
                type: "ble",
                peripheralAddress: mockDevice.address,
            })) as ProxyBleChannel;

            expect(channel.connected).to.be.true;
            await channel.close();
        });

        it("should reject when openChannel is called before onData listener is installed", async () => {
            const proxyBle = new ProxyBle(handler);
            const mockDevice = new MockBleDevice({ discriminator: 1234, vendorId: 0xfff1, productId: 0x8000 });

            await discoverDevice(proxyBle, mockDevice);

            const central = proxyBle.centralInterface as ProxyBleCentralInterface;
            try {
                await central.openChannel({ type: "ble", peripheralAddress: mockDevice.address });
                expect.fail("Should have thrown");
            } catch (err) {
                expect((err as Error).message).to.include("Network Interface");
            }
        });

        it("should disconnect and throw when device lacks the required Matter characteristics", async () => {
            const proxyBle = new ProxyBle(handler);
            const mockDevice = new MockBleDevice({ discriminator: 5555, vendorId: 0xfff1, productId: 0x8000 });

            await discoverDevice(proxyBle, mockDevice);

            testClient.onCommand(BleProxyCommand.Connect, async () => ({ connection_handle: 7, mtu: 244 }));
            testClient.onCommand(BleProxyCommand.DiscoverServices, async () => ({ services: mockDevice.services }));
            // Only C3 — the required C1/C2 are missing
            testClient.onCommand(BleProxyCommand.DiscoverCharacteristics, async () => ({
                characteristics: [{ uuid: "64630238-8772-45F2-B87D-748A83218F04", properties: ["read"] }],
            }));
            const disconnectPromise = testClient.waitForCommand("disconnect", Seconds(3));
            testClient.onCommand(BleProxyCommand.Disconnect, async () => ({}));

            const central = proxyBle.centralInterface as ProxyBleCentralInterface;
            central.onData(() => {});

            try {
                await central.openChannel({ type: "ble", peripheralAddress: mockDevice.address });
                expect.fail("Should have thrown");
            } catch (err) {
                expect((err as Error).message).to.include("missing required Matter characteristics");
            }

            const disconnectCmd = await disconnectPromise;
            expect((disconnectCmd.args as { connection_handle: number }).connection_handle).to.equal(7);
        });

        it("rejects openChannel (not crash) when the handshake times out while the write is still pending", async () => {
            const proxyBle = new ProxyBle(handler);
            const mockDevice = new MockBleDevice({ discriminator: 8888, vendorId: 0xfff1, productId: 0x8000 });

            await discoverDevice(proxyBle, mockDevice);

            testClient.onCommand(BleProxyCommand.Connect, async () => ({ connection_handle: 9, mtu: 247 }));
            testClient.onCommand(BleProxyCommand.DiscoverServices, async () => ({ services: mockDevice.services }));
            testClient.onCommand(BleProxyCommand.DiscoverCharacteristics, async () => ({
                characteristics: mockDevice.characteristics,
            }));
            // The write ack never returns and no handshake frame is sent, so the handshake timer fires while
            // WriteAndSubscribe is still pending: openChannel must reject, not leave an unhandled rejection
            testClient.onCommand(BleProxyCommand.WriteAndSubscribe, () => new Promise<void>(() => {}));
            testClient.onCommand(BleProxyCommand.Disconnect, async () => ({}));

            const central = proxyBle.centralInterface as ProxyBleCentralInterface;
            central.onData(() => {});

            // Enable MockTime only around the timed-out phase so the handshake timer fires without a real 15s wait
            MockTime.enable();
            try {
                const settled = central.openChannel({ type: "ble", peripheralAddress: mockDevice.address }).then(
                    () => ({ ok: true as const }),
                    (err: Error) => ({ ok: false as const, err }),
                );
                await testClient.waitForCommand("write_and_subscribe", Seconds(5));
                await MockTime.advance(Seconds(16));

                const outcome = await settled;
                expect(outcome.ok, "openChannel should reject, not resolve or crash").to.be.false;
                if (!outcome.ok) {
                    expect(outcome.err.message).to.include("BTP handshake response not received");
                }
            } finally {
                MockTime.disable();
            }
        });

        it("tears down the channel when the owning proxy client disconnects", async () => {
            const proxyBle = new ProxyBle(handler);
            const mockDevice = new MockBleDevice({ discriminator: 7000, vendorId: 0xfff1, productId: 0x8000 });

            await discoverDevice(proxyBle, mockDevice);
            wireBtpFlow(mockDevice);

            const central = proxyBle.centralInterface as ProxyBleCentralInterface;
            central.onData(() => {});

            const channel = (await central.openChannel({
                type: "ble",
                peripheralAddress: mockDevice.address,
            })) as ProxyBleChannel;
            expect(channel.connected).to.be.true;

            const channelClosed = nextEmit(channel.closed);
            const connectionClosed = nextEmit(connection.closed);
            await testClient.close();
            await connectionClosed;

            expect(channel.connected).to.be.false;
            await channelClosed;
        });
    });
});
