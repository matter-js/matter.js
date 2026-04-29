/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fabric } from "#fabric/Fabric.js";
import { Advertisement, CommissioningMode, MdnsAdvertiser, MdnsServer, ServiceDescription } from "#index.js";
import {
    Bytes,
    ConnectionlessTransport,
    DnsCodec,
    DnsMessage,
    DnsRecordType,
    Duration,
    Instant,
    InternalError,
    MdnsSocket,
    Millis,
    MockCrypto,
    MockNetwork,
    MockRouter,
    MockUdpChannel,
    NetworkSimulator,
    Seconds,
    Time,
    UdpChannel,
} from "@matter/general";
import { GlobalFabricId, NodeId, VendorId } from "@matter/types";

const SERVER_IPv4 = "192.168.200.1";
const SERVER_IPv6 = "fe80::e777:4f5e:c61e:7314";
const SERVER_MAC = "00:B0:D0:63:C2:26";
const CLIENT_IPv4 = "192.168.200.2";
const CLIENT_IPv6 = "fe80::e777:4f5e:c61e:7315";
const CLIENT_MAC = "CA:FE:00:00:BE:EF";
const PORT = 5540;
const PORT2 = 5541;
const PORT3 = 5542;

const GLOBAL_ID = GlobalFabricId(0x18);
const NODE_ID = NodeId(1);

const FABRIC = { globalId: GLOBAL_ID, nodeId: NODE_ID } as Fabric;
const OPERATIONAL_SERVICE = ServiceDescription.Operational({
    fabric: FABRIC,
});

const COMMISSIONABLE_SERVICE = ServiceDescription.Commissionable({
    name: "Test Device",
    mode: CommissioningMode.Basic,
    deviceType: 1,
    vendorId: VendorId(1),
    productId: 0x8000,
    discriminator: 1234,
});

