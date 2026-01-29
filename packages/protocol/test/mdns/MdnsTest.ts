/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fabric } from "#fabric/Fabric.js";
import {
    Bytes,
    ConnectionlessTransport,
    DnsCodec,
    DnsMessage,
    DnsMessageType,
    DnsMessageTypeFlag,
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
    TxtRecord,
    UdpChannel,
} from "#general";
import {
    Advertisement,
    CommissioningMode,
    MdnsAdvertiser,
    MdnsClient,
    MdnsScannerTargetCriteria,
    MdnsServer,
    ServiceDescription,
} from "#index.js";
import { GlobalFabricId, NodeId, VendorId } from "#types";

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
        let client: MdnsClient;
        let scanListener: UdpChannel;
        let broadcastListener: UdpChannel;
        let scannerManipulator: MockRouter.PacketManipulator | undefined;
        let broadcasterManipulator: MockRouter.PacketManipulator | undefined;

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
            client = new MdnsClient(clientSocket);

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
                packet => {
                    return scannerManipulator ? scannerManipulator(packet) : packet;
                },
            );
            (scanListener as any).foo = "scannerChannel";
            scanListener.addMembership(multicastIp);
            scannerManipulator = undefined; // Reset

            // Add an additional listener on the scanner to detect broadcaster announcements
            broadcastListener = new MockUdpChannel(
                clientNetwork,
                {
                    listeningPort: 5353,
                    listeningAddress: testIpv4Enabled ? CLIENT_IPv4 : CLIENT_IPv6,
                    type,
                },
                packet => {
                    return broadcasterManipulator ? broadcasterManipulator(packet) : packet;
                },
            );
            (broadcastListener as any).foo = "broadcasterChannel";
            broadcastListener.addMembership(multicastIp);
            broadcasterManipulator = undefined; // Reset
        });

        afterEach(async () => {
            await closeAll();
            await server.close();
            await client.close();
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

        async function serve(service: ServiceDescription, port = PORT) {
            const ad = getAdvertiser(port).getAdvertisement({ ...service, port });
            expect(ad).not.undefined;
        }

        async function close(port = PORT) {
            const advertiser = advertisers[port];
            expect(advertiser.advertisements.size).greaterThan(0);
            await MockTime.resolve(Advertisement.closeAll(advertiser.advertisements));
        }

        async function closeAll() {
            for (const port in advertisers) {
                await MockTime.resolve(advertisers[port].close());
                delete advertisers[port];
            }
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

        describe("Disabled discovery", () => {
            it("the client do not know announced records if scanning is not enabled by criteria", async () => {
                const collection = waitForMessages({ count: 2 });

                advertise(COMMISSIONABLE_SERVICE);
                advertise(OPERATIONAL_SERVICE, PORT2);

                await collection;

                // Same result when we just get the records
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)?.addresses).deep.equal(undefined);

                // No commissionable devices because never queried
                expect(client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 })).deep.equal([]);

                // And expire the announcement
                await closeAll();

                // And removed after expiry
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)).deep.equal(undefined);

                expect(client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 })).deep.equal([]);
            });
        });

        describe("Only commissionable discovery", () => {
            const criteria: MdnsScannerTargetCriteria = {
                commissionable: true,
                operationalTargets: [],
            };
            beforeEach(() => client.targetCriteriaProviders.add(criteria));
            afterEach(() => client.targetCriteriaProviders.delete(criteria));

            it("the client do not know announced operational records if scanning is not enabled by criteria", async () => {
                const collection = waitForMessages({ count: 2 });

                advertise(COMMISSIONABLE_SERVICE);
                advertise(OPERATIONAL_SERVICE, PORT2);

                await collection;

                // Same result when we just get the records
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)?.addresses).deep.equal(undefined);

                // No commissionable devices because never queried
                expect(client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 })).deep.equal([
                    {
                        CM: 1,
                        D: 1234,
                        DN: "Test Device",
                        DT: 1,
                        P: 32768,
                        PH: 33,
                        SAI: 300,
                        SD: 4,
                        SII: 500,
                        SAT: 4000,
                        T: 0,
                        ICD: 0,
                        V: 1,
                        VP: "1+32768",
                        addresses: IPIntegrationResultsPort1,
                        deviceIdentifier: "8080808080808080",
                        discoveredAt: undefined,
                        ttl: undefined,
                        instanceId: "8080808080808080",
                    },
                ]);

                // And expire the announcement
                await closeAll();

                // And removed after expiry
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)).deep.equal(undefined);

                expect(client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 })).deep.equal([]);
            });

            describe("Multiple concurrent waiters for the same commissionable query", () => {
                it("two timed commissionable discoveries with different timeouts resolve in the correct order", async () => {
                    // Start two findCommissionableDevices calls with different timeouts
                    // Neither will find a device (not advertised), so they should timeout
                    const shortTimeout = Millis(500);
                    const longTimeout = Millis(1000);

                    const identifier = { longDiscriminator: 1234 };
                    const shortPromise = client.findCommissionableDevices(identifier, shortTimeout);
                    const longPromise = client.findCommissionableDevices(identifier, longTimeout);

                    const results: Array<{
                        which: string;
                        result: typeof shortPromise extends Promise<infer T> ? T : never;
                    }> = [];

                    // Track which promise resolves first
                    await Promise.allSettled([
                        shortPromise.then(result => results.push({ which: "short", result })),
                        longPromise.then(result => results.push({ which: "long", result })),
                    ]);

                    // Advance past the short timeout
                    await MockTime.advance(600);
                    await MockTime.yield3();

                    // Short timeout should have resolved first with empty array
                    expect(results.length).equals(1);
                    expect(results[0].which).equals("short");
                    expect(results[0].result).deep.equals([]);

                    // Advance past the long timeout
                    await MockTime.advance(500);
                    await MockTime.yield3();

                    // Long timeout should now also have resolved with empty array
                    expect(results.length).equals(2);
                    expect(results[1].which).equals("long");
                    expect(results[1].result).deep.equals([]);
                });

                it("two concurrent commissionable queries both resolve when a matching record is found", async () => {
                    // Start two findCommissionableDevices calls for the same identifier
                    const timeout = Seconds(10);
                    const identifier = { longDiscriminator: 1234 };

                    const promise1 = client.findCommissionableDevices(identifier, timeout);
                    const promise2 = client.findCommissionableDevices(identifier, timeout);

                    // Now advertise the device - both waiters should be notified
                    advertise(COMMISSIONABLE_SERVICE);

                    // Wait for the broadcast to be processed
                    const [result1, result2] = await MockTime.resolve(Promise.all([promise1, promise2]));

                    // Both should have found the device
                    expect(result1.length).equals(1);
                    expect(result1[0].deviceIdentifier).equals("8080808080808080");
                    expect(result1[0].addresses).deep.equal(IPIntegrationResultsPort1);

                    expect(result2.length).equals(1);
                    expect(result2[0].deviceIdentifier).equals("8080808080808080");
                    expect(result2[0].addresses).deep.equal(IPIntegrationResultsPort1);

                    // Cleanup
                    await closeAll();
                });
            });
        });

        describe("Operational discovery", () => {
            const criteria: MdnsScannerTargetCriteria = {
                commissionable: false,
                operationalTargets: [{ fabricId: GLOBAL_ID }],
            };
            beforeEach(() => client.targetCriteriaProviders.add(criteria));
            afterEach(() => client.targetCriteriaProviders.delete(criteria));

            it("the client directly returns server record if it has been announced before and records are removed on cancel", async () => {
                const collection = waitForMessages(Seconds(10));
                advertise(OPERATIONAL_SERVICE);

                const messages = await collection;

                const result = await client.findOperationalDevice(FABRIC, NODE_ID, Seconds.one);

                // Ensure no additional queries sent (only the initial PTR query from criteria add should exist)
                // findOperationalDevice should use cached data from the broadcast
                expect(
                    messages.filter(
                        m => m?.messageType === DnsMessageType.Query && m.queries[0]?.recordType === DnsRecordType.SRV,
                    ).length,
                ).equals(0);

                expect(result?.addresses).deep.equal(IPIntegrationResultsPort1);

                // Same result when we just get the records
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)?.addresses).deep.equal(
                    IPIntegrationResultsPort1,
                );

                // And expire the announcement
                await close();
                await MockTime.yield3();

                // And empty result after expiry
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)).deep.equal(undefined);
            });

            it("the client queries the server record if it has not been announced before", async () => {
                const sentData = new Array<Bytes>();
                const listener = scanListener.onData((_netInterface, _peerAddress, _peerPort, data) =>
                    sentData.push(data),
                );

                advertise(OPERATIONAL_SERVICE);

                const findPromise = client.findOperationalDevice(FABRIC, NODE_ID);

                await MockTime.resolve(findPromise);

                // Find the SRV query (not the initial PTR query from criteria add)
                const srvQueryData = sentData.find(data => {
                    const msg = DnsCodec.decode(data);
                    return msg?.queries[0]?.recordType === DnsRecordType.SRV;
                });
                expect(srvQueryData).not.undefined;
                expectMessage(DnsCodec.decode(srvQueryData!), {
                    additionalRecords: [],
                    answers: [],
                    authorities: [],
                    messageType: 0,
                    queries: [
                        {
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordClass: 1,
                            recordType: 33,
                            uniCastResponse: false,
                        },
                    ],
                    transactionId: 0,
                });

                const result = await findPromise;

                expect(result?.addresses).deep.equal(IPIntegrationResultsPort1);
                await listener.close();

                // Same result when we just get the records
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)?.addresses).deep.equal(
                    IPIntegrationResultsPort1,
                );

                // And expire the announcement
                await close();

                // And empty result after expiry
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)).deep.equal(undefined);
            });

            it("the client queries the server record and get correct response also with multiple announced instances", async () => {
                // Wait for 4 messages: 1 initial PTR query + 1 PTR response + 1 SRV query + 1 SRV response
                const messages = waitForMessages({ count: 4 });

                await serve(COMMISSIONABLE_SERVICE, PORT);
                await serve(OPERATIONAL_SERVICE, PORT2);

                const findPromise = client.findOperationalDevice(FABRIC, NODE_ID);

                const allMessages = await MockTime.resolve(messages);

                // Find the SRV query and SRV response (skip the initial PTR query/response)
                const query = allMessages.find(
                    m => m?.messageType === DnsMessageType.Query && m.queries[0]?.recordType === DnsRecordType.SRV,
                );
                // Find response that contains an SRV answer (not the PTR response from initial query)
                const response = allMessages.find(
                    m =>
                        DnsMessageType.isResponse(m?.messageType ?? 0) &&
                        m?.answers.some(a => a.recordType === DnsRecordType.SRV),
                );

                expectMessage(query, {
                    additionalRecords: [],
                    answers: [],
                    authorities: [],
                    messageType: 0,
                    queries: [
                        {
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordClass: 1,
                            recordType: 33,
                            uniCastResponse: false,
                        },
                    ],
                    transactionId: 0,
                });
                expectMessage(response, {
                    additionalRecords: [
                        {
                            flushCache: false,
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordClass: 1,
                            recordType: 16,
                            ttl: Seconds(120),
                            value: ["SII=500", "SAI=300", "SAT=4000"],
                        },
                        ...IPDnsRecords,
                    ],
                    answers: [
                        {
                            flushCache: false,
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordClass: 1,
                            recordType: 33,
                            ttl: Seconds(120),
                            value: { port: PORT2, priority: 0, target: "00B0D063C2260000.local", weight: 0 },
                        },
                    ],
                    authorities: [],
                    messageType: 0x8400,
                    queries: [],
                    transactionId: 0,
                });

                const result = await findPromise;

                expect(result?.addresses).deep.equal(IPIntegrationResultsPort2);

                // Same result when we just get the records
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)?.addresses).deep.equal(
                    IPIntegrationResultsPort2,
                );

                // No commissionable devices because never queried
                expect(client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 })).deep.equal([]);

                // And expire the announcement
                await closeAll();

                // And empty result after expiry
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)).deep.equal(undefined);
            });

            it("the client queries the server record and also accepts unauthoritative responses", async () => {
                const sentData = new Array<Bytes>();
                const listener = scanListener.onData((_netInterface, _peerAddress, _peerPort, data) =>
                    sentData.push(data),
                );
                let packetManipulated = false;
                scannerManipulator = (packet: MockRouter.Packet) => {
                    const message = DnsCodec.decode(packet.payload);
                    if (message) {
                        // If Authoritative response turn into unauthoritative answer
                        if (message.messageType === DnsMessageType.Response) {
                            message.messageType &= ~DnsMessageTypeFlag.AA;
                            packet.payload = DnsCodec.encode(message);
                            packetManipulated = true;
                        }
                    }
                    return packet;
                };

                advertise(OPERATIONAL_SERVICE);

                const findPromise = client.findOperationalDevice(FABRIC, NODE_ID);

                await MockTime.resolve(findPromise);

                expect(packetManipulated).to.equal(true);

                // Find the SRV query (not the initial PTR query from criteria add)
                const srvQueryData = sentData.find(data => {
                    const msg = DnsCodec.decode(data);
                    return msg?.queries[0]?.recordType === DnsRecordType.SRV;
                });
                expect(srvQueryData).not.undefined;
                expectMessage(DnsCodec.decode(srvQueryData!), {
                    additionalRecords: [],
                    answers: [],
                    authorities: [],
                    messageType: 0,
                    queries: [
                        {
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordClass: 1,
                            recordType: 33,
                            uniCastResponse: false,
                        },
                    ],
                    transactionId: 0,
                });

                const result = await findPromise;

                expect(result?.addresses).deep.equal(IPIntegrationResultsPort1);
                await listener.close();

                // Same result when we just get the records
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)?.addresses).deep.equal(
                    IPIntegrationResultsPort1,
                );

                // And expire the announcement
                await close();

                // And empty result after expiry
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)).deep.equal(undefined);
            });

            describe("Multiple concurrent waiters for the same query", () => {
                it("two timed discoveries with different timeouts resolve in the correct order", async () => {
                    // Start two findOperationalDevice calls with different timeouts
                    // Neither will find a device (not advertised), so they should timeout and return undefined
                    const shortTimeout = Millis(500);
                    const longTimeout = Millis(1000);

                    const shortPromise = client.findOperationalDevice(FABRIC, NODE_ID, shortTimeout);
                    const longPromise = client.findOperationalDevice(FABRIC, NODE_ID, longTimeout);

                    const results: Array<{
                        which: string;
                        result: typeof shortPromise extends Promise<infer T> ? T : never;
                    }> = [];

                    // Track which promise resolves first
                    await Promise.allSettled([
                        shortPromise.then(result => results.push({ which: "short", result })),
                        longPromise.then(result => results.push({ which: "long", result })),
                    ]);

                    // Advance past the short timeout
                    await MockTime.advance(600);
                    await MockTime.yield3();

                    // Short timeout should have resolved first with undefined
                    expect(results.length).equals(1);
                    expect(results[0].which).equals("short");
                    expect(results[0].result).equals(undefined);

                    // Advance past the long timeout
                    await MockTime.advance(500);
                    await MockTime.yield3();

                    // Long timeout should now also have resolved with undefined
                    expect(results.length).equals(2);
                    expect(results[1].which).equals("long");
                    expect(results[1].result).equals(undefined);
                });

                it("two concurrent queries both resolve when a matching record is found", async () => {
                    // Start two findOperationalDevice calls for the same device
                    const timeout = Seconds(10);

                    const promise1 = client.findOperationalDevice(FABRIC, NODE_ID, timeout);
                    const promise2 = client.findOperationalDevice(FABRIC, NODE_ID, timeout);

                    // Now advertise the device - both waiters should be notified
                    advertise(OPERATIONAL_SERVICE);

                    // Wait for the broadcast to be processed
                    const [result1, result2] = await MockTime.resolve(Promise.all([promise1, promise2]));

                    // Both should have found the device
                    expect(result1?.addresses).deep.equal(IPIntegrationResultsPort1);
                    expect(result2?.addresses).deep.equal(IPIntegrationResultsPort1);

                    // Cleanup
                    await close();
                });
            });
        });

        it("the client queries the server record with a truncated query", async () => {
            const sentData = new Array<Bytes>();
            const listener = scanListener.onData((_netInterface, _peerAddress, _peerPort, data) => {
                if (DnsMessageType.isResponse(DnsCodec.decode(data)?.messageType ?? DnsMessageType.Response)) return;
                if (sentData.some(d => Bytes.areEqual(d, data))) return; // Sort out duplicates
                sentData.push(data);
            });

            // Intercept the message to be sent and make it bigger to generate a truncated query
            const DUMMY_TRX_ID = 0x1234;
            MockTime.interceptOnce(
                MdnsSocket.prototype,
                "send",
                async res => res,
                args => {
                    const message = args[0];
                    if (message.messageType === DnsMessageType.Query) {
                        message.transactionId = DUMMY_TRX_ID;
                        message.answers = [];
                        for (let i = 0; i < 50; i++) {
                            message.answers.push(TxtRecord("a.b.c.d", [`A=${i}`]));
                        }
                    }
                    return args;
                },
            );

            advertise(OPERATIONAL_SERVICE);

            const findPromise = client.findOperationalDevice(FABRIC, NODE_ID);

            await MockTime.resolve(findPromise);

            const initialQuery = DnsCodec.decode(sentData[0]);
            expect(initialQuery?.transactionId).equal(DUMMY_TRX_ID);
            expect(initialQuery?.queries).deep.equal([
                {
                    name: "0000000000000018-0000000000000001._matter._tcp.local",
                    recordClass: 1,
                    recordType: 33,
                    uniCastResponse: false,
                },
            ]);
            expect(initialQuery?.answers.length).equal(48);
            expect(initialQuery?.messageType).equal(DnsMessageType.Query | DnsMessageTypeFlag.TC);

            const secondQuery = DnsCodec.decode(sentData[1]);
            expect(secondQuery?.messageType).equal(DnsMessageType.Query);
            expect(secondQuery?.transactionId).equal(DUMMY_TRX_ID);
            expect(secondQuery?.queries).deep.equal([]);
            expect(secondQuery?.answers.length).equal(2);

            const result = await findPromise;

            expect(result?.addresses).deep.equal(IPIntegrationResultsPort1);
            await listener.close();
            await close();
        });

        describe("Initial query on new operational targets", () => {
            function waitForQuery(): Promise<DnsMessage> {
                return new Promise((resolve, reject) => {
                    const listener = scanListener.onData((_netInterface, _peerAddress, _peerPort, data) => {
                        const message = DnsCodec.decode(data);
                        if (message && DnsMessageType.isQuery(message.messageType)) {
                            listener.close().then(
                                () => resolve(message),
                                err => reject(err as Error),
                            );
                        }
                    });
                });
            }

            it("sends initial PTR query when a new operational target is added", async () => {
                const queryPromise = waitForQuery();

                // Add criteria with operational target - should trigger initial query
                const criteria: MdnsScannerTargetCriteria = {
                    commissionable: false,
                    operationalTargets: [{ fabricId: GLOBAL_ID, nodeId: NODE_ID }],
                };

                client.targetCriteriaProviders.add(criteria);

                const query = await queryPromise;

                expect(query.messageType).equals(DnsMessageType.Query);
                expect(query.queries).deep.includes({
                    name: "0000000000000018-0000000000000001._matter._tcp.local",
                    recordClass: 1,
                    recordType: DnsRecordType.PTR,
                    uniCastResponse: false,
                });

                client.targetCriteriaProviders.delete(criteria);
            });

            it("sends initial PTR query for fabric-only target", async () => {
                const queryPromise = waitForQuery();

                // Add criteria with fabric-only operational target (no nodeId)
                const criteria: MdnsScannerTargetCriteria = {
                    commissionable: false,
                    operationalTargets: [{ fabricId: GLOBAL_ID }],
                };

                client.targetCriteriaProviders.add(criteria);

                const query = await queryPromise;

                expect(query.messageType).equals(DnsMessageType.Query);
                expect(query.queries).deep.includes({
                    name: "_I0000000000000018._sub._matter._tcp.local",
                    recordClass: 1,
                    recordType: DnsRecordType.PTR,
                    uniCastResponse: false,
                });

                client.targetCriteriaProviders.delete(criteria);
            });

            it("does not send initial query for already known targets", async () => {
                // First add a criteria to establish a known target
                const queryPromise1 = waitForQuery();

                const criteria1: MdnsScannerTargetCriteria = {
                    commissionable: false,
                    operationalTargets: [{ fabricId: GLOBAL_ID, nodeId: NODE_ID }],
                };

                client.targetCriteriaProviders.add(criteria1);
                await queryPromise1; // Wait for initial query

                // Now add same target again via different criteria - should NOT trigger new query
                let queryReceived = false;
                const listener = scanListener.onData((_netInterface, _peerAddress, _peerPort, data) => {
                    const message = DnsCodec.decode(data);
                    if (message && DnsMessageType.isQuery(message.messageType)) {
                        queryReceived = true;
                    }
                });

                const criteria2: MdnsScannerTargetCriteria = {
                    commissionable: false,
                    operationalTargets: [{ fabricId: GLOBAL_ID, nodeId: NODE_ID }],
                };

                client.targetCriteriaProviders.add(criteria2);

                // Wait a bit for any potential query
                await MockTime.resolve(Time.sleep("wait", Millis(10)));

                // No new queries should be sent for already known target
                expect(queryReceived).equals(false);

                await listener.close();
                client.targetCriteriaProviders.delete(criteria1);
                client.targetCriteriaProviders.delete(criteria2);
            });

            it("sends initial queries for multiple new targets in one message", async () => {
                const queryPromise = waitForQuery();

                const GLOBAL_ID_2 = GlobalFabricId(0x19);
                const NODE_ID_2 = NodeId(2);

                // Add criteria with multiple operational targets
                const criteria: MdnsScannerTargetCriteria = {
                    commissionable: false,
                    operationalTargets: [
                        { fabricId: GLOBAL_ID, nodeId: NODE_ID },
                        { fabricId: GLOBAL_ID_2, nodeId: NODE_ID_2 },
                    ],
                };

                client.targetCriteriaProviders.add(criteria);

                const query = await queryPromise;

                expect(query.messageType).equals(DnsMessageType.Query);
                expect(query.queries.length).equals(2);
                expect(query.queries).deep.includes({
                    name: "0000000000000018-0000000000000001._matter._tcp.local",
                    recordClass: 1,
                    recordType: DnsRecordType.PTR,
                    uniCastResponse: false,
                });
                expect(query.queries).deep.includes({
                    name: "0000000000000019-0000000000000002._matter._tcp.local",
                    recordClass: 1,
                    recordType: DnsRecordType.PTR,
                    uniCastResponse: false,
                });

                client.targetCriteriaProviders.delete(criteria);
            });
        });

        describe("Operational and commissionable discovery", () => {
            const criteria: MdnsScannerTargetCriteria = {
                commissionable: true,
                operationalTargets: [{ fabricId: GLOBAL_ID }],
            };
            beforeEach(() => client.targetCriteriaProviders.add(criteria));
            afterEach(() => client.targetCriteriaProviders.delete(criteria));

            it("the client knows announced records if scanning is enabled by criteria", async () => {
                // Wait for 3 messages: 1 initial PTR query (from criteria add) + 2 broadcast responses
                const messages = waitForMessages({ count: 3 });
                advertise(COMMISSIONABLE_SERVICE);
                advertise(OPERATIONAL_SERVICE, PORT2);

                await messages;

                // Same result when we just get the records
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)?.addresses).deep.equal(
                    IPIntegrationResultsPort2,
                );

                // No commissionable devices because never queried
                expect(client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 })).deep.equal([
                    {
                        CM: 1,
                        D: 1234,
                        DN: "Test Device",
                        DT: 1,
                        P: 32768,
                        PH: 33,
                        SAI: Millis(300),
                        SD: 4,
                        SII: Millis(500),
                        SAT: Seconds(4),
                        T: 0,
                        ICD: 0,
                        V: 1,
                        VP: "1+32768",
                        addresses: IPIntegrationResultsPort1,
                        deviceIdentifier: "8080808080808080",
                        discoveredAt: undefined,
                        ttl: undefined,
                        instanceId: "8080808080808080",
                    },
                ]);

                // And expire the announcement
                await closeAll();

                // And removed after expiry
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)).deep.equal(undefined);

                expect(client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 })).deep.equal([]);
            });

            it("the client queries the server record and get correct response when announced before", async () => {
                const collection = waitForMessages(Seconds(10));

                advertise(COMMISSIONABLE_SERVICE);
                advertise(OPERATIONAL_SERVICE, PORT2);

                const messages = await collection;

                const result = await client.findOperationalDevice(FABRIC, NODE_ID, Seconds(10));

                // Ensure no additional SRV queries sent (only the initial PTR query from criteria add should exist)
                // findOperationalDevice should use cached data from the broadcast
                expect(
                    messages.filter(
                        m => m?.messageType === DnsMessageType.Query && m.queries[0]?.recordType === DnsRecordType.SRV,
                    ).length,
                ).equals(0);

                expect(result?.addresses).deep.equal(IPIntegrationResultsPort2);

                // Same result when we just get the records
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)?.addresses).deep.equal(
                    IPIntegrationResultsPort2,
                );

                // Also commissionable devices known now
                expect(client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 })).deep.equal([
                    {
                        CM: 1,
                        D: 1234,
                        DN: "Test Device",
                        DT: 1,
                        P: 32768,
                        PH: 33,
                        SAI: Millis(300),
                        SD: 4,
                        SII: Millis(500),
                        SAT: Seconds(4),
                        T: 0,
                        ICD: 0,
                        V: 1,
                        VP: "1+32768",
                        addresses: IPIntegrationResultsPort1,
                        deviceIdentifier: "8080808080808080",
                        discoveredAt: undefined,
                        ttl: undefined,
                        instanceId: "8080808080808080",
                    },
                ]);

                // And expire the announcement
                await closeAll();

                // And removed after expiry
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)).deep.equal(undefined);

                expect(client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 })).deep.equal([]);
            });
        });

        describe("Goodbye protection against out-of-order packets", () => {
            const criteria: MdnsScannerTargetCriteria = {
                commissionable: true,
                operationalTargets: [{ fabricId: GLOBAL_ID }],
            };
            beforeEach(() => client.targetCriteriaProviders.add(criteria));
            afterEach(() => client.targetCriteriaProviders.delete(criteria));

            it("ignores goodbye (TTL=0) for operational device discovered within 1 second", async () => {
                // Wait for the initial announcement to be received
                const messages = waitForMessages({ count: 2 });
                advertise(OPERATIONAL_SERVICE);
                await messages;

                // Verify the device is discovered
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)?.addresses).deep.equal(
                    IPIntegrationResultsPort1,
                );

                // Send a goodbye message (TTL=0) immediately - simulating out-of-order packet
                await serverSocket.send(
                    {
                        messageType: DnsMessageType.Response,
                        answers: [
                            {
                                name: "0000000000000018-0000000000000001._matter._tcp.local",
                                recordType: DnsRecordType.TXT,
                                recordClass: 1,
                                ttl: Instant, // TTL=0
                                value: [],
                                flushCache: false,
                            },
                        ],
                    },
                    "fake0",
                );

                // Wait for the message to be processed
                await MockTime.resolve(Time.sleep("process", Millis(50)));

                // Device should still be there - goodbye was ignored due to protection window
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)?.addresses).deep.equal(
                    IPIntegrationResultsPort1,
                );

                await closeAll();
            });

            it("accepts goodbye (TTL=0) for operational device discovered more than 1 second ago", async () => {
                // Wait for an initial announcement to be received
                const messages = waitForMessages({ count: 2 });
                advertise(OPERATIONAL_SERVICE);
                await messages;

                // Verify device is discovered
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)?.addresses).deep.equal(
                    IPIntegrationResultsPort1,
                );

                // Wait more than 1 second (protection window)
                await MockTime.resolve(Time.sleep("wait", Millis(1100)));

                // Send a goodbye message (TTL=0) - now outside protection window
                await serverSocket.send(
                    {
                        messageType: DnsMessageType.Response,
                        answers: [
                            {
                                name: "0000000000000018-0000000000000001._matter._tcp.local",
                                recordType: DnsRecordType.TXT,
                                recordClass: 1,
                                ttl: Instant, // TTL=0
                                value: [],
                                flushCache: false,
                            },
                        ],
                    },
                    "fake0",
                );

                // Wait for the message to be processed
                await MockTime.resolve(Time.sleep("process", Millis(50)));
                await MockTime.yield3();

                // Device should be removed - goodbye was accepted
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)).deep.equal(undefined);

                await closeAll();
            });

            it("ignores goodbye (TTL=0) for commissionable device discovered within 1 second", async () => {
                // Wait for initial announcement to be received
                const messages = waitForMessages({ count: 2 });
                advertise(COMMISSIONABLE_SERVICE);
                await messages;

                // Verify device is discovered
                const devices = client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 });
                expect(devices.length).equals(1);
                expect(devices[0].deviceIdentifier).equals("8080808080808080");

                // Send a goodbye message (TTL=0) immediately - simulating out-of-order packet
                await serverSocket.send(
                    {
                        messageType: DnsMessageType.Response,
                        answers: [
                            {
                                name: "8080808080808080._matterc._udp.local",
                                recordType: DnsRecordType.TXT,
                                recordClass: 1,
                                ttl: Instant, // TTL=0
                                value: [],
                                flushCache: false,
                            },
                        ],
                    },
                    "fake0",
                );

                // Wait for message to be processed
                await MockTime.resolve(Time.sleep("process", Millis(50)));

                // Device should still be there - goodbye was ignored due to protection window
                const devicesAfter = client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 });
                expect(devicesAfter.length).equals(1);

                await closeAll();
            });

            it("accepts goodbye (TTL=0) for commissionable device discovered more than 1 second ago", async () => {
                // Wait for initial announcement to be received
                const messages = waitForMessages({ count: 2 });
                advertise(COMMISSIONABLE_SERVICE);
                await messages;

                // Verify device is discovered
                const devices = client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 });
                expect(devices.length).equals(1);

                // Wait more than 1 second (protection window)
                await MockTime.resolve(Time.sleep("wait", Millis(1100)));

                // Send a goodbye message (TTL=0) - now outside protection window
                await serverSocket.send(
                    {
                        messageType: DnsMessageType.Response,
                        answers: [
                            {
                                name: "8080808080808080._matterc._udp.local",
                                recordType: DnsRecordType.TXT,
                                recordClass: 1,
                                ttl: Instant, // TTL=0
                                value: [],
                                flushCache: false,
                            },
                        ],
                    },
                    "fake0",
                );

                // Wait for message to be processed
                await MockTime.resolve(Time.sleep("process", Millis(50)));

                // Device should be removed - goodbye was accepted
                const devicesAfter = client.getDiscoveredCommissionableDevices({ longDiscriminator: 1234 });
                expect(devicesAfter.length).equals(0);

                await closeAll();
            });

            it("ignores goodbye (TTL=0) for IP address discovered within 1 second", async () => {
                // Wait for initial announcement to be received
                const messages = waitForMessages({ count: 2 });
                advertise(OPERATIONAL_SERVICE);
                await messages;

                // Verify device is discovered with addresses
                const device = client.getDiscoveredOperationalDevice(FABRIC, NODE_ID);
                expect(device?.addresses.length).greaterThan(0);
                const initialAddressCount = device?.addresses.length ?? 0;

                // Send a goodbye for a specific IP address immediately
                await serverSocket.send(
                    {
                        messageType: DnsMessageType.Response,
                        answers: [
                            {
                                name: "00B0D063C2260000.local",
                                recordType: DnsRecordType.AAAA,
                                recordClass: 1,
                                ttl: Instant, // TTL=0
                                value: SERVER_IPv6,
                                flushCache: false,
                            },
                        ],
                    },
                    "fake0",
                );

                // Wait for message to be processed
                await MockTime.resolve(Time.sleep("process", Millis(50)));

                // IP address should still be there - goodbye was ignored due to protection window
                const deviceAfter = client.getDiscoveredOperationalDevice(FABRIC, NODE_ID);
                expect(deviceAfter?.addresses.length).equals(initialAddressCount);

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
        message.answers.sort((a, b) => a.name.localeCompare(b.name) || a.value.localeCompare(b.value));
        message.additionalRecords.sort(
            (a, b) => a.name.localeCompare(b.name) || a.value.toString().localeCompare(b.value),
        );

        message.additionalRecords.forEach(r => {
            if (r.recordType === DnsRecordType.TXT && Array.isArray(r.value)) {
                r.value.sort();
            }
        });
    }

    expect(actual).deep.equals(expected);
}
