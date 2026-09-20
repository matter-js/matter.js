/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BlePeripheral, BleScanner, BleScannerClient } from "#common/BleScanner.js";
import { Bytes, createPromise, Duration, Instant, Millis, Seconds, Time, Timestamp } from "@matter/general";

const SERVICE_DATA_A = Bytes.fromHex("00c9067c11018000"); // D=1737, VP=4476+32769
const SERVICE_DATA_B = Bytes.fromHex("00e8037c11018000"); // D=1000, VP=4476+32769

class MockBleScannerClient implements BleScannerClient {
    callback?: (peripheral: BlePeripheral, data: Bytes) => void;
    setDiscoveryCallback(callback: (peripheral: BlePeripheral, data: Bytes) => void) {
        this.callback = callback;
    }
    startScanningError?: Error;
    stopScanningError?: Error;

    #listeningSince?: Timestamp;
    #listenedTime = Instant;

    get listeningTime(): Duration | undefined {
        if (this.#listeningSince === undefined) {
            return this.#listenedTime;
        }
        return Millis(this.#listenedTime + Timestamp.delta(this.#listeningSince, Time.nowUs));
    }

    /** Each call the scanner made, so a test can see whether transitions overlapped. */
    readonly scanCalls = new Array<"start" | "stop">();

    #startGate?: Promise<void>;
    #openStartGate?: () => void;
    #stopGate?: Promise<void>;
    #openStopGate?: () => void;

    async startScanning() {
        this.scanCalls.push("start");
        await this.#startGate;
        if (this.startScanningError) throw this.startScanningError;
        this.startListening();
    }

    async stopScanning() {
        this.scanCalls.push("stop");
        await this.#stopGate;
        this.stopListening();
        if (this.stopScanningError) throw this.stopScanningError;
    }

    /** Leaves the next `startScanning()` in flight, as a client waiting for its radio does. */
    holdStart() {
        const { promise, resolver } = createPromise<void>();
        this.#startGate = promise;
        this.#openStartGate = resolver;
    }

    releaseStart() {
        this.#startGate = undefined;
        this.#openStartGate?.();
        this.#openStartGate = undefined;
    }

    /** Leaves the next `stopScanning()` in flight, as a client whose radio reports its state asynchronously does. */
    holdStop() {
        const { promise, resolver } = createPromise<void>();
        this.#stopGate = promise;
        this.#openStopGate = resolver;
    }

    releaseStop() {
        this.#stopGate = undefined;
        this.#openStopGate?.();
        this.#openStopGate = undefined;
    }

    get scanning() {
        return this.#listeningSince !== undefined;
    }

    /** The radio scans, which for a real client is an event it receives rather than the request we made. */
    startListening() {
        this.#listeningSince ??= Time.nowUs;
    }

    /** The radio stopped, as when the adapter powers off under a scan we still believe is running. */
    stopListening() {
        if (this.#listeningSince !== undefined) {
            this.#listenedTime = Millis(this.#listenedTime + Timestamp.delta(this.#listeningSince, Time.nowUs));
            this.#listeningSince = undefined;
        }
    }

    discover(address: string, data: Bytes) {
        this.callback!({ address }, data);
    }
}

/** A client of a transport that cannot tell how long it listened, such as one deduplicating advertisements. */
class MockOneShotBleScannerClient extends MockBleScannerClient {
    override get listeningTime() {
        return undefined;
    }
}

/** A client of a transport that can lose access to a peripheral, such as one routing through proxies. */
class MockProxyingBleScannerClient extends MockBleScannerClient {
    readonly unreachable = new Set<string>();

    isPeripheralReachable(address: string) {
        return !this.unreachable.has(address);
    }
}

/**
 * Lets a discovery reach its waiter: it starts scanning and evaluates the stored records before it
 * registers one, and an advertisement arriving while it is still starting up proves nothing.
 */
async function settleDiscovery() {
    for (let i = 0; i < 10; i++) {
        await MockTime.yield();
    }
}

/**
 * Scans the way a discovery does, because a record only ages while the scanner listens. Returns the stop function,
 * which ends the scan and the discovery it runs under.
 */
async function startScanning(scanner: BleScanner) {
    // An identifier no advertisement in this suite matches, so scanning is all this discovery contributes
    const discovery = scanner.findCommissionableDevicesContinuously({ productId: 1 }, () => {});
    await settleDiscovery();
    return async () => {
        await scanner.close();
        await discovery;
    };
}

describe("BleScanner", () => {
    before(() => MockTime.enable());

    describe("service-data-based deduplication and aging", () => {
        it("merges repeat advertisements from the same peripheral into a single entry", () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            const devices = scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 });
            expect(devices).to.have.lengthOf(1);
            expect(devices[0].deviceIdentifier).to.equal("aa:aa:aa:aa:aa:aa");
        });

        it("keeps both entries when matching service data arrives from a second address within the stale window", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);
            const stopScanning = await startScanning(scanner);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            await MockTime.advance(Seconds(10));
            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_A);
            await stopScanning();