[
    { serverHasIpv4Addresses: true, testIpv4Enabled: true },
    { serverHasIpv4Addresses: true, testIpv4Enabled: false },
    { serverHasIpv4Addresses: false, testIpv4Enabled: false },
].forEach(({ serverHasIpv4Addresses, testIpv4Enabled }) => {
    const serverIps = serverHasIpv4Addresses ? [SERVER_IPv4, SERVER_IPv6] : [SERVER_IPv6];
    const clientIps = testIpv4Enabled ? [CLIENT_IPv4, CLIENT_IPv6] : [CLIENT_IPv6];

    const IPDnsRecords = [
        {
            flushCache: false,
            name: "00B0D063C2260000.local",
            recordType: 28,
            recordClass: 1,
            ttl: Seconds(120),
            value: "fe80::e777:4f5e:c61e:7314",
        },
    ];
    if (testIpv4Enabled && serverHasIpv4Addresses) {
        IPDnsRecords.push({
            flushCache: false,
            name: "00B0D063C2260000.local",
            recordType: 1,
            recordClass: 1,
            ttl: Seconds(120),
            value: "192.168.200.1",
        });
    }

    const IPIntegrationResultsPort1 = [{ ip: `${SERVER_IPv6}%fake0`, port: PORT, type: "udp" }];
    const IPIntegrationResultsPort2 = [{ ip: `${SERVER_IPv6}%fake0`, port: PORT2, type: "udp" }];
    if (testIpv4Enabled && serverHasIpv4Addresses) {
        IPIntegrationResultsPort1.push({ ip: SERVER_IPv4, port: PORT, type: "udp" });
        IPIntegrationResultsPort2.push({ ip: SERVER_IPv4, port: PORT2, type: "udp" });
    }

    describe(`MDNS Scanner and Broadcaster ${testIpv4Enabled ? "with" : "without"} IPv4 (and Ipv4 ${
        serverHasIpv4Addresses ? "" : "not "
    }provided)`, () => {
        const crypto = MockCrypto();
        before(MockTime.enable);

        let serverSocket: MdnsSocket;
        let server: MdnsServer;
        let clientSocket: MdnsSocket;
        let scanListener: UdpChannel;
        let broadcastListener: UdpChannel;
        let scannerInterceptor: MockRouter.Interceptor | undefined;
        let broadcasterInterceptor: MockRouter.Interceptor | undefined;

        let advertisers = {} as Record<number, MdnsAdvertiser>;

        beforeEach(async () => {
            const simulator = new NetworkSimulator();
            const serverNetwork = new MockNetwork(simulator, SERVER_MAC, serverIps);
            const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, clientIps);

            let multicastIp, type: "udp4" | "udp6";
            if (testIpv4Enabled) {
                multicastIp = "224.0.0.251";
                type = "udp4";
            } else {
                multicastIp = "ff02::fb";
                type = "udp6";
            }

            advertisers = {};

            clientSocket = await MdnsSocket.create(clientNetwork, {
                enableIpv4: testIpv4Enabled,
                netInterface: "fake0",
            });

            serverSocket = await MdnsSocket.create(serverNetwork, {
                enableIpv4: testIpv4Enabled,
                netInterface: "fake0",
            });
            server = new MdnsServer(serverSocket);

            // Add an additional listener on the broadcaster to detect scans
            scanListener = new MockUdpChannel(
                serverNetwork,
                {
                    listeningPort: 5353,
                    listeningAddress: testIpv4Enabled ? SERVER_IPv4 : SERVER_IPv6,
                    type,
                },
                (packet, route) => {
                    if (scannerInterceptor) {
                        scannerInterceptor(packet, route);
                    } else {
                        route(packet);
                    }
                },
            );
            (scanListener as any).foo = "scannerChannel";
            scanListener.addMembership(multicastIp);
            scannerInterceptor = undefined; // Reset

            // Add an additional listener on the scanner to detect broadcaster announcements
            broadcastListener = new MockUdpChannel(
                clientNetwork,
                {
                    listeningPort: 5353,
                    listeningAddress: testIpv4Enabled ? CLIENT_IPv4 : CLIENT_IPv6,
                    type,
                },
                (packet, route) => {
                    if (broadcasterInterceptor) {
                        broadcasterInterceptor(packet, route);
                    } else {
                        route(packet);
                    }
                },
            );
            (broadcastListener as any).foo = "broadcasterChannel";
            broadcastListener.addMembership(multicastIp);
            broadcasterInterceptor = undefined; // Reset
        });

        afterEach(async () => {
            await closeAll();
            await server.close();
            await clientSocket.close();
            await scanListener.close();
            await broadcastListener.close();
        });

        function getAdvertiser(port = PORT) {
            let advertiser = advertisers[port];
            if (advertiser === undefined) {
                advertiser = advertisers[port] = new MdnsAdvertiser(crypto, server, { port });
            }
            return advertiser;
        }

        function advertise(service: ServiceDescription, port = PORT) {
            const ad = getAdvertiser(port).advertise({ ...service, port }, "startup")!;
            expect(ad).not.undefined;
        }

        async function close(port = PORT) {
            const advertiser = advertisers[port];
            expect(advertiser.advertisements.size).greaterThan(0);
            // Advance past the goodbye protection window so TTL=0 packets are not ignored
            await MockTime.advance(1000);
            await MockTime.resolve(Advertisement.closeAll(advertiser.advertisements));
        }

        async function closeAll() {
            // Ensure in-flight transmissions complete
            await MockTime.macrotasks;

            // Advance past the goodbye protection window so TTL=0 packets are not ignored
            await MockTime.advance(1000);

            for (const port in advertisers) {
                await MockTime.resolve(advertisers[port].close());
                delete advertisers[port];
            }

            // Ensure in-flight transmissions complete
            await MockTime.macrotasks;
        }

        class MessageCollector extends Array<DnsMessage> {
            #listener: ConnectionlessTransport.Listener;

            constructor(onMessage?: (message: DnsMessage) => void) {
                super();
                this.#listener = scanListener.onData((_netInterface, _peerAddress, _peerPort, data) => {
                    const message = DnsCodec.decode(data);
                    if (message === undefined) {
                        throw new InternalError(`DNS message decode failure`);
                    }
                    this.push(message);
                    onMessage?.(message);
                });
            }

            close() {
                return this.#listener.close();
            }
        }

        async function waitForMessage() {
            const messages = await waitForMessages({ count: 1 });
            return messages[0];
        }

        function waitForMessages(config: { count: number } | Duration) {
            if (typeof config === "object") {
                return new Promise<Array<DnsMessage>>((resolve, reject) => {
                    const collector = new MessageCollector(() => {
                        if (collector.length < config.count) {
                            return;
                        }
                        collector.close().then(() => resolve(collector), reject);
                    });
                });
            }

            const collector = new MessageCollector();
            return MockTime.resolve(
                Time.sleep("message collector", config)
                    .then(collector.close.bind(collector))
                    .then(() => collector),
            );
        }

        describe("broadcaster", () => {
            it("has correct crypto installed", async () => {
                // This is the first place we encounter this in a full test run so be a little explicit about it
                expect(crypto.randomUint8).equals(0x80, "Crypto mocking is broken, tests will fail");
            });

            it("it broadcasts the device fabric on one port and expires", async () => {
                const announcement = waitForMessage();

                advertise({
                    ...OPERATIONAL_SERVICE,
                    idleInterval: Millis(100),
                    activeInterval: Millis(200),
                });

                expectMessage(await announcement, {
                    transactionId: 0,
                    messageType: 0x8400,
                    queries: [],
                    answers: [
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordType: 12,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: "_matter._tcp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordType: 12,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: "_I0000000000000018._sub._matter._tcp.local",
                        },
                        {
                            flushCache: false,
                            name: "_matter._tcp.local",
                            recordType: 12,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: "0000000000000018-0000000000000001._matter._tcp.local",
                        },
                        {
                            flushCache: false,
                            name: "_I0000000000000018._sub._matter._tcp.local",
                            recordType: 12,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: "0000000000000018-0000000000000001._matter._tcp.local",
                        },
                    ],
                    authorities: [],
                    additionalRecords: [
                        {
                            flushCache: false,
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordType: 33,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: { priority: 0, weight: 0, port: PORT, target: "00B0D063C2260000.local" },
                        },
                        {
                            flushCache: false,
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordType: 16,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: ["SII=100", "SAI=200", "SAT=4000"],
                        },
                        ...IPDnsRecords,
                    ],
                });

                const expiration = waitForMessage();

                // And expire the announcement
                await close();

                const expiryResult = await expiration;

                // Expiry is the same as the announcement result but with ttl = 0
                expectMessage(expiryResult, {
                    transactionId: 0,
                    messageType: 0x8400,
                    queries: [],
                    answers: [
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordType: 12,
                            recordClass: 1,
                            ttl: Instant,
                            value: "_matter._tcp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordType: 12,
                            recordClass: 1,
                            ttl: Instant,
                            value: "_I0000000000000018._sub._matter._tcp.local",
                        },
                        {
                            flushCache: false,
                            name: "_matter._tcp.local",
                            recordType: 12,
                            recordClass: 1,
                            ttl: Instant,
                            value: "0000000000000018-0000000000000001._matter._tcp.local",
                        },
                        {
                            flushCache: false,
                            name: "_I0000000000000018._sub._matter._tcp.local",
                            recordType: 12,
                            recordClass: 1,
                            ttl: Instant,
                            value: "0000000000000018-0000000000000001._matter._tcp.local",
                        },
                    ],
                    authorities: [],
                    additionalRecords: [
                        {
                            flushCache: false,
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordType: 33,
                            recordClass: 1,
                            ttl: Instant,
                            value: { priority: 0, weight: 0, port: PORT, target: "00B0D063C2260000.local" },
                        },
                        {
                            flushCache: false,
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordType: 16,
                            recordClass: 1,
                            ttl: Instant,
                            value: ["SII=100", "SAI=200", "SAT=4000"],
                        },
                        ...IPDnsRecords.map(record => ({ ...record, ttl: Instant })),
                    ],
                });
            });

            it("it broadcasts the device commissionable info on one port", async () => {
                const announcement = waitForMessage();

                advertise(COMMISSIONABLE_SERVICE);

                expectMessage(await announcement, {
                    additionalRecords: [
                        {
                            flushCache: false,
                            name: "8080808080808080._matterc._udp.local",
                            recordClass: 1,
                            recordType: 33,
                            ttl: Seconds(120),
                            value: { port: PORT, priority: 0, target: "00B0D063C2260000.local", weight: 0 },
                        },
                        {
                            flushCache: false,
                            name: "8080808080808080._matterc._udp.local",
                            recordClass: 1,
                            recordType: 16,
                            ttl: Seconds(120),
                            value: [
                                "VP=1+32768",
                                "DT=1",
                                "DN=Test Device",
                                "SII=500",
                                "SAI=300",
                                "SAT=4000",
                                "D=1234",
                                "CM=1",
                                "PH=33",
                            ],
                        },
                        ...IPDnsRecords,
                    ],
                    answers: [
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_V1._sub._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_T1._sub._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_S4._sub._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_L1234._sub._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_CM._sub._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_matterc._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_V1._sub._matterc._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_T1._sub._matterc._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_S4._sub._matterc._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_L1234._sub._matterc._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_CM._sub._matterc._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterc._udp.local",
                        },
                    ],
                    authorities: [],
                    messageType: 0x8400,
                    queries: [],
                    transactionId: 0,
                });

                // And expire the announcement
                await close();
            });

            it("it broadcasts the controller commissioner on one port", async () => {
                const announcement = waitForMessage();

                advertise(
                    ServiceDescription.Commissioner({
                        name: "Test Commissioner",
                        deviceType: 1,
                        vendorId: VendorId(1),
                        productId: 0x8000,
                    }),
                );

                expectMessage(await announcement, {
                    additionalRecords: [
                        {
                            flushCache: false,
                            name: "8080808080808080._matterd._udp.local",
                            recordClass: 1,
                            recordType: 33,
                            ttl: Seconds(120),
                            value: { port: PORT, priority: 0, target: "00B0D063C2260000.local", weight: 0 },
                        },
                        {
                            flushCache: false,
                            name: "8080808080808080._matterd._udp.local",
                            recordClass: 1,
                            recordType: 16,
                            ttl: Seconds(120),
                            value: ["VP=1+32768", "DT=1", "DN=Test Commissioner", "SII=500", "SAI=300", "SAT=4000"],
                        },
                        ...IPDnsRecords,
                    ],
                    answers: [
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_matterd._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_matterd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_V1._sub._matterd._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_V1._sub._matterd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterd._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_T1._sub._matterd._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_T1._sub._matterd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterd._udp.local",
                        },
                    ],
                    authorities: [],
                    messageType: 0x8400,
                    queries: [],
                    transactionId: 0,
                });

                // And expire the announcement
                await close();
            });

            it("it allows announcements of multiple devices on different ports", async () => {
                const announcements = waitForMessages({ count: 3 });

                advertise(OPERATIONAL_SERVICE);
                advertise(COMMISSIONABLE_SERVICE, PORT2);
                advertise(
                    ServiceDescription.Commissioner({
                        name: "Test Commissioner",
                        deviceType: 1,
                        vendorId: VendorId(1),
                        productId: 0x8000,
                    }),
                    PORT3,
                );

                const [message1, message2, message3] = await announcements;

                expectMessage(message1, {
                    transactionId: 0,
                    messageType: 0x8400,
                    queries: [],
                    answers: [
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordType: 12,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: "_matter._tcp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordType: 12,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: "_I0000000000000018._sub._matter._tcp.local",
                        },
                        {
                            flushCache: false,
                            name: "_matter._tcp.local",
                            recordType: 12,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: "0000000000000018-0000000000000001._matter._tcp.local",
                        },
                        {
                            flushCache: false,
                            name: "_I0000000000000018._sub._matter._tcp.local",
                            recordType: 12,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: "0000000000000018-0000000000000001._matter._tcp.local",
                        },
                    ],
                    authorities: [],
                    additionalRecords: [
                        {
                            flushCache: false,
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordType: 33,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: { priority: 0, weight: 0, port: PORT, target: "00B0D063C2260000.local" },
                        },
                        {
                            flushCache: false,
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordType: 16,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: ["SII=500", "SAI=300", "SAT=4000"],
                        },
                        ...IPDnsRecords,
                    ],
                });

                expectMessage(message2, {
                    additionalRecords: [
                        {
                            flushCache: false,
                            name: "8080808080808080._matterc._udp.local",
                            recordClass: 1,
                            recordType: 33,
                            ttl: Seconds(120),
                            value: { port: PORT2, priority: 0, target: "00B0D063C2260000.local", weight: 0 },
                        },
                        {
                            flushCache: false,
                            name: "8080808080808080._matterc._udp.local",
                            recordClass: 1,
                            recordType: 16,
                            ttl: Seconds(120),
                            value: [
                                "VP=1+32768",
                                "DT=1",
                                "DN=Test Device",
                                "SII=500",
                                "SAI=300",
                                "SAT=4000",
                                "D=1234",
                                "CM=1",
                                "PH=33",
                            ],
                        },
                        ...IPDnsRecords,
                    ],
                    answers: [
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_V1._sub._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_T1._sub._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_S4._sub._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_L1234._sub._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_CM._sub._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_matterc._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_V1._sub._matterc._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_T1._sub._matterc._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_S4._sub._matterc._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_L1234._sub._matterc._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterc._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_CM._sub._matterc._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterc._udp.local",
                        },
                    ],
                    authorities: [],
                    messageType: 0x8400,
                    queries: [],
                    transactionId: 0,
                });

                expectMessage(message3, {
                    additionalRecords: [
                        {
                            flushCache: false,
                            name: "8080808080808080._matterd._udp.local",
                            recordClass: 1,
                            recordType: 33,
                            ttl: Seconds(120),
                            value: { port: PORT3, priority: 0, target: "00B0D063C2260000.local", weight: 0 },
                        },
                        {
                            flushCache: false,
                            name: "8080808080808080._matterd._udp.local",
                            recordClass: 1,
                            recordType: 16,
                            ttl: Seconds(120),
                            value: ["VP=1+32768", "DT=1", "DN=Test Commissioner", "SII=500", "SAI=300", "SAT=4000"],
                        },
                        ...IPDnsRecords,
                    ],
                    answers: [
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_matterd._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_matterd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_V1._sub._matterd._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_V1._sub._matterd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterd._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "_T1._sub._matterd._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_T1._sub._matterd._udp.local",
                            recordClass: 1,
                            recordType: 12,
                            ttl: Seconds(120),
                            value: "8080808080808080._matterd._udp.local",
                        },
                    ],
                    authorities: [],
                    messageType: 0x8400,
                    queries: [],
                    transactionId: 0,
                });

                // And expire the announcement for all via close
                await closeAll();
            });
        });
    });
});

