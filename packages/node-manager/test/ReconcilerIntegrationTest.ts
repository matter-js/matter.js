/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { AclCapacityExceededError, DesiredStateBehavior, itemMapKey } from "@matter/node";
import { AccessControlServer } from "@matter/node/behaviors/access-control";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { SubjectId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";

const { Operate, Administer } = AccessControl.AccessControlEntryPrivilege;
const { Case } = AccessControl.AccessControlEntryAuthMode;
const SUBJECT = SubjectId(0x55n);

const grant = { privilege: Operate, authMode: Case, subjects: [SUBJECT], targets: null };

async function controllerWithReconciler(site: MockSite) {
    return site.addCommissionedPair({
        controller: { type: MockServerNode.RootEndpoint.with(ReconcilerBehavior) },
    });
}

describe("Reconciler integration (single peer)", () => {
    before(() => {
        MockTime.init();
    });

    it("applies an acl intent to a reachable peer and preserves admin", async () => {
        await using site = new MockSite();
        const { controller, device } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");

        await peer.act(agent => agent.get(DesiredStateBehavior).setIntent("acl", "k1", grant, "converge"));
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));

        const acl = device.state.accessControl.acl;
        expect(acl.some(e => e.subjects?.[0] === SUBJECT && e.privilege === Operate)).equals(true);
        expect(acl.some(e => e.privilege === Administer)).equals(true);
        const item = peer.stateOf(DesiredStateBehavior).items[itemMapKey("acl", "k1")];
        expect(item?.status.state).equals("committed");
    });

    it("leaves the item pending while the subscription is down, drains when back", async () => {
        await using site = new MockSite();
        const { controller, device } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");

        await MockTime.resolve(device.stop(), { macrotasks: true });

        await peer.act(agent => agent.get(DesiredStateBehavior).setIntent("acl", "k1", grant, "converge"));
        expect(peer.stateOf(DesiredStateBehavior).items[itemMapKey("acl", "k1")]?.status.state).equals("pending");

        await MockTime.resolve(device.start(), { macrotasks: true });
        const peerAgain = await subscribedPeer(controller, "peer1");
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peerAgain)));
        expect(peerAgain.stateOf(DesiredStateBehavior).items[itemMapKey("acl", "k1")]?.status.state).equals(
            "committed",
        );
    });

    it("rejects admission when the device ACL is full", async () => {
        await using site = new MockSite();
        const { controller } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");

        await MockTime.resolve(
            controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true })),
        );

        await peer.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            const current = ds.getCapacity("acl");
            ds.setCapacity("acl", { limit: current?.used ?? 1, used: current?.used ?? 1 });
            expect(() => ds.assertCanAdd("acl")).throws(AclCapacityExceededError);
        });
    });

    it("re-pends and re-applies when the entry is removed behind the engine", async () => {
        await using site = new MockSite();
        const { controller, device } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");

        await peer.act(agent => agent.get(DesiredStateBehavior).setIntent("acl", "k1", grant, "converge"));
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));
        expect(peer.stateOf(DesiredStateBehavior).items[itemMapKey("acl", "k1")]?.status.state).equals("committed");

        await MockTime.resolve(
            device.act("drop-our-acl", agent => {
                const acl = agent.get(AccessControlServer);
                acl.state.acl = acl.state.acl.filter(e => e.subjects?.[0] !== SUBJECT);
            }),
        );

        await MockTime.resolve(
            controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true })),
        );
        const acl = device.state.accessControl.acl;
        expect(acl.some(e => e.subjects?.[0] === SUBJECT)).equals(true);
    });
});
