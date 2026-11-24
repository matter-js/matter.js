/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Acl, Binding, GroupMembership } from "#reconcile/kinds.js";
import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import {
    createPromise,
    Diagnostic,
    Duration,
    ImplementationError,
    LogDestination,
    Logger,
    LogLevel,
    MaybePromise,
    Millis,
    Seconds,
} from "@matter/general";
import {
    ClientNode,
    DesiredStateBehavior,
    Endpoint,
    ItemEnforcement,
    ItemKind,
    itemMapKey,
    ManagedItem,
    NetworkClient,
    ServerNode,
} from "@matter/node";
import { AccessControlClient, AccessControlServer } from "@matter/node/behaviors/access-control";
import { BindingClient, BindingServer } from "@matter/node/behaviors/binding";
import { GroupKeyManagementClient, GroupKeyManagementServer } from "@matter/node/behaviors/group-key-management";
import { GroupsServer } from "@matter/node/behaviors/groups";
import { OnOffLightSwitchDevice } from "@matter/node/devices/on-off-light-switch";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { FabricManager } from "@matter/protocol";
import { ClusterId, EndpointNumber, FabricIndex, GroupId, NodeId, SubjectId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";

const { Operate } = AccessControl.AccessControlEntryPrivilege;
const { Case } = AccessControl.AccessControlEntryAuthMode;

const QUIET = Seconds(2);
const SUBJECT = SubjectId(0x55n);
const OTHER_SUBJECT = SubjectId(0x66n);
const grant = { privilege: Operate, authMode: Case, subjects: [SUBJECT], targets: null };
const otherGrant = { ...grant, subjects: [OTHER_SUBJECT] };

type Mode = "converge" | "maintain";

/** A commissioned pair whose controller runs the reconciler, with the peer's subscription established. */
async function managedPair(
    site: MockSite,
    options: {
        driftBudget?: { count: number; window: Duration };
        device?: MockServerNode.Configuration<MockServerNode.RootEndpoint>;
    } = {},
) {
    const { driftBudget, device: deviceConfig } = options;
    const { controller, device } = await site.addCommissionedPair({
        controller: {
            type: MockServerNode.RootEndpoint.with(ReconcilerBehavior),
            reconciler: driftBudget === undefined ? undefined : { driftBudget },
        },
        ...(deviceConfig === undefined ? {} : { device: deviceConfig }),
    });
    const peer = await subscribedPeer(controller, "peer1");
    return { controller, device, peer };
}

/** Advance in steps small enough that the peer's subscription stays alive, until `done` holds. */
async function pumpFor(step: Duration, times: number, done: () => boolean) {
    for (let i = 0; i < times && !done(); i++) {
        await MockTime.advance(step);
        await MockTime.macrotask;
    }
}

/** Let `duration` pass, then wait for every pass queued on the peer's lock by then to finish. */
async function passesAfter(controller: ServerNode, peer: ClientNode, duration: Duration) {
    await MockTime.advance(duration);
    await MockTime.macrotask;
    await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));
}

async function explicitVerify(controller: ServerNode, peer: ClientNode) {
    await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true })));
}

/**
 * Write intents, let the reconciler apply them, and wait until the passes the start-up and the writes queued are done,
 * so only what a test does afterwards is counted.
 */
async function commit(
    controller: ServerNode,
    peer: ClientNode,
    intents: { kind: string; key: string; intent: unknown; mode?: Mode }[],
) {
    await peer.act(agent => {
        const ds = agent.get(DesiredStateBehavior);
        for (const { kind, key, intent, mode } of intents) {
            ds.setIntent(kind, key, intent, mode ?? "converge");
        }
    });
    await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));
    // Past the settle delay, and long enough for the reports of our own writes to arrive
    await pumpFor(Seconds(1), 6, () => false);
    await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));
    for (const { kind, key } of intents) {
        expect(statusOf(peer, kind, key)).equals("committed");
    }
}

const statusOf = (peer: ClientNode, kind: string, key: string) =>
    peer.stateOf(DesiredStateBehavior).items[itemMapKey(kind, key)]?.status.state;

/**
 * Count the calls of `member` of a built-in kind. The reconciler registers the shared instance, and its registry
 * refuses a second kind of the same name, so the counter wraps the member on that instance until it is disposed.
 */
