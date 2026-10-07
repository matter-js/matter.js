/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BleError } from "#ble/Ble.js";
import { BleListeningClock } from "#common/BleListeningClock.js";
import { BlePeripheral, BleScanner, BleScannerClient } from "#common/BleScanner.js";
import { Bytes, Duration, Minutes, Seconds } from "@matter/general";

const SERVICE_DATA_A = Bytes.fromHex("00c9067c11018000"); // D=1737, VP=4476+32769
const SERVICE_DATA_B = Bytes.fromHex("00e8037c11018000"); // D=1000, VP=4476+32769

class MockBleScannerClient implements BleScannerClient {
    callback?: (peripheral: BlePeripheral, data: Bytes) => void;
    setDiscoveryCallback(callback: (peripheral: BlePeripheral, data: Bytes) => void) {
        this.callback = callback;
    }
    stopScanningError?: Error;

    readonly #listening = new BleListeningClock();

    get listeningTime(): Duration | undefined {
        return this.#listening.total;
    }

    async startScanning() {
        this.startListening();
    }

    async stopScanning() {
        this.stopListening();
        if (this.stopScanningError) throw this.stopScanningError;
    }

    /** The radio scans, which for a real client is an event it receives rather than the request we made. */
    startListening() {
        this.#listening.start();
    }

    /** The radio stopped, as when the adapter powers off under a scan we still believe is running. */
    stopListening() {
        this.#listening.stop();
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
        // Ends the scan and leaves the scanner usable, unlike close()
        scanner.cancelCommissionableDeviceDiscovery({ productId: 1 });
        await discovery;
        await settleDiscovery();
    };
}

