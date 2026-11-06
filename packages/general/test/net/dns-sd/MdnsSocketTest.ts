/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AAAARecord,
    Bytes,
    DnsCodec,
    DnsMessage,
    DnsMessageType,
    DnsRecordClass,
    DnsRecordType,
    LogDestination,
    Logger,
    LogLevel,
    MAX_MDNS_MESSAGE_SIZE,
    MatterAggregateError,
    MdnsSocket,
    MockNetwork,
    NetworkError,
    NetworkSimulator,
    NetworkUnreachableError,
    PtrRecord,
    Seconds,
    UdpSocketOptions,
} from "#index.js";
import {
    closeTestEnv,
    collectSentMessages,
    completeDnsMessage,
    createMatterServiceResponse,
    createOversizedResponse,
    createQuery,
    createResponse,
    createTestEnv,
    DEFAULT_IPV4,
    PEER_IPV4,
    PEER_IPV6,
    sendFromPeer,
    TestEnv,
    waitForReceipt,
} from "./mdns-socket-utils.js";

/** {@link message} with its list of failed sends sorted, because the address families are sent in parallel */
function failuresInAnyOrder(message: string) {
    const [head, list] = message.split("Send failed on ");
    return list === undefined ? message : `${head}Send failed on ${list.split(", ").sort().join(", ")}`;
}
describe("MdnsSocket", () => {
    describe("receiving messages", () => {
        let env: TestEnv;

        beforeEach(async () => {
            env = await createTestEnv({ enableIpv4: true });
        });

        afterEach(async () => {
            await closeTestEnv(env);
        });

        it("receives and parses valid DNS query", async () => {
            const query = completeDnsMessage(createQuery("_matter._tcp.local"));

            const receiptPromise = waitForReceipt(env.socket);
            await sendFromPeer(env, query);

            const received = await receiptPromise;
            expect(received.messageType).to.equal(DnsMessageType.Query);
            expect(received.queries).to.have.length(1);
            expect(received.queries[0].name).to.equal("_matter._tcp.local");
            expect(received.sourceIp).to.equal(PEER_IPV4);
            expect(received.sourceIntf).to.equal("fake0");
        });

        it("receives and parses valid DNS response", async () => {
            const response = completeDnsMessage(
                createMatterServiceResponse("TestDevice", 5540, "device.local", "192.168.1.100"),
            );

            const receiptPromise = waitForReceipt(env.socket);
            await sendFromPeer(env, response);

            const received = await receiptPromise;
            expect(received.messageType).to.equal(DnsMessageType.Response);
            expect(received.answers.length).to.be.greaterThan(0);
        });

        it("ignores unparseable messages", async () => {
            // Send garbage data that cannot be parsed as DNS
            const garbageData = Bytes.fromHex("deadbeef0102030405");
            await env.peerChannel.send(MdnsSocket.BROADCAST_IPV4, MdnsSocket.BROADCAST_PORT, garbageData);

            // Send a valid message after to verify socket still works
            const query = completeDnsMessage(createQuery("_test._tcp.local"));
            const receiptPromise = waitForReceipt(env.socket);
            await sendFromPeer(env, query);

            const received = await receiptPromise;
            expect(received.queries[0].name).to.equal("_test._tcp.local");
        });

        it("waits on close for a message handler still running", async () => {
            let release!: () => void;
            const gate = new Promise<void>(resolve => (release = resolve));
            const handling = new Promise<void>(resolve => {
                env.socket.receipt.on(async () => {
                    resolve();
                    await gate;
                });
            });
            await sendFromPeer(env, completeDnsMessage(createQuery("_matter._tcp.local")));
            await handling;

            let closed = false;
            const closing = env.socket.close().then(() => {
                closed = true;
            });
            for (let i = 0; i < 10; i++) {
                await MockTime.yield();
            }
            expect(closed).false;

            release();
            await closing;
            expect(closed).true;
        });

        it("ignores messages after close", async () => {
            await env.socket.close();

            // Attempt to send - should not throw and message should be ignored
            const query = completeDnsMessage(createQuery("_matter._tcp.local"));
            const encoded = DnsCodec.encode(query);
            await env.peerChannel.send(MdnsSocket.BROADCAST_IPV4, MdnsSocket.BROADCAST_PORT, encoded);

            // No way to directly verify the message was ignored, but no error should occur
        });
    });

    describe("receiving messages IPv6 only", () => {
        let env: TestEnv;

        beforeEach(async () => {
            env = await createTestEnv({ enableIpv4: false });
        });

        afterEach(async () => {
            await closeTestEnv(env);
        });

        it("receives messages via IPv6", async () => {
            const query = completeDnsMessage(createQuery("_matter._tcp.local"));

            const receiptPromise = waitForReceipt(env.socket);
            await sendFromPeer(env, query, false);

            const received = await receiptPromise;
            expect(received.messageType).to.equal(DnsMessageType.Query);
            expect(received.sourceIp).to.equal(PEER_IPV6);
        });
    });

    describe("sending messages", () => {
        let env: TestEnv;

        beforeEach(async () => {
            env = await createTestEnv({ enableIpv4: true });
        });

        afterEach(async () => {
            await closeTestEnv(env);
        });

        it("sends a simple query", async () => {
            const collector = collectSentMessages(env);

            const query = createQuery("_matter._tcp.local");
            await env.socket.send(query, "fake0");

            await collector.stop();
            expect(collector.messages).to.have.length(1);
            expect(collector.messages[0].queries).to.have.length(1);
            expect(collector.messages[0].queries[0].name).to.equal("_matter._tcp.local");
        });

        it("sends a response with answers", async () => {
            const collector = collectSentMessages(env);

            const response = createResponse([PtrRecord("_matter._tcp.local", "device._matter._tcp.local")]);
            await env.socket.send(response, "fake0");

            await collector.stop();
            expect(collector.messages).to.have.length(1);
            expect(collector.messages[0].messageType).to.equal(DnsMessageType.Response);
            expect(collector.messages[0].answers).to.have.length(1);
        });

        it("sends unicast message to specific destination", async () => {
            const collector = collectSentMessages(env);

            const response = createResponse([PtrRecord("_matter._tcp.local", "device._matter._tcp.local")]);
            await env.socket.send(response, "fake0", PEER_IPV4);

            await collector.stop();
            expect(collector.messages).to.have.length(1);
        });
    });

    describe("message splitting", () => {
        let env: TestEnv;

        beforeEach(async () => {
            env = await createTestEnv({ enableIpv4: true });
        });

        afterEach(async () => {
            await closeTestEnv(env);
        });

        it("splits large response into multiple messages", async () => {
            const collector = collectSentMessages(env);

            // Create a response with many answers that will exceed MAX_MDNS_MESSAGE_SIZE
            const largeResponse = createOversizedResponse(20);
            await env.socket.send(largeResponse, "fake0");

            await collector.stop();

            // Should have been split into multiple messages
            expect(collector.messages.length).to.be.greaterThan(1);

            // Each message should be under the size limit
            for (const msg of collector.messages) {
                const encoded = DnsCodec.encode(msg);
                expect(encoded.byteLength).to.be.at.most(MAX_MDNS_MESSAGE_SIZE);
            }

            // Total answers across all messages should match original
            const totalAnswers = collector.messages.reduce((sum, msg) => sum + msg.answers.length, 0);
            expect(totalAnswers).to.equal(largeResponse.answers!.length);
        });

        it("clears queries after first split message", async () => {
            const collector = collectSentMessages(env);

            // Create a query with many known answers that will be split
            const largeQuery = {
                messageType: DnsMessageType.Query,
                queries: [{ name: "_matter._tcp.local", recordType: 12, recordClass: 1, uniCastResponse: false }],
                answers: createOversizedResponse(20).answers,
                authorities: [],
                additionalRecords: [],
            };
            await env.socket.send(largeQuery, "fake0");

            await collector.stop();

            // First message should have the query
            expect(collector.messages[0].queries).to.have.length(1);

            // Subsequent messages should have no queries
            for (let i = 1; i < collector.messages.length; i++) {
                expect(collector.messages[i].queries).to.have.length(0);
            }
        });

        it("sends oversized answer records with warning", async () => {
            // Create a single answer that is way too large (impossible to fit in standard mDNS)
            const hugeValue = "x".repeat(2000);
            const oversizedAnswer = {
                messageType: DnsMessageType.Response as const,
                queries: [],
                answers: [
                    {
                        name: `${"a".repeat(200)}._matter._tcp.local`,
                        recordType: 16,
                        recordClass: 1,
                        ttl: Seconds(120),
                        value: [hugeValue],
                        flushCache: false,
                    },
                ],
                authorities: [],
                additionalRecords: [],
            };

            // Should complete successfully with a warning (not throw)
            // The warning is logged but the message is sent anyway
            await env.socket.send(oversizedAnswer, "fake0");
        });
    });

    describe("query splitting", () => {
        let env: TestEnv;

        beforeEach(async () => {
            env = await createTestEnv({ enableIpv4: true });
        });

        afterEach(async () => {
            await closeTestEnv(env);
        });

        it("sends queries in single message when they fit (1 packet)", async () => {
            const collector = collectSentMessages(env);

            // 5 short queries that easily fit in one message
            const query = {
                messageType: DnsMessageType.Query,
                queries: [
                    { name: "_svc1._tcp.local", recordType: 255, recordClass: 1, uniCastResponse: false },
                    { name: "_svc2._tcp.local", recordType: 255, recordClass: 1, uniCastResponse: false },
                    { name: "_svc3._tcp.local", recordType: 255, recordClass: 1, uniCastResponse: false },
                    { name: "_svc4._tcp.local", recordType: 255, recordClass: 1, uniCastResponse: false },
                    { name: "_svc5._tcp.local", recordType: 255, recordClass: 1, uniCastResponse: false },
                ],
                answers: [],
                authorities: [],
                additionalRecords: [],
            };
            await env.socket.send(query, "fake0");

            await collector.stop();
            expect(collector.messages).to.have.length(1);
            expect(collector.messages[0].queries).to.have.length(5);

            // Verify message is under size limit
            const encoded = DnsCodec.encode(collector.messages[0]);
            expect(encoded.byteLength).to.be.at.most(MAX_MDNS_MESSAGE_SIZE);
        });

        it("splits queries into 2 packets when they exceed message size", async () => {
            const collector = collectSentMessages(env);

            // Each query ~55 bytes (name encoding + 4 bytes type/class)
            // 12 bytes header, 1232 max → ~22 queries per packet
            // 25 queries should need 2 packets
            const queries = [];
            for (let i = 0; i < 25; i++) {
                queries.push({
                    name: `service${i.toString().padStart(3, "0")}xxxxxxxxxxxxxxxxxxxx._matter._tcp.local`,
                    recordType: 255,
                    recordClass: 1,
                    uniCastResponse: false,
                });
            }
            const query = {
                messageType: DnsMessageType.Query,
                queries,
                answers: [],
                authorities: [],
                additionalRecords: [],
            };
            await env.socket.send(query, "fake0");

            await collector.stop();
            expect(collector.messages).to.have.length(2);

            // Total queries across all messages should match original
            const totalQueries = collector.messages.reduce((sum, msg) => sum + msg.queries.length, 0);
            expect(totalQueries).to.equal(25);

            // Each message should be under size limit
            for (const msg of collector.messages) {
                const encoded = DnsCodec.encode(msg);
                expect(encoded.byteLength).to.be.at.most(MAX_MDNS_MESSAGE_SIZE);
            }
        });

        it("splits queries into 3 packets when they are very large", async () => {
            const collector = collectSentMessages(env);

            // ~22 queries per packet, so 50 queries should need 3 packets
            const queries = [];
            for (let i = 0; i < 50; i++) {
                queries.push({
                    name: `service${i.toString().padStart(3, "0")}xxxxxxxxxxxxxxxxxxxx._matter._tcp.local`,
                    recordType: 255,
                    recordClass: 1,
                    uniCastResponse: false,
                });
            }
            const query = {
                messageType: DnsMessageType.Query,
                queries,
                answers: [],
                authorities: [],
                additionalRecords: [],
            };
            await env.socket.send(query, "fake0");

            await collector.stop();
            expect(collector.messages).to.have.length(3);

            // Total queries across all messages should match original
            const totalQueries = collector.messages.reduce((sum, msg) => sum + msg.queries.length, 0);
            expect(totalQueries).to.equal(50);

            // Each message should be under size limit
            for (const msg of collector.messages) {
                const encoded = DnsCodec.encode(msg);
                expect(encoded.byteLength).to.be.at.most(MAX_MDNS_MESSAGE_SIZE);
            }
        });

        it("does not include known-answers when splitting queries", async () => {
            const collector = collectSentMessages(env);

            // Create a query with many queries AND known-answers
            // When queries are split, known-answers should be omitted because
            // they only suppress responses for queries in the SAME message
            const queries = [];
            for (let i = 0; i < 25; i++) {
                queries.push({
                    name: `service${i.toString().padStart(3, "0")}xxxxxxxxxxxxxxxxxxxx._matter._tcp.local`,
                    recordType: 255,
                    recordClass: 1,
                    uniCastResponse: false,
                });
            }
            const query = {
                messageType: DnsMessageType.Query,
                queries,
                answers: [PtrRecord("_matter._tcp.local", "device._matter._tcp.local")],
                authorities: [],
                additionalRecords: [],
            };
            await env.socket.send(query, "fake0");

            await collector.stop();
            expect(collector.messages.length).to.be.greaterThan(1);

            // All messages should have empty answers (known-answers omitted)
            for (const msg of collector.messages) {
                expect(msg.answers).to.have.length(0);
            }
        });

        it("preserves message type when splitting queries", async () => {
            const collector = collectSentMessages(env);

            const queries = [];
            for (let i = 0; i < 25; i++) {
                queries.push({
                    name: `service${i.toString().padStart(3, "0")}xxxxxxxxxxxxxxxxxxxx._matter._tcp.local`,
                    recordType: 255,
                    recordClass: 1,
                    uniCastResponse: false,
                });
            }
            const query = {
                messageType: DnsMessageType.Query,
                queries,
                answers: [],
                authorities: [],
                additionalRecords: [],
            };
            await env.socket.send(query, "fake0");

            await collector.stop();
            expect(collector.messages.length).to.be.greaterThan(1);

            // All split messages should have the same message type
            for (const msg of collector.messages) {
                expect(msg.messageType).to.equal(DnsMessageType.Query);
            }
        });
    });

    describe("additional records handling", () => {
        let env: TestEnv;

        beforeEach(async () => {
            env = await createTestEnv({ enableIpv4: true });
        });

        afterEach(async () => {
            await closeTestEnv(env);
        });

        it("includes additional records when they fit", async () => {
            const collector = collectSentMessages(env);

            const response = createMatterServiceResponse("Device1", 5540, "device.local", DEFAULT_IPV4);
            await env.socket.send(response, "fake0");

            await collector.stop();
            expect(collector.messages).to.have.length(1);
            // Response should include all records
            expect(collector.messages[0].answers.length).to.be.greaterThan(0);
        });

        it("spills additional records that do not fit into follow-up messages", async () => {
            const collector = collectSentMessages(env);

            // Create a response that fills up most of the message size with answers
            // then has additional records that won't fit
            const response = {
                ...createOversizedResponse(10),
                additionalRecords: createOversizedResponse(5).answers,
            };
            await env.socket.send(response, "fake0");

            await collector.stop();

            // All additional records are delivered across multiple messages
            const totalAdditional = collector.messages.reduce((sum, msg) => sum + msg.additionalRecords.length, 0);
            expect(totalAdditional).to.equal(5);

            expect(collector.messages.length).to.be.greaterThan(1);

            // Each message stays within the size limit
            for (const msg of collector.messages) {
                expect(DnsCodec.encode(msg).byteLength).to.be.at.most(MAX_MDNS_MESSAGE_SIZE);
            }
        });
    });

    describe("close behavior", () => {
        it("closes cleanly", async () => {
            const env = await createTestEnv();

            await env.socket.close();

            // Close should be idempotent-ish (no error on subsequent operations)
            await closeTestEnv(env);
        });

        it("ignores messages received after close starts", async () => {
            const env = await createTestEnv();
            const receivedMessages: MdnsSocket.Message[] = [];

            env.socket.receipt.on(msg => {
                receivedMessages.push(msg);
            });

            // Send first message - should be received
            const query1 = completeDnsMessage(createQuery("_first._tcp.local"));
            await sendFromPeer(env, query1);

            await Promise.resolve();

            expect(receivedMessages).to.have.length(1);

            // Close the socket
            await env.socket.close();

            // Send second message - should be ignored
            const query2 = completeDnsMessage(createQuery("_second._tcp.local"));
            const encoded = DnsCodec.encode(query2);
            await env.peerChannel.send(MdnsSocket.BROADCAST_IPV4, MdnsSocket.BROADCAST_PORT, encoded);

            // Still only one message received
            expect(receivedMessages).to.have.length(1);
            expect(receivedMessages[0].queries[0].name).to.equal("_first._tcp.local");

            await env.peerChannel.close();
            await env.network.close();
            await env.peerNetwork.close();
        });
    });

    describe("relevance pre-filter", () => {
        let env: TestEnv;

        beforeEach(async () => {
            env = await createTestEnv({ enableIpv4: true });
        });

        afterEach(async () => {
            await closeTestEnv(env);
        });

        // Subscribe, then send messages expected to be dropped followed by a sentinel expected to pass.  Delivery is
        // ordered, so the first receipt is the sentinel iff every prior message was filtered before decode.
        function firstReceiptAfter(
            dropped: (Partial<DnsMessage> & { messageType: DnsMessageType })[],
            sentinel: Partial<DnsMessage> & { messageType: DnsMessageType },
        ) {
            const receiptPromise = waitForReceipt(env.socket);
            return (async () => {
                for (const message of dropped) {
                    await sendFromPeer(env, completeDnsMessage(message));
                }
                await sendFromPeer(env, completeDnsMessage(sentinel));
                return receiptPromise;
            })();
        }

        it("accepts everything when no names are registered", async () => {
            const receiptPromise = waitForReceipt(env.socket);
            await sendFromPeer(env, completeDnsMessage(createQuery("_googlecast._tcp.local")));
            const received = await receiptPromise;
            expect(received.queries[0].name).to.equal("_googlecast._tcp.local");
        });

        it("keeps a registered service-type query and drops unrelated traffic", async () => {
            env.socket.registerRelevantNames("test", ["_matter._tcp.local"]);
            const received = await firstReceiptAfter(
                [createQuery("_googlecast._tcp.local"), createQuery("_spotify-connect._tcp.local")],
                createQuery("_matter._tcp.local"),
            );
            expect(received.queries[0].name).to.equal("_matter._tcp.local");
        });

        it("matches case-insensitively", async () => {
            env.socket.registerRelevantNames("test", ["_matter._tcp.local"]);
            const receiptPromise = waitForReceipt(env.socket);
            await sendFromPeer(env, completeDnsMessage(createQuery("_MATTER._TCP.LOCAL")));
            const received = await receiptPromise;
            expect(received.queries[0].name.toLowerCase()).to.equal("_matter._tcp.local");
        });

        it("keeps subtype and operational-instance names (derive the service-type label)", async () => {
            env.socket.registerRelevantNames("test", ["_matter._tcp.local"]);

            const subtype = await (async () => {
                const receiptPromise = waitForReceipt(env.socket);
                await sendFromPeer(env, completeDnsMessage(createQuery("_IC1AEBF9B24C32F45._sub._matter._tcp.local")));
                return receiptPromise;
            })();
            expect(subtype.queries[0].name).to.equal("_IC1AEBF9B24C32F45._sub._matter._tcp.local");

            const instance = await (async () => {
                const receiptPromise = waitForReceipt(env.socket);
                await sendFromPeer(
                    env,
                    completeDnsMessage(createQuery("89612D9C3604BB09-3DB2B46355FE8C6B._matter._tcp.local")),
                );
                return receiptPromise;
            })();
            expect(instance.queries[0].name).to.equal("89612D9C3604BB09-3DB2B46355FE8C6B._matter._tcp.local");
        });

        it("keeps an A/AAAA answer for a tracked hostname carrying no service text (trap #1)", async () => {
            env.socket.registerRelevantNames("dnssd", ["_matter._tcp.local", "68ec8a0d7fe80000.local"]);
            const receiptPromise = waitForReceipt(env.socket);
            await sendFromPeer(
                env,
                completeDnsMessage(createResponse([AAAARecord("68EC8A0D7FE80000.local", "abcd::42")])),
            );
            const received = await receiptPromise;
            expect(received.answers).to.have.length(1);
            expect(received.answers[0].name).to.equal("68EC8A0D7FE80000.local");
        });

        it("drops an A/AAAA answer for an untracked hostname", async () => {
            env.socket.registerRelevantNames("dnssd", ["_matter._tcp.local", "68ec8a0d7fe80000.local"]);
            const received = await firstReceiptAfter(
                [createResponse([AAAARecord("ffffffffffffffff.local", "abcd::99")])],
                createQuery("_matter._tcp.local"),
            );
            expect(received.queries[0].name).to.equal("_matter._tcp.local");
        });

        it("follows compression pointers to a footprint reachable only via the pointer", async () => {
            env.socket.registerRelevantNames("test", ["_matter._tcp.local"]);

            // Two answers: #1 is a TXT whose name (x.local) carries no footprint but whose RDATA happens to contain the
            // literal labels "_matter._tcp.local" (starting at offset 31); #2's name is a compression pointer to that
            // RDATA. The only literal "_matter" lives in RDATA the matcher skips, so it is found solely by following
            // the pointer in #2's name.
            // oxfmt-ignore
            const raw = Uint8Array.from([
                0x00, 0x00, 0x84, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, // header: response, 2 answers
                0x01, 0x78, 0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, 0x00, // #1 name "x.local"
                0x00, 0x10, 0x00, 0x01, 0x00, 0x00, 0x00, 0x78, 0x00, 0x14, // TXT, IN, ttl, rdlength=20
                0x07, 0x5f, 0x6d, 0x61, 0x74, 0x74, 0x65, 0x72, // RDATA @31: "_matter"
                0x04, 0x5f, 0x74, 0x63, 0x70, 0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, 0x00, // "_tcp" "local" \0
                0xc0, 0x1f, // #2 name: pointer -> offset 31
                0x00, 0x1c, 0x00, 0x01, 0x00, 0x00, 0x00, 0x78, 0x00, 0x10, // AAAA, IN, ttl, rdlength=16
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // AAAA RDATA (::)
            ]);

            const receiptPromise = waitForReceipt(env.socket);
            await env.peerChannel.send(MdnsSocket.BROADCAST_IPV4, MdnsSocket.BROADCAST_PORT, raw);
            const received = await receiptPromise;
            expect(received.answers).to.have.length(2);
        });

        it('disables filtering when an owner registers "all"', async () => {
            env.socket.registerRelevantNames("responder", ["_matter._tcp.local"]);
            env.socket.registerRelevantNames("generic", "all");
            const receiptPromise = waitForReceipt(env.socket);
            await sendFromPeer(env, completeDnsMessage(createQuery("_googlecast._tcp.local")));
            const received = await receiptPromise;
            expect(received.queries[0].name).to.equal("_googlecast._tcp.local");
        });

        it("reverts to accept-all after the last owner unregisters", async () => {
            env.socket.registerRelevantNames("test", ["_matter._tcp.local"]);
            env.socket.unregisterRelevantNames("test");
            const receiptPromise = waitForReceipt(env.socket);
            await sendFromPeer(env, completeDnsMessage(createQuery("_googlecast._tcp.local")));
            const received = await receiptPromise;
            expect(received.queries[0].name).to.equal("_googlecast._tcp.local");
        });

        it("unions footprints across owners", async () => {
            env.socket.registerRelevantNames("a", ["_matter._tcp.local"]);
            env.socket.registerRelevantNames("b", ["68ec8a0d7fe80000.local"]);

            const hostHit = await (async () => {
                const receiptPromise = waitForReceipt(env.socket);
                await sendFromPeer(
                    env,
                    completeDnsMessage(createResponse([AAAARecord("68EC8A0D7FE80000.local", "abcd::42")])),
                );
                return receiptPromise;
            })();
            expect(hostHit.answers[0].name).to.equal("68EC8A0D7FE80000.local");

            const serviceHit = await firstReceiptAfter(
                [createQuery("_googlecast._tcp.local")],
                createQuery("_matter._tcp.local"),
            );
            expect(serviceHit.queries[0].name).to.equal("_matter._tcp.local");
        });

        it("adds and removes a tracked name incrementally", async () => {
            env.socket.registerRelevantNames("filters", ["_matter._tcp.local"]);
            env.socket.addRelevantName("tracked", "68ec8a0d7fe80000.local");

            const kept = await (async () => {
                const receiptPromise = waitForReceipt(env.socket);
                await sendFromPeer(
                    env,
                    completeDnsMessage(createResponse([AAAARecord("68EC8A0D7FE80000.local", "abcd::42")])),
                );
                return receiptPromise;
            })();
            expect(kept.answers[0].name).to.equal("68EC8A0D7FE80000.local");

            env.socket.removeRelevantName("tracked", "68ec8a0d7fe80000.local");
            const received = await firstReceiptAfter(
                [createResponse([AAAARecord("68EC8A0D7FE80000.local", "abcd::99")])],
                createQuery("_matter._tcp.local"),
            );
            expect(received.queries[0].name).to.equal("_matter._tcp.local");
        });

        it("keeps a footprint shared by owners until the last releases it (refcount)", async () => {
            env.socket.registerRelevantNames("a", ["_matter._tcp.local"]);
            env.socket.registerRelevantNames("b", ["_matter._tcp.local"]);
            env.socket.unregisterRelevantNames("a");

            const receiptPromise = waitForReceipt(env.socket);
            await sendFromPeer(env, completeDnsMessage(createQuery("_matter._tcp.local")));
            const received = await receiptPromise;
            expect(received.queries[0].name).to.equal("_matter._tcp.local");
        });
    });

    describe("constants", () => {
        it("has correct mDNS broadcast addresses", () => {
            expect(MdnsSocket.BROADCAST_IPV4).to.equal("224.0.0.251");
            expect(MdnsSocket.BROADCAST_IPV6).to.equal("ff02::fb");
            expect(MdnsSocket.BROADCAST_PORT).to.equal(5353);
        });
    });

    describe("reach of a send on a named interface", () => {
        /** A network whose IPv4 sends with the numbers in {@link failingIpv4Sends} fail, counting from 0. */
        class Ipv4FailingNetwork extends MockNetwork {
            readonly failingIpv4Sends = new Set<number>();
            readonly failingIpv6Sends = new Set<number>();
            afterSend?: () => void;
            lookupFails = false;
            #ipv4Sends = 0;
            #ipv6Sends = 0;

            get ipv4Sends() {
                return this.#ipv4Sends;
            }

            override getIpMac(name: string) {
                if (this.lookupFails) {
                    throw new NetworkError(`Details of ${name} unavailable`);
                }
                return super.getIpMac(name);
            }

            override async createUdpSocket(options: UdpSocketOptions) {
                const socket = await super.createUdpSocket(options);
                const send = socket.send.bind(socket);
                socket.send = async (host, port, payload) => {
                    const fails =
                        options.type === "udp4"
                            ? this.failingIpv4Sends.has(this.#ipv4Sends++)
                            : this.failingIpv6Sends.has(this.#ipv6Sends++);
                    if (fails) {
                        throw new NetworkUnreachableError("send ENETUNREACH");
                    }
                    await send(host, port, payload);
                    this.afterSend?.();
                };
                return socket;
            }
        }

        async function socketOn(ips: string[], enableIpv4 = true) {
            const network = new Ipv4FailingNetwork(new NetworkSimulator(), "00:11:22:33:44:01", ips);
            const socket = await MdnsSocket.create(network, { enableIpv4, netInterface: "fake0" });
            return { network, socket };
        }

        const IPV4_FAILURE = "Send failed on fake0 (IPv4): send ENETUNREACH";
        const BOTH_FAILURE = "Send failed on fake0 (IPv4): send ENETUNREACH, fake0 (IPv6): send ENETUNREACH";

        function failureOf(reach: Awaited<ReturnType<MdnsSocket["send"]>>) {
            expect(reach?.kind).equals("some");
            return reach?.kind === "some" ? failuresInAnyOrder(reach.failure.message) : undefined;
        }

        it("is all when every datagram left on every address family", async () => {
            const { socket } = await socketOn(["10.10.10.1", "abcd::1"]);
            try {
                expect(await socket.send(createOversizedResponse(20), "fake0")).deep.equals({ kind: "all" });
            } finally {
                await socket.close();
            }
        });

        for (const datagram of ["a later", "the first"]) {
            it(`is some when ${datagram} datagram left on IPv6 only`, async () => {
                const { network, socket } = await socketOn(["10.10.10.1", "abcd::1"]);
                network.failingIpv4Sends.add(datagram === "the first" ? 0 : 1);
                try {
                    expect(failureOf(await socket.send(createOversizedResponse(20), "fake0"))).equals(IPV4_FAILURE);
                } finally {
                    await socket.close();
                }
            });
        }

        it("is some and sends the rest when one datagram left on no address family", async () => {
            const { network, socket } = await socketOn(["10.10.10.1", "abcd::1"]);
            network.failingIpv4Sends.add(0);
            network.failingIpv6Sends.add(0);
            const response = createOversizedResponse(20);
            try {
                expect(failureOf(await socket.send(response, "fake0"))).equals(BOTH_FAILURE);
            } finally {
                await socket.close();
            }
        });

        it("is some when the last datagram of an answer with spilled additional records left nowhere", async () => {
            const { network, socket } = await socketOn(["10.10.10.1", "abcd::1"]);
            const records = createOversizedResponse(20).answers ?? [];
            const message = {
                messageType: DnsMessageType.Response,
                answers: records.slice(0, 1),
                additionalRecords: records.slice(1),
            };
            await socket.send(message, "fake0");
            const datagrams = network.ipv4Sends;
            expect(datagrams).greaterThan(1);
            network.failingIpv4Sends.add(2 * datagrams - 1);
            network.failingIpv6Sends.add(2 * datagrams - 1);
            try {
                expect(failureOf(await socket.send(message, "fake0"))).equals(BOTH_FAILURE);
            } finally {
                await socket.close();
            }
        });

        it("is some when the first datagram of a split query left nowhere", async () => {
            const { network, socket } = await socketOn(["10.10.10.1", "abcd::1"]);
            const queries = Array.from({ length: 60 }, (_, index) => ({
                name: `${"q".repeat(40)}${index}._matter._tcp.local`,
                recordType: DnsRecordType.PTR,
                recordClass: DnsRecordClass.IN,
                uniCastResponse: false,
            }));
            network.failingIpv4Sends.add(0);
            network.failingIpv6Sends.add(0);
            try {
                expect(failureOf(await socket.send({ messageType: DnsMessageType.Query, queries }, "fake0"))).equals(
                    BOTH_FAILURE,
                );
            } finally {
                await socket.close();
            }
        });

        it("carries the first failure and logs the later ones at debug level", async () => {
            const { network, socket } = await socketOn(["10.10.10.1", "abcd::1"]);
            network.failingIpv4Sends.add(0);
            network.failingIpv4Sends.add(1);
            network.failingIpv6Sends.add(1);
            const logged = new Array<{ level: LogLevel; text: string }>();
            Logger.destinations.capture = LogDestination({
                add({ level, values }) {
                    logged.push({ level, text: values.map(value => `${value}`).join(" ") });
                },
            });
            try {
                expect(failureOf(await socket.send(createOversizedResponse(20), "fake0"))).equals(IPV4_FAILURE);
                expect(logged.map(({ level }) => level)).deep.equals([LogLevel.DEBUG]);
                expect(logged[0].text).contains("mDNS datagram on interface fake0 failed on every address family");
                expect(logged[0].text).contains("ENETUNREACH");
            } finally {
                delete Logger.destinations.capture;
                await socket.close();
            }
        });

        it("is some when a later datagram found no address family the socket uses", async () => {
            const { network, socket } = await socketOn(["10.10.10.1", "abcd::1"], false);
            network.afterSend = () => network.deleteAddr("abcd::1");
            try {
                expect(failureOf(await socket.send(createOversizedResponse(20), "fake0"))).equals(
                    "mDNS datagram not sent: interface fake0 has no address family the server uses",
                );
            } finally {
                await socket.close();
            }
        });

        it("is some with a network error when the address lookup for a later datagram fails", async () => {
            const { network, socket } = await socketOn(["10.10.10.1", "abcd::1"]);
            network.afterSend = () => (network.lookupFails = true);
            try {
                const reach = await socket.send(createOversizedResponse(20), "fake0");
                expect(failureOf(reach)).equals("mDNS datagram on interface fake0 not sent");
                expect(reach?.kind === "some" ? reach.failure.cause : undefined).instanceOf(MatterAggregateError);
            } finally {
                network.lookupFails = false;
                await socket.close();
            }
        });

        it("rejects with the first error when no datagram left on any address family", async () => {
            const { network, socket } = await socketOn(["10.10.10.1", "abcd::1"]);
            for (let i = 0; i < 10; i++) {
                network.failingIpv4Sends.add(i);
                network.failingIpv6Sends.add(i);
            }
            try {
                const error = await socket.send(createOversizedResponse(20), "fake0").then(
                    () => undefined,
                    (error: unknown) => error,
                );
                expect(error).instanceOf(NetworkError);
                expect(error instanceof Error ? error.cause : undefined).instanceOf(NetworkUnreachableError);
            } finally {
                await socket.close();
            }
        });

        it("is none on an interface without an address family the socket uses", async () => {
            const { socket } = await socketOn(["10.10.10.1"], false);
            try {
                expect(await socket.send(createOversizedResponse(20), "fake0")).deep.equals({ kind: "none" });
            } finally {
                await socket.close();
            }
        });

        it("is undefined without a named interface", async () => {
            const { socket } = await socketOn(["10.10.10.1", "abcd::1"]);
            try {
                expect(await socket.send(createOversizedResponse(1))).equals(undefined);
            } finally {
                await socket.close();
            }
        });

        it("rejects without a named interface when the address lookup for a later datagram fails", async () => {
            const { network, socket } = await socketOn(["10.10.10.1", "abcd::1"]);
            network.afterSend = () => (network.lookupFails = true);
            try {
                const error = await socket.send(createOversizedResponse(20)).then(
                    () => undefined,
                    (error: unknown) => error,
                );
                expect(error).instanceOf(MatterAggregateError);
            } finally {
                network.lookupFails = false;
                await socket.close();
            }
        });
    });
});
