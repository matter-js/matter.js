/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Acl } from "#reconcile/kinds.js";
import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import {
    Diagnostic,
    Duration,
    ImplementationError,
    LogDestination,
    Logger,
    LogLevel,
    Minutes,
    Seconds,
} from "@matter/general";
import {
    AclCapacityExceededError,
    ClientNode,
    DesiredStateBehavior,
    ItemDrift,
    ItemKind,
    itemMapKey,
    ServerNode,
} from "@matter/node";
import { AccessControlServer } from "@matter/node/behaviors/access-control";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { FabricManager } from "@matter/protocol";
import { NodeId, Status, StatusResponseError, SubjectId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";

const { Operate, Administer } = AccessControl.AccessControlEntryPrivilege;
const { Case } = AccessControl.AccessControlEntryAuthMode;
const SUBJECT = SubjectId(0x55n);

const grant = { privilege: Operate, authMode: Case, subjects: [SUBJECT], targets: null };

async function controllerWithReconciler(
    site: MockSite,
    reconciler?: {
        settleDelay?: Duration;
        sweepInterval?: Duration;
        driftBudget?: { count: number; window: Duration };
    },
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
            expect(() => ds.assertCanAdd("acl", ["another"])).throws(AclCapacityExceededError);
        });
    });

    it("converges a peer on its own, without anyone asking for a pass", async () => {
        await using site = new MockSite();
        // A sweep every second, so the peer's subscription is still alive when it runs.
        const { controller, device } = await controllerWithReconciler(site, { sweepInterval: Seconds(1) });
        const peer = await subscribedPeer(controller, "peer1");

        await peer.act(agent => agent.get(DesiredStateBehavior).setIntent("acl", "k1", grant, "converge"));

        // Nothing calls reconcile: the periodic sweep is what makes an intent written while nothing is
        // watching still reach the device.
        const hasOurs = () => device.state.accessControl.acl.some(e => e.subjects?.[0] === SUBJECT);
        await pumpFor(Seconds(1), 40, hasOurs);
        expect(hasOurs()).equals(true);

        // The sweep pushes work the device has not taken; it does not re-read what the device holds. A
        // `converge` entry lost behind the engine's back stays lost until an explicit verify re-applies it.
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

    it("keeps an item it gave up on, so absence still means the work is done", async () => {
        await using site = new MockSite();
        const { controller, device } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");

        // An entry the device refuses for good: a subject the ACL cannot hold.
        const unusable = { ...grant, subjects: [NodeId(0n)] };
        await peer.act(agent => agent.get(DesiredStateBehavior).setIntent("acl", "bad", unusable, "converge"));
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));

        // It stays, carrying the status that says why. Dropping it would tell a caller reading desired state
        // that the device is as asked, and leave nothing behind for the next start to read.
        const failed = peer.stateOf(DesiredStateBehavior).items[itemMapKey("acl", "bad")];
        expect(failed?.status.state).equals("commitFailed");
        expect(failed?.status.failureCode).not.equals(undefined);

        // Writing the intent again is new work, and it converges.
        await peer.act(agent => agent.get(DesiredStateBehavior).setIntent("acl", "bad", grant, "converge"));
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));
        expect(device.state.accessControl.acl.length).greaterThan(0);
        expect(peer.stateOf(DesiredStateBehavior).items[itemMapKey("acl", "bad")]?.status.state).equals("committed");
    });

    it("re-applies an entry removed behind the engine on an explicit verify", async () => {
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

    it("rejects an explicit verify pass whose live read failed, after re-applying what it could read", async () => {
        await using site = new MockSite();
        const { controller } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");

        const applied = new Array<string>();
        const readError = new StatusResponseError("live read failed", Status.Failure);
        const kind = (name: string, verify: ItemKind["verify"]): ItemKind => ({
            kind: name,
            priority: 0,
            async apply(_node, item) {
                applied.push(`${name}:${item.key}`);
            },
            verify,
        });
        await controller.act(agent => {
            const reconciler = agent.get(ReconcilerBehavior);
            reconciler.registerItemKind(
                kind("boom", async () => {
                    throw readError;
                }),
            );
            reconciler.registerItemKind(kind("moved", async () => false));
        });

        await peer.act(async agent => {
            const ds = agent.get(DesiredStateBehavior);
            for (const name of ["boom", "moved"]) {
                ds.setIntent(name, "k", {}, "maintain");
                await ds.updateStatus(name, "k", "committed");
            }
        });

        // The intent writes schedule a pass that may apply the items while still pending; let it finish first,
        // so only the explicit pass is under test.
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));
        applied.length = 0;
        await expect(
            MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true }))),
        ).rejectedWith(readError);
        expect(applied).deep.equals(["moved:k"]);
    });
});

