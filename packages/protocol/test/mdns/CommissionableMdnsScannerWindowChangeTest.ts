/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissionableMdnsScanner } from "#mdns/CommissionableMdnsScanner.js";
import {
    MATTER_COMMISSION_SERVICE_QNAME,
    getCommissionableDeviceQname,
    getLongDiscriminatorQname,
} from "#mdns/MdnsConsts.js";
import { MdnsServer } from "#mdns/MdnsServer.js";
import {
    AAAARecord,
    ARecord,
    DnsMessageType,
    DnsRecord,
    DnsRecordType,
    DnssdNames,
    Duration,
    Instant,
    MdnsSocket,
    Millis,
    MockCrypto,
    MockNetwork,
    NetworkSimulator,
    PtrRecord,
    Seconds,
    ServerAddress,
    SrvRecord,
    Time,
    TxtRecord,
} from "@matter/general";

const DEVICE_IPv4 = "10.10.10.1";
const DEVICE_IPv6 = "abcd::1";
const DEVICE_MAC = "00:11:22:33:44:55";
const CONTROLLER_IPv4 = "10.10.10.2";
const CONTROLLER_IPv6 = "abcd::2";
const CONTROLLER_MAC = "AA:BB:CC:DD:EE:FF";
const DEVICE_ADDRESSES = [DEVICE_IPv4, DEVICE_IPv6];

const HOSTNAME = "0011223344550000.local";
const PORT = 5540;
const DISCRIMINATOR = 3840;
const PREVIOUS_WINDOW = "F24C0677BA7AF549";
const NEXT_WINDOW = "6B7F25408AAD3DB6";

/**
 * The record set a matter.js device publishes for one commissioning window.
 *
 * Mirrors `MdnsAdvertisement`: every unique record carries the cache-flush bit, and the host A/AAAA records belong to
 * the record set of every window and of the operational service.
 */
function windowRecords(instanceId: string, ttl: Duration): DnsRecord[] {
    const qname = getCommissionableDeviceQname(instanceId);
    return [
        PtrRecord(MATTER_COMMISSION_SERVICE_QNAME, qname, ttl),
        PtrRecord(getLongDiscriminatorQname(DISCRIMINATOR), qname, ttl),
        SrvRecord(qname, { priority: 0, weight: 0, port: PORT, target: HOSTNAME }, ttl, true),
        TxtRecord(qname, [`D=${DISCRIMINATOR}`, "CM=2"], ttl, true),
        AAAARecord(HOSTNAME, DEVICE_IPv6, ttl, true),
        ARecord(HOSTNAME, DEVICE_IPv4, ttl, true),
    ];
}

/**
 * The device side: our own responder, publishing one service per commissioning window.
 */
class Device {
    readonly #server: MdnsServer;
    readonly #socket: MdnsSocket;
    readonly #registrations = new Map<string, MdnsServer.Registration>();

    constructor(socket: MdnsSocket) {
        this.#socket = socket;
        this.#server = new MdnsServer(socket);
    }

    async announce(instanceId: string) {
        this.#registrations.set(
            instanceId,
            await this.#server.register(instanceId, () => windowRecords(instanceId, Seconds(120))),
        );
        await MockTime.resolve(this.#server.broadcast(instanceId));
    }

    async withdraw(instanceId: string) {
        const registration = this.#registrations.get(instanceId);
        if (registration !== undefined) {
            await MockTime.resolve(registration.withdraw());
        }
    }

    /**
     * Withdraws a window and then sends a goodbye for all its records, the host addresses included, as a responder
     * does that does not check whether another of its services still publishes them.
     */
    async withdrawIncludingHost(instanceId: string) {
        await this.withdraw(instanceId);
        await this.#socket.send({ messageType: DnsMessageType.Response, answers: windowRecords(instanceId, Instant) });
    }

