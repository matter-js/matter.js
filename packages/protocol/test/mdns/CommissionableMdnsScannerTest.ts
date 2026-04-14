/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissionableDevice } from "#common/Scanner.js";
import { CommissionableMdnsScanner } from "#mdns/CommissionableMdnsScanner.js";
import {
    DnsMessageType,
    DnsRecord,
    DnsRecordClass,
    DnsRecordType,
    DnssdNames,
    MdnsSocket,
    Millis,
    Minutes,
    MockCrypto,
    MockNetwork,
    NetworkSimulator,
    Seconds,
    Time,
} from "@matter/general";

const SERVER_IPv4 = "10.10.10.1";
const SERVER_IPv6 = "abcd::1";
const SERVER_MAC = "00:11:22:33:44:55";
const CLIENT_IPv4 = "10.10.10.2";
const CLIENT_IPv6 = "abcd::2";
const CLIENT_MAC = "AA:BB:CC:DD:EE:FF";

const INSTANCE_ID = "ABCD1234EFGH5678";
const HOSTNAME = "0011223344550000.local";
const PORT = 5540;

describe("CommissionableMdnsScanner", () => {
    before(() => {
        MockTime.enable();
    });

    it("discovers a commissionable device", async () => {
        const simulator = new NetworkSimulator();
        const serverNetwork = new MockNetwork(simulator, SERVER_MAC, [SERVER_IPv4, SERVER_IPv6]);
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);

        const serverSocket = await MdnsSocket.create(serverNetwork);
        const clientSocket = await MdnsSocket.create(clientNetwork);
        const clientNames = new DnssdNames({ socket: clientSocket, entropy: MockCrypto(0x01) });
        const scanner = new CommissionableMdnsScanner(clientNames);

        try {
            // Register a waiter before broadcasting
            const deviceFoundPromise = scanner.findCommissionableDevicesContinuously(
                {},
                () => {},
                undefined,
                undefined,
            );

            // Broadcast DNS-SD records as a Matter commissionable device would
            const instanceQname = `${INSTANCE_ID}._matterc._udp.local`;
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: [`D=3840`, `CM=1`, `VP=4996+22`],
                    },
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: { priority: 0, weight: 0, port: PORT, target: HOSTNAME },
                    },
                    {
                        name: HOSTNAME,
                        recordType: DnsRecordType.A,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: SERVER_IPv4,
                    },
                    {
                        name: HOSTNAME,
                        recordType: DnsRecordType.AAAA,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: SERVER_IPv6,
                    },
                ],
                additionalRecords: [],
            });

            // Allow async processing
            await MockTime.advance(10);

            // Stop with no timeout to collect currently-cached results
            scanner.cancelCommissionableDeviceDiscovery({});

            // The promise should resolve once the timeout/no-arg case runs
            await deviceFoundPromise;

            // We should also have a cached device
            const cached = scanner.getDiscoveredCommissionableDevices({});
            expect(cached.length).greaterThan(0);
            const device = cached[0];
            expect(device.D).equals(3840);
            expect(device.CM).equals(1);
            expect(device.deviceIdentifier).equals(INSTANCE_ID);
        } finally {
            await scanner.close();
            await clientNames.close();
            await serverSocket.close();
            await clientSocket.close();
        }
    });

    it("removes device from cache when TTL expires", async () => {
        const simulator = new NetworkSimulator();
        const serverNetwork = new MockNetwork(simulator, SERVER_MAC, [SERVER_IPv4, SERVER_IPv6]);
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);

        const serverSocket = await MdnsSocket.create(serverNetwork);
        const clientSocket = await MdnsSocket.create(clientNetwork);
        // Use minTtl: 0 so short TTLs are not bumped up
        const clientNames = new DnssdNames({ socket: clientSocket, entropy: MockCrypto(0x03), minTtl: Millis(0) });
        const scanner = new CommissionableMdnsScanner(clientNames);

        try {
            const shortTtl = Seconds(2);
            const instanceQname = `${INSTANCE_ID}._matterc._udp.local`;
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: shortTtl,
                        value: [`D=3840`, `CM=1`, `VP=4996+22`],
                    },
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: shortTtl,
                        value: { priority: 0, weight: 0, port: PORT, target: HOSTNAME },
                    },
                    {
                        name: HOSTNAME,
                        recordType: DnsRecordType.A,
                        recordClass: DnsRecordClass.IN,
                        ttl: shortTtl,
                        value: SERVER_IPv4,
                    },
                ],
                additionalRecords: [],
            });

            await MockTime.advance(10);

            // Device should be cached immediately after discovery
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 3840 }).length).equals(1);

            // Advance past the TTL
            await MockTime.advance(Seconds(3));
            // Allow async notifications to propagate
            await MockTime.advance(10);

            // Device should be removed from cache after TTL expires
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 3840 }).length).equals(0);
        } finally {
            await scanner.close();
            await clientNames.close();
            await serverSocket.close();
            await clientSocket.close();
        }
    });

    it("ignores TTL=0 goodbye within protection window", async () => {
        const simulator = new NetworkSimulator();
        const serverNetwork = new MockNetwork(simulator, SERVER_MAC, [SERVER_IPv4, SERVER_IPv6]);
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);

        const serverSocket = await MdnsSocket.create(serverNetwork);
        const clientSocket = await MdnsSocket.create(clientNetwork);
        const clientNames = new DnssdNames({ socket: clientSocket, entropy: MockCrypto(0x04) });
        const scanner = new CommissionableMdnsScanner(clientNames);

        try {
            const instanceQname = `${INSTANCE_ID}._matterc._udp.local`;
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: [`D=3840`, `CM=1`, `VP=4996+22`],
                    },
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: { priority: 0, weight: 0, port: PORT, target: HOSTNAME },
                    },
                    {
                        name: HOSTNAME,
                        recordType: DnsRecordType.A,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: SERVER_IPv4,
                    },
                ],
                additionalRecords: [],
            });

            await MockTime.advance(10);
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 3840 }).length).equals(1);

            // Send TTL=0 (goodbye) immediately — within the 1-second protection window
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: 0,
                        value: { priority: 0, weight: 0, port: PORT, target: HOSTNAME },
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            // Device should still be cached — goodbye is ignored within protection window
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 3840 }).length).equals(1);
        } finally {
            await scanner.close();
            await clientNames.close();
            await serverSocket.close();
            await clientSocket.close();
        }
    });

    it("accepts TTL=0 goodbye after protection window", async () => {
        const simulator = new NetworkSimulator();
        const serverNetwork = new MockNetwork(simulator, SERVER_MAC, [SERVER_IPv4, SERVER_IPv6]);
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);

        const serverSocket = await MdnsSocket.create(serverNetwork);
        const clientSocket = await MdnsSocket.create(clientNetwork);
        const clientNames = new DnssdNames({ socket: clientSocket, entropy: MockCrypto(0x05) });
        const scanner = new CommissionableMdnsScanner(clientNames);

        try {
            const instanceQname = `${INSTANCE_ID}._matterc._udp.local`;
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: [`D=3840`, `CM=1`, `VP=4996+22`],
                    },
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: { priority: 0, weight: 0, port: PORT, target: HOSTNAME },
                    },
                    {
                        name: HOSTNAME,
                        recordType: DnsRecordType.A,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: SERVER_IPv4,
                    },
                ],
                additionalRecords: [],
            });

            await MockTime.advance(10);
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 3840 }).length).equals(1);

            // Advance past the 1-second goodbye protection window
            await MockTime.advance(Millis(1100));

            // Send TTL=0 (goodbye) — now outside the protection window
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: 0,
                        value: { priority: 0, weight: 0, port: PORT, target: HOSTNAME },
                    },
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: 0,
                        value: [`D=3840`, `CM=1`, `VP=4996+22`],
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            // Device should be removed — goodbye was accepted
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 3840 }).length).equals(0);
        } finally {
            await scanner.close();
            await clientNames.close();
            await serverSocket.close();
            await clientSocket.close();
        }
    });

    it("re-discovers device after TTL expiry eviction", async () => {
        const simulator = new NetworkSimulator();
        const serverNetwork = new MockNetwork(simulator, SERVER_MAC, [SERVER_IPv4, SERVER_IPv6]);
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);

        const serverSocket = await MdnsSocket.create(serverNetwork);
        const clientSocket = await MdnsSocket.create(clientNetwork);
        const clientNames = new DnssdNames({
            socket: clientSocket,
            entropy: MockCrypto(0x07),
            minTtl: Millis(0),
        });
        const scanner = new CommissionableMdnsScanner(clientNames);

        try {
            const instanceQname = `${INSTANCE_ID}._matterc._udp.local`;
            const records = {
                messageType: DnsMessageType.Response as const,
                answers: [
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.TXT as const,
                        recordClass: DnsRecordClass.IN as const,
                        ttl: Seconds(2),
                        value: [`D=3840`, `CM=1`, `VP=4996+22`],
                    },
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.SRV as const,
                        recordClass: DnsRecordClass.IN as const,
                        ttl: Seconds(2),
                        value: { priority: 0, weight: 0, port: PORT, target: HOSTNAME },
                    },
                    {
                        name: HOSTNAME,
                        recordType: DnsRecordType.A as const,
                        recordClass: DnsRecordClass.IN as const,
                        ttl: Seconds(2),
                        value: SERVER_IPv4,
                    },
                ],
                additionalRecords: [] as DnsRecord[],
            };

            // First discovery
            await serverSocket.send(records);
            await MockTime.advance(10);
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 3840 }).length).equals(1);

            // Wait for TTL expiry
            await MockTime.advance(Seconds(3));
            await MockTime.advance(10);
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 3840 }).length).equals(0);

            // Re-advertise — should be re-discovered
            await serverSocket.send(records);
            await MockTime.advance(10);
            expect(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 3840 }).length).equals(1);
        } finally {
            await scanner.close();
            await clientNames.close();
            await serverSocket.close();
            await clientSocket.close();
        }
    });

    it("concurrent discoveries time out with empty results when no device is present", async () => {
        const simulator = new NetworkSimulator();
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);

        const clientSocket = await MdnsSocket.create(clientNetwork);
        const clientNames = new DnssdNames({ socket: clientSocket, entropy: MockCrypto(0x06) });
        const scanner = new CommissionableMdnsScanner(clientNames);

        try {
            const identifier = { longDiscriminator: 1234 };
            const shortPromise = scanner.findCommissionableDevicesContinuously(identifier, () => {}, Millis(500));
            const longPromise = scanner.findCommissionableDevicesContinuously(identifier, () => {}, Millis(1000));

            // Both should resolve with empty arrays once their timeouts elapse
            const [shortResult, longResult] = await MockTime.resolve(Promise.all([shortPromise, longPromise]));
            expect(shortResult).deep.equals([]);
            expect(longResult).deep.equals([]);
        } finally {
            await scanner.close();
            await clientNames.close();
            await clientSocket.close();
        }
    });

    it("two concurrent discoveries both resolve when device is found", async () => {
        const simulator = new NetworkSimulator();
        const serverNetwork = new MockNetwork(simulator, SERVER_MAC, [SERVER_IPv4, SERVER_IPv6]);
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);

        const serverSocket = await MdnsSocket.create(serverNetwork);
        const clientSocket = await MdnsSocket.create(clientNetwork);
        const clientNames = new DnssdNames({ socket: clientSocket, entropy: MockCrypto(0x07) });
        const scanner = new CommissionableMdnsScanner(clientNames);

        try {
            const identifier = { longDiscriminator: 3840 };
            const found1: CommissionableDevice[] = [];
            const found2: CommissionableDevice[] = [];
            const promise1 = scanner.findCommissionableDevicesContinuously(
                identifier,
                device => found1.push(device),
                Seconds(10),
            );
            const promise2 = scanner.findCommissionableDevicesContinuously(
                identifier,
                device => found2.push(device),
                Seconds(10),
            );

            const instanceQname = `${INSTANCE_ID}._matterc._udp.local`;
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: [`D=3840`, `CM=1`, `VP=4996+22`],
                    },
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: { priority: 0, weight: 0, port: PORT, target: HOSTNAME },
                    },
                    {
                        name: HOSTNAME,
                        recordType: DnsRecordType.A,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: SERVER_IPv4,
                    },
                ],
                additionalRecords: [],
            });

            // Process network messages then cancel both discoveries
            await MockTime.advance(10);
            scanner.cancelCommissionableDeviceDiscovery(identifier);

            const [result1, result2] = await MockTime.resolve(Promise.all([promise1, promise2]));

            expect(found1.length).equals(1);
            expect(found1[0].deviceIdentifier).equals(INSTANCE_ID);
            expect(found2.length).equals(1);
            expect(found2[0].deviceIdentifier).equals(INSTANCE_ID);
            expect(result1.length).equals(1);
            expect(result2.length).equals(1);
        } finally {
            await scanner.close();
            await clientNames.close();
            await serverSocket.close();
            await clientSocket.close();
        }
    });

    it("finds devices by long discriminator", async () => {
        const simulator = new NetworkSimulator();
        const serverNetwork = new MockNetwork(simulator, SERVER_MAC, [SERVER_IPv4, SERVER_IPv6]);
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);

        const serverSocket = await MdnsSocket.create(serverNetwork);
        const clientSocket = await MdnsSocket.create(clientNetwork);
        const clientNames = new DnssdNames({ socket: clientSocket, entropy: MockCrypto(0x02) });
        const scanner = new CommissionableMdnsScanner(clientNames);

        try {
            const instanceQname = `${INSTANCE_ID}._matterc._udp.local`;
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: [`D=3840`, `CM=1`, `VP=4996+22`],
                    },
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: { priority: 0, weight: 0, port: PORT, target: HOSTNAME },
                    },
                    {
                        name: HOSTNAME,
                        recordType: DnsRecordType.A,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: SERVER_IPv4,
                    },
                ],
                additionalRecords: [],
            });

            await MockTime.advance(10);

            const results = scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 3840 });
            expect(results.length).equals(1);
            expect(results[0].D).equals(3840);

            const noResults = scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 });
            expect(noResults.length).equals(0);
        } finally {
            await scanner.close();
            await clientNames.close();
            await serverSocket.close();
            await clientSocket.close();
        }
    });

    it("defers delivery until A/AAAA records arrive", async () => {
        const simulator = new NetworkSimulator();
        const serverNetwork = new MockNetwork(simulator, SERVER_MAC, [SERVER_IPv4, SERVER_IPv6]);
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);

        const serverSocket = await MdnsSocket.create(serverNetwork);
        const clientSocket = await MdnsSocket.create(clientNetwork);
        const clientNames = new DnssdNames({ socket: clientSocket, entropy: MockCrypto(0x08) });
        const scanner = new CommissionableMdnsScanner(clientNames);

        try {
            const found: CommissionableDevice[] = [];
            const identifier = { longDiscriminator: 3840 };
            const discoveryPromise = scanner.findCommissionableDevicesContinuously(
                identifier,
                device => found.push(device),
                Seconds(10),
            );

            // Send SRV+TXT without A/AAAA records
            const instanceQname = `${INSTANCE_ID}._matterc._udp.local`;
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: [`D=3840`, `CM=1`, `VP=4996+22`],
                    },
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: { priority: 0, weight: 0, port: PORT, target: HOSTNAME },
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            // Device should not be delivered yet — no addresses
            expect(found.length).equals(0);
            expect(scanner.getDiscoveredCommissionableDevices(identifier).length).equals(0);

            // Send A record in a follow-up response alongside a filtered record so DnssdNames
            // processes it (the iterative second pass requires at least one filtered record to trigger).
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: `_matterc._udp.local`,
                        recordType: DnsRecordType.PTR,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: `${INSTANCE_ID}._matterc._udp.local`,
                    },
                ],
                additionalRecords: [
                    {
                        name: HOSTNAME,
                        recordType: DnsRecordType.A,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: SERVER_IPv4,
                    },
                ],
            });
            await MockTime.advance(10);

            // Now the device should be delivered
            expect(found.length).equals(1);
            expect(found[0].deviceIdentifier).equals(INSTANCE_ID);
            expect(found[0].addresses.length).greaterThan(0);

            // getDiscoveredCommissionableDevices should also return it now
            expect(scanner.getDiscoveredCommissionableDevices(identifier).length).equals(1);

            scanner.cancelCommissionableDeviceDiscovery(identifier);
            await MockTime.resolve(discoveryPromise);
        } finally {
            await scanner.close();
            await clientNames.close();
            await serverSocket.close();
            await clientSocket.close();
        }
    });

    it("PTR-follow solicits SRV/TXT when PTR arrives without additional records", async () => {
        const simulator = new NetworkSimulator();
        const serverNetwork = new MockNetwork(simulator, SERVER_MAC, [SERVER_IPv4, SERVER_IPv6]);
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);

        const serverSocket = await MdnsSocket.create(serverNetwork);
        const clientSocket = await MdnsSocket.create(clientNetwork);
        const clientNames = new DnssdNames({ socket: clientSocket, entropy: MockCrypto(0x0a) });
        const scanner = new CommissionableMdnsScanner(clientNames);

        try {
            const found: CommissionableDevice[] = [];
            const identifier = { longDiscriminator: 3840 };
            const discoveryPromise = scanner.findCommissionableDevicesContinuously(
                identifier,
                device => found.push(device),
                Seconds(30),
            );

            const instanceQname = `${INSTANCE_ID}._matterc._udp.local`;

            // Responder answers SRV/TXT queries for the instance
            serverSocket.receipt.on(async message => {
                if (
                    message.queries.find(
                        q =>
                            q.name === instanceQname &&
                            (q.recordType === DnsRecordType.SRV || q.recordType === DnsRecordType.TXT),
                    )
                ) {
                    await serverSocket.send({
                        messageType: DnsMessageType.Response,
                        answers: [
                            {
                                name: instanceQname,
                                recordType: DnsRecordType.SRV,
                                recordClass: DnsRecordClass.IN,
                                ttl: Seconds(120),
                                value: { priority: 0, weight: 0, port: PORT, target: HOSTNAME },
                            },
                            {
                                name: instanceQname,
                                recordType: DnsRecordType.TXT,
                                recordClass: DnsRecordClass.IN,
                                ttl: Seconds(120),
                                value: [`D=3840`, `CM=1`, `VP=4996+22`],
                            },
                            {
                                name: HOSTNAME,
                                recordType: DnsRecordType.A,
                                recordClass: DnsRecordClass.IN,
                                ttl: Seconds(120),
                                value: SERVER_IPv4,
                            },
                        ],
                        additionalRecords: [],
                    });
                }
            });

            // Bare PTR only — no SRV/TXT as additional records.  PTR-follow should detect
            // missing SRV+TXT and start a speculative discover() for the target.
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: `_matterc._udp.local`,
                        recordType: DnsRecordType.PTR,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: instanceQname,
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            // Device cannot be built yet — only PTR, no SRV/TXT
            expect(found.length).equals(0);

            // Let the speculative discover's solicit fire and the response propagate
            await MockTime.resolve(Time.sleep("wait for speculative discover", Minutes(1)));

            expect(found.length).equals(1);
            expect(found[0].deviceIdentifier).equals(INSTANCE_ID);
            expect(found[0].D).equals(3840);
            expect(found[0].addresses.length).greaterThan(0);

            scanner.cancelCommissionableDeviceDiscovery(identifier);
            await MockTime.resolve(discoveryPromise);
        } finally {
            await scanner.close();
            await clientNames.close();
            await serverSocket.close();
            await clientSocket.close();
        }
    });

    it("discovers device when A/AAAA arrives before SRV in separate messages", async () => {
        const simulator = new NetworkSimulator();
        const serverNetwork = new MockNetwork(simulator, SERVER_MAC, [SERVER_IPv4, SERVER_IPv6]);
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);

        const serverSocket = await MdnsSocket.create(serverNetwork);
        const clientSocket = await MdnsSocket.create(clientNetwork);
        const clientNames = new DnssdNames({ socket: clientSocket, entropy: MockCrypto(0x09) });
        const scanner = new CommissionableMdnsScanner(clientNames);

        try {
            const found: CommissionableDevice[] = [];
            const identifier = { longDiscriminator: 3840 };
            const discoveryPromise = scanner.findCommissionableDevicesContinuously(
                identifier,
                device => found.push(device),
                Seconds(10),
            );

            const instanceQname = `${INSTANCE_ID}._matterc._udp.local`;

            // Message 1: PTR (filter-passing chaperone) + A record for hostname.  No SRV/TXT yet, so the
            // hostname's A record is staged because no DnssdName exists for the hostname.
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: `_matterc._udp.local`,
                        recordType: DnsRecordType.PTR,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: instanceQname,
                    },
                    {
                        name: HOSTNAME,
                        recordType: DnsRecordType.A,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: SERVER_IPv4,
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            // Device cannot be built yet — only PTR known, no SRV/TXT
            expect(found.length).equals(0);

            // Message 2: SRV + TXT for the instance.  When SRV is processed, a DnssdName for HOSTNAME is
            // created via dependency, and the staged A record is replayed onto it.
            await serverSocket.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: [`D=3840`, `CM=1`, `VP=4996+22`],
                    },
                    {
                        name: instanceQname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(120),
                        value: { priority: 0, weight: 0, port: PORT, target: HOSTNAME },
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            // Device should now be delivered with the staged IP address
            expect(found.length).equals(1);
            expect(found[0].deviceIdentifier).equals(INSTANCE_ID);
            expect(found[0].addresses.length).greaterThan(0);
            expect(found[0].addresses.some(a => a.type === "udp" && a.ip === SERVER_IPv4)).true;

            scanner.cancelCommissionableDeviceDiscovery(identifier);
            await MockTime.resolve(discoveryPromise);
        } finally {
            await scanner.close();
            await clientNames.close();
            await serverSocket.close();
            await clientSocket.close();
        }
    });
});
