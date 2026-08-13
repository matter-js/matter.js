/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { asError, Bytes, MatterError, ServerAddress } from "@matter/general";
import { BtpCodec, MatterBle } from "@matter/protocol";
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
    readonly mtu = null;
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
        this.#disconnected?.();
    }

    /** Resolves once `disconnectAsync()` completes. Register before the disconnect can happen. */
    whenDisconnected() {
        return new Promise<void>(resolve => (this.#disconnected = resolve));
    }

    cancelConnect() {}

    async discoverServicesAsync(_serviceUuids?: string[]) {
        this.serviceDiscoveries++;
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