function countCalls(kind: ItemKind, member: "verify" | "satisfiedBy") {
    const original = kind[member];
    if (original === undefined || Object.hasOwn(kind, member)) {
        throw new ImplementationError(`Cannot count the calls of "${kind.kind}".${member}`);
    }
    const counter = {
        calls: 0,
        [Symbol.dispose]() {
            Reflect.deleteProperty(kind, member);
        },
    };
    Object.defineProperty(kind, member, {
        configurable: true,
        value: (node: ClientNode, item: ManagedItem) => {
            counter.calls++;
            const result: unknown = Reflect.apply(original, kind, [node, item]);
            return result;
        },
    });
    return counter;
}

/** Count the live reads of a built-in kind; see {@link countCalls}. */
function countVerifyReads(kind: ItemKind) {
    const calls = countCalls(kind, "verify");
    return {
        get reads() {
            return calls.calls;
        },
        [Symbol.dispose]() {
            calls[Symbol.dispose]();
        },
    };
}

/** The lines of the reconciler and of the drift watcher, from now on. */
function captureLog() {
    const lines = new Array<{ level: LogLevel; text: string }>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            if (message.facility === "Reconciler" || message.facility === "DriftWatcher") {
                lines.push({ level: message.level, text: message.values.map(value => String(value)).join(" ") });
            }
        },
    });
    return lines;
}

const linesAt = (log: { level: LogLevel; text: string }[], level: LogLevel) =>
    log.filter(line => line.level === level).map(line => line.text);

/** What an enforcement record says about drift: held, an observed drift only, or nothing. */
function dispositionOf(enforcement: ItemEnforcement | undefined) {
    if (enforcement?.held) {
        return "held";
    }
    return enforcement?.drift === undefined ? undefined : "recorded";
}

const driftOf = (peer: ClientNode, kind: string, key: string) =>
    dispositionOf(peer.stateOf(DesiredStateBehavior).enforcement[itemMapKey(kind, key)]);

function driftEvents(peer: ClientNode) {
    const events = new Array<"held" | "recorded" | undefined>();
    peer.eventsOf(DesiredStateBehavior).itemEnforcementChanged.on((_kind, _key, enforcement) => {
        events.push(dispositionOf(enforcement));
    });
    return events;
}

function driftNotice(peer: ClientNode, item: string, mode: Mode) {
    return `Drift on ${peer.id} ${item} (${mode}): changed on the device by another administrator of this fabric or by the device itself; ${mode === "maintain" ? "re-applying" : "left until a task gate or an explicit verify"}`;
}

/** The next emission of a peer's attribute event, which is when the peer handled the report. */
const nextReport = (event: { once(observer: () => void): unknown }) =>
    new Promise<void>(resolve => event.once(() => resolve()));

/** Make a change on the device, as another administrator would, and wait until the peer handled its report. */
async function onDevice(reported: Promise<void>, change: MaybePromise<void>) {
    await MockTime.resolve(Promise.resolve(change));
    await MockTime.resolve(reported, { macrotasks: true });
}

interface Gate {
    /** Make the next live read of the item wait until {@link open}. */
    close(): void;
    /** Resolves once a live read of the item waits at the closed gate. */
    readonly reached: Promise<void>;
    open(): void;
}

/**
 * Commit an item of a kind whose live read waits while its gate is closed, so a test can stop a verify pass between
 * the reads of the items committed before it and the end of the pass.
 */
async function gatedItem(controller: ServerNode, peer: ClientNode, key: string): Promise<Gate> {
    let closed = false;
    const opened = createPromise<void>();
    const reached = createPromise<void>();
    const kind = `gated-${key}`;
    await controller.act(agent =>
        agent.get(ReconcilerBehavior).registerItemKind({
            kind,
            priority: 0,
            async apply() {},
            async verify() {
                if (closed) {
                    reached.resolver();
                    await opened.promise;
                }
                return true;
            },
        }),
    );
    await MockTime.resolve(
        peer.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent(kind, key, {});
            ds.updateStatus(kind, key, "committed");
        }),
    );
    return { close: () => (closed = true), reached: reached.promise, open: () => opened.resolver() };
}

const aclReport = (peer: ClientNode) => nextReport(peer.eventsOf(AccessControlClient).acl$Changed);

const hasAcl = (device: ServerNode, subject = SUBJECT) =>
    device.state.accessControl.acl.some(entry => entry.subjects?.[0] === subject);

