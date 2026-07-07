/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Abort, Hours } from "#index.js";
import { MockSite } from "./dns-sd-helpers.js";

describe("IpService link-local zone capture", () => {
    before(() => MockTime.enable());

    it("appends %intf to fe80 addresses using the receiving interface", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const service = client.addService();
        await server.broadcast();

        const abort = new Abort();
        service.status.isReachable = false;
        service.status.connecting(abort.then(() => !abort.aborted));
        const iter = service.addressChanges({ abort });

        await server.broadcast(1, Hours.one, ["fe80::1"]);

        let next = await MockTime.resolve(iter.next());
        // Drain any pre-existing addresses first
        while (!next.done && next.value.address.ip !== "fe80::1%fake0") {
            next = await MockTime.resolve(iter.next());
        }
        expect(next.value?.address).deep.equals({ ip: "fe80::1%fake0", port: 1234 });

        abort();
    });

    it("leaves ULA addresses untouched", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const service = client.addService();
        await server.broadcast();

        const abort = new Abort();
        service.status.isReachable = false;
        service.status.connecting(abort.then(() => !abort.aborted));
        const iter = service.addressChanges({ abort });

        await server.broadcast(1, Hours.one, ["fd29::1"]);

        let next = await MockTime.resolve(iter.next());
        while (!next.done && next.value.address.ip !== "fd29::1") {
            next = await MockTime.resolve(iter.next());
        }
        expect(next.value?.address).deep.equals({ ip: "fd29::1", port: 1234 });

        abort();
    });
});
