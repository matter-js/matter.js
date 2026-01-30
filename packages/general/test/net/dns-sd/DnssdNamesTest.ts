/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Hours, Minutes } from "#index.js";
import { MockSite, qnameOf } from "./dns-sd-helpers.js";

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
                expiresAt: 1735738496000,
                flushCache: false,
                name: server.hostname,
                recordClass: 1,
                recordType: 1,
                ttl: 3600000,
                value: "10.10.10.145",
            },
            {
                expiresAt: 1735738496000,
                flushCache: false,
                name: server.hostname,
                recordClass: 1,
                recordType: 28,
                ttl: 3600000,
                value: "1111:2222:3333:4444:5555:6666:7777:8891",
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
});
