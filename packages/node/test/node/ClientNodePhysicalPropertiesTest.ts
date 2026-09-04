/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientNodePhysicalProperties } from "#node/client/ClientNodePhysicalProperties.js";
import { MockSite, subscribedPeer } from "@matter/node/testing";

describe("ClientNodePhysicalProperties", () => {
    before(() => {
        MockTime.init();
    });

    it("retains last-known properties after the node is torn down", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const properties = ClientNodePhysicalProperties(peer1);

        // Force evaluation while the node is fully online so the snapshot is populated.
        const initialServers = [...properties.rootEndpointServerList];
        const initialThread = properties.supportsThread;
        const initialBattery = properties.isBatteryPowered;

        expect(initialServers.length).greaterThan(0);

        // Close the peer.  Teardown emits goingOffline (freezing the snapshot) then proceeds with
        // structure mutations that previously invalidated the cache and re-evaluated against
        // torn-down behavior state.
        const destroyed = new Promise<void>(resolve => peer1.lifecycle.destroyed.once(() => resolve()));
        await MockTime.resolve(peer1.close(), { macrotasks: true });
        await MockTime.resolve(destroyed);

        // Held reference must keep returning the snapshot captured before teardown.
        expect(properties.rootEndpointServerList).deep.equals(initialServers);
        expect(properties.supportsThread).equals(initialThread);
        expect(properties.isBatteryPowered).equals(initialBattery);
    });

    it("detaches the snapshot from live behavior state at freeze", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const properties = ClientNodePhysicalProperties(peer1);
        const liveList = properties.rootEndpointServerList;
        expect(liveList.length).greaterThan(0);

        const destroyed = new Promise<void>(resolve => peer1.lifecycle.destroyed.once(() => resolve()));
        await MockTime.resolve(peer1.close(), { macrotasks: true });
        await MockTime.resolve(destroyed);

        // After freeze the snapshot array is the deepCopy result — same contents, distinct identity from the
        // live array captured pre-teardown.
        const frozenList = properties.rootEndpointServerList;
        expect(frozenList).deep.equals(liveList);
        expect(frozenList).not.equals(liveList);
    });

    it("re-evaluates after the node comes back online", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const properties = ClientNodePhysicalProperties(peer1);

        // Capture a live snapshot and freeze it by stopping the peer.
        const initialList = [...properties.rootEndpointServerList];
        expect(initialList.length).greaterThan(0);

        await MockTime.resolve(peer1.stop(), { macrotasks: true });

        // Frozen — reading returns the captured snapshot.
        expect(properties.rootEndpointServerList).deep.equals(initialList);

        // Bringing the peer back online must unfreeze and force re-evaluation.  We do not assert that the value
        // changes (the test environment is stable), only that the snapshot identity changes — i.e. the getter
        // produced a fresh evaluation rather than returning the frozen copy.
        const frozenSnapshot = properties.rootEndpointServerList;
        await MockTime.resolve(peer1.start(), { macrotasks: true });

        const refreshedSnapshot = properties.rootEndpointServerList;
        expect(refreshedSnapshot).not.equals(frozenSnapshot);
        expect(refreshedSnapshot).deep.equals(initialList);
    });
});