/** Run the verify pass a trigger schedules (here a software version change), and wait until it is done. */
async function scheduledVerify(controller: ServerNode, peer: ClientNode) {
    await MockTime.resolve(peer.act(agent => peer.lifecycle.softwareVersionChanged.emit(1, agent.context)));
    // An explicit pass queues behind the scheduled one on the peer's lock; without `verify` it writes nothing new.
    await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));
}

/** The reconciler's own lines, and the peer lock's, which reports an error a pass let escape. */
function captureReconcilerLog() {
    const lines = new Array<{ level: LogLevel; text: string }>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            if (message.facility === "Reconciler" || message.facility === "Mutex") {
                lines.push({ level: message.level, text: message.values.map(value => String(value)).join(" ") });
            }
        },
    });
    return lines;
}

function driftEvents(peer: ClientNode) {
    const events = new Array<ItemDrift | undefined>();
    peer.eventsOf(DesiredStateBehavior).itemDriftChanged.on((_kind, _key, drift) => {
        events.push(drift);
    });
    return events;
}

describe("drift dispositions", () => {
    before(() => {
        MockTime.init();
    });

    afterEach(() => {
        delete Logger.destinations.capture;
    });

    const hasOurs = (device: ServerNode) => device.state.accessControl.acl.some(e => e.subjects?.[0] === SUBJECT);

    async function dropOurs(device: ServerNode) {
        await MockTime.resolve(
            device.act("drop-our-acl", agent => {
                const acl = agent.get(AccessControlServer);
                acl.state.acl = acl.state.acl.filter(e => e.subjects?.[0] !== SUBJECT);
            }),
        );
    }

    async function committedAcl(controller: ServerNode, peer: ClientNode, mode: "converge" | "maintain") {
        await peer.act(agent => agent.get(DesiredStateBehavior).setIntent("acl", "k1", grant, mode));
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));
        expect(peer.stateOf(DesiredStateBehavior).items[itemMapKey("acl", "k1")]?.status.state).equals("committed");
    }

    const driftOf = (peer: ClientNode) => peer.stateOf(DesiredStateBehavior).drifts[itemMapKey("acl", "k1")];

    it("records a converge drift on a scheduled verify pass and does not write it", async () => {
        await using site = new MockSite();
        const { controller, device } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");
        await committedAcl(controller, peer, "converge");
        await dropOurs(device);

        const events = driftEvents(peer);
        const log = captureReconcilerLog();
        await scheduledVerify(controller, peer);

        expect(hasOurs(device)).equals(false);
        expect(driftOf(peer)?.disposition).equals("recorded");
        expect(events.map(e => e?.disposition)).deep.equals(["recorded"]);
        expect(peer.stateOf(DesiredStateBehavior).items[itemMapKey("acl", "k1")]?.status.state).equals("committed");
        const notices = log.filter(line => line.level === LogLevel.NOTICE);
        expect(notices.map(line => line.text)).deep.equals([
            `Drift on ${peer.id} acl:k1 (converge): changed on the device by another administrator of this fabric or by the device itself; left until a task gate or an explicit verify`,
        ]);

        // A repeat confirmation keeps the mark and says nothing new above debug.
        await scheduledVerify(controller, peer);
        expect(events.length).equals(1);
        expect(log.filter(line => line.level >= LogLevel.NOTICE).length).equals(1);
    });

    it("re-applies a recorded converge drift on an explicit verify and clears the mark", async () => {
        await using site = new MockSite();
        const { controller, device } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");
        await committedAcl(controller, peer, "converge");
        await dropOurs(device);
        await scheduledVerify(controller, peer);
        expect(driftOf(peer)?.disposition).equals("recorded");

        const events = driftEvents(peer);
        await MockTime.resolve(
            controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true })),
        );

        expect(hasOurs(device)).equals(true);
        expect(driftOf(peer)).equals(undefined);
        expect(events).deep.equals([undefined]);
    });

    it("clears a mark when a scheduled verify finds the device restored", async () => {
        await using site = new MockSite();
        const { controller, device } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");
        await committedAcl(controller, peer, "converge");
        const fabricIndex = device.state.accessControl.acl.find(e => e.subjects?.[0] === SUBJECT)!.fabricIndex;
        await dropOurs(device);
        await scheduledVerify(controller, peer);
        expect(driftOf(peer)?.disposition).equals("recorded");

        await MockTime.resolve(
            device.act("restore-our-acl", agent => {
                const acl = agent.get(AccessControlServer);
                acl.state.acl = [...acl.state.acl, { ...grant, fabricIndex }];
            }),
        );
        const events = driftEvents(peer);
        await scheduledVerify(controller, peer);

        expect(driftOf(peer)).equals(undefined);
        expect(events).deep.equals([undefined]);
    });

    it("re-applies a maintain drift within its budget, then holds it", async () => {
        await using site = new MockSite();
        const window = Seconds(30);
        const { controller, device } = await controllerWithReconciler(site, { driftBudget: { count: 3, window } });
        const peer = await subscribedPeer(controller, "peer1");
        await committedAcl(controller, peer, "maintain");

        const log = captureReconcilerLog();
        for (let i = 0; i < 3; i++) {
            await dropOurs(device);
            await scheduledVerify(controller, peer);
            expect(hasOurs(device)).equals(true);
            expect(driftOf(peer)).equals(undefined);
        }
        // Only the first re-apply of a window is a notice; a device reverting the item cannot flood the log.
        expect(log.filter(line => line.level > LogLevel.DEBUG).map(line => line.text)).deep.equals([
            `Drift on ${peer.id} acl:k1 (maintain): changed on the device by another administrator of this fabric or by the device itself; re-applying`,
        ]);

        await dropOurs(device);
        await scheduledVerify(controller, peer);
        expect(hasOurs(device)).equals(false);
        expect(driftOf(peer)?.disposition).equals("held");
        const warnings = log.filter(line => line.level === LogLevel.WARN).map(line => line.text);
        expect(warnings.length).equals(1);
        expect(warnings[0]).contains(`${peer.id} acl:k1`);
        expect(warnings[0]).contains("3 times");
        expect(warnings[0]).contains(Duration.format(window));
        expect(warnings[0]).contains("needs an action");
        expect(warnings[0]).contains("retry()");
    });

    it("keeps a held item held after its window has passed", async () => {
        await using site = new MockSite();
        const window = Seconds(30);
        const { controller, peer, script } = await heldScripted(site, window);
        const events = driftEvents(peer);

        await pumpFor(Seconds(1), 40, () => false);
        await scheduledVerify(controller, peer);

        expect(script.applies).equals(1);
        expect(scriptedDriftOf(peer, "scripted")?.disposition).equals("held");
        expect(events).deep.equals([]);
    });

    for (const mode of ["converge", "maintain"] as const) {
        it(`spends the budget of a ${mode} item on an explicit verify, and holds it once spent`, async () => {
            await using site = new MockSite();
            const { controller } = await controllerWithReconciler(site, {
                driftBudget: { count: 3, window: Minutes(10) },
            });
            const peer = await subscribedPeer(controller, "peer1");
            const script = await committedScripted(controller, peer, "scripted", mode);
            script.answer = false;
            const log = captureReconcilerLog();

            for (let i = 1; i <= 3; i++) {
                await explicitVerify(controller, peer);
                expect(script.applies).equals(i);
                expect(scriptedDriftOf(peer, "scripted")).equals(undefined);
            }
            await explicitVerify(controller, peer);

            expect(script.applies).equals(3);
            expect(scriptedDriftOf(peer, "scripted")?.disposition).equals("held");
            expect(log.filter(line => line.level === LogLevel.WARN).length).equals(1);
        });
    }

    it("holds a converge drift on a scheduled verify once explicit verifies spent its budget", async () => {
        await using site = new MockSite();
        const { controller } = await controllerWithReconciler(site, {
            driftBudget: { count: 1, window: Minutes(10) },
        });
        const peer = await subscribedPeer(controller, "peer1");
        const script = await committedScripted(controller, peer, "scripted", "converge");
        script.answer = false;
        await explicitVerify(controller, peer);
        await explicitVerify(controller, peer);
        expect(scriptedDriftOf(peer, "scripted")?.disposition).equals("held");

        const events = driftEvents(peer);
        await scheduledVerify(controller, peer);

        expect(scriptedDriftOf(peer, "scripted")?.disposition).equals("held");
        expect(events).deep.equals([]);
    });

    it("retry() clears a held mark, starts the budget over and puts the entry back on the device", async () => {
        await using site = new MockSite();
        const { controller, device } = await controllerWithReconciler(site, {
            driftBudget: { count: 2, window: Minutes(10) },
        });
        const peer = await subscribedPeer(controller, "peer1");
        await committedAcl(controller, peer, "maintain");
        for (let i = 0; i < 3; i++) {
            await dropOurs(device);
            await scheduledVerify(controller, peer);
        }
        expect(hasOurs(device)).equals(false);
        expect(driftOf(peer)?.disposition).equals("held");

        const events = driftEvents(peer);
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).retry(peer, Acl, "k1")));

        expect(hasOurs(device)).equals(true);
        expect(driftOf(peer)).equals(undefined);
        expect(events).deep.equals([undefined]);

        // retry()'s own re-apply is the one spend in the new budget, so one more drift is re-applied, not held.
        await dropOurs(device);
        await scheduledVerify(controller, peer);
        expect(hasOurs(device)).equals(true);
        expect(driftOf(peer)).equals(undefined);
    });

    it("retry() refuses an item the peer does not hold, and a kind it was not given by the reconciler", async () => {
        await using site = new MockSite();
        const { controller } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");
        await committedAcl(controller, peer, "converge");

        await expect(
            MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).retry(peer, Acl, "missing"))),
        ).rejectedWith(ImplementationError, /acl:missing.*holds no such item/);
        await expect(
            MockTime.resolve(
                controller.act(agent =>
                    agent.get(ReconcilerBehavior).retry(peer, { kind: "acl", priority: 0, async apply() {} }, "k1"),
                ),
            ),
        ).rejectedWith(ImplementationError, /not the one the reconciler registered/);
    });

    it("retry() whose live read fails leaves the mark and the budget as they were", async () => {
        await using site = new MockSite();
        const { controller, peer, script } = await heldScripted(site, Minutes(10));
        const readError = new StatusResponseError("scripted read failed", Status.Failure);

        script.answer = "throws";
        const events = driftEvents(peer);
        await expect(
            MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).retry(peer, script.kind, "k"))),
        ).rejectedWith(StatusResponseError, readError.message);
        expect(scriptedDriftOf(peer, "scripted")?.disposition).equals("held");
        expect(events).deep.equals([]);

        // The budget is still spent, so a scheduled pass finding the drift again neither writes nor un-holds it.
        script.answer = false;
        await scheduledVerify(controller, peer);
        expect(script.applies).equals(1);
        expect(scriptedDriftOf(peer, "scripted")?.disposition).equals("held");

        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).retry(peer, script.kind, "k")));
        expect(script.applies).equals(2);
        expect(scriptedDriftOf(peer, "scripted")).equals(undefined);
    });

    it("drops an explicit pass whose fabric left while it waited for the peer's lock", async () => {
        await using site = new MockSite();
        const { controller } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");
        const script = await committedScripted(controller, peer, "scripted", "maintain");

        let release!: () => void;
        const entered = new Promise<void>(resolve => {
            script.hold = { entered: resolve, released: new Promise<void>(r => (release = r)) };
        });
        await MockTime.resolve(peer.act(agent => peer.lifecycle.softwareVersionChanged.emit(1, agent.context)));
        await MockTime.resolve(entered);
        script.hold = undefined;

        const queued = [
            controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true })),
            controller.act(agent => agent.get(ReconcilerBehavior).retry(peer, script.kind, "k")),
        ];
        // Both verbs pass their fabric check and queue behind the held read before the fabric goes.
        await MockTime.macrotask;
        const fabrics = controller.env.get(FabricManager);
        await MockTime.resolve(fabrics.fabrics[0].delete(), { macrotasks: true });
        // A pass that went ahead would read this drift and write it back to a peer of a fabric that is gone.
        script.answer = false;
        const reads = script.reads;
        release();

        await MockTime.resolve(Promise.all(queued), { macrotasks: true });
        expect(script.reads).equals(reads);
        expect(script.applies).equals(0);
    });

    it("discards a scheduled verify pass whose peer was unwired while its live read was out", async () => {
        await using site = new MockSite();
        const { controller } = await controllerWithReconciler(site, {
            driftBudget: { count: 1, window: Minutes(10) },
        });
        const peer = await subscribedPeer(controller, "peer1");
        const script = await committedScripted(controller, peer, "scripted", "maintain");
        script.answer = false;
        // One re-apply spends the budget, so a pass that went on deciding would hold the item and warn.
        await scheduledVerify(controller, peer);
        expect(script.applies).equals(1);

        let release!: () => void;
        const entered = new Promise<void>(resolve => {
            script.hold = { entered: resolve, released: new Promise<void>(r => (release = r)) };
        });
        await MockTime.resolve(peer.act(agent => peer.lifecycle.softwareVersionChanged.emit(1, agent.context)));
        await MockTime.resolve(entered);
        script.hold = undefined;

        const events = driftEvents(peer);
        const fabrics = controller.env.get(FabricManager);
        await MockTime.resolve(fabrics.fabrics[0].delete(), { macrotasks: true });
        const log = captureReconcilerLog();
        release();
        await pumpFor(Seconds(1), 5, () => false);

        // The peer's state is no longer readable once its fabric is gone; the drift event is what shows a mark.
        expect(script.applies).equals(1);
        expect(events).deep.equals([]);
        expect(log.filter(line => line.level >= LogLevel.WARN)).deep.equals([]);
    });

    it("confirms a held maintain drift again without writing, an event or a log line above debug", async () => {
        await using site = new MockSite();
        const { controller, device } = await controllerWithReconciler(site, {
            driftBudget: { count: 1, window: Seconds(30) },
        });
        const peer = await subscribedPeer(controller, "peer1");
        await committedAcl(controller, peer, "maintain");
        for (let i = 0; i < 2; i++) {
            await dropOurs(device);
            await scheduledVerify(controller, peer);
        }
        expect(driftOf(peer)?.disposition).equals("held");

        const events = driftEvents(peer);
        const log = captureReconcilerLog();
        await scheduledVerify(controller, peer);

        expect(hasOurs(device)).equals(false);
        expect(driftOf(peer)?.disposition).equals("held");
        expect(events).deep.equals([]);
        expect(log.filter(line => line.level > LogLevel.DEBUG)).deep.equals([]);
    });

    it("leaves a held maintain drift unwritten on an explicit verify", async () => {
        await using site = new MockSite();
        const { controller, device } = await controllerWithReconciler(site, {
            driftBudget: { count: 3, window: Seconds(30) },
        });
        const peer = await subscribedPeer(controller, "peer1");
        await committedAcl(controller, peer, "maintain");
        for (let i = 0; i < 4; i++) {
            await dropOurs(device);
            await scheduledVerify(controller, peer);
        }
        expect(driftOf(peer)?.disposition).equals("held");

        const events = driftEvents(peer);
        await explicitVerify(controller, peer);

        expect(hasOurs(device)).equals(false);
        expect(driftOf(peer)?.disposition).equals("held");
        expect(events).deep.equals([]);
    });

    it("does not mark an item rewritten while its drift read was out", async () => {
        await using site = new MockSite();
        const { controller } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");

        let hold: { entered: () => void; released: Promise<void> } | undefined;
        await controller.act(agent =>
            agent.get(ReconcilerBehavior).registerItemKind({
                kind: "slow",
                priority: 0,
                async apply() {},
                async verify() {
                    if (hold !== undefined) {
                        hold.entered();
                        await hold.released;
                    }
                    return false;
                },
            }),
        );
        await peer.act(async agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("slow", "k", { value: 1 }, "converge");
            await ds.updateStatus("slow", "k", "committed");
        });
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));

        let release!: () => void;
        const entered = new Promise<void>(resolve => {
            hold = { entered: resolve, released: new Promise<void>(r => (release = r)) };
        });
        await MockTime.resolve(peer.act(agent => peer.lifecycle.softwareVersionChanged.emit(1, agent.context)));
        await MockTime.resolve(entered);
        hold = undefined;

        // The rewrite lands committed, so only the generation tells the pending mark that it is stale.
        await peer.act(async agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("slow", "k", { value: 2 }, "converge");
            await ds.updateStatus("slow", "k", "committed");
        });
        const events = driftEvents(peer);
        release();
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));

        expect(peer.stateOf(DesiredStateBehavior).drifts[itemMapKey("slow", "k")]).equals(undefined);
        expect(events).deep.equals([]);
    });

    it("keeps the mark of an item whose live read fails", async () => {
        await using site = new MockSite();
        const { controller } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");
        const script = await committedScripted(controller, peer, "scripted", "converge");
        script.answer = false;
        await scheduledVerify(controller, peer);
        expect(scriptedDriftOf(peer, "scripted")?.disposition).equals("recorded");

        script.answer = "throws";
        const events = driftEvents(peer);
        await scheduledVerify(controller, peer);

        expect(scriptedDriftOf(peer, "scripted")?.disposition).equals("recorded");
        expect(events).deep.equals([]);
    });

    it("handles the other items of a scheduled verify pass whose live read fails, quietly", async () => {
        await using site = new MockSite();
        const { controller } = await controllerWithReconciler(site);
        const peer = await subscribedPeer(controller, "peer1");
        const failing = await committedScripted(controller, peer, "failing", "converge");
        failing.answer = "throws";
        const moved = await committedScripted(controller, peer, "moved", "converge");
        moved.answer = false;

        const readsBefore = failing.reads;
        const log = captureReconcilerLog();
        await scheduledVerify(controller, peer);

        expect(failing.reads).equals(readsBefore + 1);
        expect(scriptedDriftOf(peer, "moved")?.disposition).equals("recorded");
        // The one line above debug is the other item's drift: the failed read neither escapes the pass to the
        // peer's lock nor logs on its own.
        expect(log.filter(line => line.level > LogLevel.DEBUG).map(line => line.text)).deep.equals([
            `Drift on ${peer.id} moved:k (converge): changed on the device by another administrator of this fabric or by the device itself; left until a task gate or an explicit verify`,
        ]);
    });
});

