/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { Diagnostic, InternalError, Lifetime } from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";

function processLifetime() {
    // Lifetime.process is typed as an owner only, so reach the process lifetime through a sublifetime
    using probe = Lifetime.process.join("probe");
    const process = probe.owner;
    if (process === undefined) {
        throw new InternalError("A sublifetime of the process lifetime has no owner");
    }
    return process;
}

function allLifetimes() {
    const result = new Array<Lifetime>();
    const walk = (lifetime: Lifetime) => {
        result.push(lifetime);
        for (const span of lifetime.spans) {
            walk(span);
        }
    };
    for (const span of processLifetime().spans) {
        walk(span);
    }
    return result;
}

function nameOf(lifetime: Lifetime) {
    const parts = Array.isArray(lifetime.name) ? lifetime.name : [lifetime.name];
    return parts.map(part => String(Diagnostic.valueOf(part) ?? part)).join(" ");
}

function lifetimesSince(before: Set<Lifetime>) {
    return allLifetimes()
        .filter(lifetime => !before.has(lifetime))
        .map(nameOf);
}

describe("LifetimeRelease", () => {
    before(() => {
        MockTime.init();

        // Create the process-wide read-only context before any baseline; its lifetime is never released
        expect(LocalActorContext.ReadOnly).not.undefined;
    });

    it("releases every lifetime of a commissioned pair with an active subscription", async () => {
        const before = new Set(allLifetimes());

        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");

        await site.close();

        expect(lifetimesSince(before)).deep.equals([]);
    });

    it("lets the runtime go inactive once its only node closes", async () => {
        await using site = new MockSite();
        const device = await site.addDevice();
        const runtime = device.env.root.runtime;

        await MockTime.resolve(device.close(), { macrotasks: true });

        await MockTime.resolve(runtime.inactive);
    });
});
