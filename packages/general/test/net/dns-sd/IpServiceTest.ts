/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Abort, Hours, Minutes } from "#index.js";
import { expectAddresses, expectKvs, MockSite } from "./dns-sd-helpers.js";

describe("IpService", () => {
    before(() => MockTime.enable());

    it("notices new addresses", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const service = client.addService();
        const discovered = new Promise<void>(resolve => service.changed.once(resolve));

        await server.broadcast();

        await MockTime.resolve(discovered);

        expectAddresses(service.addresses);
        expectKvs(service);
    });

    it("notifies on parameter changes but swallows identical re-announcements and TXT expiry", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const service = client.addService();

        // Reachable means no active resolution runs; parameter changes must still arrive via passive announcements.
        service.status.isReachable = true;

        const changed = new Promise<void>(resolve => service.changed.once(resolve));
        await server.broadcast(1, Hours(24));
        await MockTime.resolve(changed);
        expectKvs(service);

        let changes = 0;
        service.changed.on(() => {
            changes++;
        });

        // Identical re-announcement: parameters did not change, so no notification.
        await MockTime.resolve(server.broadcast(1, Hours(24)), { macrotasks: true });
        await MockTime.advance(Minutes(1));
        expect(changes).equals(0);

        // Changed parameters: notify and reflect the new values.
        const rechanged = new Promise<void>(resolve => service.changed.once(resolve));
        await server.broadcast(1, Hours(24), undefined, ["foo=baz", "added=1"]);
        await MockTime.resolve(rechanged);
        expect(changes).equals(1);
        const kvs = new Map([...service.parameters]);
        expect(kvs.get("foo")).equals("baz");
        expect(kvs.get("added")).equals("1");

        // TXT expiry while the address persists: swallowed (last known parameters remain the best assumption).
        await MockTime.resolve(server.broadcast(1, Hours(24), undefined, ["foo=baz", "added=1"], 0), {
            macrotasks: true,
        });
        await MockTime.advance(Minutes(1));
        expect(changes).equals(1);
    });

    it("expires", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const service = client.addService();

        // Wait for discovery
        let changed = new Promise<void>(resolve => service.changed.once(resolve));
        await server.broadcast();
        await MockTime.resolve(changed);
        expectAddresses(service.addresses);

        // Delay but for less time than TTL
        await MockTime.advance(Minutes(30));
        expectAddresses(service.addresses);

        // Delay for more time than remaining TTL and wait for expiry
        changed = new Promise<void>(resolve => service.changed.once(resolve));
        await MockTime.advance(Minutes(31));
        await MockTime.resolve(changed);

        expect([...service.addresses].length).equals(0);
    });

    it("updates ttl", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const service = client.addService();

        // Wait for discovery
        let changed = new Promise<void>(resolve => service.changed.once(resolve));
        await server.broadcast();
        await MockTime.resolve(changed);
        expectAddresses(service.addresses);

        // Delay but for less time than TTL
        await MockTime.advance(Minutes(30));
        expectAddresses(service.addresses);

        // Broadcast again and advance outside of original TTL but less than new TTL
        await server.broadcast();
        await MockTime.advance(Minutes(45));
        expectAddresses(service.addresses);

        // Now advance out of new TTL and wait for expiration
        changed = new Promise<void>(resolve => service.changed.once(resolve));
        await MockTime.advance(Minutes(16));
        await MockTime.resolve(changed);

        expect([...service.addresses].length).equals(0);
    });

    it("streams adds and deletes", async () => {
        await using site = new MockSite();
        const { client, server } = await site.addPair();

        const service = client.addService();
        await server.broadcast();

        const abort = new Abort();

        // Force discovery
        service.status.isReachable = false;
        service.status.connecting(abort.then(() => !abort.aborted));

        const iter = service.addressChanges({ abort });

        // Should generate two preexisting addresses
        await expectAdd("abcd::91");
        await expectAdd("10.10.10.145");

        // Should generate no addresses
        await server.broadcast();

        // Should generate two more addresses
        await server.broadcast(1, Hours.one, ["fd00::1"]);
        await expectAdd("fd00::1");

        // Should expire all addresses
        await server.broadcast(1, 0);
        await expectDelete("fd00::1");
        await expectDelete("abcd::91");
        await expectDelete("10.10.10.145");

        // Should stop iteration
        abort();
        expect((await iter.next()).done).true;

        async function expectAdd(ip: string) {
            await expectAddr("add", ip);
        }

        async function expectDelete(ip: string) {
            await expectAddr("delete", ip);
        }

        async function expectAddr(kind: "add" | "delete", ip: string) {
            const next = await MockTime.resolve(iter.next());
            expect(next.done).equals(false);
            expect(next.value.kind).equals(kind);
            expect(next.value.address).deep.equals({
                ip,
                port: 1234,
            });
        }
    });
});
