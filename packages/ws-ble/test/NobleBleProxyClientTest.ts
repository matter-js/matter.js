/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Runs the reference noble proxy client against the hub over a mock transport, with a scripted noble standing in for
 * the Bluetooth adapter.
 */

import {
    Environment,
    InternalError,
    Millis,
    MockWsConnection,
    Time,
    WebSocketClient,
    type HttpEndpoint,
} from "@matter/general";
import { BtpCodec, MatterBle } from "@matter/protocol";
import type { Noble } from "@stoprocent/noble";
import { BleProxyHandler } from "../src/BleProxyHandler.js";
import { ProxyBle } from "../src/ProxyBle.js";
import { MockBleDevice } from "./support/MockBleDevice.js";

// A non-literal specifier keeps the node-only client out of the browser bundle the Web test target builds
const NOBLE_CLIENT_MODULE = ["..", "src", "noble-client", "NobleBleProxyClient.js"].join("/");
type NobleClientModule = typeof import("../src/noble-client/NobleBleProxyClient.js");
type NobleBleProxyClientClass = NobleClientModule["NobleBleProxyClient"];

async function loadNobleBleProxyClient(): Promise<NobleBleProxyClientClass> {
    // Node exposes the CommonJS build's exports under `default` only
    const loaded: Partial<NobleClientModule> & { default?: Partial<NobleClientModule> } = await import(
        NOBLE_CLIENT_MODULE
    );
    const NobleBleProxyClient = loaded.NobleBleProxyClient ?? loaded.default?.NobleBleProxyClient;
    if (NobleBleProxyClient === undefined) {
        throw new InternalError(`${NOBLE_CLIENT_MODULE} does not export NobleBleProxyClient`);
    }
    return NobleBleProxyClient;
}

const DISCOVERY_TIMEOUT = Millis(500);

type Listener = (...args: never[]) => void;

/** The part of node's EventEmitter that noble objects expose and the proxy client uses. */
class Emitter {
    readonly #listeners = new Map<string, Array<{ listener: Listener; once: boolean }>>();

    on(event: string, listener: Listener) {
        this.#entries(event).push({ listener, once: false });
        return this;
    }

    once(event: string, listener: Listener) {
        this.#entries(event).push({ listener, once: true });
        return this;
    }

    removeListener(event: string, listener: Listener) {
        const entries = this.#entries(event);
        const index = entries.findIndex(entry => entry.listener === listener);
        if (index !== -1) {
            entries.splice(index, 1);
        }
        return this;
    }

    listenerCount(event: string) {
        return this.#entries(event).length;
    }

    emit(event: string, ...args: unknown[]) {
        for (const entry of [...this.#entries(event)]) {
            if (entry.once) {
                this.removeListener(event, entry.listener);
            }
            Reflect.apply(entry.listener, undefined, args);
        }
    }

    #entries(event: string) {
        let entries = this.#listeners.get(event);
        if (entries === undefined) {
            entries = [];
            this.#listeners.set(event, entries);
        }
        return entries;
    }
}

class FakeCharacteristic extends Emitter {
    constructor(
        readonly uuid: string,
        readonly properties: string[],
        private readonly onWrite: (data: Uint8Array) => void = () => {},
    ) {
        super();
    }

    async writeAsync(data: Buffer, _withoutResponse: boolean) {
        this.onWrite(new Uint8Array(data));
    }

    async subscribeAsync() {}

    async unsubscribeAsync() {}

    async readAsync() {
        return Buffer.alloc(0);
    }
}

/** A Matter peripheral that answers every BTP handshake and records the segment size each one requested. */
class FakePeripheral extends Emitter {
    readonly id = "aabbccddeeff";
    readonly address = "aa:bb:cc:dd:ee:ff";
    readonly rssi = -50;
    readonly connectable = true;
    state = "disconnected";

    /** noble reports null until the ATT_MTU exchange completes. */
    mtu: number | null = null;

    /** Runs once the client starts waiting for the ATT_MTU exchange. */
    onMtuWait?: () => void;

    readonly handshakeSegmentSizes = new Array<number>();
    readonly advertisement;
    readonly #service;

    constructor(device: MockBleDevice) {
        super();
        this.advertisement = {
            localName: device.name,
            serviceData: [{ uuid: "fff6", data: Buffer.from(device.advertisementServiceData) }],
            serviceUuids: ["fff6"],
        };

        const c2 = new FakeCharacteristic("18ee2ef5263d4559959f4f9c429f9d12", ["indicate"]);
        const c1 = new FakeCharacteristic("18ee2ef5263d4559959f4f9c429f9d11", ["write"], data => {
            if (data[0] === 0x65 && data[1] === 0x6c) {
                this.handshakeSegmentSizes.push(BtpCodec.decodeBtpHandshakeRequest(data).attMtu);
                queueMicrotask(() => c2.emit("data", Buffer.from(device.generateBtpHandshakeResponse()), true));
            }
        });
        this.#service = {
            uuid: "fff6",
            characteristics: [c1, c2],
            discoverCharacteristicsAsync: async () => [c1, c2],
        };
    }

    override on(event: string, listener: Listener) {
        if (event === "mtu") {
            this.onMtuWait?.();
        }
        return super.on(event, listener);
    }

    async connectAsync() {
        this.state = "connected";
    }

    async disconnectAsync() {
        this.state = "disconnected";
        this.emit("disconnect");
    }

    dropConnection() {
        this.state = "disconnected";
        this.emit("disconnect");
    }

    async discoverServicesAsync(_uuids?: string[]) {
        return [this.#service];
    }
}

