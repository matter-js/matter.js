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
