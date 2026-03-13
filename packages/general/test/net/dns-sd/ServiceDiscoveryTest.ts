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

        // Track filter additions/removals
        let filterCount = 0;
        const origAdd = client.names.addFilter.bind(client.names);
        const origRemove = client.names.removeFilter.bind(client.names);
        (client.names as any).addFilter = (f: any) => {
            filterCount++;
            origAdd(f);
        };
        (client.names as any).removeFilter = (f: any) => {
            filterCount--;
            origRemove(f);
        };

        const discovery = new CollectingDiscovery(client.names);
        expect(filterCount).equals(1);

        discovery.stop();
        await discovery;
        expect(filterCount).equals(0);
    });
});