class FakeNoble extends Emitter {
    constructor(private readonly peripheral: FakePeripheral) {
        super();
    }

    async waitForPoweredOnAsync() {}

    async startScanningAsync() {
        queueMicrotask(() => this.emit("discover", this.peripheral));
    }

    async stopScanningAsync() {}

    stop() {}
}

/** Hands the noble client one end of an in-memory socket pair instead of dialing a URL. */
class PairedWebSocketClient extends WebSocketClient {
    constructor(private readonly connection: HttpEndpoint.WsConnection) {
        super();
    }

    override async connect(_url: string) {
        return this.connection;
    }
}

describe("NobleBleProxyClient", function () {
    this.timeout(10_000);

    let NobleBleProxyClient: NobleBleProxyClientClass;

    before(async function () {
        if (typeof window !== "undefined") {
            this.skip();
        }
        NobleBleProxyClient = await loadNobleBleProxyClient();
    });

    afterEach(() => MockTime.disable());

    /** Discover the peripheral through the noble client in real time, then open its channel under MockTime. */
    async function startOpeningChannelVia(peripheral: FakePeripheral, device: MockBleDevice) {
        const handler = new BleProxyHandler();
        const pair = MockWsConnection();
        handler.accept(pair.server);

        const environment = new Environment("noble-client-test");
        environment.set(WebSocketClient, new PairedWebSocketClient(pair.client));
        const client = new NobleBleProxyClient({
            serverUrl: "ws://hub/ble",
            noble: new FakeNoble(peripheral) as unknown as Noble,
            environment,
        });
        await client.connect();

        const proxyBle = new ProxyBle(handler);
        await proxyBle.scanner.findCommissionableDevicesContinuously(
            { longDiscriminator: device.discriminator },
            () => {},
            DISCOVERY_TIMEOUT,
        );
        const central = proxyBle.centralInterface;
        central.onData(() => {});

        MockTime.enable();
        const opening = MockTime.resolve(central.openChannel({ type: "ble", peripheralAddress: peripheral.address }), {
            stepMs: 100,
        });

        return {
            opening,
            async close() {
                await (await opening.catch(() => undefined))?.close();
                await client.close();
                await handler.close();
            },
        };
    }

    it("reports an ATT_MTU that the exchange delivers after the interview", async () => {
        const device = new MockBleDevice({ discriminator: 2001, vendorId: 0xfff1, productId: 0x8000 });
        const peripheral = new FakePeripheral(device);
        peripheral.onMtuWait = () =>
            Time.getTimer("late ATT_MTU exchange", Millis(500), () =>
                peripheral.emit("mtu", MatterBle.MAXIMUM_ATT_MTU),
            ).start();

        const { opening, close } = await startOpeningChannelVia(peripheral, device);
        await opening;

        expect(peripheral.handshakeSegmentSizes).deep.equal([MatterBle.MAXIMUM_BTP_MTU]);
        expect(peripheral.listenerCount("mtu")).equal(0);

        await close();
    });

    it("falls back to the minimum segment size when the ATT_MTU exchange never completes", async () => {
        const device = new MockBleDevice({ discriminator: 2002, vendorId: 0xfff1, productId: 0x8000 });
        const peripheral = new FakePeripheral(device);

        const { opening, close } = await startOpeningChannelVia(peripheral, device);
        await opening;

        expect(peripheral.handshakeSegmentSizes).deep.equal([MatterBle.MINIMUM_ATT_MTU]);
        expect(peripheral.listenerCount("mtu")).equal(0);
        expect(MockTime.timerCountFor("BLE proxy ATT_MTU exchange")).equal(0);

        await close();
    });

    it("reports an ATT_MTU that is already known without waiting", async () => {
        const device = new MockBleDevice({ discriminator: 2003, vendorId: 0xfff1, productId: 0x8000 });
        const peripheral = new FakePeripheral(device);
        peripheral.mtu = 100;

        const { opening, close } = await startOpeningChannelVia(peripheral, device);
        await opening;

        expect(peripheral.handshakeSegmentSizes).deep.equal([MatterBle.btpSegmentSizeFromAttMtu(100)]);
        expect(peripheral.listenerCount("mtu")).equal(0);

        await close();
    });

    it("stops waiting for the ATT_MTU exchange when the peripheral disconnects", async () => {
        const device = new MockBleDevice({ discriminator: 2004, vendorId: 0xfff1, productId: 0x8000 });
        const peripheral = new FakePeripheral(device);
        let waitStartedAt: number | undefined;
        peripheral.onMtuWait = () => {
            waitStartedAt = Time.nowMs;
            Time.getTimer("disconnect during ATT_MTU exchange", Millis(100), () => peripheral.dropConnection()).start();
        };

        const { opening, close } = await startOpeningChannelVia(peripheral, device);
        // The connect itself fails rather than a later step on a handle that is already gone
        await expect(opening).rejectedWith(/peripheral disconnected/);

        expect(peripheral.listenerCount("mtu")).equal(0);
        expect(MockTime.timerCountFor("BLE proxy ATT_MTU exchange")).equal(0);
        // The open fails on the lost connection, not after the full ATT_MTU wait
        expect(Time.nowMs - (waitStartedAt ?? 0)).lessThan(1000);

        await close();
    });
});