            const devices = scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 });
            expect(devices).to.have.lengthOf(2);
            expect(devices[0].deviceIdentifier).to.equal("bb:bb:bb:bb:bb:bb");
            expect(devices[1].deviceIdentifier).to.equal("aa:aa:aa:aa:aa:aa");
        });

        it("replaces the existing entry when matching service data arrives after the stale window (address rotation)", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);
            const stopScanning = await startScanning(scanner);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            await MockTime.advance(Seconds(61));
            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_A);
            await stopScanning();

            const devices = scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 });
            expect(devices).to.have.lengthOf(1);
            expect(devices[0].deviceIdentifier).to.equal("bb:bb:bb:bb:bb:bb");
        });

        it("keeps stale entry alive when it is refreshed before the rotation window elapses", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);
            const stopScanning = await startScanning(scanner);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Seconds(55));
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            await MockTime.advance(Seconds(55));
            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_A);
            await stopScanning();

            const devices = scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 });
            expect(devices).to.have.lengthOf(2);
        });

        it("does not drop entries whose service data differs from the new advertisement", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            const stopScanning = await startScanning(scanner);
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Seconds(120));

            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_B);
            await stopScanning();

            expect(scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.exist;
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1000 })).to.have.lengthOf(1);
        });

        it("stops offering a peripheral that has not advertised for the stale window", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);
            const stopScanning = await startScanning(scanner);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            await MockTime.advance(Seconds(59));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(1);

            await MockTime.advance(Seconds(2));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(0);

            await stopScanning();
        });

        it("keeps offering a peripheral while the radio does not scan, though we asked it to", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            const stopScanning = await startScanning(scanner);
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            // The adapter powers off under the scan we still believe is running
            client.stopListening();
            await MockTime.advance(Seconds(3600));

            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(1);

            await stopScanning();
        });

        it("keeps offering a peripheral that has not advertised while nothing scans", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            const stopScanning = await startScanning(scanner);
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await stopScanning();

            await MockTime.advance(Seconds(3600));

            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(1);
        });

        it("offers a stale peripheral again once it advertises again", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);
            const stopScanning = await startScanning(scanner);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Seconds(61));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(0);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(1);

            await stopScanning();
        });

        it("does not hand a discovery a peripheral that stopped advertising while an earlier scan ran", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            const stopEarlierScan = await startScanning(scanner);
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Seconds(61));
            await stopEarlierScan();

            const candidates = new Array<string>();
            const discovery = scanner.findCommissionableDevicesContinuously(
                { shortDiscriminator: 6 },
                ({ deviceIdentifier }) => candidates.push(deviceIdentifier),
            );
            await settleDiscovery();

            expect(candidates).to.have.lengthOf(0);

            await discovery;
        });

        it("still resolves a stale peripheral for a channel open", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Seconds(61));

            expect(scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.exist;
        });

        it("stops offering a peripheral that goes stale while a discovery runs", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            const candidates = new Array<string>();
            const discovery = scanner.findCommissionableDevicesContinuously(
                { shortDiscriminator: 6 },
                ({ deviceIdentifier }) => candidates.push(deviceIdentifier),
            );
            await settleDiscovery();

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await settleDiscovery();
            expect(candidates).to.deep.equal(["aa:aa:aa:aa:aa:aa"]);

            await MockTime.advance(Seconds(61));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(0);

            await scanner.close();
            await discovery;
        });

        it("keeps offering a peripheral of a client that reports no listening time", async () => {
            const client = new MockOneShotBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Seconds(3600));

            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(1);
        });
    });

    describe("forgetCommissionedDevice", () => {
        it("keeps offering another device advertising identical service data", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            // Two devices of one model share a discriminator, so their service data is identical
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Seconds(10));
            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_A);

            scanner.forgetCommissionedDevice([{ type: "ble", peripheralAddress: "bb:bb:bb:bb:bb:bb" }]);

            const devices = scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 });
            expect(devices).to.have.lengthOf(1);
            expect(devices[0].deviceIdentifier).to.equal("aa:aa:aa:aa:aa:aa");
        });

        it("ignores addresses of another transport", () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            scanner.forgetCommissionedDevice([{ type: "udp", ip: "fe80::1", port: 5540 }]);

            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(1);
        });

        it("stops offering a peripheral that was commissioned", () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_B);

            scanner.forgetCommissionedDevice([{ type: "ble", peripheralAddress: "aa:aa:aa:aa:aa:aa" }]);

            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(0);
            expect(() => scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.throw("No device found");
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1000 })).to.have.lengthOf(1);
        });

        it("offers a forgotten peripheral again once it advertises again", () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            scanner.forgetCommissionedDevice([{ type: "ble", peripheralAddress: "aa:aa:aa:aa:aa:aa" }]);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(1);
        });
    });

    describe("reachability", () => {
        it("stops offering a peripheral the transport can no longer reach", () => {
            const client = new MockProxyingBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(1);

            client.unreachable.add("aa:aa:aa:aa:aa:aa");

            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(0);
        });

        it("refuses to hand out a peripheral the transport can no longer reach", () => {
            const client = new MockProxyingBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            client.unreachable.add("aa:aa:aa:aa:aa:aa");

            expect(() => scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.throw("is currently not reachable");
        });

        it("offers a peripheral again once the transport reaches it again", () => {
            const client = new MockProxyingBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            client.unreachable.add("aa:aa:aa:aa:aa:aa");
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(0);

            client.unreachable.delete("aa:aa:aa:aa:aa:aa");

            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(1);
            expect(scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.exist;
        });

        it("keeps a one-shot discovery waiting while only unreachable peripherals advertise", async () => {
            const client = new MockProxyingBleScannerClient();
            const scanner = new BleScanner(client);
            client.unreachable.add("aa:aa:aa:aa:aa:aa");

            let settled = false;
            const discovery = scanner
                .findCommissionableDevices({ longDiscriminator: 1737 }, Seconds(10))
                .then(devices => {
                    settled = true;
                    return devices;
                });

            await settleDiscovery();
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await settleDiscovery();
            expect(settled).to.equal(false);

            await MockTime.advance(Seconds(11));
            expect(await discovery).to.have.lengthOf(0);
        });

        it("ends a one-shot discovery as soon as a reachable peripheral advertises", async () => {
            const client = new MockProxyingBleScannerClient();
            const scanner = new BleScanner(client);

            const discovery = scanner.findCommissionableDevices({ longDiscriminator: 1737 }, Seconds(10));
            await settleDiscovery();

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            expect(await discovery).to.have.lengthOf(1);
        });

        it("purges an unreachable cached peripheral when a discovery asks to ignore existing records", async () => {
            const client = new MockProxyingBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            client.unreachable.add("aa:aa:aa:aa:aa:aa");

            const discovery = scanner.findCommissionableDevices({ longDiscriminator: 1737 }, Seconds(10), true);
            await settleDiscovery();

            // The purged record must not come back through a reachability change alone.
            client.unreachable.delete("aa:aa:aa:aa:aa:aa");
            await MockTime.advance(Seconds(11));

            expect(await discovery).to.have.lengthOf(0);
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(0);
        });

        it("hands a running discovery a peripheral the transport reaches again", async () => {
            const client = new MockProxyingBleScannerClient();
            const scanner = new BleScanner(client);

            const candidates = new Array<string>();
            const discovery = scanner.findCommissionableDevicesContinuously(
                { longDiscriminator: 1737 },
                ({ deviceIdentifier }) => candidates.push(deviceIdentifier),
            );
            await settleDiscovery();

            client.unreachable.add("aa:aa:aa:aa:aa:aa");
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await settleDiscovery();
            expect(candidates).to.have.lengthOf(0);

            client.unreachable.delete("aa:aa:aa:aa:aa:aa");
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await settleDiscovery();

            expect(candidates).to.deep.equal(["aa:aa:aa:aa:aa:aa"]);

            await scanner.close();
            await discovery;
        });

        it("hands a discovery a peripheral that became unreachable before the discovery started", async () => {
            const client = new MockProxyingBleScannerClient();
            const scanner = new BleScanner(client);

            // Discovered through a transport that is gone by the time commissioning starts, which is what a BLE
            // proxy power-cycled between two commissioning runs looks like.
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            client.unreachable.add("aa:aa:aa:aa:aa:aa");

            const candidates = new Array<string>();
            const discovery = scanner.findCommissionableDevicesContinuously(
                { longDiscriminator: 1737 },
                ({ deviceIdentifier }) => candidates.push(deviceIdentifier),
            );
            await settleDiscovery();
            expect(candidates).to.have.lengthOf(0);

            client.unreachable.delete("aa:aa:aa:aa:aa:aa");
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await settleDiscovery();

            expect(candidates).to.deep.equal(["aa:aa:aa:aa:aa:aa"]);

            await scanner.close();
            await discovery;
        });

        it("offers a peripheral once however often it advertises", async () => {
            const client = new MockProxyingBleScannerClient();
            const scanner = new BleScanner(client);

            const candidates = new Array<string>();
            const discovery = scanner.findCommissionableDevicesContinuously(
                { longDiscriminator: 1737 },
                ({ deviceIdentifier }) => candidates.push(deviceIdentifier),
            );
            await settleDiscovery();

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await settleDiscovery();
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await settleDiscovery();

            expect(candidates).to.deep.equal(["aa:aa:aa:aa:aa:aa"]);

            await scanner.close();
            await discovery;
        });

        it("keeps offering peripherals for a client that states no reachability", () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(1);
        });
    });

    describe("overlapping discoveries", () => {
        it("fails every discovery waiting on a scan that cannot start", async () => {
            const client = new MockBleScannerClient();
            client.startScanningError = new Error("start failed");
            const scanner = new BleScanner(client);

            const first = scanner.findCommissionableDevices({ longDiscriminator: 1737 }, Seconds(10));
            const second = scanner.findCommissionableDevices({ longDiscriminator: 1000 }, Seconds(10));

            await expect(first).to.be.rejectedWith("start failed");
            await MockTime.advance(Seconds(11));
            await expect(second).to.be.rejectedWith("start failed");
        });

        it("scans again for a later discovery after a scan could not start", async () => {
            const client = new MockBleScannerClient();
            client.startScanningError = new Error("start failed");
            const scanner = new BleScanner(client);

            await expect(
                scanner.findCommissionableDevices({ longDiscriminator: 1737 }, Seconds(10)),
            ).to.be.rejectedWith("start failed");

            client.startScanningError = undefined;
            const discovery = scanner.findCommissionableDevices({ longDiscriminator: 1737 }, Seconds(10));
            await settleDiscovery();

            expect(client.scanning).to.equal(true);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            expect(await discovery).to.have.lengthOf(1);
        });

        it("starts the next scan only once the previous stop finished", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            const first = scanner.findCommissionableDevicesContinuously({ shortDiscriminator: 6 }, () => {});
            await settleDiscovery();

            client.holdStop();
            scanner.cancelCommissionableDeviceDiscovery({ shortDiscriminator: 6 });
            await settleDiscovery();

            const second = scanner.findCommissionableDevicesContinuously({ shortDiscriminator: 7 }, () => {});
            await settleDiscovery();

            // The stop is still in flight, so the radio is not asked to start again yet
            expect(client.scanCalls).to.deep.equal(["start", "stop"]);

            client.releaseStop();
            await first;
            await settleDiscovery();

            expect(client.scanCalls).to.deep.equal(["start", "stop", "start"]);
            expect(client.scanning).to.equal(true);

            await scanner.close();
            await second;
        });

        it("leaves no scan running when it closes while one is starting", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.holdStart();
            const discovery = scanner.findCommissionableDevicesContinuously({ shortDiscriminator: 6 }, () => {});
            await settleDiscovery();

            const closed = scanner.close();
            await settleDiscovery();

            client.releaseStart();
            await closed;
            await discovery;

            expect(client.scanCalls).to.deep.equal(["start", "stop"]);
            expect(client.scanning).to.equal(false);
        });

        it("keeps scanning for a discovery that still runs when another ends", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            const candidates = new Array<string>();
            const running = scanner.findCommissionableDevicesContinuously(
                { shortDiscriminator: 6 },
                ({ deviceIdentifier }) => candidates.push(deviceIdentifier),
            );
            const ending = scanner.findCommissionableDevicesContinuously({ shortDiscriminator: 7 }, () => {});
            await settleDiscovery();
            expect(client.scanning).to.equal(true);

            scanner.cancelCommissionableDeviceDiscovery({ shortDiscriminator: 7 });
            await ending;

            expect(client.scanning).to.equal(true);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await settleDiscovery();
            expect(candidates).to.deep.equal(["aa:aa:aa:aa:aa:aa"]);

            scanner.cancelCommissionableDeviceDiscovery({ shortDiscriminator: 6 });
            await running;

            expect(client.scanning).to.equal(false);
        });
    });

    describe("discoveries for one identifier", () => {
        it("hands an advertisement to every discovery waiting for it", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            const first = new Array<string>();
            const second = new Array<string>();
            const firstDiscovery = scanner.findCommissionableDevicesContinuously(
                { shortDiscriminator: 6 },
                ({ deviceIdentifier }) => first.push(deviceIdentifier),
            );
            const secondDiscovery = scanner.findCommissionableDevicesContinuously(
                { shortDiscriminator: 6 },
                ({ deviceIdentifier }) => second.push(deviceIdentifier),
            );
            await settleDiscovery();

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await settleDiscovery();

            expect(first).to.deep.equal(["aa:aa:aa:aa:aa:aa"]);
            expect(second).to.deep.equal(["aa:aa:aa:aa:aa:aa"]);

            await scanner.close();
            await firstDiscovery;
            await secondDiscovery;
        });

        it("ends one discovery on its timeout and leaves the other waiting", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            const candidates = new Array<string>();
            const running = scanner.findCommissionableDevicesContinuously(
                { shortDiscriminator: 6 },
                ({ deviceIdentifier }) => candidates.push(deviceIdentifier),
            );
            const expiring = scanner.findCommissionableDevices({ shortDiscriminator: 6 }, Seconds(10));
            await settleDiscovery();

            await MockTime.advance(Seconds(11));
            expect(await expiring).to.have.lengthOf(0);

            // The discovery without a timeout still runs, and the radio still scans for it
            expect(client.scanning).to.equal(true);
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await settleDiscovery();
            expect(candidates).to.deep.equal(["aa:aa:aa:aa:aa:aa"]);

            await scanner.close();
            await running;
        });

        it("does not end a discovery when another discovery's timeout expires", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            const shortWait = scanner.findCommissionableDevices({ shortDiscriminator: 6 }, Seconds(10));
            const longWait = scanner.findCommissionableDevices({ shortDiscriminator: 6 }, Seconds(60));
            let longWaitSettled = false;
            const trackedLongWait = longWait.then(devices => {
                longWaitSettled = true;
                return devices;
            });
            await settleDiscovery();

            await MockTime.advance(Seconds(11));
            expect(await shortWait).to.have.lengthOf(0);
            await settleDiscovery();

            expect(longWaitSettled).to.equal(false);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            expect(await trackedLongWait).to.have.lengthOf(1);
        });

        it("ends every discovery for an identifier that is canceled", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            const first = scanner.findCommissionableDevicesContinuously({ shortDiscriminator: 6 }, () => {});
            const second = scanner.findCommissionableDevicesContinuously({ shortDiscriminator: 6 }, () => {});
            await settleDiscovery();

            scanner.cancelCommissionableDeviceDiscovery({ shortDiscriminator: 6 });

            await first;
            await second;
            await settleDiscovery();

            expect(client.scanning).to.equal(false);
        });
    });

    describe("close", () => {
        it("settles a timeout-less continuous discovery driven by an external cancel signal", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            // Mirrors Discovery.ts: no timeout, external cancelSignal that never resolves during shutdown.
            const cancelSignal = new Promise<void>(() => {});

            let settled = false;
            const discovery = scanner
                .findCommissionableDevicesContinuously({ longDiscriminator: 1737 }, () => {}, undefined, cancelSignal)
                .then(() => (settled = true));

            await Promise.resolve();
            expect(settled).to.equal(false);

            await scanner.close();
            await discovery;

            expect(settled).to.equal(true);
        });

        it("settles a timeout-less continuous discovery with an internal cancel signal", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            let settled = false;
            const discovery = scanner
                .findCommissionableDevicesContinuously({ longDiscriminator: 1737 }, () => {})
                .then(() => (settled = true));

            await Promise.resolve();
            expect(settled).to.equal(false);

            await scanner.close();
            await discovery;

            expect(settled).to.equal(true);
        });

        it("releases waiters and rethrows when the client fails to stop scanning", async () => {
            const client = new MockBleScannerClient();
            client.stopScanningError = new Error("stop failed");
            const scanner = new BleScanner(client);

            // Would hang (mocha timeout) if close() left the waiter orphaned on the closeClient() throw.
            const discovery = scanner.findCommissionableDevicesContinuously({ longDiscriminator: 1737 }, () => {});

            await Promise.resolve();

            // close() owns the stop once it runs, so it alone reports the failure and the discovery simply ends
            await expect(scanner.close()).to.be.rejectedWith("stop failed");
            expect(await discovery).to.have.lengthOf(0);
        });
    });
});
