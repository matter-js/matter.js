/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DnssdName } from "#net/dns-sd/DnssdName.js";
import { discoverNames } from "#net/dns-sd/ServiceDiscovery.js";
import { MOCK_SERVICE_DOMAIN, MockSite, qnameOf } from "./dns-sd-helpers.js";

describe("discoverNames", () => {
    before(() => {
        MockTime.enable();
    });

    it("discovers a service instance", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const controller = new AbortController();
        const found: DnssdName[] = [];

        const iter = discoverNames(client.names, MOCK_SERVICE_DOMAIN, controller.signal);

        // Consume in the background
        const collecting = (async () => {
            let result = await iter.next();
            while (!result.done) {
                found.push(result.value);
                controller.abort();
                result = await iter.next();
            }
        })();

        await server.broadcast();
        await MockTime.advance(10);
        await collecting;

        expect(found).length(1);
        expect(found[0].qname).equals(qnameOf(1));
    });

    it("yields nothing when aborted before discovery", async () => {
        await using site = new MockSite();
        const { client } = await site.addPair();

        const controller = new AbortController();
        controller.abort();

        const found: DnssdName[] = [];
        const iter = discoverNames(client.names, MOCK_SERVICE_DOMAIN, controller.signal);
        let result = await iter.next();
        while (!result.done) {
            found.push(result.value);
            result = await iter.next();
        }

        expect(found).deep.equals([]);
    });

    it("removes filter from DnssdNames after abort", async () => {
        await using site = new MockSite();
        const { client } = await site.addPair();

        const filtersBefore = client.names.filters.size;
        const controller = new AbortController();

        const iter = discoverNames(client.names, MOCK_SERVICE_DOMAIN, controller.signal);
        expect(client.names.filters.size).equals(filtersBefore + 1);

        controller.abort();
        // Drain the iterator so cleanup runs
        await iter.next();

        expect(client.names.filters.size).equals(filtersBefore);
    });
});
