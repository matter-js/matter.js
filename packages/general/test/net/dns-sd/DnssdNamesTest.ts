/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnsMessageType, type DnsRecord, DnsRecordClass, DnsRecordType } from "#codec/DnsCodec.js";
import { Hours, Millis, Minutes, Seconds } from "#index.js";
import { MOCK_SERVICE_DOMAIN, MockSite, qnameOf } from "./dns-sd-helpers.js";

describe("DnssdNames", () => {
    before(() => {
        MockTime.enable();
    });

    it("discovers", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const discovered = new Promise<void>(resolve => {
            client.names.discovered.once(() => resolve());
        });
        await server.broadcast();
        await discovered;

        const qname = qnameOf(1);

        expect(client.names.has(qname)).true;
        expect(client.names.has(server.hostname)).true;

        const name = client.names.get(qname);
        expect([...name.records]).deep.equals([
            {
                installedAt: 1735734896000,
                expiresAt: 1735738496000,
                flushCache: false,
                name: qname,
                recordClass: 1,
                recordType: 33,
                ttl: 3600000,
                value: {
                    port: 1234,
                    priority: 10,
                    target: "0000000000000091.local",
                    weight: 1,
                },
            },
            {
                installedAt: 1735734896000,
                expiresAt: 1735738496000,
                flushCache: false,
                name: qname,
                recordClass: 1,
                recordType: 16,
                ttl: 3600000,
                value: ["flag", "foo=bar"],
            },
        ]);

        const host = client.names.get(server.hostname);
        expect([...host.records]).deep.equals([
            {
                installedAt: 1735734896000,
                expiresAt: 1735738496000,
                flushCache: false,
                name: server.hostname,
                recordClass: 1,
                recordType: 1,
                ttl: 3600000,
                value: "10.10.10.145",
            },
            {
                installedAt: 1735734896000,
                expiresAt: 1735738496000,
                flushCache: false,
                name: server.hostname,
                recordClass: 1,
                recordType: 28,
                ttl: 3600000,
                value: "abcd::91",
            },
        ]);
    });

    it("expires", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const discovered = new Promise<void>(resolve => {
            client.names.discovered.once(() => resolve());
        });
        await server.broadcast();
        await discovered;

        const qname = qnameOf(1);

        expect(client.names.has(qname)).true;
        expect(client.names.has(server.hostname)).true;

        await MockTime.advance(Minutes(30));

        expect(client.names.has(qname)).true;
        expect(client.names.has(server.hostname)).true;

        await MockTime.advance(Hours(1));

        expect(client.names.has(qname)).false;
        expect(client.names.has(server.hostname)).false;
    });

    describe("dynamic filter", () => {
        it("accepts records matching a dynamically added filter", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            // No filter initially — accept nothing by default in this test
            client.configureNames({ filter: () => false });

            // Add a filter that accepts the server's service
            const filter = (record: DnsRecord) => record.name === qnameOf(1);
            client.names.filters.add(filter);

            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
            await server.broadcast();
            await discovered;

            expect(client.names.has(qnameOf(1))).true;
        });

        it("stops accepting records after filter removal", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const filter = (record: DnsRecord) => record.name === qnameOf(1);
            client.configureNames({ filter: () => false });
            client.names.filters.add(filter);
            client.names.filters.delete(filter);

            await server.broadcast();
            await MockTime.advance(100);

            expect(client.names.has(qnameOf(1))).false;
        });

        it("accepts records if any filter matches (OR semantics)", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            client.configureNames({ filter: () => false });

            const filter1 = (record: DnsRecord) => record.name === qnameOf(1);
            const filter2 = (record: DnsRecord) => record.name === qnameOf(2);
            client.names.filters.add(filter1);
            client.names.filters.add(filter2);

            const discovered = new Promise<void>(resolve => {
                let count = 0;
                client.names.discovered.on(() => {
                    if (++count >= 2) resolve();
                });
            });
            await server.broadcast(1);
            await server.broadcast(2);
            await discovered;

            expect(client.names.has(qnameOf(1))).true;
            expect(client.names.has(qnameOf(2))).true;
        });

        it("removing one filter keeps the other active", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            client.configureNames({ filter: () => false });

            const filter1 = (record: DnsRecord) => record.name === qnameOf(1);
            const filter2 = (record: DnsRecord) => record.name === qnameOf(2);
            client.names.filters.add(filter1);
            client.names.filters.add(filter2);

            // Remove filter for service 1 but keep filter for service 2
            client.names.filters.delete(filter1);

            await server.broadcast(1);
            await server.broadcast(2);
            await MockTime.advance(100);

            expect(client.names.has(qnameOf(1))).false;
            expect(client.names.has(qnameOf(2))).true;
        });

        it("already-discovered names persist after filter removal", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            client.configureNames({ filter: () => false });

            const filter = (record: DnsRecord) => record.name === qnameOf(1);
            client.names.filters.add(filter);

            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
            await server.broadcast();
            await discovered;

            expect(client.names.has(qnameOf(1))).true;

            // Remove filter — existing names should still be present
            client.names.filters.delete(filter);
            expect(client.names.has(qnameOf(1))).true;

            // But new broadcasts for a different service should not be accepted
            await server.broadcast(2);
            await MockTime.advance(100);
            expect(client.names.has(qnameOf(2))).false;
        });

        it("no filters means accept all records", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            // Default names with no filter
            const discovered = new Promise<void>(resolve => {
                let count = 0;
                client.names.discovered.on(() => {
                    if (++count >= 2) resolve();
                });
            });
            await server.broadcast(1);
            await server.broadcast(2);
            await discovered;

            expect(client.names.has(qnameOf(1))).true;
            expect(client.names.has(qnameOf(2))).true;
        });
    });

    it("filters but tracks and expires SRV even if filtered out", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const qname1 = qnameOf(1);
        const qname2 = qnameOf(2);

        client.configureNames({
            filter(record) {
                return record.name === qname2;
            },
        });

        const discovered = new Promise<void>(resolve => {
            client.names.discovered.once(() => resolve());
        });
        await server.broadcast(1);
        await server.broadcast(2);
        await MockTime.resolve(discovered);

        expect(client.names.has(qname1)).false;
        expect(client.names.has(qname2)).true;
        expect(client.names.has(server.hostname)).true;

        await MockTime.advance(Hours(2));

        expect(client.names.has(qname2)).false;
        expect(client.names.has(server.hostname)).false;
    });

    it("applies 5% TTL grace period", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        // Opt in to grace factor — test helper disables it by default to avoid MockTime cap interference
        client.configureNames({ ttlGraceFactor: 1.05 });

        // Use TTL of 100s for easy math.  With 5% grace, effective expiry is 105s.
        const ttl = Seconds(100);
        const discovered = new Promise<void>(resolve => {
            client.names.discovered.once(() => resolve());
        });
        await server.broadcast(1, ttl);
        await discovered;

        const qname = qnameOf(1);

        // Past nominal TTL but within grace period
        await MockTime.advance(Seconds(101));
        expect(client.names.has(qname)).true;

        // Past grace period
        await MockTime.advance(Seconds(5));
        expect(client.names.has(qname)).false;
    });

    describe("IP staging cache", () => {
        it("stages IP records arriving before SRV and replays on name creation", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            // Use a filter that accepts service-domain records but NOT bare hostnames.
            // This mirrors real usage where CommissionableMdnsScanner filters for _matterc._udp.local.
            client.configureNames({
                filter: record =>
                    record.name === MOCK_SERVICE_DOMAIN || record.name.endsWith(`.${MOCK_SERVICE_DOMAIN}`),
            });

            // Send A/AAAA for the server's hostname in isolation (no SRV yet).
            // Include a filter-passing PTR so the message is processed at all.
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: MOCK_SERVICE_DOMAIN,
                        recordType: DnsRecordType.PTR,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: qname,
                    },
                    {
                        name: server.hostname,
                        recordType: DnsRecordType.A,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: "10.10.10.145",
                    },
                    {
                        name: server.hostname,
                        recordType: DnsRecordType.AAAA,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: "abcd::91",
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            // Hostname should NOT be in names yet (no SRV dependency created it,
            // and the filter rejected the hostname records)
            expect(client.names.has(server.hostname)).false;

            // Now send SRV which creates the hostname dependency via DnssdName.installRecord
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: qname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: { port: 1234, priority: 10, weight: 1, target: server.hostname },
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            // Hostname DnssdName should now exist with the staged IP records
            expect(client.names.has(server.hostname)).true;
            const host = client.names.get(server.hostname);
            const ips = [...host.records].filter(
                r => r.recordType === DnsRecordType.A || r.recordType === DnsRecordType.AAAA,
            );
            expect(ips.length).equals(2);
        });

        it("discards staged IP records after their TTL expires", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            // Use a filter + minTtl:0 so short TTLs aren't bumped
            client.configureNames({
                minTtl: Millis(0),
                filter: record =>
                    record.name === MOCK_SERVICE_DOMAIN || record.name.endsWith(`.${MOCK_SERVICE_DOMAIN}`),
            });
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: MOCK_SERVICE_DOMAIN,
                        recordType: DnsRecordType.PTR,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(2),
                        value: qname,
                    },
                    {
                        name: server.hostname,
                        recordType: DnsRecordType.A,
                        recordClass: DnsRecordClass.IN,
                        ttl: Seconds(2),
                        value: "10.10.10.145",
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            // Wait longer than TTL
            await MockTime.advance(Seconds(3));

            // Now send SRV — staged IP should have been pruned
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: qname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: { port: 1234, priority: 10, weight: 1, target: server.hostname },
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            const host = client.names.get(server.hostname);
            const ips = [...host.records].filter(
                r => r.recordType === DnsRecordType.A || r.recordType === DnsRecordType.AAAA,
            );
            expect(ips.length).equals(0);
        });
    });
});