function ourFabricOnDevice(device: ServerNode) {
    const ours = device.state.accessControl.acl.find(entry => entry.subjects?.[0] === SUBJECT);
    if (ours === undefined) {
        throw new ImplementationError("The device holds no entry of ours to take the fabric index from");
    }
    return ours.fabricIndex;
}

function editAcl(
    device: ServerNode,
    edit: (acl: AccessControl.AccessControlEntry[]) => AccessControl.AccessControlEntry[],
) {
    return device.act("other-administrator", agent => {
        const server = agent.get(AccessControlServer);
        server.state.acl = edit(server.state.acl);
    });
}

const dropAcl = (device: ServerNode, subject = SUBJECT) =>
    editAcl(device, acl => acl.filter(entry => entry.subjects?.[0] !== subject));

const addAcl = (device: ServerNode, entry: typeof grant, fabricIndex: FabricIndex) =>
    editAcl(device, acl => [...acl, { ...entry, fabricIndex }]);

describe("Drift integration", () => {
    before(() => {
        MockTime.init();
    });

    afterEach(() => {
        delete Logger.destinations.capture;
    });

    it("wires a peer while it is still under construction, and watches it once it can be read", async () => {
        await using site = new MockSite();
        const failures = new Array<string>();
        Logger.destinations.capture = LogDestination({
            add(message: Diagnostic.Message) {
                const text = message.values.map(value => String(value)).join(" ");
                if (message.level >= LogLevel.WARN && text.includes("reconciler")) {
                    failures.push(text);
                }
            },
        });
        const { controller, device, peer } = await managedPair(site);
        expect(failures).deep.equals([]);

        await commit(controller, peer, [{ kind: "acl", key: "k1", intent: grant }]);
        using counter = countVerifyReads(Acl);
        await onDevice(aclReport(peer), dropAcl(device));
        await passesAfter(controller, peer, QUIET);
        expect(counter.reads).equals(1);
    });

    describe("a converge ACL entry removed on the device", () => {
        /** Commit the entry, remove it on the device, and let the drift pass that follows record it. */
        async function recordedRemoval(site: MockSite) {
            const { controller, device, peer } = await managedPair(site);
            await commit(controller, peer, [{ kind: "acl", key: "k1", intent: grant }]);
            await onDevice(aclReport(peer), dropAcl(device));
            await passesAfter(controller, peer, QUIET);
            expect(driftOf(peer, "acl", "k1")).equals("recorded");
            return { controller, device, peer };
        }

        it("is recorded after one read once the quiet period passed, and not written back", async () => {
            await using site = new MockSite();
            const { controller, device, peer } = await managedPair(site);
            await commit(controller, peer, [{ kind: "acl", key: "k1", intent: grant }]);
            using counter = countVerifyReads(Acl);
            const events = driftEvents(peer);
            const log = captureLog();

            await onDevice(aclReport(peer), dropAcl(device));
            await passesAfter(controller, peer, Seconds(1));
            expect(counter.reads).equals(0);
            await passesAfter(controller, peer, Seconds(1));

            expect(counter.reads).equals(1);
            expect(driftOf(peer, "acl", "k1")).equals("recorded");
            expect(events).deep.equals(["recorded"]);
            expect(linesAt(log, LogLevel.NOTICE)).deep.equals([driftNotice(peer, "acl:k1", "converge")]);
            expect(hasAcl(device)).equals(false);
            expect(statusOf(peer, "acl", "k1")).equals("committed");
        });

        it("is read again on a subscription the client establishes, and still not written back", async () => {
            await using site = new MockSite();
            const { controller, device, peer } = await recordedRemoval(site);
            using counter = countVerifyReads(Acl);
            const events = driftEvents(peer);

            await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }), { macrotasks: true });
            await MockTime.resolve(peer.set({ network: { autoSubscribe: true } }), { macrotasks: true });
            await subscribedPeer(controller, "peer1");
            await passesAfter(controller, peer, Seconds(0));

            expect(counter.reads).equals(1);
            expect(hasAcl(device)).equals(false);
            expect(driftOf(peer, "acl", "k1")).equals("recorded");
            expect(events).deep.equals([]);
        });

        // Characterization test: passes without deferral too; MockSite reports the write after its status write
        it("is written back by an explicit verify, and the report of that write leaves no suspect", async () => {
            await using site = new MockSite();
            const { controller, device, peer } = await recordedRemoval(site);
            const events = driftEvents(peer);
            using counter = countVerifyReads(Acl);

            await explicitVerify(controller, peer);
            await passesAfter(controller, peer, QUIET);
            await passesAfter(controller, peer, QUIET);

            expect(hasAcl(device)).equals(true);
            expect(driftOf(peer, "acl", "k1")).equals(undefined);
            expect(events).deep.equals([undefined]);
            expect(counter.reads).equals(1);
        });
    });

    it("clears the mark after a live read once the removed entry is restored on the device", async () => {
        await using site = new MockSite();
        const { controller, device, peer } = await managedPair(site);
        await commit(controller, peer, [{ kind: "acl", key: "k1", intent: grant }]);
        const fabricIndex = ourFabricOnDevice(device);
        using counter = countVerifyReads(Acl);
        await onDevice(aclReport(peer), dropAcl(device));
        await passesAfter(controller, peer, QUIET);
        expect(driftOf(peer, "acl", "k1")).equals("recorded");

        const events = driftEvents(peer);
        const log = captureLog();
        await onDevice(aclReport(peer), addAcl(device, grant, fabricIndex));
        await passesAfter(controller, peer, QUIET);

        expect(counter.reads).equals(2);
        expect(driftOf(peer, "acl", "k1")).equals(undefined);
        expect(events).deep.equals([undefined]);
        expect(linesAt(log, LogLevel.DEBUG)).contains(
            `Drift on ${peer.id} acl:k1 ended: the device holds the item again`,
        );
    });

    it("re-applies a maintain entry within its budget, holds the next drift and leaves it held until retry()", async () => {
        await using site = new MockSite();
        const windowSeconds = 30;
        const window = Seconds(windowSeconds);
        const { controller, device, peer } = await managedPair(site, { driftBudget: { count: 3, window } });
        await commit(controller, peer, [{ kind: "acl", key: "k1", intent: grant, mode: "maintain" }]);
        using counter = countVerifyReads(Acl);
        const log = captureLog();

        for (let i = 1; i <= 3; i++) {
            await onDevice(aclReport(peer), dropAcl(device));
            await passesAfter(controller, peer, QUIET);
            expect(hasAcl(device)).equals(true);
            expect(driftOf(peer, "acl", "k1")).equals(undefined);
            expect(counter.reads).equals(i);
        }
        expect(linesAt(log, LogLevel.NOTICE)).deep.equals([driftNotice(peer, "acl:k1", "maintain")]);

        const events = driftEvents(peer);
        await onDevice(aclReport(peer), dropAcl(device));
        await passesAfter(controller, peer, QUIET);
        expect(hasAcl(device)).equals(false);
        expect(driftOf(peer, "acl", "k1")).equals("held");
        expect(events).deep.equals(["held"]);
        const warnings = linesAt(log, LogLevel.WARN);
        expect(warnings.length).equals(1);
        expect(warnings[0]).contains(`${peer.id} acl:k1 (maintain) held`);
        expect(warnings[0]).contains("3 re-applies still count");
        expect(warnings[0]).contains("needs an action");

        // No trigger re-applies a held item once its window has passed.
        const reads = counter.reads;
        await pumpFor(Seconds(1), windowSeconds + 10, () => false);
        expect(hasAcl(device)).equals(false);
        expect(driftOf(peer, "acl", "k1")).equals("held");
        expect(counter.reads).equals(reads);

        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).retry(peer, Acl, "k1")));
        expect(hasAcl(device)).equals(true);
        expect(driftOf(peer, "acl", "k1")).equals(undefined);
    });

    describe("our own write", () => {
        /**
         * Commit `first`, then apply `second` while the watch of `first` is in place, and let the echo of that write
         * and two quiet periods pass. Neither item may become a suspect.
         */
        async function expectNoSuspect(
            controller: ServerNode,
            peer: ClientNode,
            kind: ItemKind,
            first: { key: string; intent: unknown },
            second: { key: string; intent: unknown },
        ) {
            using counter = countVerifyReads(kind);
            const events = driftEvents(peer);
            const log = captureLog();

            await commit(controller, peer, [{ kind: kind.kind, ...second }]);
            await passesAfter(controller, peer, QUIET);
            await passesAfter(controller, peer, QUIET);

            expect(counter.reads).equals(0);
            expect(events).deep.equals([]);
            for (const { key } of [first, second]) {
                expect(peer.stateOf(DesiredStateBehavior).enforcement[itemMapKey(kind.kind, key)]).equals(undefined);
            }
            expect(log.filter(line => line.level > LogLevel.DEBUG)).deep.equals([]);
        }

        it("leaves no ACL suspect", async () => {
            await using site = new MockSite();
            const { controller, peer } = await managedPair(site);
            const first = { key: "k1", intent: grant };
            await commit(controller, peer, [{ kind: "acl", ...first }]);

            await expectNoSuspect(controller, peer, Acl, first, { key: "k2", intent: otherGrant });
        });

        it("leaves no Binding suspect", async () => {
            await using site = new MockSite();
            const { controller, peer } = await managedPair(site, { device: bindingDevice });
            const first = { key: "k1", intent: bindingTo(0x99n, EndpointNumber(1)) };
            await commit(controller, peer, [{ kind: "binding", ...first }]);

            await expectNoSuspect(controller, peer, Binding, first, {
                key: "k2",
                intent: bindingTo(0x98n, EndpointNumber(1)),
            });
        });

        it("leaves no group membership suspect", async () => {
            await using site = new MockSite();
            const { controller, peer } = await managedPair(site, { device: groupsDevice });
            await commit(controller, peer, groupIntents);

            await expectNoSuspect(
                controller,
                peer,
                GroupMembership,
                { key: String(GROUP), intent: membership(GROUP) },
                { key: String(OTHER_GROUP), intent: membership(OTHER_GROUP) },
            );
        });
    });

    describe("a report that arrives while a verify pass runs", () => {
        /**
         * A committed ACL entry with a gated item read before it and one read after it. A pass for the peer reads the
         * entry only while the first gate is open, and ends only once the second is.
         */
        async function entryBetweenGates(site: MockSite) {
            const { controller, device, peer } = await managedPair(site);
            const before = await gatedItem(controller, peer, "before");
            await commit(controller, peer, [{ kind: "acl", key: "k1", intent: grant }]);
            const after = await gatedItem(controller, peer, "after");
            const fabricIndex = ourFabricOnDevice(device);
            return { controller, device, peer, before, after, fabricIndex };
        }

        it("makes an item restored after the pass read its drift a suspect, and its drift ends after one more read", async () => {
            await using site = new MockSite();
            const { controller, device, peer, before, after, fabricIndex } = await entryBetweenGates(site);
            using counter = countVerifyReads(Acl);
            before.close();
            after.close();

            peer.eventsOf(NetworkClient).subscriptionStatusChanged.emit(true);
            await MockTime.resolve(before.reached);
            await onDevice(aclReport(peer), dropAcl(device));
            before.open();
            await MockTime.resolve(after.reached);
            expect(counter.reads).equals(1);
            await onDevice(aclReport(peer), addAcl(device, grant, fabricIndex));
            after.open();
            await passesAfter(controller, peer, Seconds(0));
            expect(driftOf(peer, "acl", "k1")).equals("recorded");

            await passesAfter(controller, peer, QUIET);

            expect(counter.reads).equals(2);
            expect(driftOf(peer, "acl", "k1")).equals(undefined);
        });

        it("makes an item changed again after the pass read it restored a suspect, and its drift is recorded after one more read", async () => {
            await using site = new MockSite();
            const { controller, device, peer, before, after, fabricIndex } = await entryBetweenGates(site);
            await onDevice(aclReport(peer), dropAcl(device));
            await passesAfter(controller, peer, QUIET);
            expect(driftOf(peer, "acl", "k1")).equals("recorded");
            using counter = countVerifyReads(Acl);
            before.close();
            after.close();

            const verify = controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true }));
            await MockTime.resolve(before.reached);
            await onDevice(aclReport(peer), addAcl(device, grant, fabricIndex));
            before.open();
            await MockTime.resolve(after.reached);
            expect(counter.reads).equals(1);
            await onDevice(aclReport(peer), dropAcl(device));
            after.open();
            await MockTime.resolve(verify);
            expect(driftOf(peer, "acl", "k1")).equals(undefined);

            await passesAfter(controller, peer, QUIET);

            expect(counter.reads).equals(2);
            expect(driftOf(peer, "acl", "k1")).equals("recorded");
        });
    });

    it("reads once after three device changes inside the quiet period", async () => {
        await using site = new MockSite();
        const { controller, device, peer } = await managedPair(site);
        await commit(controller, peer, [{ kind: "acl", key: "k1", intent: grant }]);
        const fabricIndex = ourFabricOnDevice(device);
        using counter = countVerifyReads(Acl);
        const log = captureLog();

        await onDevice(aclReport(peer), dropAcl(device));
        await MockTime.advance(Millis(1500));
        await onDevice(aclReport(peer), addAcl(device, otherGrant, fabricIndex));
        await MockTime.advance(Millis(1500));
        await onDevice(aclReport(peer), dropAcl(device, OTHER_SUBJECT));
        await passesAfter(controller, peer, Seconds(1));
        expect(counter.reads).equals(0);

        await passesAfter(controller, peer, Seconds(1));
        expect(counter.reads).equals(1);
        await passesAfter(controller, peer, QUIET);
        expect(counter.reads).equals(1);
        expect(driftOf(peer, "acl", "k1")).equals("recorded");
        expect(linesAt(log, LogLevel.NOTICE)).deep.equals([driftNotice(peer, "acl:k1", "converge")]);
    });

    it("reads no binding after a report of another endpoint alone", async () => {
        await using site = new MockSite();
        const { controller, device, peer } = await managedPair(site, { device: bindingDevice });
        const own = device.parts.require("own");
        const other = device.parts.require("other");
        await commit(controller, peer, [{ kind: "binding", key: "k1", intent: bindingTo(0x99n, own.number) }]);
        const fabricIndex = own.stateOf(BindingServer).binding[0].fabricIndex;
        using counter = countVerifyReads(Binding);
        using judged = countCalls(Binding, "satisfiedBy");

        await onDevice(
            bindingReport(peer, other.number),
            editBinding(other, () => [{ node: NodeId(0x77n), endpoint: EndpointNumber(1), fabricIndex }]),
        );
        await passesAfter(controller, peer, QUIET);
        await passesAfter(controller, peer, QUIET);

        expect(judged.calls).equals(0);
        expect(counter.reads).equals(0);
    });

    it("makes a binding on a non-root endpoint a suspect only through its own endpoint's report", async () => {
        await using site = new MockSite();
        const { controller, device, peer } = await managedPair(site, { device: bindingDevice });
        const own = device.parts.require("own");
        const other = device.parts.require("other");
        await commit(controller, peer, [{ kind: "binding", key: "k1", intent: bindingTo(0x99n, own.number) }]);
        const fabricIndex = own.stateOf(BindingServer).binding[0].fabricIndex;
        using counter = countVerifyReads(Binding);

        await onDevice(
            bindingReport(peer, own.number),
            editBinding(own, () => []),
        );
        await MockTime.advance(Millis(1500));
        // A report the item does not watch: it must not start the quiet period over
        await onDevice(
            bindingReport(peer, other.number),
            editBinding(other, () => [{ node: NodeId(0x77n), endpoint: EndpointNumber(1), fabricIndex }]),
        );
        await passesAfter(controller, peer, Millis(500));

        expect(counter.reads).equals(1);
        expect(driftOf(peer, "binding", "k1")).equals("recorded");
        await passesAfter(controller, peer, QUIET);
        expect(counter.reads).equals(1);
    });

    it("reads nothing when the peer is unreachable as the quiet period ends", async () => {
        await using site = new MockSite();
        const { controller, device, peer } = await managedPair(site);
        await commit(controller, peer, [{ kind: "acl", key: "k1", intent: grant }]);
        using counter = countVerifyReads(Acl);
        const events = driftEvents(peer);
        const log = captureLog();

        await onDevice(aclReport(peer), dropAcl(device));
        await MockTime.resolve(peer.set({ network: { isDisabled: true } }));
        await passesAfter(controller, peer, QUIET);
        await passesAfter(controller, peer, QUIET);

        expect(counter.reads).equals(0);
        expect(events).deep.equals([]);
        expect(linesAt(log, LogLevel.DEBUG)).contains(`${peer.id} is unreachable; dropping 1 drift suspects`);
    });

    describe("no pass afterwards", () => {
        const quietTimer = (peer: ClientNode) => MockTime.timerCountFor(`drift quiet period of ${peer.id}`);

        it("once the fabric is lost", async () => {
            await using site = new MockSite();
            const { controller, device, peer } = await managedPair(site);
            await commit(controller, peer, [{ kind: "acl", key: "k1", intent: grant }]);
            const events = driftEvents(peer);

            await onDevice(aclReport(peer), dropAcl(device));
            expect(quietTimer(peer)).equals(1);
            const fabrics = controller.env.get(FabricManager);
            await MockTime.resolve(fabrics.fabrics[0].delete(), { macrotasks: true });
            expect(quietTimer(peer)).equals(0);
            await pumpFor(Seconds(1), 4, () => false);

            expect(events).deep.equals([]);
        });

        it("once the peer is removed", async () => {
            await using site = new MockSite();
            const { controller, device, peer } = await managedPair(site);
            await commit(controller, peer, [{ kind: "acl", key: "k1", intent: grant }]);
            const log = captureLog();

            await onDevice(aclReport(peer), dropAcl(device));
            expect(quietTimer(peer)).equals(1);
            await MockTime.resolve(peer.delete(), { macrotasks: true });
            expect(quietTimer(peer)).equals(0);
            await pumpFor(Seconds(1), 4, () => false);

            expect(log.filter(line => line.level > LogLevel.DEBUG)).deep.equals([]);
        });
    });

    it("records a group membership removed on the device after one read", async () => {
        await using site = new MockSite();
        const { controller, device, peer } = await managedPair(site, { device: groupsDevice });
        await commit(controller, peer, groupIntents);
        using counter = countVerifyReads(GroupMembership);
        const events = driftEvents(peer);

        await onDevice(
            nextReport(peer.eventsOf(GroupKeyManagementClient).groupTable$Changed),
            device.act("other-administrator", agent => {
                const server = agent.get(GroupKeyManagementServer);
                server.state.groupTable = server.state.groupTable.filter(entry => entry.groupId !== GROUP);
            }),
        );
        await passesAfter(controller, peer, QUIET);

        expect(counter.reads).equals(1);
        expect(driftOf(peer, "endpointGroupMembership", String(GROUP))).equals("recorded");
        expect(events).deep.equals(["recorded"]);
        expect(isMember(device, GROUP)).equals(false);
    });
});

