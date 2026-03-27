/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DnssdNames } from "#net/dns-sd/DnssdNames.js";
import { DiscoveredService, ServiceDiscovery } from "#net/dns-sd/ServiceDiscovery.js";
import { MOCK_SERVICE_DOMAIN, MockSite, qnameOf } from "./dns-sd-helpers.js";

// Concrete subclass for testing
class CollectingDiscovery extends ServiceDiscovery<DiscoveredService[]> {
    readonly found: DiscoveredService[] = [];

    constructor(names: DnssdNames) {
        // MOCK_SERVICE_DOMAIN is "_foo._tcp.local"; strip ".local"
        const serviceType = MOCK_SERVICE_DOMAIN.replace(/\.local$/, "");
        super(names, serviceType);
    }

    protected onDiscovered(service: DiscoveredService) {
        this.found.push(service);
    }

    protected onComplete() {
        return this.found;
    }
}

describe("ServiceDiscovery", () => {
    before(() => {
        MockTime.enable();
    });

    it("discovers a service instance via onDiscovered", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const discovery = new CollectingDiscovery(client.names);
        await server.broadcast();

        // Allow async discovery processing
        await MockTime.advance(10);
        discovery.stop();
        const results = await discovery;

        expect(results).length(1);
        expect(results[0].instanceName).equals(qnameOf(1));
        expect(results[0].serviceType).equals(MOCK_SERVICE_DOMAIN.replace(/\.local$/, ""));
    });

    it("resolves with empty array when no services found before stop", async () => {
        await using site = new MockSite();
        const { client } = await site.addPair();

        const discovery = new CollectingDiscovery(client.names);
        discovery.stop();
        const results = await discovery;

        expect(results).deep.equals([]);
    });

    it("removes filter from DnssdNames after stop", async () => {
        await using site = new MockSite();
        const { client } = await site.addPair();

        const filtersBefore = client.names.filters.size;
        const discovery = new CollectingDiscovery(client.names);
        expect(client.names.filters.size).equals(filtersBefore + 1);

        discovery.stop();
        await discovery;
        expect(client.names.filters.size).equals(filtersBefore);
    });
});
