/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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
    MdnsSocket,
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

                // Ensure no queries sent
                expect(messages.findIndex(m => m?.messageType === DnsMessageType.Query)).equals(-1);

                expect(result?.addresses).deep.equal(IPIntegrationResultsPort1);

                // Same result when we just get the records
                expect(client.getDiscoveredOperationalDevice(FABRIC, NODE_ID)?.addresses).deep.equal(
                    IPIntegrationResultsPort1,
                );

                // And expire the announcement
                await close();

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

                expectMessage(DnsCodec.decode(sentData[0]), {
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
                const messages = waitForMessages({ count: 2 });

                await serve(COMMISSIONABLE_SERVICE, PORT);
                await serve(OPERATIONAL_SERVICE, PORT2);

                const findPromise = client.findOperationalDevice(FABRIC, NODE_ID);

                const [query, response] = await MockTime.resolve(messages);

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

                expectMessage(DnsCodec.decode(sentData[0]), {
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

        describe("Operational and commissionable discovery", () => {
            const criteria: MdnsScannerTargetCriteria = {
                commissionable: true,
                operationalTargets: [{ fabricId: GLOBAL_ID }],
            };
            beforeEach(() => client.targetCriteriaProviders.add(criteria));
            afterEach(() => client.targetCriteriaProviders.delete(criteria));

            it("the client knows announced records if scanning is enabled by criteria", async () => {
                const messages = waitForMessages({ count: 2 });
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

                // Ensure no queries sent
                expect(messages.findIndex(m => m?.messageType === DnsMessageType.Query)).equals(-1);

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
