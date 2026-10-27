/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MdnsServer } from "#mdns/MdnsServer.js";
import {
    AAAARecord,
    ARecord,
    Time,
    InternalError,
    ImplementationError,
    ClosedError,
    Bytes,
    DnsCodec,
    DnsMessage,
    DnsMessageType,
    DnsMessageTypeFlag,
    DnsRecord,
    DnsRecordClass,
    DnsRecordType,
    Duration,
    LogDestination,
    Logger,
    LogLevel,
    MdnsSocket,
    Millis,
    Minutes,
    MockNetwork,
    Network,
    NetworkError,
    NetworkInterfaceDetails,
    NetworkSimulator,
    PtrRecord,
    Seconds,
    SrvRecord,
    TxtRecord,
    UdpMulticastServer,
    UdpSocketOptions,
} from "@matter/general";

const CLIENT_IPv4 = "192.168.200.2";
const CLIENT_MAC = "CA:FE:00:00:BE:EF";
const DUMMY_IP = "1.2.3.4";
const DUMMY_QNAME = "a.b.c.d";
const INTERFACE_NAME = "fake0";

describe("MdnsServer", () => {
    before(MockTime.enable);

    const clientIps = [CLIENT_IPv4];
    const simulator = new NetworkSimulator();
    const network: Network = new MockNetwork(simulator, CLIENT_MAC, clientIps);

    let send: (message: Bytes, remoteIp: string, netInterface: string) => void;
    let onResponse: (message: Bytes, netInterface?: string, unicastTarget?: string) => Promise<void>;
    const udpServerSimulator = {
        onMessage(listener: (message: Bytes, remoteIp: string, netInterface: string) => void) {
            send = listener;
        },

        async send(
            message: Bytes,
            netInterface?: string,
            unicastTarget?: string,
        ): Promise<UdpMulticastServer.Reach | undefined> {
            await onResponse(message, netInterface, unicastTarget);
            return netInterface === undefined ? undefined : { kind: "all" };
        },

        async close() {},

        get network() {
            return network;
        },
    } as UdpMulticastServer;

    let mdnsServer: MdnsServer;

    /**
     * Let {@link duration} pass in 5 ms steps while the server's pending work runs, so timers fire on time and the
     * sends they start complete; for asserting what was or was not sent by then.
     */
    function waitFor(duration: Duration) {
        return MockTime.resolve(Time.sleep("test window", duration), { stepMs: 5 });
    }

    let fooRegistration: MdnsServer.Registration;

    beforeEach(async () => {
        await MockTime.advance(130_000); // More then 2 minutes in the future for the difference calculation vs 120s ttl
        const socket = new MdnsSocket(udpServerSimulator);
        mdnsServer = new MdnsServer(socket);

        fooRegistration = await mdnsServer.register("foo", () => [
            PtrRecord(DUMMY_QNAME, "abcd"),
            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
            ARecord("abcd.local", DUMMY_IP),
        ]);
    });

    afterEach(async () => {
        await mdnsServer.close();
    });

    describe("Server responds to standard queries for different types", () => {
        it(`server responds to an ANY query with different Query messageTypes (Query)`, async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [
                            PtrRecord(DUMMY_QNAME, "abcd"),
                            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                        ],
                        additionalRecords: [ARecord("abcd.local", DUMMY_IP)],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);
        });

        it(`server responds to an ANY query with different Query messageTypes (Truncated Query)`, async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query | DnsMessageTypeFlag.TC,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            expect(responses.length).equals(0); // Not yet there
            await MockTime.advance(500);

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [
                            PtrRecord(DUMMY_QNAME, "abcd"),
                            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                        ],
                        additionalRecords: [ARecord("abcd.local", DUMMY_IP)],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);
        });

        it("server responds to an PTR query", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.PTR,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [PtrRecord(DUMMY_QNAME, "abcd")],
                        additionalRecords: [
                            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                            ARecord("abcd.local", DUMMY_IP),
                        ],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);
        });

        it("server responds to an SRV query", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.SRV,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" })],
                        additionalRecords: [TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]), ARecord("abcd.local", DUMMY_IP)],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);
        });

        it("server responds to an A query with A record only", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: "abcd.local",
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.A,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [ARecord("abcd.local", DUMMY_IP)],
                        additionalRecords: [],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);
        });
    });

    describe("Cache-flush bit", () => {
        const DUMMY_SRV = SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" });
        const flushed = (record: DnsRecord<any>) => ({ ...record, flushCache: true });

        function collectResponses() {
            const responses = new Array<DnsMessage | undefined>();
            onResponse = async (message: Bytes) => {
                responses.push(DnsCodec.decode(message));
            };
            return responses;
        }

        it("suppresses a record the querier knows even though we flag it cache-flush", async () => {
            await mdnsServer.register("foo", () => [PtrRecord(DUMMY_QNAME, "abcd"), flushed(DUMMY_SRV)]);
            const responses = collectResponses();

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: DUMMY_QNAME, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.ANY }],
                    answers: [DUMMY_SRV],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Millis(1));

            expect(responses.flatMap(message => message?.answers ?? [])).deep.equals([PtrRecord(DUMMY_QNAME, "abcd")]);
        });

        it("suppresses only while more than half the known answer's lifetime remains", async () => {
            for (const [remaining, expectSuppressed] of [
                [Seconds(61), true],
                [Seconds(60), false],
                [Seconds(59), false],
            ] as const) {
                await mdnsServer.register("foo", () => [PtrRecord(DUMMY_QNAME, "abcd"), flushed(DUMMY_SRV)]);
                const responses = collectResponses();

                send(
                    DnsCodec.encode({
                        messageType: DnsMessageType.Query,
                        queries: [{ name: DUMMY_QNAME, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.ANY }],
                        answers: [
                            SrvRecord(
                                DUMMY_QNAME,
                                { priority: 0, weight: 0, port: 1234, target: "abcd.local" },
                                remaining,
                            ),
                        ],
                    }),
                    DUMMY_IP,
                    INTERFACE_NAME,
                );
                await waitFor(Millis(1));

                const sentSrv = responses
                    .flatMap(message => message?.answers ?? [])
                    .some(record => record.recordType === DnsRecordType.SRV);
                expect(sentSrv).equals(!expectSuppressed);
                await MockTime.advance(130_000);
            }
        });

        it("drops the bit on an additional record whose set a known answer pruned", async () => {
            const first = ARecord("abcd.local", DUMMY_IP);
            const second = ARecord("abcd.local", "5.6.7.8");
            await mdnsServer.register("foo", () => [PtrRecord(DUMMY_QNAME, "abcd"), flushed(first), flushed(second)]);
            const responses = collectResponses();

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: DUMMY_QNAME, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.ANY }],
                    answers: [first],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Millis(1));

            expect(responses.flatMap(message => message?.additionalRecords ?? [])).deep.equals([second]);
        });

        it("omits the bit from a unicast response", async () => {
            await mdnsServer.register("foo", () => [PtrRecord(DUMMY_QNAME, "abcd"), flushed(DUMMY_SRV)]);

            // A unicast request is answered by multicast unless the records went out as multicast recently, so
            // establish that first
            onResponse = async () => {};
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: DUMMY_QNAME, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.ANY }],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Millis(1));
            await MockTime.advance(1000);

            const responses = collectResponses();
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                            uniCastResponse: true,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Millis(1));

            const sent = responses.flatMap(message => message?.answers ?? []);
            expect(sent.length).greaterThan(0);
            expect(sent.some(record => record.flushCache)).false;
        });

        it("drops the bit when a known answer leaves the record set incomplete", async () => {
            const first = ARecord("abcd.local", DUMMY_IP);
            const second = ARecord("abcd.local", "5.6.7.8");
            await mdnsServer.register("foo", () => [flushed(first), flushed(second)]);
            const responses = collectResponses();

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: "abcd.local", recordClass: DnsRecordClass.IN, recordType: DnsRecordType.A }],
                    answers: [first],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Millis(1));

            expect(responses.flatMap(message => message?.answers ?? [])).deep.equals([second]);
        });

        it("keeps the bit when the whole record set is sent", async () => {
            const first = ARecord("abcd.local", DUMMY_IP);
            const second = ARecord("abcd.local", "5.6.7.8");
            await mdnsServer.register("foo", () => [flushed(first), flushed(second)]);
            const responses = collectResponses();

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: "abcd.local", recordClass: DnsRecordClass.IN, recordType: DnsRecordType.A }],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Millis(1));

            expect(responses.flatMap(message => message?.answers ?? [])).deep.equals([flushed(first), flushed(second)]);
        });
    });

    describe("Answer suppression", () => {
        it("suppress one answers in an ANY query", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                    answers: [PtrRecord(DUMMY_QNAME, "abcd")],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [
                            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                        ],
                        additionalRecords: [ARecord("abcd.local", DUMMY_IP)],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);
        });

        it("suppress some answers in an ANY query", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                    answers: [TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]), PtrRecord(DUMMY_QNAME, "abcd")],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" })],
                        additionalRecords: [ARecord("abcd.local", DUMMY_IP)],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);
        });

        it("suppress full answer in an ANY query", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                    answers: [
                        TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                        PtrRecord(DUMMY_QNAME, "abcd"),
                        SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                        ARecord("abcd.local", DUMMY_IP),
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            expect(responses).deep.equal([]);
        });

        it("suppress full answer in an A query", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: "abcd.local",
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.A,
                        },
                    ],
                    answers: [ARecord("abcd.local", DUMMY_IP)],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            expect(responses).deep.equal([]);
        });
    });

    describe("Handle duplicate messages", () => {
        it("server does not answer the same ANY query again when it arrives in the tick of the answer", async () => {
            const query = DnsCodec.encode({
                messageType: DnsMessageType.Query,
                queries: [{ name: DUMMY_QNAME, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.ANY }],
            });
            const responses = new Array<DnsMessage | undefined>();
            onResponse = async (message: Bytes) => {
                responses.push(DnsCodec.decode(message));
                if (responses.length === 1) {
                    // The repeated query arrives after the answer left, in the same tick
                    send(query, DUMMY_IP, INTERFACE_NAME);
                }
            };

            send(query, DUMMY_IP, INTERFACE_NAME);
            await waitFor(Seconds(2));

            expect(responses).length(1);
        });
        it("server answers the same ANY query within a second once the second has passed", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [
                            PtrRecord(DUMMY_QNAME, "abcd"),
                            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                        ],
                        additionalRecords: [ARecord("abcd.local", DUMMY_IP)],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);

            const firstResponse = [...responses];
            responses.length = 0;
            await MockTime.advance(500);

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Millis(400));
            expect(responses).deep.equal([]);

            await waitFor(Millis(200));
            expect(responses).deep.equal(firstResponse);
        });

        it("server do not suppress response from same ANY query when > 1s delay", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            const EXPEECTED_RESPONSE = [
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [
                            PtrRecord(DUMMY_QNAME, "abcd"),
                            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                        ],
                        additionalRecords: [ARecord("abcd.local", DUMMY_IP)],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ];

            await waitFor(Millis(1));

            expect(responses).deep.equal(EXPEECTED_RESPONSE);

            responses.length = 0;
            await MockTime.advance(1001);

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            expect(responses).deep.equal(EXPEECTED_RESPONSE);
        });

        it("server does not answer a different query for the same records in the tick of the answer", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [
                            PtrRecord(DUMMY_QNAME, "abcd"),
                            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                        ],
                        additionalRecords: [ARecord("abcd.local", DUMMY_IP)],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);

            responses.length = 0;

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.A,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Seconds(2));

            expect(responses).deep.equal([]);
        });

        it("server defers an additional record multicast less than a second ago", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: "abcd.local",
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.A,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [ARecord("abcd.local", DUMMY_IP)],
                        additionalRecords: [],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);

            responses.length = 0;

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [
                            PtrRecord(DUMMY_QNAME, "abcd"),
                            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                        ],
                        additionalRecords: [],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);

            await waitFor(Seconds(1));
            expect(responses.map(({ message }) => message?.answers)).deep.equal([
                responses[0].message?.answers,
                [ARecord("abcd.local", DUMMY_IP)],
            ]);
        });
    });

    describe("Server responds as unicast (if allowed)", () => {
        const QUERY = {
            messageType: DnsMessageType.Query,
            queries: [
                {
                    name: DUMMY_QNAME,
                    recordClass: DnsRecordClass.IN,
                    recordType: DnsRecordType.ANY,
                    uniCastResponse: true,
                },
            ],
        };

        const RESPONSE = {
            message: {
                transactionId: 0,
                messageType: DnsMessageType.Response,
                answers: [
                    PtrRecord(DUMMY_QNAME, "abcd"),
                    SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                    TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                ],
                additionalRecords: [ARecord("abcd.local", DUMMY_IP)],
                authorities: [],
                queries: [],
            },
            netInterface: INTERFACE_NAME,
        };

        it("server responds to an ANY query as multicast if requested via unicast but records were never sent before", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await waitFor(Millis(1));

            expect(responses).deep.equal([{ ...RESPONSE, uniCastTarget: undefined }]); // multicast
        });

        it("server responds to an ANY query as multicast when unicast is requested after a previous unicast query with less than 1/4 of TTL remaining", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await waitFor(Millis(1));
            await MockTime.advance(29_000); // less than 1/4 of ttl

            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await waitFor(Millis(1));

            expect(responses).deep.equal([
                { ...RESPONSE, uniCastTarget: undefined }, // multicast
                { ...RESPONSE, uniCastTarget: DUMMY_IP }, // unicast
            ]);
        });

        it("server responds to an ANY query as multicast even if requested as unicast and after a multicast query with more than 1/4 of ttl but never sent as multicast", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await waitFor(Millis(1));
            await MockTime.advance(31_000); // more than 1/4 of ttl

            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await waitFor(Millis(1));

            expect(responses).deep.equal([
                { ...RESPONSE, uniCastTarget: undefined }, // multicast
                { ...RESPONSE, uniCastTarget: undefined }, // multicast
            ]);
        });

        it("server responds to an ANY query as multicast even if requested as unicast and after a multicast query with more than 1/4 of ttl when earlier sent as multicast", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            let respond = () => {};
            let responded = new Promise<void>(resolve => (respond = resolve));
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
                if (responses.length >= 2) {
                    respond();
                }
            };

            // Send as multicast once
            QUERY.queries[0].uniCastResponse = false;
            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await waitFor(Millis(1));
            await MockTime.advance(20_000); // more than 1/4 of ttl

            // Send as unicast
            QUERY.queries[0].uniCastResponse = true;
            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await MockTime.resolve(responded);
            responded = new Promise<void>(resolve => (respond = resolve));
            await MockTime.advance(11_000); // more than 1/4 of ttl

            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await MockTime.resolve(responded);

            expect(responses).deep.equal([
                { ...RESPONSE, uniCastTarget: undefined }, // multicast
                { ...RESPONSE, uniCastTarget: DUMMY_IP }, // unicast
                { ...RESPONSE, uniCastTarget: undefined }, // multicast
            ]);
        });
    });

    describe("Server splits response into multiple packets when answer gets too big", () => {
        it("include as many answers as possible and spill remaining additionalRecords into a follow-up packet", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            const recordsRequest: DnsRecord<any>[] = [];
            const recordsAnswers: DnsRecord<any>[] = [];
            const recordsAdditional: DnsRecord<any>[] = [];
            for (let i = 0; i < 12; i++) {
                recordsRequest.push(PtrRecord(DUMMY_QNAME, `abcd${i + 10}`));
                recordsRequest.push(
                    SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234 + i, target: "abcd.local" }),
                );
                recordsRequest.push(TxtRecord(DUMMY_QNAME, [`A=${i + 10}`, `B=2`]));
                recordsRequest.push(ARecord("abcd.local", `1.2.3.${i + 10}`));

                recordsAnswers.push(PtrRecord(DUMMY_QNAME, `abcd${i + 10}`));
                recordsAnswers.push(
                    SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234 + i, target: "abcd.local" }),
                );
                recordsAnswers.push(TxtRecord(DUMMY_QNAME, [`A=${i + 10}`, `B=2`]));

                recordsAdditional.push(ARecord("abcd.local", `1.2.3.${i + 10}`));
            }

            await mdnsServer.register("foo", () => recordsRequest);

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            // Bounded so a regression fails at the assertion instead of starving the macrotask queue
            for (let i = 0; responses.length !== 2 && i < 100; i++) {
                await MockTime.yield();
            }

            expect(responses).length(2);
            expect(responses[0].message?.answers).deep.equal(recordsAnswers);
            expect(responses[1].message?.answers).deep.equal([]);
            expect(responses.flatMap(({ message }) => message?.additionalRecords ?? [])).deep.equal(recordsAdditional);
            expect(responses[1].message?.additionalRecords.length).above(0);
        });

        it("split answers into multiple responses and add additional records in last one", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            const recordsRequest: DnsRecord<any>[] = [];
            const recordsAnswers: DnsRecord<any>[] = [];
            const recordsAdditional: DnsRecord<any>[] = [];
            for (let i = 0; i < 16; i++) {
                recordsRequest.push(PtrRecord(DUMMY_QNAME, `abcd${i + 10}`));
                recordsRequest.push(
                    SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234 + i, target: "abcd.local" }),
                );
                recordsRequest.push(TxtRecord(DUMMY_QNAME, [`A=${i + 10}`, `B=2`]));
                recordsRequest.push(ARecord("abcd.local", `1.2.3.${i + 10}`));

                recordsAnswers.push(PtrRecord(DUMMY_QNAME, `abcd${i + 10}`));
                recordsAnswers.push(
                    SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234 + i, target: "abcd.local" }),
                );
                recordsAnswers.push(TxtRecord(DUMMY_QNAME, [`A=${i + 10}`, `B=2`]));

                recordsAdditional.push(ARecord("abcd.local", `1.2.3.${i + 10}`));
            }

            await mdnsServer.register("foo", () => recordsRequest);

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            // Bounded so a regression fails at the assertion instead of starving the macrotask queue
            for (let i = 0; responses.length !== 2 && i < 100; i++) {
                await MockTime.yield();
            }

            expect(responses).length(2);
            expect(responses.flatMap(({ message }) => message?.answers ?? [])).deep.equal(recordsAnswers);
            expect(responses[0].message?.additionalRecords).deep.equal([]);
            expect(responses[1].message?.additionalRecords).deep.equal(recordsAdditional);
        });
    });

    describe("Repeated question (RFC 6762 §6)", () => {
        it("does not answer a repeated question that arrives in the tick of the answer", async () => {
            const query = DnsCodec.encode({
                messageType: DnsMessageType.Query,
                queries: [{ name: DUMMY_QNAME, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.PTR }],
            });
            const responses = new Array<DnsMessage | undefined>();
            onResponse = async (message: Bytes) => {
                responses.push(DnsCodec.decode(message));
                if (responses.length === 1) {
                    // The repeated query arrives after the answer left, in the same tick
                    send(query, DUMMY_IP, INTERFACE_NAME);
                }
            };

            send(query, DUMMY_IP, INTERFACE_NAME);
            await waitFor(Seconds(2));

            expect(responses).length(1);
        });
        it("answers a repeated question at once a second after the answer", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            // First query
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.PTR,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));
            expect(responses.length).equals(1);

            responses.length = 0;

            await MockTime.advance(1001);

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.PTR,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));
            expect(responses.length).equals(1);
        });
    });

    describe("Unknown-name query rejection", () => {
        it("does not respond to queries for names we do not serve", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: "_googlecast._tcp.local",
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.PTR,
                        },
                        {
                            name: "_airplay._tcp.local",
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));
            expect(responses.length).equals(0);
        });

        it("responds to A-record host name even though it differs from the service qname", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: "abcd.local",
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.A,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));
            expect(responses.length).equals(1);
        });

        it("still responds when a known-name query is mixed with unknown-name queries", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: "_googlecast._tcp.local",
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.PTR,
                        },
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));
            expect(responses.length).equals(1);
        });

        it("matches uppercase query names against lowercase records (RFC 6762 §16)", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME.toUpperCase(),
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));
            expect(responses.length).equals(1);
        });

        it("lets zero-query continuation packets merge known-answers into a cached TC fragment", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query | DnsMessageTypeFlag.TC,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Millis(1));
            expect(responses.length).equals(0);

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [],
                    answers: [PtrRecord(DUMMY_QNAME, "abcd")],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Millis(1));

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [
                            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                        ],
                        additionalRecords: [ARecord("abcd.local", DUMMY_IP)],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);
        });

        it("picks up new names after the records generator is replaced", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            const newQname = "other.service.local";
            await mdnsServer.register("foo", () => [
                PtrRecord(newQname, "efgh"),
                SrvRecord(newQname, { priority: 0, weight: 0, port: 5678, target: "efgh.local" }),
            ]);

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: newQname,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));
            expect(responses.length).equals(1);

            // Old name was truly replaced - no response for the previous qname.
            responses.length = 0;
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Millis(1));
            expect(responses.length).equals(0);
        });

        it("merges known-answers from a TC continuation that carries unrelated queries", async () => {
            // Packet 1 carries our query with TC=1; packet 2 continues with an unrelated query
            // plus a known-answer record for our PTR. The fast-reject path must evaluate the
            // merged query set so packet 2 is not dropped before the known-answer is merged in.
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query | DnsMessageTypeFlag.TC,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Millis(1));
            expect(responses.length).equals(0);

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: "_googlecast._tcp.local",
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.PTR,
                        },
                    ],
                    answers: [PtrRecord(DUMMY_QNAME, "abcd")],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );
            await waitFor(Millis(1));

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [
                            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                        ],
                        additionalRecords: [ARecord("abcd.local", DUMMY_IP)],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);
        });

        it("suppresses known-answer records supplied with a different case (RFC 6762 §16)", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        {
                            name: DUMMY_QNAME,
                            recordClass: DnsRecordClass.IN,
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                    answers: [PtrRecord(DUMMY_QNAME.toUpperCase(), "abcd")],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            await waitFor(Millis(1));

            // PTR must still be suppressed despite case-mismatch in the known-answer record.
            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: [
                            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
                        ],
                        additionalRecords: [ARecord("abcd.local", DUMMY_IP)],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);
        });
    });

    describe("Goodbye", () => {
        const HOST = "abcd.local";
        const HOST_GOODBYE = { ...ARecord(HOST, DUMMY_IP), ttl: 0, flushCache: true };
        const FULL_TTL = Seconds(120);
        const WINDOW_QNAME = "window.b.c.d";
        const NEXT_WINDOW_QNAME = "next-window.b.c.d";

        function serviceRecords(qname: string) {
            return [
                PtrRecord(DUMMY_QNAME, qname),
                SrvRecord(qname, { priority: 0, weight: 0, port: 1234, target: HOST }, FULL_TTL),
                ARecord(HOST, DUMMY_IP, FULL_TTL),
            ];
        }

        let sent: DnsMessage[];
        let targets: Array<string | undefined>;
        let registrations: Map<string, MdnsServer.Registration>;
        let failSend: ((message: DnsMessage) => boolean) | undefined;
        let afterSend: ((message: DnsMessage) => void) | undefined;
        let hold: { matches(message: DnsMessage): boolean; started(): void; released: Promise<void> } | undefined;
        let waiters: Array<{ count: number; resolve(): void }>;
        let levels: LogLevel[];

        async function register(service: string, generator: MdnsServer.RecordGenerator) {
            registrations.set(service, await mdnsServer.register(service, generator));
        }

        function withdraw(...services: string[]) {
            return Promise.all(services.map(service => registrations.get(service)?.withdraw()));
        }

        /** Resolves once {@link count} packets were sent since {@link sent} was last emptied. */
        function sentAtLeast(count: number) {
            if (sent.length >= count) {
                return Promise.resolve();
            }
            return new Promise<void>(resolve => waiters.push({ count, resolve }));
        }

        /** Hold the first packet that {@link matches} in the socket until released. */
        function holdSend(matches: (message: DnsMessage) => boolean) {
            let release = () => {};
            const released = new Promise<void>(resolve => (release = resolve));
            let start = () => {};
            const started = new Promise<void>(resolve => (start = resolve));
            hold = { matches, started: () => start(), released };
            return { started, release: () => release() };
        }

        beforeEach(async () => {
            sent = new Array<DnsMessage>();
            targets = new Array<string | undefined>();
            registrations = new Map();
            failSend = afterSend = hold = undefined;
            waiters = [];
            onResponse = async (message, _netInterface, unicastTarget) => {
                const decoded = DnsCodec.decode(message)!;
                if (failSend?.(decoded)) {
                    throw new NetworkError("Send failed");
                }
                sent.push(decoded);
                targets.push(unicastTarget);
                for (const waiter of waiters.filter(({ count }) => sent.length >= count)) {
                    waiters.splice(waiters.indexOf(waiter), 1);
                    waiter.resolve();
                }
                afterSend?.(decoded);
                if (hold?.matches(decoded)) {
                    const { started, released } = hold;
                    hold = undefined;
                    started();
                    await released;
                }
            };
            levels = new Array<LogLevel>();
            Logger.destinations.capture = LogDestination({
                add(message) {
                    if (message.facility === "MdnsServer" || message.facility === "MdnsListener") {
                        levels.push(message.level);
                    }
                },
            });
            await register("foo", () => serviceRecords("operational.b.c.d"));
            await register("window", () => serviceRecords(WINDOW_QNAME));
            await MockTime.resolve(mdnsServer.broadcast());
            // RFC 6762 §6: let the announced records become eligible for multicast answers again
            await MockTime.advance(Seconds(1));
            sent.length = targets.length = 0;
        });

        afterEach(() => {
            delete Logger.destinations.capture;
        });

        function goodbyeRecords() {
            return sent.flatMap(({ answers }) => answers.filter(({ ttl }) => ttl === 0));
        }

        function isHostRecord({ name, recordType }: DnsRecord) {
            return name === HOST && recordType === DnsRecordType.A;
        }

        function withdrawnServices() {
            return goodbyeRecords()
                .filter(({ recordType }) => recordType === DnsRecordType.SRV)
                .map(({ name }) => name)
                .sort();
        }

        function summarize(records: DnsRecord[]) {
            return records.map(({ name, recordType, ttl }) => `${DnsRecordType[recordType]} ${name} ttl=${ttl}`);
        }

        function answerSummary() {
            return summarize(sent.flatMap(({ answers }) => answers));
        }

        function warnings() {
            return levels.filter(level => level > LogLevel.DEBUG);
        }

        function query(...queries: { name: string; recordType: DnsRecordType; uniCastResponse?: boolean }[]) {
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: queries.map(q => ({ ...q, recordClass: DnsRecordClass.IN })),
                }),
                CLIENT_IPv4,
                INTERFACE_NAME,
            );
        }

        it("omits the host addresses another service still publishes", async () => {
            await withdraw("window");

            const goodbyes = goodbyeRecords();
            expect(goodbyes.map(({ name, recordType }) => `${DnsRecordType[recordType]} ${name}`)).deep.equal([
                `PTR ${DUMMY_QNAME}`,
                `SRV ${WINDOW_QNAME}`,
            ]);
        });

        it("omits the host addresses a remaining service publishes when several services leave at once", async () => {
            await register("next-window", () => serviceRecords(NEXT_WINDOW_QNAME));
            await MockTime.resolve(withdraw("foo", "window"));

            expect(withdrawnServices()).deep.equal(["operational.b.c.d", WINDOW_QNAME]);
            expect(goodbyeRecords().filter(isHostRecord)).deep.equal([]);
        });

        it("includes the host addresses once no other service publishes them", async () => {
            await withdraw("window");
            sent.length = 0;

            await withdraw("foo");

            expect(goodbyeRecords().filter(isHostRecord)).deep.equal([HOST_GOODBYE]);
        });

        it("includes the host addresses once when the last services are withdrawn together", async () => {
            await MockTime.resolve(Promise.all([withdraw("window"), withdraw("foo")]));

            expect(goodbyeRecords().filter(isHostRecord)).deep.equal([HOST_GOODBYE]);
        });

        it("says goodbye to a record only once", async () => {
            await withdraw("window");
            sent.length = 0;

            await withdraw("foo");

            expect(summarize(goodbyeRecords())).deep.equal([
                `PTR ${DUMMY_QNAME} ttl=0`,
                "SRV operational.b.c.d ttl=0",
                `A ${HOST} ttl=0`,
            ]);
        });

        it("says goodbye to a replaced address without the cache-flush bit while its set has records", async () => {
            let ip = "10.1.1.1";
            await register("moving", () => [
                SrvRecord("moving.b.c.d", { priority: 0, weight: 0, port: 1234, target: "moving.local" }, FULL_TTL),
                ARecord("moving.local", ip, FULL_TTL, true),
            ]);
            await MockTime.resolve(mdnsServer.broadcast("moving"));
            sent.length = 0;

            ip = "10.1.1.2";
            await MockTime.resolve(registrations.get("moving")?.refresh());
            expect(sent).deep.equal([]);
            await MockTime.resolve(mdnsServer.broadcast("moving"));

            expect(sent).length(1);
            expect(sent[0].answers.filter(({ name }) => name === "moving.local")).deep.equal([
                { ...ARecord("moving.local", "10.1.1.1"), ttl: 0, flushCache: false },
                ARecord("moving.local", "10.1.1.2", FULL_TTL, true),
            ]);
        });
        it("answers queries that arrive during the goodbye only for the remaining services", async () => {
            afterSend = message => {
                if (message.answers.some(({ ttl }) => ttl === 0)) {
                    afterSend = undefined;
                    query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
                    query({ name: HOST, recordType: DnsRecordType.A });
                }
            };

            await withdraw("window");
            await MockTime.resolve(sentAtLeast(2));
            await waitFor(Seconds(2));

            expect(summarize(sent.slice(1).flatMap(({ answers }) => answers))).deep.equal([
                `A ${HOST} ttl=${FULL_TTL}`,
            ]);
        });

        it("drops an answer for a service withdrawn while the answer waits", async () => {
            query(
                { name: "operational.b.c.d", recordType: DnsRecordType.SRV },
                { name: WINDOW_QNAME, recordType: DnsRecordType.SRV },
            );
            await MockTime.resolve(sentAtLeast(1));
            expect(answerSummary()).deep.equal([`SRV operational.b.c.d ttl=${FULL_TTL}`]);

            await withdraw("window");
            const afterGoodbye = sent.length;
            await waitFor(Seconds(2));

            expect(sent.slice(afterGoodbye)).deep.equal([]);
        });

        it("drops an answer for a service registered again while the answer waits", async () => {
            query(
                { name: "operational.b.c.d", recordType: DnsRecordType.SRV },
                { name: WINDOW_QNAME, recordType: DnsRecordType.SRV },
            );
            await MockTime.resolve(sentAtLeast(1));
            expect(answerSummary()).deep.equal([`SRV operational.b.c.d ttl=${FULL_TTL}`]);

            await withdraw("window");
            await register("window", () => serviceRecords(NEXT_WINDOW_QNAME));
            const afterGoodbye = sent.length;
            await waitFor(Seconds(2));

            expect(sent.slice(afterGoodbye)).deep.equal([]);
        });

        it("leaves a service withdrawn while the announcement waits out of the announcement", async () => {
            const answer = holdSend(message => message.answers.some(({ ttl }) => ttl > 0));
            query({ name: "operational.b.c.d", recordType: DnsRecordType.SRV });
            await answer.started;
            const broadcasting = mdnsServer.broadcast();
            await MockTime.advance(Millis(10));
            const withdrawing = withdraw("window");
            answer.release();
            await MockTime.resolve(Promise.all([broadcasting, withdrawing]));

            expect(
                sent.slice(1).some(({ answers }) => answers.some(({ name, ttl }) => name === WINDOW_QNAME && ttl > 0)),
            ).false;
            expect(withdrawnServices()).deep.equal([WINDOW_QNAME]);
        });

        it("announces all services in one packet with each shared record once", async () => {
            await MockTime.resolve(mdnsServer.broadcast());

            expect(sent).length(1);
            expect(sent[0].answers.filter(isHostRecord)).length(1);
        });

        it("defers a record multicast less than a second ago from an announcement", async () => {
            query({ name: HOST, recordType: DnsRecordType.A });
            await MockTime.resolve(sentAtLeast(1));

            await MockTime.resolve(mdnsServer.broadcast("window"));

            expect(sent).length(2);
            expect(sent[1].answers.filter(isHostRecord)).deep.equal([]);
            await waitFor(Seconds(1));
            expect(sent.slice(2).map(({ answers }) => summarize(answers))).deep.equal([[`A ${HOST} ttl=${FULL_TTL}`]]);
        });
        it("keeps a service registered again under the same name while the goodbye runs", async () => {
            const expiring = withdraw("window");
            await register("window", () => serviceRecords(NEXT_WINDOW_QNAME));
            await expiring;
            expect(withdrawnServices()).deep.equal([WINDOW_QNAME]);
            sent.length = 0;

            query({ name: NEXT_WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));

            expect(answerSummary()).deep.equal([`SRV ${NEXT_WINDOW_QNAME} ttl=${FULL_TTL}`]);
        });

        it("answers for the remaining service a query that arrives while the goodbye is sent", async () => {
            const goodbye = holdSend(message => message.answers.some(({ ttl }) => ttl === 0));
            const withdrawing = withdraw("foo");
            await goodbye.started;

            query(
                { name: HOST, recordType: DnsRecordType.A },
                { name: "operational.b.c.d", recordType: DnsRecordType.SRV },
            );
            await MockTime.advance(Millis(10));
            goodbye.release();
            await MockTime.resolve(withdrawing);
            await MockTime.resolve(sentAtLeast(2));
            await waitFor(Seconds(2));

            const answers = sent.filter(({ answers }) => answers.every(({ ttl }) => ttl > 0));
            expect(summarize(answers.flatMap(({ answers }) => answers))).deep.equal([`A ${HOST} ttl=${FULL_TTL}`]);
        });

        it("ends with the host address of a service registered after the first goodbye", async () => {
            await register("srv-only", () => [
                SrvRecord("srv-only.b.c.d", { priority: 0, weight: 0, port: 1234, target: HOST }, FULL_TTL),
            ]);
            await withdraw("foo");
            await MockTime.resolve(mdnsServer.broadcast());
            sent.length = 0;

            let registering: Promise<void> | undefined;
            afterSend = message => {
                if (registering === undefined && message.answers.some(({ ttl }) => ttl === 0)) {
                    registering = register("next", () => serviceRecords(NEXT_WINDOW_QNAME)).then(() =>
                        mdnsServer.broadcast("next"),
                    );
                }
            };

            await MockTime.resolve(Promise.all([withdraw("srv-only"), withdraw("window")]));
            await MockTime.resolve(registering);
            await MockTime.advance(Seconds(1));

            const hostRecords = sent.flatMap(({ answers }) => answers).filter(isHostRecord);
            expect(hostRecords.at(-1)?.ttl).equal(FULL_TTL);
        });

        it("keeps the host address of a service registered right after the last one was withdrawn", async () => {
            await withdraw("foo");
            sent.length = 0;

            const withdrawing = withdraw("window");
            await register("next", () => serviceRecords(NEXT_WINDOW_QNAME));
            await MockTime.resolve(Promise.all([withdrawing, mdnsServer.broadcast("next")]));

            const hostRecords = sent.flatMap(({ answers }) => answers).filter(isHostRecord);
            expect(hostRecords.at(-1)?.ttl).equal(FULL_TTL);
        });

        it("sends the goodbye after an answer in flight and leaves out what was registered meanwhile", async () => {
            await withdraw("foo");
            sent.length = 0;

            const answer = holdSend(message => message.answers.some(({ ttl }) => ttl > 0));
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await answer.started;
            const withdrawing = withdraw("window");
            await register("next", () => serviceRecords(NEXT_WINDOW_QNAME));
            await MockTime.advance(Millis(10));
            answer.release();
            await MockTime.resolve(withdrawing);

            expect(sent.map(({ answers }) => summarize(answers))).deep.equal([
                [`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`],
                [`PTR ${DUMMY_QNAME} ttl=0`, `SRV ${WINDOW_QNAME} ttl=0`],
            ]);
        });

        it("multicasts a record once for overlapping queries", async () => {
            query(
                { name: "operational.b.c.d", recordType: DnsRecordType.SRV },
                { name: WINDOW_QNAME, recordType: DnsRecordType.SRV },
            );
            await MockTime.resolve(sentAtLeast(1));
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(2));
            await waitFor(Seconds(2));

            const windowSrv = sent
                .flatMap(({ answers }) => answers)
                .filter(({ name, recordType }) => name === WINDOW_QNAME && recordType === DnsRecordType.SRV);
            expect(windowSrv).length(1);
        });

        it("answers within a second of an announcement once the second has passed", async () => {
            let announcedAt = 0;
            afterSend = () => (announcedAt = Time.nowUs);
            await MockTime.resolve(mdnsServer.broadcast("window"));
            afterSend = undefined;
            sent.length = 0;
            await MockTime.advance(Millis(100));

            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await waitFor(Millis(500));
            expect(sent).deep.equal([]);

            await MockTime.resolve(sentAtLeast(1));
            expect(Time.nowUs - announcedAt).least(Seconds(1));
            await waitFor(Seconds(2));
            expect(answerSummary()).deep.equal([`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`]);
        });

        it("answers a pointer query with the pointer of every service of the type", async () => {
            query({ name: DUMMY_QNAME, recordType: DnsRecordType.PTR });
            await MockTime.resolve(sentAtLeast(2));

            const targets = sent
                .flatMap(({ answers }) => answers)
                .filter(({ recordType }) => recordType === DnsRecordType.PTR)
                .map(({ value }) => value);
            expect(targets).deep.equal(["operational.b.c.d", WINDOW_QNAME]);
        });

        it("answers a repeated question at 950 ms once the second has passed", async () => {
            let answeredAt = 0;
            afterSend = () => {
                answeredAt = Time.nowUs;
                afterSend = undefined;
            };
            query({ name: DUMMY_QNAME, recordType: DnsRecordType.PTR });
            await MockTime.resolve(sentAtLeast(2));
            await register("late", () => [PtrRecord(DUMMY_QNAME, "late.b.c.d")]);
            await MockTime.advance(Millis(950 - (Time.nowUs - answeredAt)));
            sent.length = 0;

            query({ name: DUMMY_QNAME, recordType: DnsRecordType.PTR });
            await MockTime.resolve(sentAtLeast(1));
            const immediate = sent.flatMap(({ answers }) => answers).map(({ value }) => value);
            await waitFor(Seconds(2));

            expect(immediate).deep.equal(["late.b.c.d"]);
            expect(
                sent
                    .slice(1)
                    .flatMap(({ answers }) => answers)
                    .map(({ value }) => value),
            ).deep.equal(["operational.b.c.d", WINDOW_QNAME]);
        });
        it("sends no answer chunk of a withdrawn service after its goodbye", async () => {
            const BIG_QNAME = "big.b.c.d";
            await register("big", () => [
                SrvRecord(BIG_QNAME, { priority: 0, weight: 0, port: 1234, target: HOST }, FULL_TTL),
                ...Array.from({ length: 12 }, (_, index) => TxtRecord(BIG_QNAME, [`K${index}=${"x".repeat(200)}`])),
            ]);
            await MockTime.resolve(mdnsServer.broadcast("big"));
            await MockTime.advance(Seconds(1));
            sent.length = 0;

            const firstChunk = holdSend(message =>
                message.answers.some(({ name, ttl }) => name === BIG_QNAME && ttl > 0),
            );
            query({ name: BIG_QNAME, recordType: DnsRecordType.ANY });
            await firstChunk.started;
            const withdrawing = withdraw("big");
            await MockTime.advance(Millis(10));
            firstChunk.release();
            await MockTime.resolve(withdrawing);

            const goodbyeIndex = sent.findIndex(({ answers }) => answers.some(({ ttl }) => ttl === 0));
            const chunkIndexes = sent
                .map(({ answers }, index) =>
                    answers.some(({ name, ttl }) => name === BIG_QNAME && ttl > 0) ? index : -1,
                )
                .filter(index => index >= 0);
            expect(chunkIndexes.length).above(1);
            expect(goodbyeIndex).above(Math.max(...chunkIndexes));
        });

        it("says goodbye with records that the server cannot change", async () => {
            const records = [
                Object.freeze(PtrRecord(DUMMY_QNAME, "frozen.b.c.d")),
                Object.freeze(
                    SrvRecord("frozen.b.c.d", { priority: 0, weight: 0, port: 1234, target: HOST }, FULL_TTL),
                ),
            ];
            await register("frozen", () => records);
            await MockTime.resolve(mdnsServer.broadcast("frozen"));
            sent.length = 0;

            await withdraw("frozen");
            expect(summarize(goodbyeRecords())).deep.equal([`PTR ${DUMMY_QNAME} ttl=0`, `SRV frozen.b.c.d ttl=0`]);

            await register("frozen", () => records);
            sent.length = 0;
            query({ name: "frozen.b.c.d", recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            expect(answerSummary()).deep.equal([`SRV frozen.b.c.d ttl=${FULL_TTL}`]);
        });

        it("multicasts a record again to a QU query after its goodbye and registration again", async () => {
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            await MockTime.advance(Seconds(1));
            await withdraw("window");
            await register("window", () => serviceRecords(WINDOW_QNAME));
            sent.length = targets.length = 0;

            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV, uniCastResponse: true });
            await MockTime.resolve(sentAtLeast(1));

            expect(answerSummary()).deep.equal([`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`]);
            expect(targets).deep.equal([undefined]);
        });

        it("announces a changed record on the broadcast after a refresh and says goodbye to its old value", async () => {
            let txt = "A=1";
            await register("txt", () => [TxtRecord("txt.b.c.d", [txt])]);

            query({ name: "txt.b.c.d", recordType: DnsRecordType.TXT });
            await MockTime.resolve(sentAtLeast(1));
            txt = "A=2";
            await MockTime.resolve(registrations.get("txt")?.refresh());
            await MockTime.resolve(mdnsServer.broadcast("txt"));

            expect(sent.map(({ answers }) => answers.map(({ value, ttl }) => ({ value, ttl })))).deep.equal([
                [{ value: [Bytes.fromString("A=1")], ttl: FULL_TTL }],
                [
                    { value: [Bytes.fromString("A=1")], ttl: 0 },
                    { value: [Bytes.fromString("A=2")], ttl: FULL_TTL },
                ],
            ]);
        });
        it("does not multicast an unchanged record again within a second of a refresh", async () => {
            query({ name: HOST, recordType: DnsRecordType.A });
            await MockTime.resolve(sentAtLeast(1));
            await MockTime.resolve(registrations.get("window")?.refresh());
            query({ name: HOST, recordType: DnsRecordType.ANY });
            await waitFor(Millis(500));

            expect(sent.flatMap(({ answers }) => answers).filter(isHostRecord)).length(1);
        });

        it("says goodbye to the vendor pointer on the broadcast after a refresh masks it", async () => {
            let masked = false;
            await register("masked", () => [
                ...(masked ? [] : [PtrRecord("_V1._sub._matterc._udp.local", "masked.b.c.d")]),
                SrvRecord("masked.b.c.d", { priority: 0, weight: 0, port: 1234, target: HOST }, FULL_TTL),
            ]);
            await MockTime.resolve(mdnsServer.broadcast("masked"));
            sent.length = 0;

            masked = true;
            await MockTime.resolve(registrations.get("masked")?.refresh());
            await MockTime.resolve(mdnsServer.broadcast("masked"));

            expect(summarize(goodbyeRecords())).deep.equal([`PTR _V1._sub._matterc._udp.local ttl=0`]);
        });
        it("publishes only the masked records after a refresh", async () => {
            let masked = false;
            await register("masked", () => [
                ...(masked ? [] : [PtrRecord("_V1._sub._matterc._udp.local", "masked.b.c.d")]),
                SrvRecord("masked.b.c.d", { priority: 0, weight: 0, port: 1234, target: HOST }, FULL_TTL),
            ]);
            masked = true;
            await MockTime.resolve(registrations.get("masked")?.refresh());

            query({ name: "_V1._sub._matterc._udp.local", recordType: DnsRecordType.PTR });
            await waitFor(Seconds(2));
            await MockTime.resolve(mdnsServer.broadcast("masked"));

            expect(sent.flatMap(({ answers }) => answers).some(({ name }) => name.startsWith("_V1"))).false;
        });
        it("keeps answering after a goodbye whose send failed", async () => {
            failSend = message => message.answers.some(({ ttl }) => ttl === 0);
            await withdraw("window");
            query({ name: "operational.b.c.d", recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));

            expect(warnings()).deep.equal([LogLevel.NOTICE]);
            expect(answerSummary()).deep.equal([`SRV operational.b.c.d ttl=${FULL_TTL}`]);
        });

        it("sends no goodbye for records that peers no longer cache", async () => {
            await register("short", () => [
                SrvRecord("short.b.c.d", { priority: 0, weight: 0, port: 1234, target: HOST }, Seconds(2)),
            ]);
            await MockTime.resolve(mdnsServer.broadcast("short"));
            await waitFor(Seconds(3));
            sent.length = 0;

            await MockTime.resolve(registrations.get("short")?.withdraw());

            expect(goodbyeRecords()).deep.equal([]);
        });

        it("keeps the current registration when the handle of a replaced one withdraws", async () => {
            const stale = registrations.get("window")!;
            await register("window", () => serviceRecords(WINDOW_QNAME));
            sent.length = 0;

            await MockTime.resolve(stale.withdraw());
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));

            expect(goodbyeRecords()).deep.equal([]);
            expect(answerSummary()).deep.equal([`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`]);
        });

        it("does not call the generators again when the handle of a replaced registration refreshes", async () => {
            const stale = registrations.get("window")!;
            let calls = 0;
            await register("window", () => {
                calls++;
                return serviceRecords(WINDOW_QNAME);
            });
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            const before = calls;

            await MockTime.resolve(stale.refresh());
            await MockTime.advance(Seconds(1));
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await waitFor(Millis(200));

            expect(calls).equal(before);
        });

        it("notices failed goodbyes once per outage of the interface", async () => {
            failSend = message => message.answers.some(({ ttl }) => ttl === 0);
            await withdraw("window");
            await MockTime.resolve(mdnsServer.broadcast());
            expect(warnings()).deep.equal([LogLevel.NOTICE]);

            failSend = undefined;
            await MockTime.resolve(mdnsServer.broadcast());
            expect(goodbyeRecords().length).greaterThan(0);

            failSend = message => message.answers.some(({ ttl }) => ttl === 0);
            sent.length = 0;
            await register("window", () => serviceRecords(WINDOW_QNAME));
            await MockTime.resolve(mdnsServer.broadcast("window"));
            await waitFor(Seconds(2));
            expect(answerSummary()).includes(`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`);
            await withdraw("window");

            expect(warnings()).deep.equal([LogLevel.NOTICE, LogLevel.NOTICE]);
        });

        it("logs a goodbye that fails while the server closes at debug level", async () => {
            let attempted = false;
            failSend = message => (attempted ||= message.answers.some(({ ttl }) => ttl === 0));
            const withdrawing = withdraw("window");
            const closing = mdnsServer.close();
            await MockTime.resolve(Promise.all([withdrawing, closing]));

            expect(attempted).true;
            expect(levels).not.empty;
            expect(warnings()).deep.equal([]);
        });

        it("sends the next packet of an answer after a failed multicast send and notices the outage once", async () => {
            failSend = message => message.answers.some(({ ttl }) => ttl > 0);
            for (let i = 0; i < 2; i++) {
                query({ name: "operational.b.c.d", recordType: DnsRecordType.SRV });
                await waitFor(Seconds(2));
            }
            failSend = message => message.answers.some(({ name }) => name === "operational.b.c.d");
            query(
                { name: "operational.b.c.d", recordType: DnsRecordType.SRV },
                { name: WINDOW_QNAME, recordType: DnsRecordType.SRV },
            );
            await MockTime.resolve(sentAtLeast(1));

            expect(answerSummary()).deep.equal([`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`]);
            expect(warnings()).deep.equal([LogLevel.NOTICE]);
        });
        it("logs a failed unicast answer at debug level", async () => {
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            await MockTime.advance(Seconds(1));
            let attempt = () => {};
            const attempted = new Promise<void>(resolve => (attempt = resolve));
            failSend = () => {
                attempt();
                return true;
            };

            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV, uniCastResponse: true });
            await MockTime.resolve(attempted);
            await waitFor(Millis(10));
            expect(levels).not.empty;
            expect(warnings()).deep.equal([]);

            await MockTime.advance(Seconds(1));
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await waitFor(Millis(200));

            expect(warnings()).deep.equal([LogLevel.NOTICE]);
        });

        it("skips the remaining announcements after a failed send and notices the outage", async () => {
            failSend = message => message.answers.some(({ name }) => name === "operational.b.c.d");

            await MockTime.resolve(mdnsServer.broadcast());

            expect(sent).deep.equal([]);
            expect(warnings()).deep.equal([LogLevel.NOTICE]);
        });

        it("sends a waiting goodbye on close and drops a waiting answer", async () => {
            const answer = holdSend(message => message.answers.some(({ ttl }) => ttl > 0));
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await answer.started;
            query({ name: "operational.b.c.d", recordType: DnsRecordType.SRV });
            await MockTime.advance(Millis(10));
            const withdrawing = withdraw("window");
            const closing = mdnsServer.close();
            answer.release();
            await MockTime.resolve(Promise.all([withdrawing, closing]));

            expect(sent.map(({ answers }) => summarize(answers))).deep.equal([
                [`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`],
                [`PTR ${DUMMY_QNAME} ttl=0`, `SRV ${WINDOW_QNAME} ttl=0`],
            ]);
        });

        it("stops an answer that waits between packets when the server closes", async () => {
            query(
                { name: "operational.b.c.d", recordType: DnsRecordType.SRV },
                { name: WINDOW_QNAME, recordType: DnsRecordType.SRV },
            );
            await MockTime.resolve(sentAtLeast(1));

            await mdnsServer.close();
            await waitFor(Seconds(2));

            expect(sent).length(1);
            expect(warnings()).deep.equal([]);
        });

        it("closes only after the send in flight settled", async () => {
            const answer = holdSend(message => message.answers.some(({ ttl }) => ttl > 0));
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await answer.started;

            let closed = false;
            const closing = mdnsServer.close().then(() => (closed = true));
            await MockTime.advance(Millis(10));
            expect(closed).false;

            answer.release();
            await MockTime.resolve(closing);
            expect(closed).true;
        });

        for (const when of ["after close", "while close starts"]) {
            it(`returns an inert registration ${when}`, async () => {
                const texts = new Array<string>();
                Logger.destinations.capture = LogDestination({
                    add(message) {
                        if (message.facility === "MdnsServer") {
                            texts.push(String(message.values[0]));
                        }
                    },
                });
                let registering;
                if (when === "after close") {
                    await mdnsServer.close();
                    registering = mdnsServer.register("late", () => serviceRecords("late.b.c.d"));
                } else {
                    registering = mdnsServer.register("late", () => serviceRecords("late.b.c.d"));
                    await mdnsServer.close();
                }
                const registration = await MockTime.resolve(registering);
                texts.length = 0;

                await registration.withdraw();

                expect(sent).deep.equal([]);
                expect(texts).deep.equal([]);
            });
        }
        it("withdraws a service when its registration is disposed", async () => {
            const registration = registrations.get("window");
            if (registration === undefined) {
                throw new InternalError("No window registration");
            }

            await registration[Symbol.asyncDispose]();

            expect(withdrawnServices()).deep.equal([WINDOW_QNAME]);
        });

        it("ignores a replaced registration's refresh and withdraw", async () => {
            const replaced = registrations.get("window");
            if (replaced === undefined) {
                throw new InternalError("No window registration");
            }
            let calls = 0;
            await register("window", () => {
                calls++;
                return serviceRecords(WINDOW_QNAME);
            });
            calls = 0;

            await MockTime.resolve(replaced.refresh());
            await replaced.withdraw();
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));

            expect(calls).equal(0);
            expect(goodbyeRecords()).deep.equal([]);
            expect(answerSummary()).deep.equal([`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`]);
        });

        it("announces two services registered at the same time", async () => {
            await Promise.all([
                register("a", () => [SrvRecord("a.b.c.d", { priority: 0, weight: 0, port: 1, target: HOST })]),
                register("b", () => [SrvRecord("b.b.c.d", { priority: 0, weight: 0, port: 2, target: HOST })]),
            ]);

            await MockTime.resolve(mdnsServer.broadcast("a", "b"));

            expect(answerSummary()).deep.equal([`SRV a.b.c.d ttl=${FULL_TTL}`, `SRV b.b.c.d ttl=${FULL_TTL}`]);
        });

        it("says goodbye to a record that went out only as an additional record", async () => {
            await register("extra", () => [
                SrvRecord("extra.b.c.d", { priority: 0, weight: 0, port: 1234, target: "extra.local" }, FULL_TTL),
                ARecord("extra.local", "10.2.2.2", FULL_TTL),
            ]);
            query({ name: "extra.b.c.d", recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            sent.length = 0;

            await withdraw("extra");

            expect(summarize(goodbyeRecords())).deep.equal(["SRV extra.b.c.d ttl=0", "A extra.local ttl=0"]);
        });

        it("answers a question after a goodbye and registration again once the second after the goodbye passed", async () => {
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            await MockTime.advance(Seconds(1));
            await withdraw("window");
            const goodbyeAt = Time.nowUs;
            await register("window", () => serviceRecords(WINDOW_QNAME));
            sent.length = 0;

            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));

            expect(Time.nowUs - goodbyeAt).least(Seconds(1) - Millis(100));
            expect(answerSummary()).deep.equal([`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`]);
        });

        it("ignores a query on an interface whose details cannot be read", async () => {
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: WINDOW_QNAME, recordType: DnsRecordType.SRV, recordClass: DnsRecordClass.IN }],
                }),
                CLIENT_IPv4,
                "gone0",
            );
            await MockTime.resolve(mdnsServer.close());

            expect(sent).deep.equal([]);
            expect(warnings()).deep.equal([LogLevel.NOTICE]);
        });

        it("claims no names on the socket for a refresh after close", async () => {
            const socket = new MdnsSocket(udpServerSimulator);
            let claims = 0;
            const registerRelevantNames = socket.registerRelevantNames.bind(socket);
            socket.registerRelevantNames = (owner, names) => {
                claims++;
                registerRelevantNames(owner, names);
            };
            const server = new MdnsServer(socket);
            const registration = await server.register("foo", () => serviceRecords("operational.b.c.d"));
            await MockTime.resolve(server.broadcast());
            await server.close();
            claims = 0;

            await MockTime.resolve(registration.refresh());
            await registration.withdraw();

            expect(claims).equal(0);
        });

        it("tells the socket the names it publishes and drops them after the last withdrawal", async () => {
            const socket = new MdnsSocket(udpServerSimulator);
            const claimed = new Array<string[] | "none">();
            const registerRelevantNames = socket.registerRelevantNames.bind(socket);
            socket.registerRelevantNames = (owner, names) => {
                claimed.push(names === "all" ? ["all"] : [...names].sort());
                registerRelevantNames(owner, names);
            };
            const unregisterRelevantNames = socket.unregisterRelevantNames.bind(socket);
            socket.unregisterRelevantNames = owner => {
                claimed.push("none");
                unregisterRelevantNames(owner);
            };
            const server = new MdnsServer(socket);
            const registration = await server.register("foo", () => serviceRecords("operational.b.c.d"));
            await MockTime.resolve(server.broadcast());

            await registration.withdraw();
            const afterWithdraw = [...claimed];
            await server.close();

            expect(afterWithdraw).deep.equal([[DUMMY_QNAME, HOST, "operational.b.c.d"], "none"]);
        });

        it("keeps saying goodbye for a record whose TTL outlasts the idle time of the interface", async () => {
            await register("long", () => [
                SrvRecord("long.b.c.d", { priority: 0, weight: 0, port: 1234, target: HOST }, Minutes(30)),
            ]);
            await MockTime.resolve(mdnsServer.broadcast("long"));
            await MockTime.advance(Minutes(16));
            sent.length = 0;

            await withdraw("long");

            expect(summarize(goodbyeRecords())).deep.equal(["SRV long.b.c.d ttl=0"]);
        });

        it("sends only the held record in the deferred answer", async () => {
            await MockTime.resolve(mdnsServer.broadcast("window"));
            sent.length = 0;
            await MockTime.advance(Millis(100));

            query(
                { name: WINDOW_QNAME, recordType: DnsRecordType.SRV },
                { name: "operational.b.c.d", recordType: DnsRecordType.SRV },
            );
            await waitFor(Seconds(2));

            expect(sent.map(({ answers }) => summarize(answers))).deep.equal([
                [`SRV operational.b.c.d ttl=${FULL_TTL}`],
                [`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`],
            ]);
            expect(sent.map(({ additionalRecords }) => summarize(additionalRecords))).deep.equal([
                [],
                [`A ${HOST} ttl=${FULL_TTL}`],
            ]);
        });

        it("sends no additional records with a deferred answer to an address query", async () => {
            query({ name: HOST, recordType: DnsRecordType.A });
            await MockTime.resolve(sentAtLeast(1));
            await MockTime.advance(Millis(500));

            query({ name: HOST, recordType: DnsRecordType.A });
            await waitFor(Seconds(2));

            expect(sent).length(2);
            expect(summarize(sent[1].answers)).deep.equal([`A ${HOST} ttl=${FULL_TTL}`]);
            expect(sent[1].additionalRecords).deep.equal([]);
        });

        it("sends no deferred packet for a record withdrawn before it was due", async () => {
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            await MockTime.advance(Millis(500));
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.advance(Millis(10));

            await withdraw("window");
            await waitFor(Seconds(2));

            expect(sent.map(({ answers }) => answers.every(({ ttl }) => ttl === 0))).deep.equal([false, true]);
        });

        it("defers the announcement of a record registered again within a second of its goodbye", async () => {
            let goodbyeAt = 0;
            afterSend = message => {
                if (message.answers.some(({ ttl }) => ttl === 0)) {
                    goodbyeAt = Time.nowUs;
                }
            };
            await withdraw("window");
            await register("window", () => serviceRecords(WINDOW_QNAME));
            sent.length = 0;
            const times = new Array<number>();
            afterSend = () => times.push(Time.nowUs);

            await MockTime.resolve(mdnsServer.broadcast("window"));
            await waitFor(Seconds(2));

            const windowSrv = sent.findIndex(({ answers }) =>
                answers.some(
                    ({ name, recordType, ttl }) => name === WINDOW_QNAME && recordType === DnsRecordType.SRV && ttl > 0,
                ),
            );
            expect(windowSrv).least(0);
            expect(times[windowSrv] - goodbyeAt).least(Seconds(1));
        });

        it("combines the announcements of the same turn into one message", async () => {
            await register("a", () => [SrvRecord("a.b.c.d", { priority: 0, weight: 0, port: 1, target: HOST })]);
            await register("b", () => [SrvRecord("b.b.c.d", { priority: 0, weight: 0, port: 2, target: HOST })]);

            await MockTime.resolve(Promise.all([mdnsServer.broadcast("a"), mdnsServer.broadcast("b")]));

            expect(sent.map(({ answers }) => summarize(answers))).deep.equal([
                [`SRV a.b.c.d ttl=${FULL_TTL}`, `SRV b.b.c.d ttl=${FULL_TTL}`],
            ]);
        });

        it("sends no packet when there is nothing to announce or say goodbye to", async () => {
            await MockTime.resolve(mdnsServer.broadcast("unknown"));

            expect(sent).deep.equal([]);
        });

        it("sends no announcement when the server closes before it goes out", async () => {
            const broadcasting = mdnsServer.broadcast();
            const closing = mdnsServer.close();

            await MockTime.resolve(Promise.all([broadcasting, closing]));

            expect(sent).deep.equal([]);
        });

        it("clears the cache-flush bit of a record set the announcement carries only in part", async () => {
            await register("dual", () => [
                SrvRecord("dual.b.c.d", { priority: 0, weight: 0, port: 1, target: HOST }, FULL_TTL, true),
                SrvRecord("dual.b.c.d", { priority: 0, weight: 0, port: 2, target: HOST }, FULL_TTL, true),
            ]);
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: "dual.b.c.d", recordType: DnsRecordType.SRV, recordClass: DnsRecordClass.IN }],
                    answers: [SrvRecord("dual.b.c.d", { priority: 0, weight: 0, port: 2, target: HOST }, FULL_TTL)],
                }),
                CLIENT_IPv4,
                INTERFACE_NAME,
            );
            await MockTime.resolve(sentAtLeast(1));
            sent.length = 0;

            await MockTime.resolve(mdnsServer.broadcast("dual"));

            expect(sent[0].answers.map(({ value, flushCache }) => `${value.port} ${flushCache}`)).deep.equal([
                "2 false",
            ]);
        });
        it("multicasts the reply to a query that mixes QU and QM questions", async () => {
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            await MockTime.advance(Seconds(1));
            targets.length = 0;

            query(
                { name: WINDOW_QNAME, recordType: DnsRecordType.SRV, uniCastResponse: true },
                { name: WINDOW_QNAME, recordType: DnsRecordType.PTR },
            );
            await MockTime.resolve(sentAtLeast(2));

            expect(targets).deep.equal([undefined]);
        });

        it("notices a failing deferred send once per outage", async () => {
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            failSend = () => true;
            for (let outage = 0; outage < 2; outage++) {
                for (let i = 0; i < 2; i++) {
                    await MockTime.advance(Millis(500));
                    query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
                    await waitFor(Seconds(1));
                }
                failSend = undefined;
                query({ name: "operational.b.c.d", recordType: DnsRecordType.SRV });
                await waitFor(Seconds(1));
                failSend = () => true;
            }

            expect(warnings()).deep.equal([LogLevel.NOTICE, LogLevel.NOTICE]);
        });

        it("does not send a deferred record before its second has passed when the timer fires early", async () => {
            const getTimer = Time.default.getTimer.bind(Time.default);
            Time.default.getTimer = (name, duration, callback) =>
                getTimer(
                    name,
                    name === "MDNS deferred answer" ? Millis(Math.max(0, duration - 50)) : duration,
                    callback,
                );
            try {
                const times = new Array<number>();
                afterSend = () => times.push(Time.nowUs);
                query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
                await waitFor(Millis(500));
                query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
                await waitFor(Seconds(2));

                expect(times).length(2);
                expect(times[1] - times[0]).least(Seconds(1));
            } finally {
                Time.default.getTimer = getTimer;
            }
        });

        it("varies the delay between the packets of one answer", async () => {
            const random = Math.random;
            const values = [0.1, 0.9];
            Math.random = () => values.shift() ?? 0.5;
            try {
                const gaps = new Array<number>();
                for (let i = 0; i < 2; i++) {
                    const times = new Array<number>();
                    afterSend = () => times.push(Time.nowUs);
                    query(
                        { name: "operational.b.c.d", recordType: DnsRecordType.SRV },
                        { name: WINDOW_QNAME, recordType: DnsRecordType.SRV },
                    );
                    await MockTime.resolve(Time.sleep("packet delay window", Millis(200)), { stepMs: 1 });
                    gaps.push(times[1] - times[0]);
                    await MockTime.advance(Seconds(1));
                }

                expect(gaps[0]).within(Millis(30), Millis(35));
                expect(gaps[1]).within(Millis(110), Millis(115));
            } finally {
                Math.random = random;
            }
        });

        it("sends each deferred record once its own second has passed", async () => {
            const times = new Array<number>();
            afterSend = () => times.push(Time.nowUs);
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await waitFor(Millis(300));
            query({ name: "operational.b.c.d", recordType: DnsRecordType.SRV });
            await waitFor(Millis(200));

            query(
                { name: WINDOW_QNAME, recordType: DnsRecordType.SRV },
                { name: "operational.b.c.d", recordType: DnsRecordType.SRV },
            );
            await waitFor(Seconds(2));

            expect(sent.map(({ answers }) => summarize(answers))).deep.equal([
                [`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`],
                [`SRV operational.b.c.d ttl=${FULL_TTL}`],
                [`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`],
                [`SRV operational.b.c.d ttl=${FULL_TTL}`],
            ]);
            expect(times[2] - times[0]).within(Seconds(1), Seconds(1) + Millis(5));
            expect(times[3] - times[1]).within(Seconds(1), Seconds(1) + Millis(5));
        });
        it("sends one deferred answer for many queries that hit the same held record", async () => {
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            await MockTime.advance(Millis(500));

            for (let i = 0; i < 5; i++) {
                query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            }
            await waitFor(Seconds(2));

            expect(sent).length(2);
        });

        it("drops the deferred answer on close without waiting for it", async () => {
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            await MockTime.advance(Millis(500));
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.advance(Millis(10));

            const closedAt = Time.nowUs;
            await mdnsServer.close();
            expect(Time.nowUs).equal(closedAt);
            await waitFor(Seconds(2));

            expect(sent).length(1);
        });

        it("holds a record sent as an additional record like an answer", async () => {
            query({ name: "operational.b.c.d", recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            expect(sent[0].additionalRecords.filter(isHostRecord)).length(1);
            await MockTime.advance(Millis(500));

            query({ name: HOST, recordType: DnsRecordType.A });
            await waitFor(Millis(300));
            expect(sent).length(1);

            await waitFor(Seconds(1));
            expect(summarize(sent[1].answers)).deep.equal([`A ${HOST} ttl=${FULL_TTL}`]);
        });

        it("waits 20 to 120 ms between the packets of one answer", async () => {
            const times = new Array<number>();
            afterSend = () => times.push(Time.nowUs);

            query(
                { name: "operational.b.c.d", recordType: DnsRecordType.SRV },
                { name: WINDOW_QNAME, recordType: DnsRecordType.SRV },
            );
            await MockTime.resolve(Time.sleep("packet delay window", Millis(200)), { stepMs: 1 });

            expect(sent).length(2);
            expect(times[1] - times[0]).within(Millis(20), Millis(121));
        });

        it("suppresses a known answer that writes the same IPv6 address another way", async () => {
            await register("v6", () => [AAAARecord("v6.local", "abcd:0:0::1", FULL_TTL)]);

            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: "v6.local", recordType: DnsRecordType.AAAA, recordClass: DnsRecordClass.IN }],
                    answers: [AAAARecord("v6.local", "abcd::1", FULL_TTL)],
                }),
                CLIENT_IPv4,
                INTERFACE_NAME,
            );
            await waitFor(Seconds(2));

            expect(sent).deep.equal([]);
        });
        it("keeps nothing registered when the server closes while a registration runs", async () => {
            const registering = mdnsServer.register("late", () => serviceRecords("late.b.c.d"));
            const closing = mdnsServer.close();

            const registration = await registering;
            await closing;
            await registration.refresh();

            expect(sent).deep.equal([]);
            expect(warnings()).deep.equal([]);
        });
        it("logs nothing above debug level when the server closes during a refresh", async () => {
            const refreshing = registrations.get("window")?.refresh();
            const closing = mdnsServer.close();

            await MockTime.resolve(Promise.all([refreshing, closing]));

            expect(warnings()).deep.equal([]);
        });

        it("answers again at once after a multicast whose send failed", async () => {
            failSend = () => true;
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await waitFor(Millis(100));
            failSend = undefined;

            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await waitFor(Millis(100));

            expect(answerSummary()).deep.equal([`SRV ${WINDOW_QNAME} ttl=${FULL_TTL}`]);
        });

        it("suppresses a known answer whose pointer target differs in case", async () => {
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: DUMMY_QNAME, recordType: DnsRecordType.PTR, recordClass: DnsRecordClass.IN }],
                    answers: [
                        PtrRecord(DUMMY_QNAME, "OPERATIONAL.b.c.d", FULL_TTL),
                        PtrRecord(DUMMY_QNAME, WINDOW_QNAME.toUpperCase(), FULL_TTL),
                    ],
                }),
                CLIENT_IPv4,
                INTERFACE_NAME,
            );
            await waitFor(Seconds(2));

            expect(sent).deep.equal([]);
        });

        it("does not send a deferred record that another packet carried after its second passed", async () => {
            let firstAt = 0;
            afterSend = () => {
                firstAt = Time.nowUs;
                afterSend = undefined;
            };
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await waitFor(Millis(500));
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await waitFor(Millis(980 - (Time.nowUs - firstAt)));

            const held = holdSend(message => message.answers.some(({ name }) => name === "operational.b.c.d"));
            query({ name: "operational.b.c.d", recordType: DnsRecordType.SRV });
            await held.started;
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await waitFor(Millis(40));
            held.release();
            await waitFor(Seconds(3));

            const windowSrv = sent
                .flatMap(({ answers }) => answers)
                .filter(({ name, recordType }) => name === WINDOW_QNAME && recordType === DnsRecordType.SRV);
            expect(windowSrv).length(2);
        });
        it("sends the additional record of a deferred answer that was never multicast", async () => {
            await register("fresh", () => [
                SrvRecord("fresh.b.c.d", { priority: 0, weight: 0, port: 1, target: "fresh.local" }, FULL_TTL),
                ARecord("fresh.local", "10.4.4.4", FULL_TTL),
            ]);
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: "fresh.b.c.d", recordType: DnsRecordType.SRV, recordClass: DnsRecordClass.IN }],
                    answers: [ARecord("fresh.local", "10.4.4.4", FULL_TTL)],
                }),
                CLIENT_IPv4,
                INTERFACE_NAME,
            );
            await waitFor(Millis(500));
            query({ name: "fresh.b.c.d", recordType: DnsRecordType.SRV });
            await waitFor(Seconds(1));

            expect(
                sent.map(({ answers, additionalRecords }) => [summarize(answers), summarize(additionalRecords)]),
            ).deep.equal([
                [["SRV fresh.b.c.d ttl=120000"], []],
                [["SRV fresh.b.c.d ttl=120000"], ["A fresh.local ttl=120000"]],
            ]);
        });

        it("sends a record deferred as answer and as additional record in the answer section", async () => {
            await MockTime.resolve(mdnsServer.broadcast("window"));
            sent.length = 0;
            await MockTime.advance(Millis(100));

            query({ name: "operational.b.c.d", recordType: DnsRecordType.SRV });
            await waitFor(Millis(100));
            query({ name: HOST, recordType: DnsRecordType.A });
            await waitFor(Seconds(1));

            expect(
                sent.map(({ answers, additionalRecords }) => [summarize(answers), summarize(additionalRecords)]),
            ).deep.equal([
                [[`SRV operational.b.c.d ttl=${FULL_TTL}`], []],
                [[`A ${HOST} ttl=${FULL_TTL}`], []],
            ]);
        });

        it("sends a deferred additional record alone in the answer section", async () => {
            await MockTime.resolve(mdnsServer.broadcast("window"));
            sent.length = 0;
            await MockTime.advance(Millis(100));

            query({ name: "operational.b.c.d", recordType: DnsRecordType.SRV });
            await waitFor(Seconds(1));

            expect(
                sent.map(({ answers, additionalRecords }) => [summarize(answers), summarize(additionalRecords)]),
            ).deep.equal([
                [[`SRV operational.b.c.d ttl=${FULL_TTL}`], []],
                [[`A ${HOST} ttl=${FULL_TTL}`], []],
            ]);
        });

        it("holds the address records of one name together", async () => {
            await register("ds", () => [
                ARecord("ds.local", "10.5.5.5", FULL_TTL, true),
                AAAARecord("ds.local", "fd00::5", FULL_TTL, true),
            ]);
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: "ds.local", recordType: DnsRecordType.ANY, recordClass: DnsRecordClass.IN }],
                    answers: [ARecord("ds.local", "10.5.5.5", FULL_TTL)],
                }),
                CLIENT_IPv4,
                INTERFACE_NAME,
            );
            await waitFor(Millis(500));

            query({ name: "ds.local", recordType: DnsRecordType.ANY });
            await waitFor(Millis(300));
            expect(sent).length(1);
            await waitFor(Seconds(1));

            expect(sent.map(({ answers }) => answers.map(({ recordType }) => DnsRecordType[recordType]))).deep.equal([
                ["AAAA"],
                ["A", "AAAA"],
            ]);
        });

        it("carries a record asked for twice in one query once and clears the bit of its incomplete set", async () => {
            await register("dual", () => [
                SrvRecord("dual.b.c.d", { priority: 0, weight: 0, port: 1, target: HOST }, FULL_TTL, true),
                SrvRecord("dual.b.c.d", { priority: 0, weight: 0, port: 2, target: HOST }, FULL_TTL, true),
            ]);
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [
                        { name: "dual.b.c.d", recordType: DnsRecordType.ANY, recordClass: DnsRecordClass.IN },
                        { name: "dual.b.c.d", recordType: DnsRecordType.SRV, recordClass: DnsRecordClass.IN },
                    ],
                    answers: [SrvRecord("dual.b.c.d", { priority: 0, weight: 0, port: 2, target: HOST }, FULL_TTL)],
                }),
                CLIENT_IPv4,
                INTERFACE_NAME,
            );
            await MockTime.resolve(sentAtLeast(1));

            expect(sent[0].answers.map(({ value, flushCache }) => `${value.port} ${flushCache}`)).deep.equal([
                "1 false",
            ]);
        });

        it("sends only goodbyes when the server closes while an announcement waits behind a send", async () => {
            const answer = holdSend(message => message.answers.some(({ ttl }) => ttl > 0));
            query({ name: "operational.b.c.d", recordType: DnsRecordType.SRV });
            await answer.started;
            await MockTime.advance(Seconds(1));
            const broadcasting = mdnsServer.broadcast();
            await MockTime.resolve(Time.macrotask);
            const withdrawing = withdraw("window");
            const closing = mdnsServer.close();
            answer.release();
            await MockTime.resolve(Promise.all([broadcasting, withdrawing, closing]));

            expect(sent.slice(1).flatMap(({ answers }) => answers.filter(({ ttl }) => ttl > 0))).deep.equal([]);
            expect(withdrawnServices()).deep.equal([WINDOW_QNAME]);
        });

        it("suppresses a known answer whose SRV target differs in case", async () => {
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: WINDOW_QNAME, recordType: DnsRecordType.SRV, recordClass: DnsRecordClass.IN }],
                    answers: [
                        SrvRecord(
                            WINDOW_QNAME,
                            { priority: 0, weight: 0, port: 1234, target: HOST.toUpperCase() },
                            FULL_TTL,
                        ),
                    ],
                }),
                CLIENT_IPv4,
                INTERFACE_NAME,
            );
            await waitFor(Seconds(2));

            expect(sent).deep.equal([]);
        });

        it("keeps additional records of a unicast reply that multicast would hold back", async () => {
            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));
            await waitFor(Millis(500));

            query({ name: WINDOW_QNAME, recordType: DnsRecordType.SRV, uniCastResponse: true });
            await MockTime.resolve(sentAtLeast(2));

            expect(targets[1]).equal(CLIENT_IPv4);
            expect(summarize(sent[1].additionalRecords)).deep.equal([`A ${HOST} ttl=${FULL_TTL}`]);
        });

        it("claims no names after close, for a registration that the close interrupts or a withdrawal", async () => {
            const socket = new MdnsSocket(udpServerSimulator);
            let claims = 0;
            const registerRelevantNames = socket.registerRelevantNames.bind(socket);
            socket.registerRelevantNames = (owner, names) => {
                claims++;
                registerRelevantNames(owner, names);
            };
            const server = new MdnsServer(socket);
            const first = await server.register("one", () => serviceRecords("one.b.c.d"));
            await server.register("two", () => serviceRecords("two.b.c.d"));
            await MockTime.resolve(server.broadcast());
            const registering = server.register("three", () => serviceRecords("three.b.c.d"));
            const closing = server.close();
            claims = 0;

            await MockTime.resolve(Promise.all([registering, closing]));
            await first.withdraw();

            expect(claims).equal(0);
        });

        it("answers a query for a name registered after the names were claimed", async () => {
            await register("other", () => [
                SrvRecord("other.service.local", { priority: 0, weight: 0, port: 1234, target: HOST }, FULL_TTL),
            ]);

            query({ name: "other.service.local", recordType: DnsRecordType.SRV });
            await MockTime.resolve(sentAtLeast(1));

            expect(answerSummary()).deep.equal([`SRV other.service.local ttl=${FULL_TTL}`]);
        });
    });

    describe("Close", () => {
        let levels: LogLevel[];
        let values: unknown[];

        beforeEach(() => {
            levels = new Array<LogLevel>();
            values = new Array<unknown>();
            Logger.destinations.capture = LogDestination({
                add(message) {
                    if (message.facility === "MdnsServer") {
                        levels.push(message.level);
                        values.push(...message.values);
                    }
                },
            });
        });

        afterEach(() => {
            delete Logger.destinations.capture;
        });

        it("sends nothing and logs at debug level for a broadcast after close", async () => {
            const responses = new Array<Bytes>();
            onResponse = async message => {
                responses.push(message);
            };

            await mdnsServer.close();
            await MockTime.resolve(mdnsServer.broadcast("foo"));

            expect(responses).deep.equal([]);
            expect(levels).not.empty;
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equal([]);
        });

        it("logs at debug level when withdrawing a service while the server closes", async () => {
            onResponse = async () => {};
            await MockTime.resolve(mdnsServer.broadcast("foo"));
            levels.length = 0;

            const closing = mdnsServer.close();
            await fooRegistration.withdraw();
            await closing;

            expect(levels).not.empty;
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equal([]);
            expect(values.some(value => value instanceof ClosedError)).true;
        });

        it("returns the same promise from every close, unregisters its names and stops truncated queries", async () => {
            const responses = new Array<Bytes>();
            onResponse = async message => {
                responses.push(message);
            };
            send(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query | DnsMessageTypeFlag.TC,
                    queries: [{ name: DUMMY_QNAME, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.ANY }],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            const closing = mdnsServer.close();
            expect(mdnsServer.close()).equal(closing);
            await closing;
            await waitFor(Seconds(1));

            expect(responses).deep.equal([]);
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equal([]);
        });
    });

    describe("Host name", () => {
        let interfaces: Record<string, NetworkInterfaceDetails | "throws" | "none">;
        let failListingOnce: boolean;
        let multiNetwork: Network;
        let server: MdnsServer;
        let foo: MdnsServer.Registration;
        let sent: Array<{ netInterface?: string; message?: DnsMessage }>;
        let lookups: string[];
        let deliver: (message: Bytes, remoteIp: string, netInterface: string) => void;
        let failingInterfaces: Set<string>;
        let socketNames: string[];
        let sentWaiter: { count: number; resolve(): void } | undefined;

        /** Resolves once {@link count} packets were sent since {@link sent} was last emptied. */
        function sentAtLeast(count: number) {
            if (sent.length >= count) {
                return Promise.resolve();
            }
            return new Promise<void>(resolve => (sentWaiter = { count, resolve }));
        }

        class MultiInterfaceNetwork extends MockNetwork {
            override getNetInterfaces() {
                if (failListingOnce) {
                    failListingOnce = false;
                    throw new NetworkError("Interfaces cannot be listed");
                }
                return Object.keys(interfaces).map(name => ({ name }));
            }

            override getIpMac(name: string) {
                lookups.push(name);
                const details = interfaces[name];
                if (details === "throws") {
                    throw new NetworkError(`Interface ${name} is gone`);
                }
                if (details === "none") {
                    throw new InternalError(`Interface ${name} reports no details only asynchronously in this test`);
                }
                return details;
            }
        }

        class AsyncNetwork extends Network {
            constructor(private readonly inner: MultiInterfaceNetwork) {
                super();
            }

            getNetInterfaces() {
                return this.inner.getNetInterfaces();
            }

            async getIpMac(name: string) {
                await Promise.resolve();
                if (interfaces[name] === "none") {
                    lookups.push(name);
                    return undefined;
                }
                return this.inner.getIpMac(name);
            }

            createUdpSocket(options: UdpSocketOptions) {
                return this.inner.createUdpSocket(options);
            }

            override close() {
                return this.inner.close();
            }
        }

        function createServer(network: Network) {
            multiNetwork = network;
            const udp = {
                onMessage(listener: (message: Bytes, remoteIp: string, netInterface: string) => void) {
                    deliver = listener;
                },
                async send(
                    message: Bytes,
                    netInterface?: string,
                    _unicastTarget?: string,
                ): Promise<UdpMulticastServer.Reach | undefined> {
                    if (netInterface !== undefined && failingInterfaces.has(netInterface)) {
                        throw new NetworkError(`Interface ${netInterface} is gone`);
                    }
                    sent.push({ netInterface, message: DnsCodec.decode(message) });
                    if (sentWaiter !== undefined && sent.length >= sentWaiter.count) {
                        sentWaiter.resolve();
                        sentWaiter = undefined;
                    }
                    return netInterface === undefined ? undefined : { kind: "all" };
                },
                async close() {},
                get network() {
                    return multiNetwork;
                },
            } as UdpMulticastServer;
            const socket = new MdnsSocket(udp);
            const registerRelevantNames = socket.registerRelevantNames.bind(socket);
            socket.registerRelevantNames = (owner, names) => {
                socketNames = names === "all" ? ["all"] : [...names].sort();
                registerRelevantNames(owner, names);
            };
            server = new MdnsServer(socket);
        }

        const generator: MdnsServer.RecordGenerator = (_intf, addrs, hostname) => [
            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: hostname }),
            ...addrs.ipV4.map(ip => ARecord(hostname, ip)),
        ];

        async function announcedTargets() {
            // RFC 6762 §6: an announcement defers records multicast less than a second ago
            await MockTime.advance(Seconds(1));
            sent.length = 0;
            foo = await server.register("foo", generator);
            await MockTime.resolve(server.broadcast("foo"));
            return sent.flatMap(({ netInterface, message }) =>
                (message?.answers ?? [])
                    .filter(record => record.recordType === DnsRecordType.SRV && record.ttl > 0)
                    .map(record => ({ netInterface, target: record.value.target })),
            );
        }

        beforeEach(() => {
            interfaces = {
                lo: { mac: "00:00:00:00:00:00", ipV4: ["127.0.0.1"], ipV6: [] },
                eth0: { mac: "aa:bb:cc:dd:ee:01", ipV4: ["10.0.0.2"], ipV6: [] },
                docker0: { mac: "aa:bb:cc:dd:ee:02", ipV4: ["172.17.0.1"], ipV6: [] },
            };
            sent = [];
            lookups = [];
            failingInterfaces = new Set();
            socketNames = [];
            failListingOnce = false;
            createServer(new MultiInterfaceNetwork(new NetworkSimulator(), CLIENT_MAC, clientIps));
        });

        afterEach(async () => {
            await server.close();
            await multiNetwork.close();
        });

        it("names one host on every interface", async () => {
            interfaces = { anpi0: { mac: "aa:bb:cc:dd:ee:00", ipV4: [], ipV6: [] }, ...interfaces };

            expect(await announcedTargets()).deep.equal([
                { netInterface: "anpi0", target: "AABBCCDDEE010000.local" },
                { netInterface: "lo", target: "AABBCCDDEE010000.local" },
                { netInterface: "eth0", target: "AABBCCDDEE010000.local" },
                { netInterface: "docker0", target: "AABBCCDDEE010000.local" },
            ]);
        });

        it("keeps the name while its MAC is present, even when another interface lists first", async () => {
            await announcedTargets();
            interfaces = { docker0: interfaces.docker0, eth0: interfaces.eth0 };

            expect(await announcedTargets()).deep.equal([
                { netInterface: "docker0", target: "AABBCCDDEE010000.local" },
                { netInterface: "eth0", target: "AABBCCDDEE010000.local" },
            ]);
        });

        it("follows a rotated MAC", async () => {
            await announcedTargets();
            interfaces.eth0 = { mac: "aa:bb:cc:dd:ee:03", ipV4: ["10.0.0.2"], ipV6: [] };

            expect(await announcedTargets()).deep.equal([
                { netInterface: "lo", target: "AABBCCDDEE030000.local" },
                { netInterface: "eth0", target: "AABBCCDDEE030000.local" },
                { netInterface: "docker0", target: "AABBCCDDEE030000.local" },
            ]);
        });

        it("skips an interface whose details cannot be read", async () => {
            interfaces = { gone: "throws", ...interfaces };

            expect(await announcedTargets()).deep.equal([
                { netInterface: "lo", target: "AABBCCDDEE010000.local" },
                { netInterface: "eth0", target: "AABBCCDDEE010000.local" },
                { netInterface: "docker0", target: "AABBCCDDEE010000.local" },
            ]);
        });

        it("says goodbye on an interface whose details can no longer be read", async () => {
            await announcedTargets();
            interfaces.eth0 = "throws";
            sent.length = 0;

            await foo.withdraw();

            expect(
                sent.flatMap(({ netInterface, message }) =>
                    (message?.answers ?? [])
                        .filter(record => record.recordType === DnsRecordType.SRV && record.ttl === 0)
                        .map(() => netInterface),
                ),
            ).deep.equal(["lo", "eth0", "docker0"]);
        });

        it("chooses the name on a network that reports interface details asynchronously", async () => {
            await server.close();
            await multiNetwork.close();
            interfaces = { gone: "throws", ...interfaces };
            createServer(new AsyncNetwork(new MultiInterfaceNetwork(new NetworkSimulator(), CLIENT_MAC, clientIps)));

            expect(await announcedTargets()).deep.equal([
                { netInterface: "lo", target: "AABBCCDDEE010000.local" },
                { netInterface: "eth0", target: "AABBCCDDEE010000.local" },
                { netInterface: "docker0", target: "AABBCCDDEE010000.local" },
            ]);
        });

        it("names each interface by its own MAC when the interfaces cannot be listed", async () => {
            failListingOnce = true;

            expect(await announcedTargets()).deep.equal([
                { netInterface: "lo", target: "0000000000000000.local" },
                { netInterface: "eth0", target: "AABBCCDDEE010000.local" },
                { netInterface: "docker0", target: "AABBCCDDEE020000.local" },
            ]);
        });

        it("names each interface by its own MAC when none has a usable one", async () => {
            interfaces = { lo: interfaces.lo };

            expect(await announcedTargets()).deep.equal([{ netInterface: "lo", target: "0000000000000000.local" }]);
        });

        function goodbyeInterfaces() {
            return sent.flatMap(({ netInterface, message }) =>
                (message?.answers ?? [])
                    .filter(record => record.recordType === DnsRecordType.SRV && record.ttl === 0)
                    .map(() => netInterface),
            );
        }

        function captureLevels() {
            const levels = new Array<LogLevel>();
            Logger.destinations.capture = LogDestination({
                add(message) {
                    if (message.facility === "MdnsServer") {
                        levels.push(message.level);
                    }
                },
            });
            return levels;
        }

        it("keeps the goodbye of an interface that one listing misses", async () => {
            await announcedTargets();
            const eth0 = interfaces.eth0;
            delete interfaces.eth0;
            await MockTime.resolve(server.broadcast("foo"));
            interfaces.eth0 = eth0;
            sent.length = 0;

            await foo.withdraw();

            expect(goodbyeInterfaces()).deep.equal(["lo", "eth0", "docker0"]);
        });

        it("logs a failed goodbye on an interface that is no longer listed at debug level", async () => {
            await announcedTargets();
            delete interfaces.eth0;
            await MockTime.resolve(server.broadcast("foo"));
            failingInterfaces.add("eth0");
            sent.length = 0;
            const levels = captureLevels();

            try {
                await foo.withdraw();
            } finally {
                delete Logger.destinations.capture;
            }

            expect(goodbyeInterfaces()).deep.equal(["lo", "docker0"]);
            expect(levels).deep.equal([LogLevel.DEBUG]);
        });

        it("notices once that the details of an interface cannot be read", async () => {
            interfaces = { gone: "throws", ...interfaces };
            const messages = new Array<{ level: LogLevel; text: string }>();
            Logger.destinations.capture = LogDestination({
                add(message) {
                    if (message.facility === "MdnsServer" && message.level > LogLevel.DEBUG) {
                        messages.push({ level: message.level, text: String(message.values[0]) });
                    }
                },
            });

            try {
                await announcedTargets();
                await MockTime.advance(Seconds(11));
                await MockTime.resolve(server.broadcast("foo"));
            } finally {
                delete Logger.destinations.capture;
            }

            expect(messages).deep.equal([{ level: LogLevel.NOTICE, text: "Details of interface gone cannot be read" }]);
        });

        it("announces changed addresses on the broadcast after a refresh and says goodbye to the old ones", async () => {
            await announcedTargets();
            interfaces.eth0 = { mac: "aa:bb:cc:dd:ee:01", ipV4: ["10.0.0.3"], ipV6: [] };
            sent.length = 0;

            await MockTime.resolve(foo.refresh());
            await MockTime.resolve(server.broadcast("foo"));

            expect(
                sent.flatMap(({ netInterface, message }) =>
                    netInterface === "eth0"
                        ? (message?.answers ?? [])
                              .filter(({ recordType }) => recordType === DnsRecordType.A)
                              .map(({ value, ttl }) => `${value} ttl=${ttl}`)
                        : [],
                ),
            ).deep.equal(["10.0.0.2 ttl=0", "10.0.0.3 ttl=120000"]);
        });
        it("keeps no registration whose generator throws", async () => {
            await announcedTargets();

            await expect(
                server.register("bad", () => {
                    throw new ImplementationError("Generator failed");
                }),
            ).rejectedWith(ImplementationError);
            const levels = captureLevels();
            try {
                await MockTime.resolve(server.broadcast());
            } finally {
                delete Logger.destinations.capture;
            }

            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equal([]);
        });

        it("sends no goodbye once every record it sent has expired", async () => {
            await announcedTargets();
            sent.length = 0;
            await MockTime.advance(Minutes(16));

            await foo.withdraw();

            expect(goodbyeInterfaces()).deep.equal([]);
            expect(sent).deep.equal([]);
        });

        it("reads the interface addresses again after 15 minutes", async () => {
            await announcedTargets();
            interfaces.eth0 = { mac: "aa:bb:cc:dd:ee:01", ipV4: ["10.0.0.3"], ipV6: [] };

            await MockTime.advance(Minutes(14));
            sent.length = 0;
            await MockTime.resolve(server.broadcast("foo"));
            const before = sent.flatMap(({ netInterface, message }) =>
                netInterface === "eth0"
                    ? (message?.answers ?? []).filter(({ recordType }) => recordType === DnsRecordType.A)
                    : [],
            );

            await MockTime.advance(Minutes(2));
            sent.length = 0;
            await MockTime.resolve(server.broadcast("foo"));
            const after = sent.flatMap(({ netInterface, message }) =>
                netInterface === "eth0"
                    ? (message?.answers ?? []).filter(({ recordType }) => recordType === DnsRecordType.A)
                    : [],
            );

            expect(before.map(({ value }) => value)).deep.equal(["10.0.0.2"]);
            expect(after.map(({ value }) => value)).deep.equal(["10.0.0.3"]);
        });

        it("answers from the last details when they cannot be read again", async () => {
            await announcedTargets();
            interfaces.eth0 = "throws";
            await MockTime.advance(Minutes(16));
            sent.length = 0;

            deliver(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: DUMMY_QNAME, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.SRV }],
                }),
                CLIENT_IPv4,
                "eth0",
            );
            await MockTime.resolve(sentAtLeast(1));

            expect(sent.map(({ netInterface }) => netInterface)).deep.equal(["eth0"]);
        });

        function queryOn(netInterface: string) {
            deliver(
                DnsCodec.encode({
                    messageType: DnsMessageType.Query,
                    queries: [{ name: DUMMY_QNAME, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.SRV }],
                }),
                CLIENT_IPv4,
                netInterface,
            );
        }

        it("says no goodbye to the records of a live service while the interface reports no details", async () => {
            await server.close();
            await multiNetwork.close();
            createServer(new AsyncNetwork(new MultiInterfaceNetwork(new NetworkSimulator(), CLIENT_MAC, clientIps)));
            await announcedTargets();
            const bar = await server.register("bar", () => [
                SrvRecord("bar.b.c.d", { priority: 0, weight: 0, port: 1, target: "bar.local" }),
            ]);
            await MockTime.resolve(server.broadcast("bar"));
            interfaces.eth0 = "none";
            await MockTime.resolve(foo.refresh());
            sent.length = 0;

            await bar.withdraw();

            expect(
                sent.flatMap(({ message }) =>
                    (message?.answers ?? []).filter(({ ttl }) => ttl === 0).map(({ name }) => name),
                ),
            ).deep.equal(["bar.b.c.d", "bar.b.c.d", "bar.b.c.d"]);
        });

        it("keeps the last details when an asynchronous read fails and reads them again later", async () => {
            await server.close();
            await multiNetwork.close();
            createServer(new AsyncNetwork(new MultiInterfaceNetwork(new NetworkSimulator(), CLIENT_MAC, clientIps)));
            await announcedTargets();
            interfaces.eth0 = "throws";
            await MockTime.advance(Minutes(16));
            sent.length = 0;

            queryOn("eth0");
            await MockTime.resolve(sentAtLeast(1));
            expect(sent.map(({ netInterface }) => netInterface)).deep.equal(["eth0"]);

            interfaces.eth0 = { mac: "aa:bb:cc:dd:ee:01", ipV4: ["10.0.0.3"], ipV6: [] };
            await MockTime.advance(Seconds(11));
            sent.length = 0;
            await MockTime.resolve(server.broadcast("foo"));

            expect(
                sent.flatMap(({ netInterface, message }) =>
                    netInterface === "eth0"
                        ? (message?.answers ?? [])
                              .filter(({ recordType, ttl }) => recordType === DnsRecordType.A && ttl > 0)
                              .map(({ value }) => value)
                        : [],
                ),
            ).deep.equal(["10.0.0.3"]);
        });

        it("reads the details of an interface without earlier details again only after the retry interval", async () => {
            await announcedTargets();
            interfaces.wlan0 = "throws";
            lookups.length = 0;

            queryOn("wlan0");
            queryOn("wlan0");
            await MockTime.advance(Seconds(5));
            queryOn("wlan0");
            expect(lookups).deep.equal(["wlan0"]);

            await MockTime.advance(Seconds(6));
            queryOn("wlan0");
            expect(lookups).deep.equal(["wlan0", "wlan0"]);
        });

        it("reads an interface that reported no details again only after the retry interval", async () => {
            await server.close();
            await multiNetwork.close();
            createServer(new AsyncNetwork(new MultiInterfaceNetwork(new NetworkSimulator(), CLIENT_MAC, clientIps)));
            await MockTime.resolve(announcedTargets());
            interfaces.wlan0 = "none";
            lookups.length = 0;

            queryOn("wlan0");
            await waitFor(Seconds(5));
            queryOn("wlan0");
            await waitFor(Seconds(6));
            queryOn("wlan0");
            await waitFor(Millis(10));

            expect(lookups).deep.equal(["wlan0", "wlan0"]);
        });

        it("does not read a failed interface again for a registration within the retry interval", async () => {
            interfaces = { gone: "throws", ...interfaces };
            await MockTime.resolve(announcedTargets());
            lookups.length = 0;

            await server.register("bar", () => []);

            expect(lookups.filter(name => name === "gone")).deep.equal([]);
        });

        it("logs a failed interface listing during a broadcast and does not throw", async () => {
            await MockTime.resolve(announcedTargets());
            failListingOnce = true;
            const levels = captureLevels();

            try {
                await MockTime.resolve(server.broadcast("foo"));
            } finally {
                delete Logger.destinations.capture;
            }

            expect(levels).deep.equal([LogLevel.WARN]);
        });

        it("tells the socket the names once interface details appear after the registration", async () => {
            await server.close();
            await multiNetwork.close();
            const known = interfaces;
            interfaces = { lo: "none", eth0: "none", docker0: "none" };
            createServer(new AsyncNetwork(new MultiInterfaceNetwork(new NetworkSimulator(), CLIENT_MAC, clientIps)));
            foo = await server.register("foo", generator);
            expect(socketNames).deep.equal([]);

            interfaces = known;
            await MockTime.advance(Seconds(11));
            await MockTime.resolve(server.broadcast("foo"));

            expect(socketNames).includes(DUMMY_QNAME);
        });

        it("notices once why a query on an interface without details is not answered", async () => {
            await MockTime.resolve(announcedTargets());
            interfaces.wlan0 = "throws";
            const messages = new Array<{ level: LogLevel; text: string }>();
            Logger.destinations.capture = LogDestination({
                add(message) {
                    if (message.facility === "MdnsServer") {
                        messages.push({ level: message.level, text: String(message.values[0]) });
                    }
                },
            });

            try {
                queryOn("wlan0");
                await waitFor(Millis(10));
            } finally {
                delete Logger.destinations.capture;
            }

            expect(messages).deep.equal([
                { level: LogLevel.NOTICE, text: "Details of interface wlan0 cannot be read" },
            ]);
        });

        it("names the interface of a failed announcement and the failed listing in its log", async () => {
            await MockTime.resolve(announcedTargets());
            const messages = new Array<{ level: LogLevel; text: string }>();
            Logger.destinations.capture = LogDestination({
                add(message) {
                    if (message.facility === "MdnsServer") {
                        messages.push({ level: message.level, text: String(message.values[0]) });
                    }
                },
            });

            try {
                await MockTime.advance(Seconds(1));
                failingInterfaces.add("eth0");
                await MockTime.resolve(server.broadcast("foo"));
                failListingOnce = true;
                await MockTime.resolve(server.broadcast("foo"));
            } finally {
                delete Logger.destinations.capture;
            }

            expect(messages).deep.equal([
                { level: LogLevel.NOTICE, text: "mDNS messages on interface eth0 cannot be sent" },
                { level: LogLevel.WARN, text: "Error announcing MDNS messages" },
            ]);
        });

        it("reads the details of a new interface once for two queries that arrive together", async () => {
            await server.close();
            await multiNetwork.close();
            createServer(new AsyncNetwork(new MultiInterfaceNetwork(new NetworkSimulator(), CLIENT_MAC, clientIps)));
            foo = await server.register("foo", generator);
            interfaces.eth1 = { mac: "aa:bb:cc:dd:ee:04", ipV4: ["10.0.1.2"], ipV6: [] };
            lookups.length = 0;

            for (const recordType of [DnsRecordType.SRV, DnsRecordType.A]) {
                deliver(
                    DnsCodec.encode({
                        messageType: DnsMessageType.Query,
                        queries: [
                            {
                                name: recordType === DnsRecordType.SRV ? DUMMY_QNAME : "AABBCCDDEE010000.local",
                                recordClass: DnsRecordClass.IN,
                                recordType,
                            },
                        ],
                    }),
                    CLIENT_IPv4,
                    "eth1",
                );
            }
            await MockTime.resolve(sentAtLeast(1));

            expect(lookups).deep.equal(["eth1"]);
            expect(sent.map(({ message }) => message?.answers.map(({ recordType }) => recordType))).deep.equal([
                [DnsRecordType.SRV],
            ]);
        });
    });
});
