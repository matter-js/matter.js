/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Lifecycle } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import type { CommissionableDevice } from "@matter/protocol";

const DEVICE: CommissionableDevice = {
    deviceIdentifier: "device-a",
    D: 1000,
    CM: 1,
    addresses: [{ type: "udp", ip: "fe80::1", port: 5540 }],
};

function peersFor(node: ServerNode, deviceIdentifier: string) {
    return [...node.peers].filter(
        peer =>
            peer.construction.status === Lifecycle.Status.Active &&
            peer.state.commissioning.deviceIdentifier === deviceIdentifier,
    );
}

/**
 * Runs {@link action} at the moment {@link peer} turns inactive, before anything else can advance its deletion.
 */
function whenInactive<T>(peer: ClientNode, action: () => Promise<T>) {
    return new Promise<T>((resolve, reject) => {
        const observer = (status: Lifecycle.Status) => {
            if (status === Lifecycle.Status.Inactive) {
                peer.construction.change.off(observer);
                action().then(resolve, reject);
            }
        };
        peer.construction.change.on(observer);
    });
}

describe("Peers.forDescriptor", () => {
    let node: ServerNode;

    beforeEach(async () => {
        node = await MockServerNode.createOnline();
    });

    afterEach(async () => {
        await node.close();
    });

    it("returns the node under construction for a second call with the same descriptor", async () => {
        const [first, second] = await MockTime.resolve(
            Promise.all([node.peers.forDescriptor(DEVICE), node.peers.forDescriptor(DEVICE)]),
        );

        expect(second).equals(first);
        expect(peersFor(node, "device-a").length).equals(1);
    });

    it("matches a constructed node by its current state, not the descriptor it was created with", async () => {
        const peer = await MockTime.resolve(node.peers.forDescriptor(DEVICE));
        await peer.set({ commissioning: { deviceIdentifier: "device-b" } });

        const found = await MockTime.resolve(node.peers.forDescriptor({ ...DEVICE, deviceIdentifier: "device-b" }));

        expect(found).equals(peer);
    });

    it("creates a new node for a device whose node is being deleted", async () => {
        const peer = await MockTime.resolve(node.peers.forDescriptor(DEVICE));

        const lookup = whenInactive(peer, () => node.peers.forDescriptor(DEVICE));
        const [found] = await MockTime.resolve(Promise.all([lookup, peer.delete()]));

        expect(found).not.equals(peer);
        const peers = peersFor(node, "device-a");
        expect(peers.length).equals(1);
        expect(peers[0]).equals(found);
    });

    it("creates a new node for a device whose node has begun deletion", async () => {
        const peer = await MockTime.resolve(node.peers.forDescriptor(DEVICE));

        let lookup: Promise<ClientNode> | undefined;
        peer.lifecycle.destroying.once(() => {
            lookup = node.peers.forDescriptor(DEVICE);
        });
        await MockTime.resolve(peer.delete());
        if (lookup === undefined) {
            expect.fail("Deletion never began");
        }
        const found = await MockTime.resolve(lookup);

        expect(found).not.equals(peer);
    });
});
