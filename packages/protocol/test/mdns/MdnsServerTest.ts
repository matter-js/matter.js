/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ARecord,
    Bytes,
    DnsCodec,
    DnsMessage,
    DnsMessageType,
    DnsMessageTypeFlag,
    DnsRecord,
    DnsRecordClass,
    DnsRecordType,
    MockNetwork,
    Network,
    NetworkSimulator,
    PtrRecord,
    SrvRecord,
    TxtRecord,
    UdpMulticastServer,
} from "#general";
import { MdnsServer } from "#mdns/MdnsServer.js";
import { MdnsSocket } from "#mdns/MdnsSocket.js";

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

        send(message: Bytes, netInterface?: string, unicastTarget?: string) {
            return onResponse(message, netInterface, unicastTarget);
        },

        async close() {},

        get network() {
            return network;
        },
    } as UdpMulticastServer;

    let mdnsServer: MdnsServer;

    beforeEach(async () => {
        await MockTime.advance(130_000); // More then 2 minutes in the future for the difference calculation vs 120s ttl
        const socket = new MdnsSocket(udpServerSimulator);
        mdnsServer = new MdnsServer(socket);

        await mdnsServer.setRecordsGenerator("foo", () => [
            PtrRecord(DUMMY_QNAME, "abcd"),
            SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
            TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]),
            ARecord("abcd.local", DUMMY_IP),
        ]);
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

            await MockTime.yield3();

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

            await MockTime.yield3();

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

            await MockTime.yield3();

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

            await MockTime.yield3();

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

            await MockTime.yield3();

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

            await MockTime.yield3();

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

            await MockTime.yield3();

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
        it("server suppress response to same ANY query when 0ms delay", async () => {
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

            await MockTime.yield3();

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
                            recordType: DnsRecordType.ANY,
                        },
                    ],
                }),
                DUMMY_IP,
                INTERFACE_NAME,
            );

            expect(responses).deep.equal([]);
        });

        it("server suppress response to same ANY query when up to 1s delay", async () => {
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

            await MockTime.yield3();

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
            await MockTime.advance(1000);

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

            expect(responses).deep.equal([]);
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

            await MockTime.yield3();

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

            await MockTime.yield3();

            expect(responses).deep.equal(EXPEECTED_RESPONSE);
        });

        it("server also suppress response to different query with same records when 0ms delay", async () => {
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

            await MockTime.yield3();

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

            expect(responses).deep.equal([]);
        });

        it("server do not suppress additional records to different query when 0ms delay", async () => {
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

            await MockTime.yield3();

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

            await MockTime.yield3();

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

            await MockTime.yield3();

            expect(responses).deep.equal([{ ...RESPONSE, uniCastTarget: undefined }]); // multicast
        });

        it("server responds to an ANY query as multicast when unicast is requested after a previous unicast query with less than 1/4 of TTL remaining", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await MockTime.yield3();
            await MockTime.advance(29_000); // less than 1/4 of ttl

            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await MockTime.yield3();

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

            await MockTime.yield3();
            await MockTime.advance(31_000); // more than 1/4 of ttl

            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await MockTime.yield3();

            expect(responses).deep.equal([
                { ...RESPONSE, uniCastTarget: undefined }, // multicast
                { ...RESPONSE, uniCastTarget: undefined }, // multicast
            ]);
        });

        it("server responds to an ANY query as multicast even if requested as unicast and after a multicast query with more than 1/4 of ttl when earlier sent as multicast", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            // Send as multicast once
            QUERY.queries[0].uniCastResponse = false;
            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await MockTime.yield3();
            await MockTime.advance(20_000); // more than 1/4 of ttl

            // Send as unicast
            QUERY.queries[0].uniCastResponse = true;
            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await MockTime.yield3();
            await MockTime.advance(11_000); // more than 1/4 of ttl

            send(DnsCodec.encode(QUERY), DUMMY_IP, INTERFACE_NAME);

            await MockTime.yield3();

            expect(responses).deep.equal([
                { ...RESPONSE, uniCastTarget: undefined }, // multicast
                { ...RESPONSE, uniCastTarget: DUMMY_IP }, // unicast
                { ...RESPONSE, uniCastTarget: undefined }, // multicast
            ]);
        });
    });

    describe("Server splits response into multiple packets when answer gets too big", () => {
        it("include as many answers as possible and potentially leave additionalRecords out", async () => {
            const responses = new Array<{ message?: DnsMessage; netInterface?: string; uniCastTarget?: string }>();
            onResponse = async (message: Bytes, netInterface?: string, uniCastTarget?: string) => {
                responses.push({ message: DnsCodec.decode(message), netInterface, uniCastTarget });
            };

            const recordsRequest: DnsRecord<any>[] = [];
            const recordsAnswers: DnsRecord<any>[] = [];
            const recordsAdditional: DnsRecord<any>[] = [];
            for (let i = 0; i < 12; i++) {
                recordsRequest.push(PtrRecord(DUMMY_QNAME, "abcd"));
                recordsRequest.push(
                    SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                );
                recordsRequest.push(TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]));
                recordsRequest.push(ARecord("abcd.local", DUMMY_IP));

                recordsAnswers.push(PtrRecord(DUMMY_QNAME, "abcd"));
                recordsAnswers.push(
                    SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                );
                recordsAnswers.push(TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]));

                recordsAdditional.push(ARecord("abcd.local", DUMMY_IP));
            }

            await mdnsServer.setRecordsGenerator("foo", () => recordsRequest);

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

            await MockTime.yield3();

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: recordsAnswers,
                        additionalRecords: recordsAdditional.slice(0, 5),
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);
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
                recordsRequest.push(PtrRecord(DUMMY_QNAME, "abcd"));
                recordsRequest.push(
                    SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                );
                recordsRequest.push(TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]));
                recordsRequest.push(ARecord("abcd.local", DUMMY_IP));

                recordsAnswers.push(PtrRecord(DUMMY_QNAME, "abcd"));
                recordsAnswers.push(
                    SrvRecord(DUMMY_QNAME, { priority: 0, weight: 0, port: 1234, target: "abcd.local" }),
                );
                recordsAnswers.push(TxtRecord(DUMMY_QNAME, [`A=1`, `B=2`]));

                recordsAdditional.push(ARecord("abcd.local", DUMMY_IP));
            }

            await mdnsServer.setRecordsGenerator("foo", () => recordsRequest);

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

            while (responses.length !== 2) {
                await MockTime.yield();
            }

            expect(responses).deep.equal([
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response,
                        answers: recordsAnswers.splice(0, recordsAnswers.length - 7),
                        additionalRecords: [],
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
                {
                    message: {
                        transactionId: 0,
                        messageType: DnsMessageType.Response, // No truncation bit set because not relevant for responses
                        answers: recordsAnswers.slice(recordsAnswers.length - 7),
                        additionalRecords: recordsAdditional,
                        authorities: [],
                        queries: [],
                    },
                    netInterface: INTERFACE_NAME,
                    uniCastTarget: undefined,
                },
            ]);
        });
    });
});
