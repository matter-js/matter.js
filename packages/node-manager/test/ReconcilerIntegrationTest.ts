/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { Duration, Seconds } from "@matter/general";
import { AclCapacityExceededError, DesiredStateBehavior, itemMapKey } from "@matter/node";
import { AccessControlServer } from "@matter/node/behaviors/access-control";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { NodeId, SubjectId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";

const { Operate, Administer } = AccessControl.AccessControlEntryPrivilege;
const { Case } = AccessControl.AccessControlEntryAuthMode;
const SUBJECT = SubjectId(0x55n);

const grant = { privilege: Operate, authMode: Case, subjects: [SUBJECT], targets: null };

async function controllerWithReconciler(
    site: MockSite,
    reconciler?: { settleDelay?: Duration; sweepInterval?: Duration },
) {
    return site.addCommissionedPair({
        controller: { type: MockServerNode.RootEndpoint.with(ReconcilerBehavior), reconciler },
    });
}

/** Advance in steps small enough that a peer's subscription stays alive, until `done` holds. */
async function pumpFor(step: Duration, times: number, done: () => boolean) {
    for (let i = 0; i < times && !done(); i++) {
        await MockTime.advance(step);
        await MockTime.macrotask;
    }
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

    it("converges a peer on its own, without anyone asking for a pass", async () => {
        await using site = new MockSite();
        // A sweep every second, so the peer's subscription is still alive when it runs.
        const { controller, device } = await controllerWithReconciler(site, { sweepInterval: Seconds(1) });
        const peer = await subscribedPeer(controller, "peer1");

        await peer.act(agent => agent.get(DesiredStateBehavior).setIntent("acl", "k1", grant, "converge"));

        // Nothing calls reconcile: the periodic sweep is what makes an intent written while nothing is
        // watching still reach the device, and what re-applies one the device loses later.
        const hasOurs = () => device.state.accessControl.acl.some(e => e.subjects?.[0] === SUBJECT);
        await pumpFor(Seconds(1), 40, hasOurs);
        expect(hasOurs()).equals(true);

        // The sweep pushes work the device has not taken; it does not re-read what the device holds. An entry
        // lost behind the engine's back therefore stays lost until something asks for a verify pass — which is
        // what a peer coming back or changing software version does.
        await MockTime.resolve(
            device.act("drop-our-acl", agent => {
                const acl = agent.get(AccessControlServer);
                acl.state.acl = acl.state.acl.filter(e => e.subjects?.[0] !== SUBJECT);
            }),
        );
        await pumpFor(Seconds(1), 20, hasOurs);
        expect(hasOurs()).equals(false);

        await MockTime.resolve(
            controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true })),
        );
        expect(hasOurs()).equals(true);
    });

    it("says why it gave up on an item, until something writes that intent again", async () => {
        await using site = new MockSite();
        const { controller, device } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");

        // An entry the device refuses for good: a subject the ACL cannot hold.
        const unusable = { ...grant, subjects: [NodeId(0n)] };
        await peer.act(agent => agent.get(DesiredStateBehavior).setIntent("acl", "bad", unusable, "converge"));
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));

        // The item is gone, so its own status can no longer say why — the reconciler holds the reason instead.
        expect(peer.stateOf(DesiredStateBehavior).items[itemMapKey("acl", "bad")]).equals(undefined);
        const reason = await controller.act(agent => agent.get(ReconcilerBehavior).dropReasonFor(peer, "acl", "bad"));
        expect(reason).not.equals(undefined);

        // Writing the intent again is a new question, so the old answer goes.
        await peer.act(agent => agent.get(DesiredStateBehavior).setIntent("acl", "bad", grant, "converge"));
        expect(await controller.act(agent => agent.get(ReconcilerBehavior).dropReasonFor(peer, "acl", "bad"))).equals(
            undefined,
        );
        expect(device.state.accessControl.acl.length).greaterThan(0);
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
