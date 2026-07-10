/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdClient } from "#behavior/system/icd/IcdClient.js";
import { IcdPeerAsleepError } from "#behavior/system/icd/IcdPeerAsleepError.js";
import { IcdManagementServer } from "#behaviors/icd-management";
import { ClientNode } from "#node/ClientNode.js";
import { ServerNode } from "#node/index.js";
import { Seconds } from "@matter/general";
import type { Peer } from "@matter/protocol";
import { NetworkProfiles, Read } from "@matter/protocol";
import { EndpointNumber, NodeId, SubjectId } from "@matter/types";
import { Descriptor } from "@matter/types/clusters/descriptor";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { commission, LIT_CONFIG, wakeDevice, wakefulnessOf } from "../icd-helpers.js";
import { MockSite } from "../mock-site.js";
import { subscribedPeer } from "../node-helpers.js";

const DslsIcdServer = IcdManagementServer.with(
    IcdManagement.Feature.CheckInProtocolSupport,
    IcdManagement.Feature.LongIdleTimeSupport,
    IcdManagement.Feature.DynamicSitLitSupport,
);
const RootWithDslsIcd = ServerNode.RootEndpoint.with(DslsIcdServer);

const SitIcdServer = IcdManagementServer.with(IcdManagement.Feature.CheckInProtocolSupport);
const RootWithSitIcd = ServerNode.RootEndpoint.with(SitIcdServer);

const MONITORED = SubjectId(NodeId(0xabcdn));

const descriptorRead = Read(
    Read.Attribute({ endpoint: EndpointNumber(0), cluster: Descriptor, attributes: "serverList" }),
);

/** Commission a DSLS device that is operating in LIT mode and register the controller as a Check-In client. */
async function registeredLitPair(site: MockSite) {
    const { controller, device } = await site.addUncommissionedPair({
        device: { type: RootWithDslsIcd, icdManagement: LIT_CONFIG },
    });
    await device.act(agent => agent.get(DslsIcdServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
    await commission(controller, device);
    const peer1 = await subscribedPeer(controller, "peer1");
    // A LIT-operating peer auto-registers on the subscription-established edge; settle it, then re-register under a
    // subject the active subscription does not cover so the device transmits Check-Ins.
    if (!peer1.stateOf(IcdClient).registered) {
        const registered = new Promise<void>(resolve => peer1.eventsOf(IcdClient).registered.once(() => resolve()));
        await MockTime.resolve(registered, { macrotasks: true });
    }
    await peer1.act(agent => agent.get(IcdClient).unregister());
    await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: MONITORED }));
    // register seeds a signal (awake for activeModeThreshold = 5s); let that window lapse so the peer is idle.
    await MockTime.advance(Seconds(6));
    await MockTime.resolve(Promise.resolve(), { macrotasks: true });
    return { controller, device, peer1 };
}

/**
 * Record network-profile ids selected for {@link node}'s peer, restoring the original selector on disposal.  Filtered
 * by peer address because {@link NetworkProfiles} is a shared Environmental singleton, so another peer's concurrent
 * selection would otherwise pollute the recording.
 */
function recordNetworkSelection(controller: ServerNode, node: ClientNode) {
    const target = node.state.commissioning.peerAddress;
    const profiles = controller.env.get(NetworkProfiles);
    const selected = new Array<string | undefined>();
    const hadOwn = Object.hasOwn(profiles, "select");
    const originalSelect = profiles.select; // exact function to restore
    const delegate = originalSelect.bind(profiles); // bound copy only for delegating while recording
    profiles.select = (peer: Peer, id?: string) => {
        if (
            target !== undefined &&
            peer.address.nodeId === target.nodeId &&
            peer.address.fabricIndex === target.fabricIndex
        ) {
            selected.push(id);
        }
        return delegate(peer, id);
    };
    return {
        selected,
        [Symbol.dispose]() {
            // Restore the exact prior selector rather than blindly deleting, so a pre-existing own override survives.
            if (hadOwn) {
                profiles.select = originalSelect;
            } else {
                Reflect.deleteProperty(profiles, "select");
            }
        },
    };
}

async function drainRead(peer: ClientNode) {
    for await (const chunk of peer.interaction.read(descriptorRead)) {
        for await (const _report of chunk);
    }
}

