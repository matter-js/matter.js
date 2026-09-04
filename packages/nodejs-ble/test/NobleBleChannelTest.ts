/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { asError, Bytes, MatterError, ServerAddress } from "@matter/general";
import { BleDisconnectedError, BtpCodec, MatterBle } from "@matter/protocol";
import type { Peripheral, PeripheralState, Service } from "@stoprocent/noble";
import { EventEmitter } from "node:events";
import type { BleScanner } from "../src/BleScanner.js";
import { NobleBleCentralInterface } from "../src/NobleBleChannel.js";

const PERIPHERAL_ADDRESS = "c5:c3:4e:78:3c:6e";
const ADDRESS = ServerAddress({ type: "ble", peripheralAddress: PERIPHERAL_ADDRESS });

/** The BlueZ failure reason behind a rejected `Device.Connect()`. */
const CONNECT_ERROR = "le-connection-abort-by-local";

/**
 * Peripheral stand-in that reports the outcome of each connect attempt through noble's `connect` event.
 *
 * State transitions mirror noble's `Noble._onConnect`, which moves a peripheral to "error" before emitting a failed
 * `connect` and never follows such a failure with a `disconnect`.
 *
 * `onAttempt` runs in a microtask unless `reportsSynchronously` is set, matching noble's hci binding, which reports
 * some failures from inside `connect()` itself.
 */
class FakePeripheral extends EventEmitter {
    readonly address = PERIPHERAL_ADDRESS;

    /** noble reports null until the ATT_MTU exchange completes; tests covering that path set it back to null. */
    mtu: number | null = MatterBle.MAXIMUM_ATT_MTU;
    state: PeripheralState = "disconnected";
    connectAttempts = 0;
    serviceDiscoveries = 0;
    discoveryFailures = 0;

    reportsSynchronously = false;

    /** Services `discoverServicesAsync()` reports. Empty means the peripheral carries no Matter service. */
    services = new Array<Service>();

    /** Set to leave `disconnectAsync()` pending forever, as noble does when the disconnect event never arrives. */
    disconnectHangs = false;

    readonly #attemptWaiters = new Map<number, () => void>();
    #disconnected?: () => void;
    #discoveryStarted?: () => void;

    constructor(private readonly onAttempt: (peripheral: FakePeripheral, attempt: number) => void) {
        super();
    }

    async connectAsync() {
        const attempt = ++this.connectAttempts;
        this.state = "connecting";
        this.#attemptWaiters.get(attempt)?.();

        // noble resolves or rejects this from the same `connect` event it emits on the peripheral, so a failure
        // reaches the transport twice
        const settled = new Promise<void>((resolve, reject) => {
            this.once("connect", error => (error === undefined ? resolve() : reject(asError(error))));
        });
        if (this.reportsSynchronously) {
            this.onAttempt(this, attempt);
        } else {
            queueMicrotask(() => this.onAttempt(this, attempt));
        }
        await settled;
    }

    async disconnectAsync() {
        if (this.disconnectHangs) {
            this.state = "disconnecting";
            return new Promise<void>(() => {});
        }
        this.state = "disconnected";
        this.emit("disconnect", undefined);
        this.#disconnected?.();
    }