    async close() {
        await MockTime.resolve(this.#server.close());
    }
}

interface Harness {
    names: DnssdNames;
    scanner: CommissionableMdnsScanner;
    device: Device;
}

async function withHarness(run: (harness: Harness) => Promise<void>) {
    const simulator = new NetworkSimulator();
    const deviceNetwork = new MockNetwork(simulator, DEVICE_MAC, [DEVICE_IPv4, DEVICE_IPv6]);
    const controllerNetwork = new MockNetwork(simulator, CONTROLLER_MAC, [CONTROLLER_IPv4, CONTROLLER_IPv6]);
    const deviceSocket = await MdnsSocket.create(deviceNetwork);
    const controllerSocket = await MdnsSocket.create(controllerNetwork);
    const names = new DnssdNames({ socket: controllerSocket, entropy: MockCrypto(0x18) });
    const scanner = new CommissionableMdnsScanner(names);
    const device = new Device(deviceSocket);
    try {
        await run({ names, scanner, device });
    } finally {
        await MockTime.resolve(scanner.close());
        await device.close();
        await MockTime.resolve(names.close());
        await MockTime.resolve(deviceSocket.close());
        await MockTime.resolve(controllerSocket.close());
        await MockTime.resolve(deviceNetwork.close());
        await MockTime.resolve(controllerNetwork.close());
    }
}

/**
 * Advances mock time in steps short enough that the expiry scheduler and the coalesced address notifications of
 * `IpService` settle between them.
 */
async function elapse(duration: Duration, step = Millis(10)) {
    for (let elapsed = 0; elapsed < duration; elapsed += step) {
        await MockTime.resolve(Time.sleep("elapse", step));
    }
}

function ipsOf(addresses: Iterable<ServerAddress>) {
    return [...addresses].flatMap(address => ("ip" in address ? [address.ip] : [])).sort();
}

/**
 * Where a window stands in the shared DNS-SD cache and in the scanner.
 *
 * `hostAddresses` comes from the cache's records for the SRV target, `scannerAddresses` from the scanner's resolved
 * view of the window.  A window with records but no host addresses is the "cached without addresses" case; host
 * addresses that the scanner does not show would point at the scanner's own state instead.
 */
function stateOf({ names, scanner }: Harness, instanceId: string) {
    const records = [...(names.maybeGet(HOSTNAME)?.records ?? [])];
    return {
        instanceDiscovered: names.maybeGet(getCommissionableDeviceQname(instanceId))?.isDiscovered ?? false,
        hostAddresses: records
            .flatMap(record =>
                record.recordType === DnsRecordType.A || record.recordType === DnsRecordType.AAAA ? [record.value] : [],
            )
            .sort(),
        scannerAddresses: scanner
            .getDiscoveredCommissionableDevices({ instanceId })
            .flatMap(({ addresses }) => ipsOf(addresses)),
    };
}

/**
 * Runs a discovery for the shared discriminator for {@link duration} and returns what it delivered.
 */
async function discover({ scanner }: Harness, duration: Duration) {
    const found = new Array<{ instanceId: string; addresses: string[] }>();
    const identifier = { longDiscriminator: DISCRIMINATOR };
    const discovery = scanner.findCommissionableDevicesContinuously(
        identifier,
        ({ deviceIdentifier, addresses }) => found.push({ instanceId: deviceIdentifier, addresses: ipsOf(addresses) }),
        Seconds(30),
    );
    await elapse(duration);
    scanner.cancelCommissionableDeviceDiscovery(identifier);
    await MockTime.resolve(discovery);
    return found;
}

/**
 * A controller that is already commissioned to a device commissions it again: the device ends one commissioning window
 * and opens the next one, with the same discriminator, about 30 ms apart.  The previous window was open for three
 * minutes, so the controller has it cached.
 */
describe("CommissionableMdnsScanner across a commissioning window change", () => {
    before(() => {
        MockTime.enable();
    });

    async function openPreviousWindow(harness: Harness) {
        await harness.device.announce(PREVIOUS_WINDOW);
        for (let i = 0; i < 3; i++) {
            await elapse(Seconds(60), Seconds(1));
            await harness.device.announce(PREVIOUS_WINDOW);
        }
        await elapse(Millis(10));
        expect(stateOf(harness, PREVIOUS_WINDOW).scannerAddresses).deep.equals(DEVICE_ADDRESSES);
    }

    // Characterizes the order a device produces when it ends one window before it opens the next
    describe("goodbye of the previous window, then the next window", () => {
        async function changeWindow(harness: Harness) {
            await openPreviousWindow(harness);
            await harness.device.withdraw(PREVIOUS_WINDOW);
            await elapse(Millis(30));
            await harness.device.announce(NEXT_WINDOW);
        }

        it("delivers both windows to a discovery that starts 6 ms later", async () => {
            await withHarness(async harness => {
                await changeWindow(harness);
                await elapse(Millis(6));

                const found = await discover(harness, Millis(100));

                expect(found.map(({ instanceId }) => instanceId).sort()).deep.equals([NEXT_WINDOW, PREVIOUS_WINDOW]);
                for (const { addresses } of found) {
                    expect(addresses).deep.equals(DEVICE_ADDRESSES);
                }
            });
        });

        it("keeps the host addresses of the next window once the goodbye takes effect", async () => {
            await withHarness(async harness => {
                await changeWindow(harness);
                await elapse(Seconds(2));

                expect(stateOf(harness, NEXT_WINDOW)).deep.equals({
                    instanceDiscovered: true,
                    hostAddresses: DEVICE_ADDRESSES,
                    scannerAddresses: DEVICE_ADDRESSES,
                });
                expect(stateOf(harness, PREVIOUS_WINDOW).instanceDiscovered).equals(false);
            });
        });
    });

    // A device opens the next window before the previous one ends, or a controller with several interfaces hears the
    // goodbye last
    describe("the next window, then goodbye of the previous window", () => {
        async function changeWindow(harness: Harness) {
            await openPreviousWindow(harness);
            await harness.device.announce(NEXT_WINDOW);
            await elapse(Millis(30));
            await harness.device.withdraw(PREVIOUS_WINDOW);
        }

        // Characterizes the controller: it keeps a record for one second after its goodbye (RFC 6762 §10.1)
        it("delivers both windows to a discovery that starts 6 ms later", async () => {
            await withHarness(async harness => {
                await changeWindow(harness);
                await elapse(Millis(6));

                const found = await discover(harness, Millis(100));

                expect(found.map(({ instanceId }) => instanceId).sort()).deep.equals([NEXT_WINDOW, PREVIOUS_WINDOW]);
                for (const { addresses } of found) {
                    expect(addresses).deep.equals(DEVICE_ADDRESSES);
                }
            });
        });

        it("keeps the host addresses of the next window once the goodbye takes effect", async () => {
            await withHarness(async harness => {
                await changeWindow(harness);
                await elapse(Seconds(2));

                expect(stateOf(harness, NEXT_WINDOW)).deep.equals({
                    instanceDiscovered: true,
                    hostAddresses: DEVICE_ADDRESSES,
                    scannerAddresses: DEVICE_ADDRESSES,
                });
            });
        });
    });

    // Characterizes the controller: it honours such a goodbye (RFC 6762 §10.1), so it has to find the addresses again
    describe("a responder that says goodbye to host addresses its next window still uses", () => {
        async function changeWindow(harness: Harness) {
            await openPreviousWindow(harness);
            await harness.device.announce(NEXT_WINDOW);
            // Past the deferred host addresses of the next window (RFC 6762 §6), so the goodbye comes last
            await elapse(Millis(1100));
            await harness.device.withdrawIncludingHost(PREVIOUS_WINDOW);
            await elapse(Seconds(2));
        }

        it("drops the host addresses once the goodbye takes effect", async () => {
            await withHarness(async harness => {
                await changeWindow(harness);

                expect(stateOf(harness, NEXT_WINDOW)).deep.equals({
                    instanceDiscovered: true,
                    hostAddresses: [],
                    scannerAddresses: [],
                });
            });
        });

        it("delivers the next window once the device answers the address query", async () => {
            await withHarness(async harness => {
                await changeWindow(harness);

                expect(await discover(harness, Seconds(5))).deep.equals([
                    { instanceId: NEXT_WINDOW, addresses: DEVICE_ADDRESSES },
                ]);
            });
        });
    });
});