describe("BleScanner", () => {
    beforeEach(() => MockTime.reset());
    after(() => MockTime.disable());

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

            await MockTime.advance(Seconds(60));
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
            // Hiding a stale record is not enough: the rotated-away address must be gone
            expect(() => scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.throw();
        });

        it("drops a rotated-away address after elapsed time for a client that reports no listening time", async () => {
            const client = new MockOneShotBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Seconds(61));
            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_A);

            expect(() => scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.throw();
        });

        it("keeps an entry whose device nobody listened for when matching service data arrives from a new address", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            let stopScanning = await startScanning(scanner);
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await stopScanning();

            await MockTime.advance(Seconds(120));

            stopScanning = await startScanning(scanner);
            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_A);
            await stopScanning();

            expect(scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.exist;
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(2);
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

            await MockTime.advance(Seconds(60));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(1);

            await MockTime.advance(Seconds(1));
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

            await scanner.close();
            await discovery;
        });

        it("still resolves a stale peripheral for a channel open", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            const stopScanning = await startScanning(scanner);
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Seconds(61));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(0);

            expect(scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.exist;

            await stopScanning();
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

        it("forgets a peripheral of a client that reports no listening time 15 minutes after it was seen outside a scan", async () => {
            const client = new MockOneShotBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Minutes(15));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(1);

            await MockTime.advance(Seconds(1));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(0);
            expect(() => scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.throw(BleError);
        });

        it("forgets a peripheral silent for 15 minutes of listening", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);
            const stopScanning = await startScanning(scanner);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Minutes(15));
            scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 });
            expect(scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.exist;

            await MockTime.advance(Seconds(1));
            scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 });
            expect(() => scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.throw(BleError);

            await stopScanning();
        });

        it("keeps a peripheral of a client that reports no listening time while a scan runs, and forgets it 15 minutes after", async () => {
            const client = new MockOneShotBleScannerClient();
            const scanner = new BleScanner(client);
            const stopScanning = await startScanning(scanner);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Minutes(30));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(1);

            await stopScanning();
            await MockTime.advance(Minutes(15));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(1);

            await MockTime.advance(Seconds(1));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(0);
            expect(() => scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.throw(BleError);
        });

        it("ages a peripheral of a client that reports no listening time from its report after the last scan", async () => {
            const client = new MockOneShotBleScannerClient();
            const scanner = new BleScanner(client);
            const stopScanning = await startScanning(scanner);
            await stopScanning();

            await MockTime.advance(Minutes(10));
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            await MockTime.advance(Minutes(15));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(1);

            await MockTime.advance(Seconds(1));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(0);
        });

        it("ends the scan of a discovery whose callback throws", async () => {
            const client = new MockOneShotBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            const discovery = scanner.findCommissionableDevicesContinuously({ shortDiscriminator: 6 }, () => {
                throw new Error("callback failed");
            });
            await expect(discovery).rejectedWith("callback failed");

            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_B);
            await MockTime.advance(Minutes(16));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 3 })).to.have.lengthOf(0);
        });

        it("keeps a peripheral of a client that reports no listening time while its scan is still starting", async () => {
            let started!: () => void;
            class SlowStartingClient extends MockOneShotBleScannerClient {
                override async startScanning() {
                    await new Promise<void>(resolve => (started = resolve));
                    await super.startScanning();
                }
            }
            const client = new SlowStartingClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            const discovery = scanner.findCommissionableDevicesContinuously({ productId: 1 }, () => {});
            await settleDiscovery();

            await MockTime.advance(Minutes(16));
            expect(scanner.getDiscoveredCommissionableDevices({ shortDiscriminator: 6 })).to.have.lengthOf(1);

            started();
            await settleDiscovery();
            scanner.cancelCommissionableDeviceDiscovery({ productId: 1 });
            await discovery;
        });

        it("forgets an aged-out peripheral when another one advertises", async () => {
            const client = new MockOneShotBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Minutes(16));
            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_B);

            expect(() => scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.throw(BleError);
            expect(scanner.getDiscoveredDevice("bb:bb:bb:bb:bb:bb")).to.exist;
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

        it("forgets the BLE record of a device commissioned over another transport", () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_B);

            scanner.forgetCommissionedDevice([{ type: "udp", ip: "fe80::1", port: 5540 }], {
                D: 1737,
                VP: "4476+32769",
            });

            expect(() => scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.throw("No device found");
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1000 })).to.have.lengthOf(1);
        });

        it("matches an identity that names only the vendor", () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            scanner.forgetCommissionedDevice([], { D: 1737, VP: "4476" });

            expect(() => scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.throw("No device found");
        });

        it("keeps a record whose vendor or product differs from the identity", () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            scanner.forgetCommissionedDevice([], { D: 1737, VP: "4477+32769" });
            scanner.forgetCommissionedDevice([], { D: 1737, VP: "4476+32770" });
            scanner.forgetCommissionedDevice([], { D: 1737, VP: "4477" });

            expect(scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.exist;
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

        it("purges a stale cached peripheral when a discovery asks to ignore existing records", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);
            const stopScanning = await startScanning(scanner);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Seconds(61));
            await stopScanning();

            const discovery = scanner.findCommissionableDevices({ longDiscriminator: 1737 }, Seconds(10), true);
            await settleDiscovery();
            await MockTime.advance(Seconds(11));

            expect(await discovery).to.have.lengthOf(0);
            expect(() => scanner.getDiscoveredDevice("aa:aa:aa:aa:aa:aa")).to.throw();
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

    describe("timeout", () => {
        it("keeps the deadline of a continuous discovery across a wall-clock step", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            let settled = false;
            const discovery = scanner
                .findCommissionableDevicesContinuously({ longDiscriminator: 1737 }, () => {}, Seconds(5))
                .then(() => {
                    settled = true;
                });
            await settleDiscovery();

            MockTime.stepWallClock(-10_000);
            await MockTime.advance(Seconds(4));
            // The advertisement wakes the discovery, which then derives its remaining time from the deadline
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await settleDiscovery();
            expect(settled).equal(false);

            await MockTime.advance(Seconds(2));
            await discovery;
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

            await expect(scanner.close()).to.be.rejectedWith("stop failed");
            await expect(discovery).to.be.rejectedWith("stop failed");
        });
    });
});