interface Script {
    /** What the next live read answers. */
    answer: boolean | "throws";
    reads: number;
    applies: number;
    /** Parks the next live read until `released` settles. */
    hold?: { entered: () => void; released: Promise<void> };
    /** The registered kind, for `retry()`. */
    kind: ItemKind;
}

/** Register a kind whose live read answers as the test says, and commit one `k` item of it. */
async function committedScripted(
    controller: ServerNode,
    peer: ClientNode,
    name: string,
    mode: "converge" | "maintain",
): Promise<Script> {
    const kind: ItemKind = {
        kind: name,
        priority: 0,
        async apply() {
            script.applies++;
        },
        async verify() {
            script.reads++;
            if (script.hold !== undefined) {
                script.hold.entered();
                await script.hold.released;
            }
            if (script.answer === "throws") {
                throw new StatusResponseError("scripted read failed", Status.Failure);
            }
            return script.answer;
        },
    };
    const script: Script = { answer: true, reads: 0, applies: 0, kind };
    await controller.act(agent => agent.get(ReconcilerBehavior).registerItemKind(kind));
    await peer.act(async agent => {
        const ds = agent.get(DesiredStateBehavior);
        ds.setIntent(name, "k", {}, mode);
        ds.updateStatus(name, "k", "committed");
    });
    await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));
    return script;
}

/** A `maintain` item the device keeps reverting, held after its one re-apply. */
async function heldScripted(site: MockSite, window: Duration) {
    const pair = await controllerWithReconciler(site, { driftBudget: { count: 1, window } });
    const peer = await subscribedPeer(pair.controller, "peer1");
    const script = await committedScripted(pair.controller, peer, "scripted", "maintain");
    script.answer = false;
    await scheduledVerify(pair.controller, peer);
    await scheduledVerify(pair.controller, peer);
    expect(script.applies).equals(1);
    expect(scriptedDriftOf(peer, "scripted")?.disposition).equals("held");
    return { ...pair, peer, script };
}

async function explicitVerify(controller: ServerNode, peer: ClientNode) {
    await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true })));
}

const scriptedDriftOf = (peer: ClientNode, name: string) =>
    peer.stateOf(DesiredStateBehavior).drifts[itemMapKey(name, "k")];
