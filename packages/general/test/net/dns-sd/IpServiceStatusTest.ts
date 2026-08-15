/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DnsMessageType, DnsRecordClass, DnsRecordType } from "#codec/DnsCodec.js";
import { Time } from "#time/Time.js";
import { Hours, Minutes } from "#time/TimeUnit.js";
import { Abort } from "#util/Abort.js";
import { expectAddresses, expectKvs, MockSite, qnameOf } from "./dns-sd-helpers.js";

describe("IpServiceStatus", () => {
    before(() => {
        MockTime.enable();
    });

    it("solicits and resolves per connection status", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const service = client.addService();

        // Set service to reachable like we would if we have a previously-good address.  This should prevent discovery
        // until we enable below
        service.status.isReachable = true;

        server.publish();

        // Force resolution
        const abort = new Abort();
        service.status.connecting(abort.then(() => !abort.aborted));

        await MockTime.resolve(Time.sleep("wait a bit", Minutes(1)));

        // Should not have discovered because service believes it is reachable
        expect(service.addresses.size).equals(0);

        // Should not be resolving
        expect(service.status.isResolving).equals(false);

        // Trigger resolution
        service.status.isReachable = false;

        // Should be resolving
        expect(service.status.isResolving).true;

        await MockTime.resolve(Time.sleep("wait a bit more", Minutes(1)));

        // Should be reachable and not resolving
        expect(service.status.isResolving).false;
        expect(service.status.isReachable).true;

        // Should have resolved
        expectAddresses(service.addresses);
        expectKvs(service);
    });

    it("queries addresses of the SRV target rather than the service instance", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const qname = qnameOf(1);
        const service = client.addService(qname);

        // Cache an SRV without any address record for its target
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

        const queried = new Set<string>();
        server.mdns.receipt.on(message => {
            for (const query of message.queries) {
                if (query.recordType === DnsRecordType.A || query.recordType === DnsRecordType.AAAA) {
                    queried.add(query.name);
                }
            }
        });

        const abort = new Abort();
        service.status.connecting(abort.then(() => !abort.aborted));
        await MockTime.resolve(Time.sleep("wait for queries", Minutes(1)));
        abort();

        expect([...queried]).deep.equals([server.hostname]);
    });

    it("marks unreachable when connecting() resolves with false", async () => {
        await using site = new MockSite();
        const { client } = await site.addPair();

        const service = client.addService();
        service.status.isReachable = true;

        // Simulate a failed connection: the result promise resolves with false (no sessions established).
        // PeerConnection emits this when overallAbort fires without a successful session.
        const abort = new Abort();
        service.status.connecting(abort.then(() => false));

        expect(service.status.isReachable).true;

        abort();
        // Allow the abort.then() chain and connecting()'s .then() handler to settle
        await MockTime.resolve(Time.sleep("settle abort", Minutes(1)));

        // After the failed connection result, isReachable should be false so the next attempt triggers MDNS
        // resolution rather than short-circuiting on the stale "reachable" state.
        expect(service.status.isReachable).false;
    });
});