function expectMessage(actual: DnsMessage | undefined, expected: DnsMessage) {
    for (const message of [actual, expected]) {
        if (!message) {
            continue;
        }
        message.answers.sort(
            (a, b) => a.name.localeCompare(b.name) || sortKey(a.value).localeCompare(sortKey(b.value)),
        );
        message.additionalRecords.sort(
            (a, b) => a.name.localeCompare(b.name) || sortKey(a.value).localeCompare(sortKey(b.value)),
        );

        message.additionalRecords.forEach(r => {
            if (r.recordType === DnsRecordType.TXT && Array.isArray(r.value)) {
                // Fixtures may declare value as string[]; normalize to Bytes[] then sort by hex (lossless on binary).
                r.value = (r.value as (Uint8Array | string)[])
                    .map(b => (typeof b === "string" ? Bytes.fromString(b) : b))
                    .sort((a, b) => Bytes.toHex(a).localeCompare(Bytes.toHex(b)));
            }
        });
    }

    expect(actual).deep.equals(expected);
}

function sortKey(value: unknown): string {
    if (Array.isArray(value)) {
        return (value as (Uint8Array | string)[])
            .map(entry => Bytes.toHex(typeof entry === "string" ? Bytes.fromString(entry) : entry))
            .join(",");
    }
    if (typeof value === "string") {
        return value;
    }
    return String(value);
}
