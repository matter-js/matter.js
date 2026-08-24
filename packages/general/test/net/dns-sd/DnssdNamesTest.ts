/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnsMessageType, type DnsRecord, DnsRecordClass, DnsRecordType } from "#codec/DnsCodec.js";
import { Hours, Millis, Minutes, Seconds } from "#index.js";
import { Time } from "#time/Time.js";
import { Abort } from "#util/Abort.js";
import { Bytes } from "#util/Bytes.js";
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
                value: ["foo=bar", "flag"].map(Bytes.fromString),
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
                sourceIntf: undefined,
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
                sourceIntf: "fake0",
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
            client.names.filters.add(filter, "all");

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
            client.names.filters.add(filter, "all");
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
            client.names.filters.add(filter1, "all");
            client.names.filters.add(filter2, "all");

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
            client.names.filters.add(filter1, "all");
            client.names.filters.add(filter2, "all");

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
            client.names.filters.add(filter, "all");

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

        it("ingests A/AAAA arriving in a packet alone after the SRV target is known", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            client.configureNames({
                filter: record =>
                    record.name === MOCK_SERVICE_DOMAIN || record.name.endsWith(`.${MOCK_SERVICE_DOMAIN}`),
            });

            // PTR + SRV; SRV installation creates the hostname DnssdName via dependency
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

            expect(client.names.has(server.hostname)).true;

            // Solicited response carrying ONLY A/AAAA for the hostname — no filter-matching records.
            // The dependency pass must still attach these records because the hostname is already known.
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
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

            const host = client.names.get(server.hostname);
            const ips = [...host.records].filter(
                r => r.recordType === DnsRecordType.A || r.recordType === DnsRecordType.AAAA,
            );
            expect(ips.length).equals(2);
        });

        it("evicts a staged IP record via goodbye in a packet with no other relevant records", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            client.configureNames({
                filter: record =>
                    record.name === MOCK_SERVICE_DOMAIN || record.name.endsWith(`.${MOCK_SERVICE_DOMAIN}`),
            });

            // Packet 1: PTR + A — A gets staged because the packet carries a filter-matching PTR
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
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            // Hostname not yet a real DnssdName — record is in the staging cache only
            expect(client.names.has(server.hostname)).false;

            // Packet 2: goodbye for the staged record, no other records
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: server.hostname,
                        recordType: DnsRecordType.A,
                        recordClass: DnsRecordClass.IN,
                        ttl: 0,
                        value: "10.10.10.145",
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            // Packet 3: SRV creates the hostname — staged record (if any) replays
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

    describe("unavailable services", () => {
        function srvRecord(qname: string, value: { port: number; target: string }): DnsRecord {
            return {
                name: qname,
                recordType: DnsRecordType.SRV,
                recordClass: DnsRecordClass.IN,
                ttl: Hours(1),
                value: { priority: 10, weight: 1, ...value },
            };
        }

        it("ignores an SRV record with port 0", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);
            const name = client.names.get(qname);

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
                    srvRecord(qname, { port: 0, target: server.hostname }),
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            expect([...name.records]).deep.equals([]);
        });

        it("ignores an SRV record with an empty target", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);
            const name = client.names.get(qname);

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
                    srvRecord(qname, { port: 1234, target: "" }),
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            expect([...name.records]).deep.equals([]);
        });

        it("ignores an SRV record with a port outside the 16-bit range", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);
            const name = client.names.get(qname);

            name.installRecord(srvRecord(qname, { port: -1, target: server.hostname }));
            name.installRecord(srvRecord(qname, { port: 65536, target: server.hostname }));

            expect([...name.records]).deep.equals([]);
        });

        it("ignores an SRV record targeting the root domain", async () => {
            await using site = new MockSite();
            const { client } = await site.addPair();

            const qname = qnameOf(1);
            const name = client.names.get(qname);

            name.installRecord(srvRecord(qname, { port: 1234, target: "." }));

            expect([...name.records]).deep.equals([]);
        });

        it("exposes no address and no target host for a service that is unavailable", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);
            client.configureNames({
                filter: record =>
                    record.name === MOCK_SERVICE_DOMAIN || record.name.endsWith(`.${MOCK_SERVICE_DOMAIN}`),
            });
            const service = client.addService(qname);

            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
                    srvRecord(qname, { port: 0, target: server.hostname }),
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

            expect([...service.addresses]).deep.equals([]);
            expect(client.names.has(server.hostname)).false;
        });

        it("does not stage IP records from a packet whose only relevant record is unavailable", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);
            client.configureNames({
                filter: record =>
                    record.name === MOCK_SERVICE_DOMAIN || record.name.endsWith(`.${MOCK_SERVICE_DOMAIN}`),
            });

            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
                    srvRecord(qname, { port: 0, target: server.hostname }),
                    {
                        name: server.hostname,
                        recordType: DnsRecordType.AAAA,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: "abcd::99",
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [srvRecord(qname, { port: 1234, target: server.hostname })],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            expect([...client.names.get(server.hostname).records]).deep.equals([]);
        });

        it("keeps a known service when a later announcement designates it unavailable", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
            await server.broadcast();
            await MockTime.resolve(discovered);

            const srvPorts = () =>
                [...client.names.get(qname).records]
                    .filter(record => record.recordType === DnsRecordType.SRV)
                    .map(record => record.value.port);
            expect(srvPorts()).deep.equals([1234]);

            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [srvRecord(qname, { port: 0, target: server.hostname })],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            expect(srvPorts()).deep.equals([1234]);
        });
    });

    describe("TXT parameters", () => {
        it("recomputes parameters when a TXT record is removed", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            // Include an SRV so the name survives when the TXT is later goodbye'd
            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
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
                        name: qname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: { port: 1234, priority: 10, weight: 1, target: server.hostname },
                    },
                    {
                        name: qname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: ["a=1", "b=2"],
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.resolve(discovered);

            expect([...client.names.get(qname).parameters]).deep.equals([
                ["a", "1"],
                ["b", "2"],
            ]);

            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: qname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: 0,
                        value: ["a=1", "b=2"],
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(Seconds(2));

            expect([...client.names.get(qname).parameters]).deep.equals([]);
        });

        it("drops keys absent from a replacement TXT record", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
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
                        name: qname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: { port: 1234, priority: 10, weight: 1, target: server.hostname },
                    },
                    {
                        name: qname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: ["a=1", "b=2"],
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.resolve(discovered);

            expect([...client.names.get(qname).parameters]).deep.equals([
                ["a", "1"],
                ["b", "2"],
            ]);

            // Goodbye the original TXT, then send a new TXT that omits key "a"
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: qname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: 0,
                        value: ["a=1", "b=2"],
                    },
                    {
                        name: qname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: ["b=3"],
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(Seconds(2));

            expect([...client.names.get(qname).parameters]).deep.equals([["b", "3"]]);
        });

        it("exposes binary TXT values via parameters.raw while preserving the string view for ASCII keys", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            const xaBytes = Bytes.fromHex("5aaf359c0501a1b0");

            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
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
                        name: qname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: { port: 1234, priority: 10, weight: 1, target: server.hostname },
                    },
                    {
                        name: qname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: [Bytes.fromString("SII=5000"), Bytes.concat(Bytes.fromString("xa="), xaBytes)],
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.resolve(discovered);

            const parameters = client.names.get(qname).parameters;

            const xa = parameters.raw("xa");
            expect(xa).not.equal(undefined);
            expect(Bytes.areEqual(xa!, xaBytes)).true;

            expect(parameters.get("SII")).equal("5000");
        });

        it("first-wins on duplicate keys per RFC 6763 §6.4", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
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
                        name: qname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: { port: 1234, priority: 10, weight: 1, target: server.hostname },
                    },
                    {
                        name: qname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: [Bytes.fromString("foo=first"), Bytes.fromString("foo=second")],
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.resolve(discovered);

            expect(client.names.get(qname).parameters.get("foo")).equal("first");
        });

        it("ignores TXT entries with empty keys per RFC 6763 §6.4", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
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
                        name: qname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: { port: 1234, priority: 10, weight: 1, target: server.hostname },
                    },
                    {
                        name: qname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: [Bytes.fromString("=value"), Bytes.fromString("="), Bytes.fromString("real=value")],
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.resolve(discovered);

            const parameters = client.names.get(qname).parameters;
            expect(parameters.size).equal(1);
            expect(parameters.has("")).false;
            expect(parameters.get("real")).equal("value");
        });

        it("ignores zero-length TXT entries per RFC 6763 §6.5", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
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
                        name: qname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: { port: 1234, priority: 10, weight: 1, target: server.hostname },
                    },
                    {
                        name: qname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: [new Uint8Array(0), Bytes.fromString("real=value")],
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.resolve(discovered);

            const parameters = client.names.get(qname).parameters;
            expect(parameters.size).equal(1);
            expect(parameters.has("")).false;
            expect(parameters.get("real")).equal("value");
        });

        it("preserves empty-value TXT entries (key=) per RFC 6763 §6.4", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
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
                        name: qname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: { port: 1234, priority: 10, weight: 1, target: server.hostname },
                    },
                    {
                        name: qname,
                        recordType: DnsRecordType.TXT,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: [Bytes.fromString("yy="), Bytes.fromString("flag")],
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.resolve(discovered);

            const parameters = client.names.get(qname).parameters;
            expect(parameters.has("yy")).true;
            expect(parameters.get("yy")).equal("");
            expect(parameters.has("flag")).true;
            expect(parameters.get("flag")).equal("");
        });
    });

    describe("goodbyes", () => {
        it("removes a record whose goodbye follows a re-announcement", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
            await server.broadcast(1, Hours(1));
            await MockTime.resolve(discovered);

            // An advertisement re-announces on its own schedule, then the host departs
            await MockTime.advance(Minutes(1));
            await server.broadcast(1, Hours(1));
            await MockTime.advance(Millis(100));

            await server.broadcast(1, 0);
            await MockTime.advance(Seconds(1));
            await MockTime.advance(10);

            expect(client.names.has(qname)).false;
        });

        it("keeps a record re-announced within the goodbye delay", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);

            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
            await server.broadcast(1, Hours(1));
            await MockTime.resolve(discovered);

            await MockTime.advance(Minutes(1));
            await server.broadcast(1, 0);
            await MockTime.advance(Millis(100));

            expect(client.names.has(qname)).true;

            await server.broadcast(1, Hours(1));
            await MockTime.advance(Seconds(1));
            await MockTime.advance(10);

            expect(client.names.has(qname)).true;
        });
    });

    describe("cache-flush records", () => {
        function txtPacket(qname: string, entries: string[], flushCache: boolean) {
            const answers: DnsRecord[] = [
                {
                    name: qname,
                    recordType: DnsRecordType.TXT,
                    recordClass: DnsRecordClass.IN,
                    ttl: Hours(1),
                    value: entries,
                    flushCache,
                },
            ];
            return { messageType: DnsMessageType.Response, answers, additionalRecords: [] };
        }

        async function discoverName(site: MockSite) {
            const { client, server } = await site.addPair();
            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
            await server.broadcast(1, Hours(1), undefined, ["a=1"]);
            await MockTime.resolve(discovered);
            return { client, server };
        }

        it("retires the superseded TXT record", async () => {
            await using site = new MockSite();
            const { client, server } = await discoverName(site);

            const qname = qnameOf(1);
            expect([...client.names.get(qname).parameters]).deep.equals([["a", "1"]]);

            await MockTime.advance(Minutes(1));
            await server.mdns.send(txtPacket(qname, ["b=2"], true));
            await MockTime.advance(Seconds(1));
            await MockTime.advance(10);

            expect([...client.names.get(qname).parameters]).deep.equals([["b", "2"]]);
        });

        it("keeps a record a responder re-announces unchanged", async () => {
            await using site = new MockSite();
            const { client, server } = await discoverName(site);

            const qname = qnameOf(1);

            await MockTime.advance(Minutes(1));
            await server.mdns.send(txtPacket(qname, ["a=1"], true));
            await MockTime.advance(Seconds(1));
            await MockTime.advance(10);

            expect([...client.names.get(qname).parameters]).deep.equals([["a", "1"]]);
        });

        it("keeps the superseded record when the bit is absent", async () => {
            await using site = new MockSite();
            const { client, server } = await discoverName(site);

            const qname = qnameOf(1);

            await MockTime.advance(Minutes(1));
            await server.mdns.send(txtPacket(qname, ["b=2"], false));
            await MockTime.advance(Seconds(1));
            await MockTime.advance(10);

            expect([...client.names.get(qname).parameters]).deep.equals([
                ["b", "2"],
                ["a", "1"],
            ]);
        });

        it("keeps every record of a type that arrives in the flushing packet", async () => {
            await using site = new MockSite();
            const { client, server } = await discoverName(site);

            const qname = qnameOf(1);

            await MockTime.advance(Minutes(1));
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [txtPacket(qname, ["b=2"], true).answers[0], txtPacket(qname, ["c=3"], true).answers[0]],
                additionalRecords: [],
            });
            await MockTime.advance(Seconds(1));
            await MockTime.advance(10);

            expect([...client.names.get(qname).parameters].map(([key]) => key).sort()).deep.equals(["b", "c"]);
        });

        it("ignores the bit in a query's known-answer list", async () => {
            await using site = new MockSite();
            const { client, server } = await discoverName(site);

            const qname = qnameOf(1);

            await MockTime.advance(Minutes(1));
            await server.mdns.send({
                messageType: DnsMessageType.Query,
                queries: [{ name: qname, recordType: DnsRecordType.TXT, recordClass: DnsRecordClass.IN }],
                answers: txtPacket(qname, ["b=2"], true).answers,
                additionalRecords: [],
            });
            await MockTime.advance(Seconds(1));
            await MockTime.advance(10);

            expect(client.names.get(qname).parameters.get("a")).equals("1");
        });

        it("keeps the record a rejected replacement would have superseded", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);
            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
            await server.broadcast(1, Hours(1));
            await MockTime.resolve(discovered);

            const srvPorts = () => {
                const ports = new Array<number>();
                for (const record of client.names.get(qname).records) {
                    if (record.recordType === DnsRecordType.SRV) {
                        ports.push(record.value.port);
                    }
                }
                return ports;
            };
            expect(srvPorts()).deep.equals([1234]);

            // Port 0 designates no service, so the record is refused — and must not take the good one with it
            await MockTime.advance(Minutes(1));
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: qname,
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: { port: 0, priority: 10, weight: 1, target: server.hostname },
                        flushCache: true,
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(Seconds(1));
            await MockTime.advance(10);

            expect(srvPorts()).deep.equals([1234]);
        });

        it("retires only the type the flushing record carries", async () => {
            await using site = new MockSite();
            const { client, server } = await discoverName(site);

            const qname = qnameOf(1);
            const typesHeld = () => new Set([...client.names.get(qname).records].map(record => record.recordType));
            expect(typesHeld().has(DnsRecordType.SRV)).true;

            await MockTime.advance(Minutes(1));
            await server.mdns.send(txtPacket(qname, ["b=2"], true));
            await MockTime.advance(Seconds(1));
            await MockTime.advance(10);

            expect(typesHeld().has(DnsRecordType.SRV)).true;
            expect([...client.names.get(qname).parameters]).deep.equals([["b", "2"]]);
        });

        it("retires a superseded address record", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
            await server.broadcast(1, Hours(1), ["fe80::1"]);
            await MockTime.resolve(discovered);

            const addresses = () =>
                [...client.names.get(server.hostname).records]
                    .filter(record => record.recordType === DnsRecordType.AAAA)
                    .map(record => record.value as string);
            expect(addresses()).deep.equals(["fe80::1"]);

            await MockTime.advance(Minutes(1));
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: server.hostname,
                        recordType: DnsRecordType.AAAA,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: "fe80::2",
                        flushCache: true,
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(Seconds(1));
            await MockTime.advance(10);

            expect(addresses()).deep.equals(["fe80::2"]);
        });

        it("strips the bit from the known answers it sends with a query", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            const qname = qnameOf(1);
            const discovered = new Promise<void>(resolve => {
                client.names.discovered.once(() => resolve());
            });
            await server.mdns.send(txtPacket(qname, ["a=1"], true));
            await MockTime.resolve(discovered);

            const knownAnswers = new Array<DnsRecord>();
            server.mdns.receipt.on(message => {
                if (message.queries.length > 0) {
                    knownAnswers.push(...message.answers);
                }
            });

            const abort = new Abort();
            const discovery = client.names.solicitor.discover({
                name: client.names.get(qname),
                recordTypes: [DnsRecordType.TXT],
                abort,
            });
            await MockTime.resolve(Time.sleep("wait for query", Seconds(1)));
            abort();
            await MockTime.resolve(discovery).catch(() => {});

            expect(knownAnswers.length).greaterThan(0);
            expect(knownAnswers.some(record => record.flushCache)).false;
        });

        it("keeps a record set a responder had to split across packets", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();
            const names = client.names;

            function address(value: string): DnsRecord {
                return {
                    name: server.hostname,
                    recordType: DnsRecordType.AAAA,
                    recordClass: DnsRecordClass.IN,
                    ttl: Hours(1),
                    value,
                    flushCache: true,
                };
            }

            const addresses = () =>
                [...names.get(server.hostname).records]
                    .filter(record => record.recordType === DnsRecordType.AAAA)
                    .map(record => record.value)
                    .sort();

            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [address("fe80::1")],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            // A set too large for one packet arrives as several; the later ones must not retire the earlier
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [address("fe80::2")],
                additionalRecords: [],
            });
            await MockTime.advance(Seconds(1));
            await MockTime.advance(10);

            expect(addresses()).deep.equals(["fe80::1", "fe80::2"]);
        });

        it("keeps a staged address set a responder had to split across packets", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            // Only the service is of interest, so addresses for a hostname no SRV has named yet are staged rather
            // than installed
            const hostname = server.hostname;
            const names = client.configureNames({
                filter: (record: DnsRecord) => record.name === MOCK_SERVICE_DOMAIN || record.name === qnameOf(1),
                filterNames: [MOCK_SERVICE_DOMAIN, qnameOf(1)],
            });
            function packet(value: string): DnsRecord[] {
                return [
                    {
                        name: MOCK_SERVICE_DOMAIN,
                        recordType: DnsRecordType.PTR,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: qnameOf(1),
                    },
                    {
                        name: hostname,
                        recordType: DnsRecordType.AAAA,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value,
                        flushCache: true,
                    },
                ];
            }

            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: packet("fe80::1"),
                additionalRecords: [],
            });
            await MockTime.advance(10);
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: packet("fe80::2"),
                additionalRecords: [],
            });
            await MockTime.advance(10);

            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [
                    {
                        name: qnameOf(1),
                        recordType: DnsRecordType.SRV,
                        recordClass: DnsRecordClass.IN,
                        ttl: Hours(1),
                        value: { port: 1234, priority: 10, weight: 1, target: hostname },
                    },
                ],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            const addresses = [...names.get(hostname).records]
                .filter(record => record.recordType === DnsRecordType.AAAA)
                .map(record => record.value)
                .sort();
            expect(addresses).deep.equals(["fe80::1", "fe80::2"]);
        });

        it("ignores the bit on a shared PTR record", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();
            const names = client.names;

            function ptr(target: string, flushCache: boolean): DnsRecord {
                return {
                    name: MOCK_SERVICE_DOMAIN,
                    recordType: DnsRecordType.PTR,
                    recordClass: DnsRecordClass.IN,
                    ttl: Hours(1),
                    value: target,
                    flushCache,
                };
            }

            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [ptr(qnameOf(1), false), ptr(qnameOf(2), false)],
                additionalRecords: [],
            });
            await MockTime.advance(10);

            const ptrCount = () => [...names.get(MOCK_SERVICE_DOMAIN).records].length;
            expect(ptrCount()).equals(2);

            // One instance re-announcing must not evict the others sharing the service type
            await MockTime.advance(Minutes(1));
            await server.mdns.send({
                messageType: DnsMessageType.Response,
                answers: [ptr(qnameOf(1), true)],
                additionalRecords: [],
            });
            await MockTime.advance(Seconds(1));
            await MockTime.advance(10);

            expect(ptrCount()).equals(2);
        });
    });

    describe("coalesced discovery", () => {
        it("merges concurrent discovers for the same name into one query stream", async () => {
            await using site = new MockSite();
            const { client, server } = await site.addPair();

            server.publish();

            const name = client.names.get(qnameOf(1));
            const solicitor = client.names.solicitor;

            const abort1 = new Abort();
            const abort2 = new Abort();

            // Count queries received by the server
            let queryCount = 0;
            server.mdns.receipt.on(message => {
                if (message.queries.length > 0) {
                    queryCount++;
                }
            });

            // Start two concurrent discovers for the same name
            const d1 = solicitor.discover({
                name,
                recordTypes: [DnsRecordType.SRV],
                abort: abort1,
            });
            const d2 = solicitor.discover({
                name,
                recordTypes: [DnsRecordType.SRV],
                abort: abort2,
            });

            // Let two retry cycles fire
            await MockTime.resolve(Time.sleep("wait for queries", Seconds(3)));

            // Only one query stream should be active — queries should not be doubled
            // Abort first caller — second should keep the loop alive
            abort1();
            queryCount = 0;
            await MockTime.resolve(Time.sleep("wait after first abort", Seconds(3)));
            expect(queryCount).greaterThan(0);

            // Abort second caller — loop should stop
            abort2();
            queryCount = 0;
            await MockTime.resolve(Time.sleep("wait after both aborted", Seconds(3)));
            expect(queryCount).equals(0);

            await Promise.allSettled([d1, d2]);
        });

        it("first caller's retry config drives the shared discovery loop", async () => {
            await using site = new MockSite();
            const { client } = await site.addPair();

            const name = client.names.get(qnameOf(1));
            const solicitor = client.names.solicitor;

            const abort1 = new Abort();
            const abort2 = new Abort();

            let queryCount = 0;
            client.mdns.receipt.on(message => {
                if (message.queries.length > 0) {
                    queryCount++;
                }
            });

            // First caller uses a tight retry cap
            const d1 = solicitor.discover({
                name,
                recordTypes: [DnsRecordType.SRV],
                abort: abort1,
                retries: { maximumInterval: Seconds(2) },
            });

            // Second caller joins with different retries — should NOT override
            const d2 = solicitor.discover({
                name,
                recordTypes: [DnsRecordType.SRV],
                abort: abort2,
                retries: { maximumInterval: Seconds(30) },
            });

            // Over 10s with 2s cap: expect ~5+ retries (1s, 2s, 2s, 2s, 2s)
            // With 30s cap it would only be ~3 (1s, 2s, 4s) so a high count proves first caller's config won
            queryCount = 0;
            await MockTime.resolve(Time.sleep("measure retry density", Seconds(10)));
            expect(queryCount).greaterThanOrEqual(4);

            abort1();
            abort2();
            await Promise.allSettled([d1, d2]);
        });
    });
});
