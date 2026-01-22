/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Time } from "#time/Time.js";
import { Minutes } from "#time/TimeUnit.js";
import { Abort } from "#util/Abort.js";
import { expectAddresses, expectKvs, MockSite } from "./dns-sd-helpers.js";

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
});
