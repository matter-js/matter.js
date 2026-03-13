/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissionableMdnsScanner } from "#mdns/CommissionableMdnsScanner.js";
import {
    DnsMessageType,
    DnsRecordClass,
    DnsRecordType,
    DnssdNames,
    MdnsSocket,
    MockCrypto,
    MockNetwork,
    NetworkSimulator,
    Seconds,
} from "@matter/general";

const SERVER_IPv4 = "10.10.10.1";
const SERVER_IPv6 = "abcd::1";
const SERVER_MAC = "00:11:22:33:44:55";
const CLIENT_IPv4 = "10.10.10.2";
const CLIENT_IPv6 = "abcd::2";
const CLIENT_MAC = "AA:BB:CC:DD:EE:FF";

const INSTANCE_ID = "ABCD1234EFGH5678";
const HOSTNAME = "devicehost.local";
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
});
