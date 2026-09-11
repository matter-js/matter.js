/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BlePeripheral, BleScanner, BleScannerClient } from "#common/BleScanner.js";
import { Bytes, Seconds } from "@matter/general";

const SERVICE_DATA_A = Bytes.fromHex("00c9067c11018000"); // D=1737, VP=4476+32769
const SERVICE_DATA_B = Bytes.fromHex("00e8037c11018000"); // D=1000, VP=4476+32769

class MockBleScannerClient implements BleScannerClient {
    callback?: (peripheral: BlePeripheral, data: Bytes) => void;
    setDiscoveryCallback(callback: (peripheral: BlePeripheral, data: Bytes) => void) {
        this.callback = callback;
    }
    stopScanningError?: Error;
    async startScanning() {}
    async stopScanning() {
        if (this.stopScanningError) throw this.stopScanningError;
    }

    discover(address: string, data: Bytes) {
        this.callback!({ address }, data);
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

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            await MockTime.advance(Seconds(10));
            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_A);

            const devices = scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 });
            expect(devices).to.have.lengthOf(2);
            expect(devices[0].deviceIdentifier).to.equal("bb:bb:bb:bb:bb:bb");
            expect(devices[1].deviceIdentifier).to.equal("aa:aa:aa:aa:aa:aa");
        });

        it("replaces the existing entry when matching service data arrives after the stale window (address rotation)", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            await MockTime.advance(Seconds(61));
            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_A);

            const devices = scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 });
            expect(devices).to.have.lengthOf(1);
            expect(devices[0].deviceIdentifier).to.equal("bb:bb:bb:bb:bb:bb");
        });

        it("keeps stale entry alive when it is refreshed before the rotation window elapses", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Seconds(55));
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            await MockTime.advance(Seconds(55));
            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_A);

            const devices = scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 });
            expect(devices).to.have.lengthOf(2);
        });

        it("does not drop entries whose service data differs from the new advertisement", async () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await MockTime.advance(Seconds(120));

            client.discover("bb:bb:bb:bb:bb:bb", SERVICE_DATA_B);

            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(1);
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1000 })).to.have.lengthOf(1);
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

        it("does not offer a peripheral twice when it keeps advertising", async () => {
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

            client.unreachable.add("aa:aa:aa:aa:aa:aa");
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(0);

            client.unreachable.delete("aa:aa:aa:aa:aa:aa");
            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);
            await settleDiscovery();

            expect(candidates).to.deep.equal(["aa:aa:aa:aa:aa:aa"]);

            await scanner.close();
            await discovery;
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

        it("hands a discovery a peripheral that became unreachable before the discovery started", async () => {
            const client = new MockProxyingBleScannerClient();
            const scanner = new BleScanner(client);

            // Discovered through a transport that is gone by the time commissioning starts, which is what a
            // BLE proxy that was power-cycled between two commissioning runs looks like.
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

        it("keeps offering peripherals for a client that states no reachability", () => {
            const client = new MockBleScannerClient();
            const scanner = new BleScanner(client);

            client.discover("aa:aa:aa:aa:aa:aa", SERVICE_DATA_A);

            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1737 })).to.have.lengthOf(1);
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
