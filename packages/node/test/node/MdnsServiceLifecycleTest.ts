/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnsCodec, Environment, Instant, Lifecycle, NetworkSimulator, Seconds, Time } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import { MdnsService } from "@matter/protocol";

/** Collects the names of DNS-SD records sent on {@link simulator}, split into announcements and goodbyes. */
function recordMdns(simulator: NetworkSimulator) {
    const announced = new Set<string>();
    const goodbyes = new Set<string>();
    simulator.router.intercept((packet, route) => {
        if (packet.kind === "udp" && packet.destPort === 5353) {
            for (const { name, ttl } of DnsCodec.decode(packet.payload)?.answers ?? []) {
                (ttl === Instant ? goodbyes : announced).add(name);
            }
        }
        route(packet);
    });
    return { announced, goodbyes };
}

function isCommissionable(name: string) {
    return name.endsWith("._matterc._udp.local");
}

async function closeEnvironment(environment: Environment) {
    await MockTime.resolve(environment.runtime.close(), { macrotasks: true });
    environment[Symbol.dispose]();
}

describe("MdnsServiceLifecycle", () => {
    before(() => {
        MockTime.init();
    });

    it("sends the DNS-SD goodbyes of a node when the runtime shuts down", async () => {
        await using site = new MockSite();
        const simulator = new NetworkSimulator();
        const device = await site.addDevice({ simulator });
        const { goodbyes } = recordMdns(simulator);

        await MockTime.resolve(device.env.runtime.close(), { macrotasks: true });

        expect([...goodbyes].some(isCommissionable)).true;
    });

    it("starts a new service for a node opened after the last node closed in the same environment", async () => {
        const environment = new Environment("shared");
        try {
            await using site = new MockSite();
            const simulator = new NetworkSimulator();

            const first = await site.addDevice({ environment, simulator, id: "first" });
            const firstMdns = environment.get(MdnsService);
            await MockTime.resolve(first.close());

            expect(firstMdns.construction.status).equals(Lifecycle.Status.Destroyed);
            expect(environment.has(MdnsService)).false;
            await MockTime.resolve(environment.runtime.inactive);

            const { announced } = recordMdns(simulator);
            await site.addDevice({ environment, simulator, id: "second" });
            const secondMdns = environment.get(MdnsService);

            await MockTime.resolve(Time.sleep("announcement", Seconds(5)));

            expect(secondMdns).not.equal(firstMdns);
            expect(secondMdns.construction.status).equals(Lifecycle.Status.Active);
            expect([...announced].some(isCommissionable)).true;
        } finally {
            await closeEnvironment(environment);
        }
    });
});