describe("ClientNodeInteraction ICD hold", () => {
    before(() => {
        MockTime.init();
    });

    it("holds a read for an idle LIT peer and completes it once a check-in wakes the peer", async () => {
        await using site = new MockSite();
        const { controller, device, peer1 } = await registeredLitPair(site);

        expect(wakefulnessOf(controller, peer1)!.awake.value).false;

        let settled = false;
        const read = drainRead(peer1).then(
            () => (settled = true),
            e => {
                settled = true;
                throw e;
            },
        );

        // Let the gate park; the read must not transmit while the peer is asleep.
        await MockTime.resolve(Promise.resolve(), { macrotasks: true });
        expect(settled).false;

        await wakeDevice(device);
        await MockTime.resolve(read, { macrotasks: true });
        expect(settled).true;
    });

    it("rejects with IcdPeerAsleepError when no check-in arrives within the default window", async () => {
        await using site = new MockSite();
        const { controller, peer1 } = await registeredLitPair(site);

        expect(wakefulnessOf(controller, peer1)!.awake.value).false;

        let caught: unknown;
        const read = drainRead(peer1).catch(e => (caught = e));

        // idleModeDuration (3600s) + CHECK_IN_MARGIN (10s) + slack.
        await MockTime.advance(Seconds(3700));
        await MockTime.resolve(read, { macrotasks: true });

        expect(caught).instanceof(IcdPeerAsleepError);
    });

    it("passes a read through immediately when the LIT peer is awake", async () => {
        await using site = new MockSite();
        const { controller, device, peer1 } = await registeredLitPair(site);

        const checkedIn = new Promise<void>(resolve => peer1.eventsOf(IcdClient).checkedIn.once(() => resolve()));
        await wakeDevice(device);
        await MockTime.resolve(checkedIn, { macrotasks: true });
        expect(wakefulnessOf(controller, peer1)!.awake.value).true;

        // No MockTime advance: an awake peer must not park.
        await MockTime.resolve(drainRead(peer1), { macrotasks: true });
    });

    it("passes a read through immediately for a non-LIT peer", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: RootWithSitIcd },
        });
        const peer1 = await subscribedPeer(controller, "peer1");
        await peer1.act(agent => agent.get(IcdClient).register());

        expect(wakefulnessOf(controller, peer1)!.requiresAwait).false;

        await MockTime.resolve(drainRead(peer1), { macrotasks: true });
    });

    it("breaks the hold deadlock after forget(): a read completes without a check-in", async () => {
        await using site = new MockSite();
        const { controller, peer1 } = await registeredLitPair(site);

        // An idle registered LIT peer would park every interaction on a check-in that never comes.
        expect(wakefulnessOf(controller, peer1)!.awake.value).false;

        await peer1.act(agent => agent.get(IcdClient).forget());

        expect(peer1.stateOf(IcdClient).registered).false;
        expect(wakefulnessOf(controller, peer1)).undefined;

        // No wakeDevice, no MockTime advance: forget() dropped the fed peer, so the interaction no longer holds.
        await MockTime.resolve(drainRead(peer1), { macrotasks: true });
    });

    it("routes a woken LIT read through the icdLit network profile", async () => {
        await using site = new MockSite();
        const { controller, device, peer1 } = await registeredLitPair(site);

        using recording = recordNetworkSelection(controller, peer1);
        expect(wakefulnessOf(controller, peer1)!.awake.value).false;

        const read = drainRead(peer1);
        await MockTime.resolve(Promise.resolve(), { macrotasks: true });

        await wakeDevice(device);
        await MockTime.resolve(read, { macrotasks: true });

        expect(recording.selected.includes("icdLit")).true;
    });

    it("honors a per-call timeout override that expires before the default window", async () => {
        await using site = new MockSite();
        const { controller, peer1 } = await registeredLitPair(site);

        expect(wakefulnessOf(controller, peer1)!.awake.value).false;

        const overrideRead = { ...descriptorRead, icdAwaitTimeout: Seconds(10) };

        let caught: unknown;
        const read = (async () => {
            for await (const chunk of peer1.interaction.read(overrideRead)) {
                for await (const _report of chunk);
            }
        })().catch(e => (caught = e));

        // Past the 10s override but well short of the 3605s default.
        await MockTime.advance(Seconds(15));
        await MockTime.resolve(read, { macrotasks: true });

        expect(caught).instanceof(IcdPeerAsleepError);
    });
});
