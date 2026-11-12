/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperationalMdnsAdvertisement } from "#advertisement/mdns/OperationalMdnsAdvertisement.js";
import { Fabric } from "#fabric/Fabric.js";
import { TestFabric } from "#fabric/TestFabric.js";
import { Advertisement, CommissioningMode, MdnsAdvertiser, MdnsServer, ServiceDescription } from "#index.js";
import {
    Bytes,
    createPromise,
    DnsCodec,
    DnsMessage,
    DnsRecordClass,
    DnsMessageType,
    DnsRecordType,
    Duration,
    Instant,
    InternalError,
    MatterAggregateError,
    MAX_MDNS_MESSAGE_SIZE,
    MdnsSocket,
    Millis,
    MockCrypto,
    MockNetwork,
    MockRouter,
    MockUdpSocket,
    NetworkSimulator,
    Seconds,
    Time,
    Transport,
    UdpSocket,
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

// The expected qnames below spell this global ID; a real Fabric derives its ID from its root key
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
            flushCache: true,
            name: "00B0D063C2260000.local",
            recordType: 28,
            recordClass: 1,
            ttl: Seconds(120),
            value: "fe80::e777:4f5e:c61e:7314",
        },
    ];
    if (testIpv4Enabled && serverHasIpv4Addresses) {
        IPDnsRecords.push({
            flushCache: true,
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
        let scanListener: UdpSocket;
        let broadcastListener: UdpSocket;
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
            scanListener = new MockUdpSocket(
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
            broadcastListener = new MockUdpSocket(
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

        function getAdvertiser(port = PORT, omitPrivateDetails = false) {
            let advertiser = advertisers[port];
            if (advertiser === undefined) {
                advertiser = advertisers[port] = new MdnsAdvertiser(crypto, server, { port, omitPrivateDetails });
            } else {
                expect(advertiser.omitPrivateDetails).equals(omitPrivateDetails);
            }
            return advertiser;
        }

        function advertise(service: ServiceDescription, port = PORT, omitPrivateDetails = false) {
            const ad = getAdvertiser(port, omitPrivateDetails).advertise({ ...service, port }, "startup")!;
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
            #listener: Transport.Listener;

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

            it("broadcasts the device fabric on one port and expires", async () => {
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
                        {
                            flushCache: true,
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordType: 33,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: { priority: 0, weight: 0, port: PORT, target: "00B0D063C2260000.local" },
                        },
                        {
                            flushCache: true,
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordType: 16,
                            recordClass: 1,
                            ttl: Seconds(120),
                            value: ["SII=100", "SAI=200"],
                        },
                        ...IPDnsRecords,
                    ],
                    authorities: [],
                    additionalRecords: [],
                });

                const expiration = waitForMessage();

                // And expire the announcement
                await close();

                const expiryResult = await expiration;

                // Expiry is the announcement with ttl = 0; unique records keep the cache-flush bit (RFC 6762 §10.2)
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
                        {
                            flushCache: true,
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordType: 33,
                            recordClass: 1,
                            ttl: Instant,
                            value: { priority: 0, weight: 0, port: PORT, target: "00B0D063C2260000.local" },
                        },
                        {
                            flushCache: true,
                            name: "0000000000000018-0000000000000001._matter._tcp.local",
                            recordType: 16,
                            recordClass: 1,
                            ttl: Instant,
                            value: ["SII=100", "SAI=200"],
                        },
                        ...IPDnsRecords.map(record => ({ ...record, ttl: Instant })),
                    ],
                    authorities: [],
                    additionalRecords: [],
                });
            });

            it("broadcasts the device commissionable info on one port", async () => {
                const announcement = waitForMessage();

                advertise(COMMISSIONABLE_SERVICE);

                expectMessage(await announcement, {
                    additionalRecords: [],
                    answers: [
                        {
                            flushCache: true,
                            name: "8080808080808080._matterc._udp.local",
                            recordClass: 1,
                            recordType: 33,
                            ttl: Seconds(120),
                            value: { port: PORT, priority: 0, target: "00B0D063C2260000.local", weight: 0 },
                        },
                        {
                            flushCache: true,
                            name: "8080808080808080._matterc._udp.local",
                            recordClass: 1,
                            recordType: 16,
                            ttl: Seconds(120),
                            value: ["VP=1+32768", "DT=1", "DN=Test Device", "D=1234", "CM=1", "PH=33"],
                        },
                        ...IPDnsRecords,
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

            it("broadcasts the controller commissioner on one port", async () => {
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
                    additionalRecords: [],
                    answers: [
                        {
                            flushCache: true,
                            name: "8080808080808080._matterd._udp.local",
                            recordClass: 1,
                            recordType: 33,
                            ttl: Seconds(120),
                            value: { port: PORT, priority: 0, target: "00B0D063C2260000.local", weight: 0 },
                        },
                        {
                            flushCache: true,
                            name: "8080808080808080._matterd._udp.local",
                            recordClass: 1,
                            recordType: 16,
                            ttl: Seconds(120),
                            value: ["VP=1+32768", "DT=1", "DN=Test Commissioner"],
                        },
                        ...IPDnsRecords,
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
                            value: "8080808080808080._matterd._udp.local",
                        },
                        {
                            flushCache: false,
                            name: "_services._dns-sd._udp.local",
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

            it("omits vendor details from commissioner broadcasts when privacy masked", async () => {
                const announcement = waitForMessage();

                advertise(
                    ServiceDescription.Commissioner({
                        name: "Test Commissioner",
                        deviceType: 1,
                        vendorId: VendorId(1),
                        productId: 0x8000,
                    }),
                    PORT,
                    true,
                );

                expectMessage(await announcement, {
                    additionalRecords: [],
                    answers: [
                        {
                            flushCache: true,
                            name: "8080808080808080._matterd._udp.local",
                            recordClass: 1,
                            recordType: 33,
                            ttl: Seconds(120),
                            value: { port: PORT, priority: 0, target: "00B0D063C2260000.local", weight: 0 },
                        },
                        {
                            flushCache: true,
                            name: "8080808080808080._matterd._udp.local",
                            recordClass: 1,
                            recordType: 16,
                            ttl: Seconds(120),
                            value: ["DT=1", "DN=Test Commissioner"],
                        },
                        ...IPDnsRecords,
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

            it("announces devices that start together in one announcement with each shared record once", async () => {
                // One publication, split into two datagrams by size
                const announcement = waitForMessages({ count: 2 });

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

                const answers = (await announcement).flatMap(({ answers }) => answers);

                expect(
                    answers
                        .filter(({ recordType }) => recordType === DnsRecordType.SRV)
                        .map(({ value }) => value.port)
                        .sort(),
                ).deep.equals([PORT, PORT2, PORT3].sort());
                const addresses = answers.filter(
                    ({ recordType }) => recordType === DnsRecordType.A || recordType === DnsRecordType.AAAA,
                );
                expect(addresses).deep.equals(IPDnsRecords);
            });
        });
    });
});

describe("MDNS announcement overflow", () => {
    const crypto = MockCrypto();
    before(MockTime.enable);

    it("splits oversized announcements into multiple packets with all records in the answer section", async () => {
        // Enough AAAA records to push the announcement past MAX_MDNS_MESSAGE_SIZE
        const ULA_IPv6 = Array.from({ length: 16 }, (_, i) => `fd54:23a1:c6de:1::${i + 1}`);

        const simulator = new NetworkSimulator();
        const serverNetwork = new MockNetwork(simulator, SERVER_MAC, [...ULA_IPv6, SERVER_IPv4, SERVER_IPv6]);
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);

        const serverSocket = await MdnsSocket.create(serverNetwork, { netInterface: "fake0" });
        const server = new MdnsServer(serverSocket);
        const advertiser = new MdnsAdvertiser(crypto, server, { port: PORT });

        const listener = new MockUdpSocket(clientNetwork, {
            listeningPort: 5353,
            listeningAddress: CLIENT_IPv4,
            type: "udp4",
        });
        listener.addMembership("224.0.0.251");

        const messages = new Array<DnsMessage>();
        const packetSizes = new Array<number>();
        const { promise: received, resolver } = createPromise<void>();
        const dataListener = listener.onData((_intf, _peer, _port, data) => {
            const message = DnsCodec.decode(data);
            if (message === undefined) {
                throw new InternalError("DNS message decode failure");
            }
            messages.push(message);
            packetSizes.push(data.byteLength);

            const answers = messages.flatMap(m => m.answers);
            if (
                answers.some(({ recordType }) => recordType === DnsRecordType.A) &&
                answers.filter(({ recordType }) => recordType === DnsRecordType.AAAA).length === ULA_IPv6.length + 1
            ) {
                resolver();
            }
        });

        try {
            advertiser.advertise({ ...COMMISSIONABLE_SERVICE, port: PORT }, "startup");
            await MockTime.resolve(received);

            // The full record set exceeds one packet
            expect(messages.length).greaterThan(1);

            // Everything is delivered in the answer section (RFC 6762 §8.3)
            for (const message of messages) {
                expect(message.additionalRecords).deep.equals([]);
                expect(message.answers.length).greaterThan(0);
            }

            const answers = messages.flatMap(m => m.answers);

            // No packet exceeds the size limit
            for (const size of packetSizes) {
                expect(size).lessThanOrEqual(MAX_MDNS_MESSAGE_SIZE);
            }

            // All address records made it through, in SelectionPreference order: link-local, ULA, IPv4
            const addressValues = answers
                .filter(({ recordType }) => recordType === DnsRecordType.AAAA || recordType === DnsRecordType.A)
                .map(({ value }) => value);
            expect(addressValues).deep.equals([SERVER_IPv6, ...ULA_IPv6, SERVER_IPv4]);
        } finally {
            await dataListener.close();
            await MockTime.advance(1000);
            await MockTime.resolve(advertiser.close());
            await server.close();
            await serverSocket.close();
            await listener.close();
        }
    });
});

describe("MDNS goodbye of one advertisement among several", () => {
    before(MockTime.enable);

    const HOST = "00B0D063C2260000.local";
    const SERVICE_DISCOVERY = "_services._dns-sd._udp.local";

    let serverSocket: MdnsSocket;
    let server: MdnsServer;
    let listener: MockUdpSocket;
    let dataListener: Transport.Listener;
    let advertisers: MdnsAdvertiser[];
    let messages: DnsMessage[];
    let messageTimes: number[];

    beforeEach(async () => {
        const simulator = new NetworkSimulator();
        const serverNetwork = new MockNetwork(simulator, SERVER_MAC, [SERVER_IPv4, SERVER_IPv6]);
        const clientNetwork = new MockNetwork(simulator, CLIENT_MAC, [CLIENT_IPv4, CLIENT_IPv6]);
        serverSocket = await MdnsSocket.create(serverNetwork, { netInterface: "fake0" });
        server = new MdnsServer(serverSocket);
        advertisers = [
            new MdnsAdvertiser(MockCrypto(0x80), server, { port: PORT }),
            new MdnsAdvertiser(MockCrypto(0x81), server, { port: PORT2 }),
        ];

        listener = new MockUdpSocket(clientNetwork, {
            listeningPort: 5353,
            listeningAddress: CLIENT_IPv4,
            type: "udp4",
        });
        listener.addMembership("224.0.0.251");
        messages = new Array<DnsMessage>();
        messageTimes = new Array<number>();
        dataListener = listener.onData((_intf, _peer, _port, data) => {
            const message = DnsCodec.decode(data);
            if (message === undefined) {
                throw new InternalError("DNS message decode failure");
            }
            messages.push(message);
            messageTimes.push(Time.nowUs);
        });
    });

    afterEach(async () => {
        await dataListener.close();
        await MockTime.resolve(MatterAggregateError.allSettled(advertisers.map(advertiser => advertiser.close())));
        await server.close();
        await serverSocket.close();
        await listener.close();
    });

    async function advertise(service: ServiceDescription, advertiser = advertisers[0]) {
        const ad = advertiser.advertise({ ...service, port: advertiser.port }, "startup");
        if (ad === undefined) {
            throw new InternalError("Advertiser refused the service");
        }
        await MockTime.resolve(Time.sleep("first announcement", Seconds(2)));
        return ad;
    }

    async function goodbyeOf(ad: Advertisement) {
        messages.length = 0;
        await MockTime.resolve(ad.close());
        await MockTime.resolve(Time.sleep("goodbye delivery", Millis(500)));
        return messages
            .flatMap(({ answers }) => answers)
            .filter(({ ttl }) => ttl === 0)
            .map(({ name, recordType, value }) => {
                const target = typeof value === "string" ? value : recordType === DnsRecordType.SRV ? value.target : "";
                return `${DnsRecordType[recordType]} ${name} ${target}`.trim();
            });
    }

    function hostRecordsOf(goodbye: string[]) {
        return goodbye.filter(record => record.startsWith("A ") || record.startsWith("AAAA "));
    }

    it("keeps the host addresses when a commissionable advertisement ends and the operational one stays", async () => {
        await advertise(OPERATIONAL_SERVICE);
        const commissionable = await advertise(COMMISSIONABLE_SERVICE);

        const goodbye = await goodbyeOf(commissionable);

        expect(hostRecordsOf(goodbye)).deep.equals([]);
        expect(goodbye).includes(`PTR ${SERVICE_DISCOVERY} _matterc._udp.local`);
    });

    it("keeps the host addresses and the service type when one of two operational advertisements ends", async () => {
        await advertise(OPERATIONAL_SERVICE);
        const second = await advertise(ServiceDescription.Operational({ fabric: await TestFabric({ index: 2 }) }));

        const goodbye = await goodbyeOf(second);

        expect(hostRecordsOf(goodbye)).deep.equals([]);
        expect(goodbye).not.includes(`PTR ${SERVICE_DISCOVERY} _matter._tcp.local`);
        expect(goodbye.filter(record => record.startsWith("SRV "))).length(1);
    });

    it("keeps the shared service type pointers when one of two commissionable advertisements ends", async () => {
        await advertise(COMMISSIONABLE_SERVICE);
        const second = await advertise(COMMISSIONABLE_SERVICE, advertisers[1]);

        const goodbye = await goodbyeOf(second);

        expect(goodbye.filter(record => record.startsWith(`PTR ${SERVICE_DISCOVERY} `))).deep.equals([]);
        expect(hostRecordsOf(goodbye)).deep.equals([]);
        expect(goodbye.filter(record => record.startsWith("SRV "))).length(1);
    });

    it("says goodbye to the host addresses and the service type once the last advertisement ends", async () => {
        const operational = await advertise(OPERATIONAL_SERVICE);
        const commissionable = await advertise(COMMISSIONABLE_SERVICE);
        await goodbyeOf(commissionable);

        const goodbye = await goodbyeOf(operational);

        expect(hostRecordsOf(goodbye).sort()).deep.equals([`A ${HOST} ${SERVER_IPv4}`, `AAAA ${HOST} ${SERVER_IPv6}`]);
        expect(goodbye).includes(`PTR ${SERVICE_DISCOVERY} _matter._tcp.local`);
    });

    it("keeps answering for an advertisement that replaced one of the same service", async () => {
        const description = ServiceDescription.Operational({ fabric: FABRIC, port: PORT });
        const first = new OperationalMdnsAdvertisement(advertisers[0], description);
        await MockTime.resolve(Time.sleep("first registration", Millis(10)));
        const second = new OperationalMdnsAdvertisement(advertisers[0], description);
        await MockTime.resolve(Time.sleep("second registration", Millis(10)));
        await MockTime.resolve(server.broadcast());

        await MockTime.resolve(first.close());
        messages.length = 0;
        await listener.send(
            "224.0.0.251",
            5353,
            DnsCodec.encode({
                messageType: DnsMessageType.Query,
                queries: [{ name: second.qname, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.SRV }],
            }),
        );
        await MockTime.resolve(Time.sleep("answer delivery", Millis(1500)));

        const answers = messages
            .flatMap(({ answers }) => answers)
            .filter(({ recordType, ttl }) => recordType === DnsRecordType.SRV && ttl > 0);
        expect(answers.map(({ name }) => name)).deep.equals([second.qname]);
    });
    it("says goodbye to the vendor pointer when the commissioning window becomes privacy masked", async () => {
        await advertise(COMMISSIONABLE_SERVICE);
        // Announcements every 90 s at most keep the vendor pointer cached until the extended announcement at 15 min
        await MockTime.resolve(Time.sleep("until shortly before the extended announcement", Seconds(850)));
        messages.length = messageTimes.length = 0;

        await MockTime.resolve(Time.sleep("past the next broadcast", Seconds(150)));

        const switched = messages.findIndex(({ answers }) =>
            answers.some(({ name, ttl }) => name === "_V1._sub._matterc._udp.local" && ttl === 0),
        );
        expect(switched).least(0);
        expect(messages[switched].answers.some(({ recordType, ttl }) => recordType === DnsRecordType.SRV && ttl > 0))
            .true;
        // The publication may be split into datagrams by size; no record of it goes out again in the next 1.5 s
        const withinSecond = messages
            .filter((_, index) => messageTimes[index] - messageTimes[switched] < Millis(1500) && index >= switched)
            .flatMap(({ answers }) =>
                answers.map(({ name, recordType, value }) => `${recordType} ${name} ${JSON.stringify(value)}`),
            );
        expect(withinSecond.length).equals(new Set(withinSecond).size);
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

        [...message.answers, ...message.additionalRecords].forEach(r => {
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
