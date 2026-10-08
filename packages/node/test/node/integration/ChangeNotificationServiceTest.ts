/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffLightDevice } from "#devices/on-off-light";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Lifecycle } from "@matter/general";
import { MockServerNode, MockSite } from "@matter/node/testing";
import type { CommissionableDevice } from "@matter/protocol";

const DEVICE: CommissionableDevice = {
    deviceIdentifier: "device-a",
    D: 1000,
    CM: 1,
    addresses: [{ type: "udp", ip: "fe80::1", port: 5540 }],
};

function record(node: ServerNode) {
    const changes = new Array<ChangeNotificationService.Change>();
    node.env.get(ChangeNotificationService).change.on(change => {
        changes.push(change);
    });
    return {
        changes,

        endpointsOf(kind: ChangeNotificationService.Change["kind"]) {
            return changes.filter(change => change.kind === kind).map(change => change.endpoint);
        },
    };
}

/**
 * Restart a controller against the storage of a commissioned pair, so its peer is restored from storage.
 */
async function controllerWithRestoredPeer(site: MockSite) {
    const { controller } = await site.addCommissionedPair();
    const id = controller.id;
    await controller.close();

    const rebooted = await site.addNode(undefined, {
        id,
        device: undefined,
        commissioning: { enabled: false },
        online: false,
    });

    const peer = rebooted.peers.get("peer1");
    if (peer === undefined) {
        expect.fail("No restored peer");
    }
    await MockTime.resolve(peer.construction);

    const recorded = record(rebooted);
    return { rebooted, peer, recorded };
}

async function restart(endpoint: Endpoint) {
    await MockTime.resolve(endpoint.reset());
    endpoint.construction.start();
    await MockTime.resolve(endpoint.construction);
}

describe("ChangeNotificationService", () => {
    before(() => {
        MockTime.init();
    });

    it("reports an endpoint readable when its construction completes and again after a restart", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const recorded = record(node);

        const light = await node.add(OnOffLightDevice, { id: "light" });
        expect(recorded.endpointsOf("readable")).deep.equals([light]);

        await restart(light);
        expect(recorded.endpointsOf("readable")).deep.equals([light, light]);
    });

    // Characterization: peers added after the service started were observed before the restored-peer fix as well
    it("reports the deletion of a peer created after a restart", async () => {
        await using site = new MockSite();
        const { rebooted, recorded } = await controllerWithRestoredPeer(site);

        const peer = await MockTime.resolve(rebooted.peers.forDescriptor(DEVICE));
        await MockTime.resolve(peer.construction);
        await MockTime.resolve(peer.delete());

        expect(recorded.endpointsOf("delete")).contains(peer);
    });

    it("reports the deletion of a peer restored from storage", async () => {
        await using site = new MockSite();
        const { peer, recorded } = await controllerWithRestoredPeer(site);

        await MockTime.resolve(peer.delete());

        expect(recorded.endpointsOf("delete")).contains(peer);
    });

    it("reports no deletion while a controller with peers closes", async () => {
        await using site = new MockSite();
        const { rebooted, recorded } = await controllerWithRestoredPeer(site);

        await MockTime.resolve(rebooted.close());

        expect(recorded.endpointsOf("delete")).deep.equals([]);
    });

    it("reports no deletion while an online controller with a commissioned peer closes", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const recorded = record(controller);

        await MockTime.resolve(controller.close());

        expect(recorded.endpointsOf("delete")).deep.equals([]);
    });

    it("reports no deletion when the runtime shuts down a controller with a started peer", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = controller.peers.get("peer1");
        if (peer === undefined) {
            expect.fail("No commissioned peer");
        }
        await MockTime.resolve(peer.start());
        expect(peer.lifecycle.isOnline).equals(true);
        const recorded = record(controller);

        await MockTime.resolve(controller.env.runtime.close(), { macrotasks: true });

        expect(recorded.endpointsOf("delete")).deep.equals([]);
        expect(peer.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(controller.peers.size).equals(0);
    });

    it("reports the shutdown of a node with its own endpoints, but no deletion, while it closes", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        await node.add(OnOffLightDevice, { id: "light" });
        const recorded = record(node);

        await MockTime.resolve(node.close());

        expect(recorded.endpointsOf("delete")).deep.equals([]);
        expect(recorded.changes.filter(change => change.kind === "event").map(change => change.event.name)).contains(
            "ShutDown",
        );
    });

    // Characterization: guards against suppressing deletions outside the node's own destruction
    it("reports the deletion of an endpoint while its node keeps running", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const recorded = record(node);

        await MockTime.resolve(light.delete());

        expect(recorded.endpointsOf("delete")).deep.equals([light]);
    });

    // Characterization: a factory reset does not destroy the node, so it must not end reporting
    it("reports the deletion of peers a factory reset erases and keeps reporting afterwards", async () => {
        await using site = new MockSite();
        const { rebooted, peer, recorded } = await controllerWithRestoredPeer(site);

        await MockTime.resolve(rebooted.erase());
        expect(recorded.endpointsOf("delete")).contains(peer);

        const light = await rebooted.add(OnOffLightDevice, { id: "light" });
        expect(recorded.endpointsOf("readable")).contains(light);
    });

    it("reports the deletion of peers a factory reset erases while the node is asked to close", async () => {
        await using site = new MockSite();
        const { rebooted, peer, recorded } = await controllerWithRestoredPeer(site);

        const erasing = rebooted.erase();
        const closing = rebooted.close();
        await MockTime.resolve(Promise.all([erasing, closing]));

        expect(recorded.endpointsOf("delete")).contains(peer);
        expect(recorded.endpointsOf("delete")).not.contains(rebooted);
    });

    it("reports the deletion of peers when a controller is deleted, but not its own teardown", async () => {
        await using site = new MockSite();
        const { rebooted, peer, recorded } = await controllerWithRestoredPeer(site);

        await MockTime.resolve(rebooted.delete());

        expect(recorded.endpointsOf("delete")).contains(peer);
        expect(recorded.endpointsOf("delete")).not.contains(rebooted);
    });

    it("reports an endpoint of a peer restored from storage readable after it restarts", async () => {
        await using site = new MockSite();
        const { peer, recorded } = await controllerWithRestoredPeer(site);
        const part = [...peer.endpoints].find(endpoint => endpoint !== peer);
        if (part === undefined) {
            expect.fail("The restored peer has no endpoint besides its root");
        }

        await restart(part);

        expect(recorded.endpointsOf("readable")).deep.equals([part]);
    });

    it("reports a peer readable that is created after the service started", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const recorded = record(node);

        const peer = await MockTime.resolve(node.peers.forDescriptor(DEVICE));
        await MockTime.resolve(peer.construction);

        expect(recorded.endpointsOf("readable")).contains(peer);
    });
});
