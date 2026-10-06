/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffLightDevice } from "#devices/on-off-light";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import type { ServerNode } from "#node/ServerNode.js";
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