const bindingDevice: MockServerNode.Configuration<MockServerNode.RootEndpoint> = {
    type: MockServerNode.RootEndpoint,
    device: undefined,
    parts: [
        { id: "own", type: OnOffLightSwitchDevice.with(BindingServer) },
        { id: "other", type: OnOffLightSwitchDevice.with(BindingServer) },
    ],
};

function bindingTo(node: bigint, localEndpoint: EndpointNumber) {
    return { localEndpoint, target: { node: NodeId(node), endpoint: EndpointNumber(1), cluster: ClusterId(6) } };
}

const bindingReport = (peer: ClientNode, endpoint: EndpointNumber) =>
    nextReport(peer.endpoints.for(endpoint).eventsOf(BindingClient).binding$Changed);

function editBinding(
    endpoint: Endpoint,
    edit: (binding: BindingServer["state"]["binding"]) => BindingServer["state"]["binding"],
) {
    return endpoint.act("other-administrator", agent => {
        const server = agent.get(BindingServer);
        server.state.binding = edit(server.state.binding);
    });
}

const GROUP = GroupId(0x101);
const OTHER_GROUP = GroupId(0x102);
const LOCAL_EP = EndpointNumber(1);

const groupsDevice: MockServerNode.Configuration<MockServerNode.RootEndpoint> = {
    type: MockServerNode.RootEndpoint,
    device: OnOffLightSwitchDevice.with(GroupsServer),
};

const membership = (groupId: GroupId) => ({ localEndpoint: LOCAL_EP, groupId, groupName: "kitchen" });

const groupIntents = [
    {
        kind: "groupKey",
        key: "42",
        intent: {
            groupKeySetId: 42,
            groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
            epochKey0: new Uint8Array(16).fill(0xab),
            epochStartTime0: 946684800000001n,
            epochKey1: null,
            epochStartTime1: null,
            epochKey2: null,
            epochStartTime2: null,
        },
    },
    { kind: "groupKeyMap", key: String(GROUP), intent: { groupId: GROUP, groupKeySetId: 42 } },
    { kind: "groupKeyMap", key: String(OTHER_GROUP), intent: { groupId: OTHER_GROUP, groupKeySetId: 42 } },
    { kind: "endpointGroupMembership", key: String(GROUP), intent: membership(GROUP) },
];

function isMember(device: ServerNode, groupId: GroupId) {
    return device
        .stateOf(GroupKeyManagementServer)
        .groupTable.some(entry => entry.groupId === groupId && entry.endpoints.includes(LOCAL_EP));
}