    /** Resolves once `disconnectAsync()` completes. Register before the disconnect can happen. */
    whenDisconnected() {
        return new Promise<void>(resolve => (this.#disconnected = resolve));
    }

    cancelConnects = 0;

    cancelConnect() {
        this.cancelConnects++;
        this.state = "disconnected";
    }

    /** Set to leave `discoverServicesAsync()` pending, holding the attempt inside the interview. */
    discoveryHangs = false;

    async discoverServicesAsync(_serviceUuids?: string[]) {
        this.serviceDiscoveries++;
        this.#discoveryStarted?.();
        if (this.discoveryHangs) {
            return new Promise<Service[]>(() => {});
        }
        if (this.discoveryFailures > 0) {
            this.discoveryFailures--;
            this.state = "disconnected";
            throw new Error("Service discovery failed");
        }
        return this.services;
    }

    failConnect(error: unknown = CONNECT_ERROR) {
        this.state = "error";
        this.emit("connect", error);
    }

    completeConnect() {
        this.state = "connected";
        this.emit("connect", undefined);
    }

    dropConnection(reason: unknown) {
        this.state = "disconnected";
        this.emit("disconnect", reason);
    }

    /** Resolves once `discoverServicesAsync()` has run. */
    whenDiscoveryStarts() {
        return new Promise<void>(resolve => (this.#discoveryStarted = resolve));
    }

    /** Resolves once `connectAsync()` has run for the given attempt. Register before the attempt can start. */
    whenAttemptStarts(attempt: number) {
        return new Promise<void>(resolve => {
            if (this.connectAttempts >= attempt) {
                resolve();
            } else {
                this.#attemptWaiters.set(attempt, resolve);
            }
        });
    }

    get asNoble() {
        return this as unknown as Peripheral;
    }
}

function matterService(characteristics: { c1: unknown; c2: unknown }) {
    return {
        uuid: MatterBle.SERVICE_UUID_SHORT,
        async discoverCharacteristicsAsync() {
            return [characteristics.c1, characteristics.c2];
        },
    } as unknown as Service;
}

const nobleUuid = (uuid: string) => uuid.replace(/-/g, "");

/** Matter service whose C1 write fails, so `NobleBleChannel.create()` throws after the interview succeeded. */
function unwritableMatterService() {
    const characteristic = (uuid: string) => ({
        uuid: nobleUuid(uuid),
        properties: [],
        async writeAsync() {
            throw new Error("Write failed");
        },
        on() {},
        removeListener() {},
        async subscribeAsync() {},
        async unsubscribeAsync() {},
    });

    return matterService({
        c1: characteristic(MatterBle.C1_CHARACTERISTIC_UUID),
        c2: characteristic(MatterBle.C2_CHARACTERISTIC_UUID),
    });
}

/**
 * Matter service that completes the BTP handshake, so `NobleBleChannel.create()` returns a live channel.
 *
 * `onSubscribe` runs once the transport is committed to the channel but before the handshake completes.
 */
function respondingMatterService(onSubscribe?: () => void) {
    const c2 = new EventEmitter();
    const handshakeResponse = Buffer.from(
        Bytes.of(BtpCodec.encodeBtpHandshakeResponse({ version: 4, attMtu: 23, windowSize: 4 })),
    );

    return matterService({
        c1: {
            uuid: nobleUuid(MatterBle.C1_CHARACTERISTIC_UUID),
            properties: [],
            async writeAsync() {},
        },
        c2: Object.assign(c2, {
            uuid: nobleUuid(MatterBle.C2_CHARACTERISTIC_UUID),
            properties: [],
            async subscribeAsync() {
                onSubscribe?.();
                queueMicrotask(() => c2.emit("data", handshakeResponse, true));
            },
            async unsubscribeAsync() {},
        }),
    });
}

/**
 * Matter service that completes every handshake with the segment size it was offered but never answers a data packet,
 * which is how a peripheral behaves whose link layer cannot carry a segment spread over several link-layer packets.
 */
function handshakeOnlyMatterService(onUnsubscribe?: () => void) {
    const c2 = new EventEmitter();
    const handshakeSegmentSizes = new Array<number>();
    const dataWrites = new Array<Uint8Array>();
    const dataWaiters = new Map<number, () => void>();
    const handshakeWaiters = new Map<number, () => void>();
    let unsubscribes = 0;
    const state = { failUnsubscribe: false, withholdAfter: Infinity, onWithheld: () => {} };

    const service = matterService({
        c1: {
            uuid: nobleUuid(MatterBle.C1_CHARACTERISTIC_UUID),
            properties: [],
            async writeAsync(data: Buffer) {
                const written = new Uint8Array(data);
                if (BtpCodec.isHandshakeResponse(written) || written.length === 9) {
                    handshakeSegmentSizes.push(BtpCodec.decodeBtpHandshakeRequest(written).attMtu);
                    handshakeWaiters.get(handshakeSegmentSizes.length)?.();
                } else {
                    dataWrites.push(written);
                    dataWaiters.get(dataWrites.length)?.();
                }
            },
        },
        c2: Object.assign(c2, {
            uuid: nobleUuid(MatterBle.C2_CHARACTERISTIC_UUID),
            properties: [],
            async subscribeAsync() {
                if (handshakeSegmentSizes.length > state.withholdAfter) {
                    queueMicrotask(() => state.onWithheld());
                    return;
                }
                const attMtu = handshakeSegmentSizes[handshakeSegmentSizes.length - 1];
                const response = Buffer.from(
                    Bytes.of(BtpCodec.encodeBtpHandshakeResponse({ version: 4, attMtu, windowSize: 4 })),
                );
                queueMicrotask(() => c2.emit("data", response, true));
            },
            async unsubscribeAsync() {
                unsubscribes++;
                onUnsubscribe?.();
                if (state.failUnsubscribe) {
                    throw new Error("Unsubscribe failed");
                }
            },
        }),
    });

    return {
        service,
        handshakeSegmentSizes,
        dataWrites,
        set failUnsubscribe(fail: boolean) {
            state.failUnsubscribe = fail;
        },
        /** Leave every handshake past the given count unanswered, so the client waits out its handshake timer. */
        withholdHandshakeResponseAfter(count: number, onWithheld: () => void) {
            state.withholdAfter = count;
            state.onWithheld = onWithheld;
        },
        /** Resolves once the given number of handshake requests have been written. */
        whenHandshake(count: number) {
            return new Promise<void>(resolve => {
                if (handshakeSegmentSizes.length >= count) {
                    resolve();
                } else {
                    handshakeWaiters.set(count, resolve);
                }
            });
        },
        get unsubscribes() {
            return unsubscribes;
        },
        /** Resolves once the given number of BTP data packets have been written. */
        whenDataWrite(count: number) {
            return new Promise<void>(resolve => {
                if (dataWrites.length >= count) {
                    resolve();
                } else {
                    dataWaiters.set(count, resolve);
                }
            });
        },
    };
}

/** Wraps a signal so a test can observe the listeners a channel attempt registers on it. */
function observedSignal(controller: AbortController) {
    const listeners = new Set<unknown>();
    const signal = new Proxy(controller.signal, {
        get(target, property) {
            if (property === "addEventListener" || property === "removeEventListener") {
                return (...args: Parameters<AbortSignal["addEventListener"]>) => {
                    const [, listener] = args;
                    if (property === "addEventListener") {
                        listeners.add(listener);
                    } else {
                        listeners.delete(listener);
                    }
                    return target[property](...args);
                };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    return { signal, listeners };
}

function centralInterfaceFor(peripheral: FakePeripheral) {
    const scanner = {
        getDiscoveredDevice: () => ({ peripheral: peripheral.asNoble, hasAdditionalAdvertisementData: false }),
    } as unknown as BleScanner;

    const central = new NobleBleCentralInterface(scanner);
    central.onData(() => {});
    return central;
}

describe("NobleBleCentralInterface", () => {
    describe("openChannel", () => {
        it("retries a connect reported as failed and gives up after three attempts", async () => {
            const peripheral = new FakePeripheral(p => p.failConnect());
            const central = centralInterfaceFor(peripheral);

            await expect(central.openChannel(ADDRESS)).rejectedWith(
                `Failed to connect to peripheral ${PERIPHERAL_ADDRESS}`,
            );

            expect(peripheral.connectAttempts).equals(3);
            await central.close();
        });

        it("reports the last connect error as cause", async () => {
            const peripheral = new FakePeripheral(p => p.failConnect());
            const central = centralInterfaceFor(peripheral);

            const error = await central.openChannel(ADDRESS).then(
                () => undefined,
                (error: unknown) => (error instanceof MatterError ? error : undefined),
            );

            const cause = error?.cause;
            expect(error?.message).equals(`Failed to connect to peripheral ${PERIPHERAL_ADDRESS}`);
            expect(cause instanceof Error ? cause.message : undefined).equals(CONNECT_ERROR);
            await central.close();
        });

        it("retries a connect error reported as an Error instance", async () => {
            const peripheral = new FakePeripheral(p => p.failConnect(new Error(CONNECT_ERROR)));
            const central = centralInterfaceFor(peripheral);

            await expect(central.openChannel(ADDRESS)).rejectedWith(
                `Failed to connect to peripheral ${PERIPHERAL_ADDRESS}`,
            );

            expect(peripheral.connectAttempts).equals(3);
            await central.close();
        });

        it("connects a peripheral a previous call left in the failed state", async () => {
            let failing = true;
            const peripheral = new FakePeripheral(p => (failing ? p.failConnect() : p.completeConnect()));
            const central = centralInterfaceFor(peripheral);

            await expect(central.openChannel(ADDRESS)).rejectedWith(
                `Failed to connect to peripheral ${PERIPHERAL_ADDRESS}`,
            );
            expect(peripheral.state).equals("error");

            failing = false;
            await expect(central.openChannel(ADDRESS)).rejectedWith(
                `Peripheral ${PERIPHERAL_ADDRESS} does not have the required Matter characteristics`,
            );

            expect(peripheral.connectAttempts).equals(4);
            await central.close();
        });

        it("bounds the attempts when the connect error is reported from within connectAsync", async () => {
            const peripheral = new FakePeripheral(p => p.failConnect(new Error("adapter state is poweredOff")));
            peripheral.reportsSynchronously = true;
            const central = centralInterfaceFor(peripheral);

            await expect(central.openChannel(ADDRESS)).rejectedWith(
                `Failed to connect to peripheral ${PERIPHERAL_ADDRESS}`,
            );

            expect(peripheral.connectAttempts).equals(3);
            await central.close();
        });

        it("continues with the connected peripheral once a retried connect succeeds", async () => {
            const peripheral = new FakePeripheral((p, attempt) =>
                attempt < 3 ? p.failConnect() : p.completeConnect(),
            );
            const central = centralInterfaceFor(peripheral);

            await expect(central.openChannel(ADDRESS)).rejectedWith(
                `Peripheral ${PERIPHERAL_ADDRESS} does not have the required Matter characteristics`,
            );

            expect(peripheral.connectAttempts).equals(3);
            expect(peripheral.serviceDiscoveries).equals(1);
            await central.close();
        });

        it("retries a link that drops while connecting and reports the disconnect reason as cause", async () => {
            const peripheral = new FakePeripheral(p => p.dropConnection("connection-abort-peer"));
            const central = centralInterfaceFor(peripheral);

            const error = await central.openChannel(ADDRESS).then(
                () => undefined,
                (error: unknown) => (error instanceof MatterError ? error : undefined),
            );

            const cause = error?.cause;
            expect(error?.message).equals(`Failed to connect to peripheral ${PERIPHERAL_ADDRESS}`);
            expect(cause instanceof Error ? cause.message : undefined).equals(
                `Peripheral ${PERIPHERAL_ADDRESS} disconnected (reason connection-abort-peer)`,
            );
            expect(peripheral.connectAttempts).equals(3);
            await central.close();
        });

        it("keeps the peripheral reserved while a retry started from the interview runs", async () => {
            const peripheral = new FakePeripheral((p, attempt) => {
                if (attempt === 1) {
                    p.completeConnect();
                }
            });
            peripheral.discoveryFailures = 1;
            const central = centralInterfaceFor(peripheral);

            const secondAttempt = peripheral.whenAttemptStarts(2);
            const opening = central.openChannel(ADDRESS).then(
                () => "resolved",
                (error: unknown) => (error instanceof Error ? error.message : `${error}`),
            );
            await secondAttempt;

            await expect(central.openChannel(ADDRESS)).rejectedWith(
                `Connection to peripheral ${PERIPHERAL_ADDRESS} is already in progress.`,
            );

            peripheral.completeConnect();
            expect(await opening).equals(
                `Peripheral ${PERIPHERAL_ADDRESS} does not have the required Matter characteristics`,
            );
            expect(peripheral.connectAttempts).equals(2);
            await central.close();
        });

        it("rejects without connecting when the abort signal is already set", async () => {
            const peripheral = new FakePeripheral(p => p.completeConnect());
            const central = centralInterfaceFor(peripheral);

            await expect(central.openChannel(ADDRESS, { abort: AbortSignal.abort() })).rejectedWith(
                `Connection to peripheral ${PERIPHERAL_ADDRESS} was aborted`,
            );

            expect(peripheral.connectAttempts).equals(0);
            await central.close();
        });

        it("stops retrying when the abort signal fires between attempts", async () => {
            const aborter = new AbortController();
            const peripheral = new FakePeripheral((p, attempt) => {
                if (attempt === 2) {
                    aborter.abort();
                }
                p.failConnect();
            });
            const central = centralInterfaceFor(peripheral);

            await expect(central.openChannel(ADDRESS, { abort: aborter.signal })).rejectedWith(
                `Connection to peripheral ${PERIPHERAL_ADDRESS} was aborted`,
            );

            expect(peripheral.connectAttempts).equals(2);

            // The aborted attempt must release the peripheral rather than leave it reserved
            await expect(central.openChannel(ADDRESS)).rejectedWith(
                `Failed to connect to peripheral ${PERIPHERAL_ADDRESS}`,
            );

            await central.close();
        });

        it("leaves no abort listener behind once the attempts end", async () => {
            const { signal, listeners } = observedSignal(new AbortController());
            const peripheral = new FakePeripheral(p => p.failConnect());
            const central = centralInterfaceFor(peripheral);

            await expect(central.openChannel(ADDRESS, { abort: signal })).rejectedWith(
                `Failed to connect to peripheral ${PERIPHERAL_ADDRESS}`,
            );

            expect(peripheral.connectAttempts).equals(3);
            expect(listeners.size).equals(0);
            await central.close();
        });

        it("disconnects the peripheral when the abort lands during the interview", async () => {
            const aborter = new AbortController();
            const peripheral = new FakePeripheral(p => p.completeConnect());
            peripheral.discoveryHangs = true;
            const central = centralInterfaceFor(peripheral);

            const disconnected = peripheral.whenDisconnected();
            const opening = central.openChannel(ADDRESS, { abort: aborter.signal });
            await peripheral.whenDiscoveryStarts();

            aborter.abort();
            await expect(opening).rejectedWith(`Connection to peripheral ${PERIPHERAL_ADDRESS} was aborted`);

            // The interview never reached #openChannels, so nothing else would ever release this link
            await disconnected;
            expect(peripheral.state).equals("disconnected");
            await central.close();
        });

        it("cancels a pending connect when the abort lands before the peripheral answers", async () => {
            const aborter = new AbortController();
            const peripheral = new FakePeripheral(() => {});
            const central = centralInterfaceFor(peripheral);

            const opening = central.openChannel(ADDRESS, { abort: aborter.signal });
            await peripheral.whenAttemptStarts(1);

            aborter.abort();
            await expect(opening).rejectedWith(`Connection to peripheral ${PERIPHERAL_ADDRESS} was aborted`);

            expect(peripheral.cancelConnects).equals(1);
            await central.close();
        });

        it("rejects rather than throws when a disconnect-driven retry races the interface closing", async () => {
            const peripheral = new FakePeripheral(() => {});
            const central = centralInterfaceFor(peripheral);

            const opening = central.openChannel(ADDRESS).then(
                () => "resolved",
                (error: unknown) => (error instanceof Error ? error.message : `${error}`),
            );
            await peripheral.whenAttemptStarts(1);
            await central.close();

            // noble delivers this from its own emit, so the retry must not throw back into it
            peripheral.dropConnection(undefined);

            expect(await opening).equals("Network interface is closed");
        });

        it("closes a channel that completes after the caller aborted", async () => {
            const aborter = new AbortController();
            const peripheral = new FakePeripheral(p => p.completeConnect());
            peripheral.services = [respondingMatterService(() => aborter.abort())];
            const central = centralInterfaceFor(peripheral);

            const disconnected = peripheral.whenDisconnected();
            await expect(central.openChannel(ADDRESS, { abort: aborter.signal })).rejectedWith(
                `Connection to peripheral ${PERIPHERAL_ADDRESS} was aborted`,
            );

            // A channel nobody received must not stay connected
            await disconnected;
            expect(peripheral.state).equals("disconnected");
            await central.close();
        });

        it("derives the segment size from an ATT_MTU that arrives after the interview", async () => {
            MockTime.init();
            const peripheral = new FakePeripheral(p => p.completeConnect());
            peripheral.mtu = null;
            // The exchange lands only once someone waits for it
            peripheral.on("newListener", event => {
                if (event === "mtu") {
                    queueMicrotask(() => peripheral.emit("mtu", MatterBle.MAXIMUM_ATT_MTU));
                }
            });
            const peer = handshakeOnlyMatterService();
            peripheral.services = [peer.service];
            const central = centralInterfaceFor(peripheral);

            const channel = await MockTime.resolve(central.openChannel(ADDRESS), { stepMs: 100 });

            expect(peer.handshakeSegmentSizes).deep.equal([MatterBle.MAXIMUM_BTP_MTU]);

            await channel.close();
            await central.close();
        });

        it("falls back to the minimum segment size when the ATT_MTU exchange never completes", async () => {
            MockTime.init();
            const peripheral = new FakePeripheral(p => p.completeConnect());
            peripheral.mtu = null;
            const peer = handshakeOnlyMatterService();
            peripheral.services = [peer.service];
            const central = centralInterfaceFor(peripheral);

            const channel = await MockTime.resolve(central.openChannel(ADDRESS), { stepMs: 500 });

            expect(peer.handshakeSegmentSizes).deep.equal([MatterBle.MINIMUM_ATT_MTU]);

            await channel.close();
            await central.close();
        });

        it("renegotiates the BTP session with the minimum segment size when the peer answers no data packet", async () => {
            MockTime.init();
            const peripheral = new FakePeripheral(p => p.completeConnect());
            peripheral.mtu = MatterBle.MAXIMUM_ATT_MTU;
            const peer = handshakeOnlyMatterService();
            peripheral.services = [peer.service];
            const central = centralInterfaceFor(peripheral);

            const channel = await central.openChannel(ADDRESS);
            expect(peer.handshakeSegmentSizes).deep.equal([MatterBle.MAXIMUM_BTP_MTU]);

            // One segment at 244 bytes, three at 20, so the replay only reassembles if the size actually dropped
            const message = Bytes.fromHex("a1".repeat(50));
            await channel.send(message);
            expect(peer.dataWrites.length).equal(1);

            await MockTime.resolve(peer.whenDataWrite(4), { stepMs: 1000 });

            expect(peer.handshakeSegmentSizes).deep.equal([MatterBle.MAXIMUM_BTP_MTU, MatterBle.MINIMUM_ATT_MTU]);
            expect(peer.unsubscribes).equal(1);
            expect(peripheral.state).equals("connected");

            const replay = peer.dataWrites.slice(1);
            expect(replay.length).equal(3);
            let reassembled: Bytes = new Uint8Array(0);
            for (const packet of replay) {
                expect(packet.byteLength).most(MatterBle.MINIMUM_ATT_MTU);
                reassembled = Bytes.concat(reassembled, BtpCodec.decodeBtpPacket(packet).payload.segmentPayload);
            }
            expect(reassembled).deep.equal(message);

            await channel.close();
            await central.close();
        });

        it("closes the channel when the renegotiation cannot close the peer's BTP session", async () => {
            MockTime.init();
            const peripheral = new FakePeripheral(p => p.completeConnect());
            peripheral.mtu = MatterBle.MAXIMUM_ATT_MTU;
            const peer = handshakeOnlyMatterService();
            peer.failUnsubscribe = true;
            peripheral.services = [peer.service];
            const central = centralInterfaceFor(peripheral);

            const channel = await central.openChannel(ADDRESS);
            const disconnected = peripheral.whenDisconnected();
            await channel.send(Bytes.fromHex("00112233445566778899"));

            await MockTime.resolve(disconnected, { stepMs: 1000 });

            expect(peer.handshakeSegmentSizes).deep.equal([MatterBle.MAXIMUM_BTP_MTU]);
            expect(peer.dataWrites.length).equal(1);

            await central.close();
        });

        it("closes the channel when the renegotiated session is not answered either", async () => {
            MockTime.init();
            const peripheral = new FakePeripheral(p => p.completeConnect());
            const peer = handshakeOnlyMatterService();
            peripheral.services = [peer.service];
            const central = centralInterfaceFor(peripheral);

            const channel = await central.openChannel(ADDRESS);
            const disconnected = peripheral.whenDisconnected();
            await channel.send(Bytes.fromHex("00112233445566778899"));

            await MockTime.resolve(disconnected, { stepMs: 1000 });

            // One renegotiation, then the peer is given up on rather than retried forever
            expect(peer.handshakeSegmentSizes).deep.equal([MatterBle.MAXIMUM_BTP_MTU, MatterBle.MINIMUM_ATT_MTU]);

            await central.close();
        });

        it("reports channel loss to a send parked on a renegotiation that fails", async () => {
            MockTime.init();
            const peripheral = new FakePeripheral(p => p.completeConnect());

            let parked: Promise<unknown> | undefined;
            const peer = handshakeOnlyMatterService(() => {
                parked ??= channel.send(Bytes.fromHex("aabb")).then(
                    () => undefined,
                    (error: unknown) => error,
                );
            });
            peer.failUnsubscribe = true;
            peripheral.services = [peer.service];
            const central = centralInterfaceFor(peripheral);

            const channel = await central.openChannel(ADDRESS);
            const disconnected = peripheral.whenDisconnected();
            await channel.send(Bytes.fromHex("00112233445566778899"));

            const failure = await MockTime.resolve(
                disconnected.then(() => parked),
                { stepMs: 1000 },
            );

            // BtpFlowError from the suspended session would not read as channel loss downstream
            expect(failure).instanceOf(BleDisconnectedError);

            await central.close();
        });

        it("abandons a renegotiation when the channel is closed while it waits for the handshake", async () => {
            MockTime.init();
            const peripheral = new FakePeripheral(p => p.completeConnect());

            let closing: Promise<void> | undefined;
            const peer = handshakeOnlyMatterService();
            // The renegotiation parks here: the peer never answers the second handshake
            peer.withholdHandshakeResponseAfter(1, () => {
                closing ??= channel.close();
            });
            peripheral.services = [peer.service];
            const central = centralInterfaceFor(peripheral);

            const channel = await central.openChannel(ADDRESS);
            await channel.send(Bytes.fromHex("00112233445566778899"));

            await MockTime.resolve(
                MockTime.resolve(peer.whenHandshake(2), { stepMs: 1000 }).then(() => closing),
                { stepMs: 1000 },
            );

            // Without the abort the handshake timer would still be armed for its full BTP_CONN_RSP_TIMEOUT
            expect(MockTime.timerCountFor("BLE handshake timeout")).equal(0);

            await central.close();
        });

        it("abandons a renegotiation when the peripheral disconnects while it waits for the handshake", async () => {
            MockTime.init();
            const peripheral = new FakePeripheral(p => p.completeConnect());

            let parked: Promise<unknown> | undefined;
            const peer = handshakeOnlyMatterService();
            peer.withholdHandshakeResponseAfter(1, () => {
                parked ??= channel.send(Bytes.fromHex("aabb")).then(
                    () => undefined,
                    (error: unknown) => error,
                );
                peripheral.dropConnection(undefined);
            });
            peripheral.services = [peer.service];
            const central = centralInterfaceFor(peripheral);

            const channel = await central.openChannel(ADDRESS);
            await channel.send(Bytes.fromHex("00112233445566778899"));

            await MockTime.resolve(peer.whenHandshake(2), { stepMs: 1000 });

            // No further time passes: the disconnect must settle this, not the handshake's own timeout
            await MockTime.yield3();
            expect(MockTime.timerCountFor("BLE handshake timeout")).equal(0);
            expect(await parked).instanceOf(BleDisconnectedError);

            await central.close();
        });

        it("holds a send issued while the BTP session is being renegotiated", async () => {
            MockTime.init();
            const peripheral = new FakePeripheral(p => p.completeConnect());
            peripheral.mtu = MatterBle.MAXIMUM_ATT_MTU;

            let sendDuringRenegotiation: Promise<void> | undefined;
            const during = Bytes.fromHex("aabbccdd");
            const peer = handshakeOnlyMatterService(() => {
                sendDuringRenegotiation ??= channel.send(during);
            });
            peripheral.services = [peer.service];
            const central = centralInterfaceFor(peripheral);

            const channel = await central.openChannel(ADDRESS);
            await channel.send(Bytes.fromHex("00112233445566778899"));

            await MockTime.resolve(peer.whenDataWrite(3), { stepMs: 1000 });
            await sendDuringRenegotiation;

            // The replay goes out first, then the message queued while the session was gone
            expect(Bytes.toHex(peer.dataWrites[2]).endsWith(Bytes.toHex(during))).equal(true);

            await channel.close();
            await central.close();
        });

        it("bounds a disconnect that never completes after a failed channel setup", async () => {
            MockTime.init();
            const peripheral = new FakePeripheral(p => p.completeConnect());
            peripheral.services = [unwritableMatterService()];
            peripheral.disconnectHangs = true;
            const central = centralInterfaceFor(peripheral);

            const opening = central.openChannel(ADDRESS).then(
                () => "resolved",
                (error: unknown) => (error instanceof Error ? error.message : `${error}`),
            );

            expect(await MockTime.resolve(opening, { stepMs: 1000 })).equals(
                `Timeout while disconnecting to peripheral ${PERIPHERAL_ADDRESS}`,
            );
            await central.close();
        });
    });
});
