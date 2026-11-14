/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AclGrant } from "#reconcile/acl-coverage.js";
import { AclItemKind } from "#reconcile/AclItemKind.js";
import { BindingItemKind } from "#reconcile/BindingItemKind.js";
import { DriftWatcher, isDriftSuspect } from "#reconcile/DriftWatcher.js";
import {
    Diagnostic,
    Duration,
    InternalError,
    LogDestination,
    Logger,
    LogLevel,
    Observable,
    Observer,
    Seconds,
    Time,
    Timestamp,
} from "@matter/general";
import {
    ClientNode,
    DesiredStateBehavior,
    ItemEnforcement,
    ItemKind,
    ItemKindRegistry,
    itemMapKey,
    ItemWatch,
    ManagedItem,
    NetworkClient,
    ServerNode,
} from "@matter/node";
import { AccessControlClient } from "@matter/node/behaviors/access-control";
import { BasicInformationClient } from "@matter/node/behaviors/basic-information";
import { BindingClient } from "@matter/node/behaviors/binding";
import { GroupKeyManagementClient } from "@matter/node/behaviors/group-key-management";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import { Subscribe } from "@matter/protocol";
import { AttributeId, EndpointNumber, GroupId, SubjectId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { OnOff } from "@matter/types/clusters/on-off";

const QUIET = Seconds(2);
const MAX_BACKOFF = Seconds(5);

type LabelAttribute = "nodeLabel" | "location";

interface LabelIntent {
    attribute: LabelAttribute;
    value: string;
}

/**
 * A kind whose items ask for a value of a writable Basic Information attribute on the root endpoint, so a test can
 * change the device's value and get a real subscription report. `satisfiedBy` reads the peer's cache.
 */
class LabelKind implements ItemKind<LabelIntent> {
    readonly kind = "label";
    readonly priority = 0;
    watching = true;
    throws = false;
    readonly evaluations = new Array<{ key: string; at: number }>();
    readonly watchesAsked = new Array<string>();

    async apply() {}

    async verify() {
        return true;
    }

    watches(node: ClientNode, item: ManagedItem<LabelIntent>): ItemWatch[] {
        this.watchesAsked.push(item.key);
        if (!this.watching) {
            return [];
        }
        return [{ endpoint: node, behavior: BasicInformationClient, attribute: item.intent.attribute }];
    }

    satisfiedBy(node: ClientNode, item: ManagedItem<LabelIntent>): boolean {
        this.evaluations.push({ key: item.key, at: Time.nowUs });
        if (this.throws) {
            throw new InternalError("satisfiedBy failed");
        }
        return node.stateOf(BasicInformationClient)[item.intent.attribute] === item.intent.value;
    }
}

interface HandOver {
    pass: DriftWatcher.Pass;
    suspects: Set<string>;
    at: number;
}

/**
 * Starts a pass at once for every hand-over and leaves it open, so no outcome is reported until a test ends the pass
 * with {@link readAll} or {@link readNothing}.
 */
class FakeHost implements DriftWatcher.Host {
    isReachable = true;
    quiet: Duration = QUIET;
    backoffCap: Duration = MAX_BACKOFF;
    watcher?: DriftWatcher;
    readonly passes = new Array<HandOver>();

    quietPeriod(): Duration {
        return this.quiet;
    }

    maxBackoff(): Duration {
        return this.backoffCap;
    }

    reachable(): boolean {
        return this.isReachable;
    }

    drift(): void {
        if (this.watcher === undefined) {
            throw new InternalError("The fake host has no watcher to take the suspects from");
        }
        const pass = this.watcher.startPass();
        this.passes.push({ pass, suspects: new Set(pass.suspects), at: Time.nowUs });
    }

    get last(): HandOver {
        const last = this.passes[this.passes.length - 1];
        if (last === undefined) {
            throw new InternalError("Nothing was handed over");
        }
        return last;
    }
}

/** End `pass` having read `read` of its suspects, all verified. */
function readAll({ pass }: HandOver, read: ReadonlySet<string> = pass.suspects, unread = new Map<string, unknown>()) {
    pass.result = { verified: new Set(read), drifted: new Set(), unread };
    pass[Symbol.dispose]();
}

/** End `pass` without a read, as a pass that threw does. */
function readNothing({ pass }: HandOver) {
    pass[Symbol.dispose]();
}

/** The observers registered on `event` from now on that are still attached, and how often one was registered. */
function observersOf<T extends any[], R>(event: Observable<T, R>) {
    const registered = new Array<Observer<T, R>>();
    const on = event.on.bind(event);
    event.on = observer => {
        registered.push(observer);
        on(observer);
    };
    return {
        get attached() {
            return registered.filter(observer => event.isObservedBy(observer)).length;
        },
        get registrations() {
            return registered.length;
        },
    };
}

function captureWatcherLog() {
    const lines = new Array<{ level: LogLevel; text: string }>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            if (message.facility === "DriftWatcher") {
                lines.push({ level: message.level, text: message.values.map(value => String(value)).join(" ") });
            }
        },
    });
    return lines;
}

function warningsIn(lines: { level: LogLevel; text: string }[]) {
    return lines.filter(line => line.level === LogLevel.WARN).map(line => line.text);
}

const LABEL_KEY = itemMapKey("label", "name");
const LOCATION_KEY = itemMapKey("label", "location");

async function commitLabel(peer: ClientNode, key: string, intent: LabelIntent) {
    await MockTime.resolve(
        peer.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("label", key, intent);
            ds.updateStatus("label", key, "committed");
        }),
    );
}

/** Change the device's value and wait until the peer's cache shows it, which is when the report was handled. */
async function report(device: ServerNode, peer: ClientNode, attribute: LabelAttribute, value: string) {
    const reported = new Promise<void>(resolve =>
        peer.eventsOf(BasicInformationClient)[`${attribute}$Changed`].once(() => resolve()),
    );
    await MockTime.resolve(device.set({ basicInformation: { [attribute]: value } }));
    await MockTime.resolve(reported, { macrotasks: true });
}

async function pair(site: MockSite) {
    const { controller, device } = await site.addCommissionedPair();
    const peer = await subscribedPeer(controller, "peer1");
    return { controller, device, peer };
}

function attributeIdOf(name: string) {
    const attribute = BasicInformationClient.schema.attributes.find(candidate => candidate.propertyName === name);
    if (attribute === undefined) {
        throw new InternalError(`Basic Information has no attribute ${name}`);
    }
    return AttributeId(attribute.id);
}

function registryWith(...kinds: ItemKind[]) {
    const registry = new ItemKindRegistry();
    for (const kind of kinds) {
        registry.register(kind);
    }
    return registry;
}

describe("isDriftSuspect", () => {
    let site: MockSite;
    let peer: ClientNode;

    before(async () => {
        MockTime.init();
        site = new MockSite();
        ({ peer } = await pair(site));
    });

    after(async () => {
        await site[Symbol.asyncDispose]();
    });

    const drift = { confirmedAt: Timestamp(0) };
    const record = (fields: Partial<ItemEnforcement>): ItemEnforcement => ({
        held: false,
        reappliesUntil: [],
        ...fields,
    });

    // [case, item state, enforcement record, satisfiedBy answer, suspect]
    const table: [string, "committed" | "pending", ItemEnforcement | undefined, boolean | "throws", boolean][] = [
        ["no observed drift, cache unsatisfied", "committed", undefined, false, true],
        ["no observed drift, cache satisfied", "committed", undefined, true, false],
        ["observed drift, cache satisfied", "committed", record({ drift }), true, true],
        ["observed drift, cache still unsatisfied", "committed", record({ drift }), false, false],
        ["held without observed drift, cache unsatisfied", "committed", record({ held: true }), false, true],
        ["held with observed drift, cache satisfied", "committed", record({ held: true, drift }), true, true],
        ["held with observed drift, cache unsatisfied", "committed", record({ held: true, drift }), false, false],
        ["satisfiedBy throws", "committed", undefined, "throws", true],
        ["satisfiedBy throws with observed drift", "committed", record({ drift }), "throws", true],
        ["pending item", "pending", undefined, false, false],
    ];

    for (const [name, state, enforcement, answer, expected] of table) {
        it(`${name}: ${expected ? "suspect" : "not a suspect"}`, () => {
            const failures = new Array<unknown>();
            const kind: ItemKind = {
                kind: "rule",
                priority: 0,
                apply: async () => {},
                watches: () => [],
                verify: async () => true,
                satisfiedBy: () => {
                    if (answer === "throws") {
                        throw new InternalError("satisfiedBy failed");
                    }
                    return answer;
                },
            };
            const item: ManagedItem = {
                kind: "rule",
                key: "k",
                intent: {},
                mode: "converge",
                status: { state, updateTimestamp: 0 },
                outstanding: "apply",
                generation: 1,
            };
            expect(isDriftSuspect(peer, kind, item, enforcement, error => failures.push(error))).equals(expected);
            expect(failures.length).equals(answer === "throws" ? 1 : 0);
        });
    }

    it("an item of a kind without satisfiedBy is never a suspect", () => {
        const kind: ItemKind = { kind: "verify-only", priority: 0, apply: async () => {} };
        const item: ManagedItem = {
            kind: "verify-only",
            key: "k",
            intent: {},
            mode: "converge",
            status: { state: "committed", updateTimestamp: 0 },
            outstanding: "apply",
            generation: 1,
        };
        expect(isDriftSuspect(peer, kind, item, undefined, () => {})).equals(false);
    });
});

describe("DriftWatcher", () => {
    const watchers = new Array<DriftWatcher>();

    /** A started watcher that is closed after the test, also when an assertion fails. */
    function newWatcher(peer: ClientNode, registry: ItemKindRegistry, host: FakeHost) {
        const watcher = new DriftWatcher(peer, registry, host);
        host.watcher = watcher;
        watchers.push(watcher);
        watcher.start();
        return watcher;
    }

    before(() => {
        MockTime.init();
    });

    afterEach(() => {
        delete Logger.destinations.capture;
        for (const watcher of watchers.splice(0)) {
            watcher.close();
        }
    });

    it("leaves no suspect and starts no timer for the echo of our own write", async () => {
        await using site = new MockSite();
        const { peer } = await pair(site);
        const answers = new Array<boolean>();
        class CountingAcl extends AclItemKind {
            override satisfiedBy(node: ClientNode, item: ManagedItem<AclGrant>) {
                const answer = super.satisfiedBy(node, item);
                answers.push(answer);
                return answer;
            }
        }
        const kind = new CountingAcl();
        const host = new FakeHost();
        const watcher = newWatcher(peer, registryWith(kind), host);

        const grant = {
            privilege: AccessControl.AccessControlEntryPrivilege.Operate,
            authMode: AccessControl.AccessControlEntryAuthMode.Case,
            subjects: [SubjectId(0x55n)],
            targets: null,
        };
        const item = await MockTime.resolve(
            peer.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                const written = ds.setIntent("acl", "k1", grant);
                ds.updateStatus("acl", "k1", "committed");
                return written;
            }),
        );
        const reported = new Promise<void>(resolve =>
            peer.eventsOf(AccessControlClient).acl$Changed.once(() => resolve()),
        );
        await MockTime.resolve(kind.apply(peer, item));
        await MockTime.resolve(reported, { macrotasks: true });

        expect(answers).deep.equals([true]);
        await MockTime.advance(Seconds(60));
        expect(host.passes).deep.equals([]);
        watcher.close();
    });

    it("hands an unsatisfied item to the host once the quiet period after its report has passed", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const kind = new LabelKind();
        const host = new FakeHost();
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        const watcher = newWatcher(peer, registryWith(kind), host);

        await report(device, peer, "nodeLabel", "theirs");
        expect(kind.evaluations.length).equals(1);
        const reportedAt = kind.evaluations[0].at;

        await MockTime.advance(Seconds(30));
        expect(host.passes.map(pass => [...pass.suspects])).deep.equals([[LABEL_KEY]]);
        expect(host.passes[0].at - reportedAt).equals(QUIET);
        watcher.close();
    });

    it("restarts the quiet period on every report and hands the suspects over once", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const kind = new LabelKind();
        const host = new FakeHost();
        host.quiet = Seconds(10);
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        const watcher = newWatcher(peer, registryWith(kind), host);

        await report(device, peer, "nodeLabel", "theirs-1");
        await MockTime.advance(Seconds(7));
        await report(device, peer, "nodeLabel", "theirs-2");
        await MockTime.advance(Seconds(7));
        await report(device, peer, "nodeLabel", "theirs-3");
        const reportedAt = kind.evaluations.map(evaluation => evaluation.at);
        expect(reportedAt.length).equals(3);
        expect(reportedAt[2] - reportedAt[0]).greaterThan(host.quiet);

        await MockTime.advance(Seconds(60));
        expect(host.passes.length).equals(1);
        expect(host.passes[0].at - reportedAt[2]).equals(host.quiet);
        watcher.close();
    });

    it("forgets a suspect whose cache is satisfied again before the quiet period ends", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const kind = new LabelKind();
        const host = new FakeHost();
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        const watcher = newWatcher(peer, registryWith(kind), host);

        await report(device, peer, "nodeLabel", "theirs");
        await report(device, peer, "nodeLabel", "ours");

        await MockTime.advance(Seconds(30));
        expect(host.passes).deep.equals([]);
        watcher.close();
    });

    it("evaluates only the items that watch the reported attribute", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const kind = new LabelKind();
        const host = new FakeHost();
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        await commitLabel(peer, "location", { attribute: "location", value: "XX" });
        const watcher = newWatcher(peer, registryWith(kind), host);

        await report(device, peer, "nodeLabel", "theirs");
        expect(kind.evaluations.map(evaluation => evaluation.key)).deep.equals(["name"]);

        await MockTime.advance(Seconds(30));
        expect(host.passes.map(pass => [...pass.suspects])).deep.equals([[LABEL_KEY]]);
        watcher.close();
    });

    it("watches an item committed later on an attribute already watched", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const kind = new LabelKind();
        const host = new FakeHost();
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        const watcher = newWatcher(peer, registryWith(kind), host);
        await commitLabel(peer, "other", { attribute: "nodeLabel", value: "ours too" });

        await report(device, peer, "nodeLabel", "theirs");

        await MockTime.advance(Seconds(30));
        expect(host.passes.map(pass => pass.suspects)).deep.equals([
            new Set([LABEL_KEY, itemMapKey("label", "other")]),
        ]);
        watcher.close();
    });

    it("does not suspect an item with observed drift whose cache stays unsatisfied, and suspects it once restored", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const kind = new LabelKind();
        const host = new FakeHost();
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        await MockTime.resolve(peer.act(agent => agent.get(DesiredStateBehavior).markDrift("label", "name")));
        const watcher = newWatcher(peer, registryWith(kind), host);

        await report(device, peer, "nodeLabel", "theirs");
        await MockTime.advance(Seconds(30));
        expect(host.passes).deep.equals([]);

        await report(device, peer, "nodeLabel", "ours");
        await MockTime.advance(Seconds(30));
        expect(host.passes.map(pass => [...pass.suspects])).deep.equals([[LABEL_KEY]]);
        watcher.close();
    });

    it("follows the committed items", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const kind = new LabelKind();
        const host = new FakeHost();
        const watcher = newWatcher(peer, registryWith(kind), host);

        await MockTime.resolve(
            peer.act(agent =>
                agent.get(DesiredStateBehavior).setIntent("label", "name", { attribute: "nodeLabel", value: "ours" }),
            ),
        );
        await report(device, peer, "nodeLabel", "pending-1");
        expect(kind.evaluations.length).equals(0);
        expect(kind.watchesAsked).deep.equals([]);

        await MockTime.resolve(
            peer.act(agent => agent.get(DesiredStateBehavior).updateStatus("label", "name", "committed")),
        );
        await report(device, peer, "nodeLabel", "committed-1");
        expect(kind.evaluations.length).equals(1);
        await MockTime.advance(Seconds(30));
        expect(host.passes.length).equals(1);

        await MockTime.resolve(peer.act(agent => agent.get(DesiredStateBehavior).dropItem("label", "name")));
        const evaluations = kind.evaluations.length;
        await report(device, peer, "nodeLabel", "removed-1");
        expect(kind.evaluations.length).equals(evaluations);
        await MockTime.advance(Seconds(30));
        expect(host.passes.length).equals(1);
        watcher.close();
    });

    describe("rebuilds on", () => {
        async function watcherNotYetWatching(site: MockSite) {
            const { controller, device, peer } = await pair(site);
            const kind = new LabelKind();
            kind.watching = false;
            const host = new FakeHost();
            await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
            const watcher = newWatcher(peer, registryWith(kind), host);
            kind.watching = true;
            return { controller, device, peer, kind, host, watcher };
        }

        // Each case checks the first report after its trigger only: the peer's structure is applied after every
        // report, which rebuilds the watcher too.
        it("an active subscription", async () => {
            await using site = new MockSite();
            const { device, peer, kind, watcher } = await watcherNotYetWatching(site);

            peer.eventsOf(NetworkClient).subscriptionStatusChanged.emit(true);
            await report(device, peer, "nodeLabel", "theirs");
            expect(kind.evaluations.length).equals(1);
            watcher.close();
        });

        it("not an ended subscription", async () => {
            await using site = new MockSite();
            const { device, peer, kind, watcher } = await watcherNotYetWatching(site);

            peer.eventsOf(NetworkClient).subscriptionStatusChanged.emit(false);
            await report(device, peer, "nodeLabel", "theirs");
            expect(kind.evaluations.length).equals(0);
            watcher.close();
        });

        it("a software version change", async () => {
            await using site = new MockSite();
            const { device, peer, kind, watcher } = await watcherNotYetWatching(site);

            await MockTime.resolve(peer.act(agent => peer.lifecycle.softwareVersionChanged.emit(2, agent.context)));
            await report(device, peer, "nodeLabel", "theirs");
            expect(kind.evaluations.length).equals(1);
            watcher.close();
        });

        it("an applied structure of this peer", async () => {
            await using site = new MockSite();
            const { device, peer, kind, watcher } = await watcherNotYetWatching(site);

            peer.owner.peers.structureApplied.emit(peer);
            await report(device, peer, "nodeLabel", "theirs");
            expect(kind.evaluations.length).equals(1);
            watcher.close();
        });

        it("not an applied structure of another node", async () => {
            await using site = new MockSite();
            const { controller, device, peer, kind, watcher } = await watcherNotYetWatching(site);

            peer.owner.peers.structureApplied.emit(controller);
            await report(device, peer, "nodeLabel", "theirs");
            expect(kind.evaluations.length).equals(0);
            watcher.close();
        });

        it("a report, whose structure is applied after it", async () => {
            await using site = new MockSite();
            const { device, peer, kind, watcher } = await watcherNotYetWatching(site);

            await report(device, peer, "nodeLabel", "theirs-1");
            expect(kind.evaluations.length).equals(0);
            await report(device, peer, "nodeLabel", "theirs-2");
            expect(kind.evaluations.length).equals(1);
            watcher.close();
        });

        it("an explicit rebuild", async () => {
            await using site = new MockSite();
            const { device, peer, kind, watcher } = await watcherNotYetWatching(site);

            watcher.rebuild();
            await report(device, peer, "nodeLabel", "theirs");
            expect(kind.evaluations.length).equals(1);
            watcher.close();
        });
    });

    it("keeps the suspects of a failed read, doubles the delay up to the cap, and resets it on success", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const kind = new LabelKind();
        const host = new FakeHost();
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        const watcher = newWatcher(peer, registryWith(kind), host);

        await report(device, peer, "nodeLabel", "theirs-1");
        await MockTime.advance(Seconds(30));
        expect(host.passes.length).equals(1);

        const delays = new Array<number>();
        for (let i = 0; i < 3; i++) {
            const failedAt = Time.nowUs;
            readNothing(host.last);
            await MockTime.advance(Seconds(30));
            expect(host.passes.length).equals(i + 2);
            expect([...host.passes[i + 1].suspects]).deep.equals([LABEL_KEY]);
            delays.push(host.passes[i + 1].at - failedAt);
        }
        expect(delays).deep.equals([Seconds(4), MAX_BACKOFF, MAX_BACKOFF]);

        readAll(host.last);
        await report(device, peer, "nodeLabel", "theirs-2");
        const reportedAt = kind.evaluations[kind.evaluations.length - 1].at;
        await MockTime.advance(Seconds(30));
        expect(host.passes.length).equals(5);
        expect(host.passes[4].at - reportedAt).equals(QUIET);
        watcher.close();
    });

    it("waits the backed-off delay after a report that arrives while reads fail", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const kind = new LabelKind();
        const host = new FakeHost();
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        newWatcher(peer, registryWith(kind), host);

        await report(device, peer, "nodeLabel", "theirs-1");
        await MockTime.advance(Seconds(30));
        expect(host.passes.length).equals(1);

        readNothing(host.last);
        await report(device, peer, "nodeLabel", "theirs-2");
        const reportedAt = kind.evaluations[kind.evaluations.length - 1].at;
        await MockTime.advance(Seconds(30));

        expect(host.passes.length).equals(2);
        expect(host.passes[1].at - reportedAt).equals(Seconds(4));
    });

    it("drops the suspects when the peer is unreachable as the quiet period ends", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const kind = new LabelKind();
        const host = new FakeHost();
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        const watcher = newWatcher(peer, registryWith(kind), host);

        await report(device, peer, "nodeLabel", "theirs");
        host.isReachable = false;
        await MockTime.advance(Seconds(30));
        host.isReachable = true;
        await MockTime.advance(Seconds(30));
        expect(host.passes).deep.equals([]);
        watcher.close();
    });

    describe("after close", () => {
        const quietTimer = (peer: ClientNode) => MockTime.timerCountFor(`drift quiet period of ${peer.id}`);

        it("holds no observer, no running timer and no suspect", async () => {
            await using site = new MockSite();
            const { device, peer } = await pair(site);
            const kind = new LabelKind();
            const host = new FakeHost();
            await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
            const reports = observersOf(peer.eventsOf(BasicInformationClient).nodeLabel$Changed);
            const structures = observersOf(peer.owner.peers.structureApplied);
            const items = observersOf(peer.eventsOf(DesiredStateBehavior).stateChanged);
            const watcher = newWatcher(peer, registryWith(kind), host);
            await report(device, peer, "nodeLabel", "theirs-1");
            expect([reports.attached, structures.attached, items.attached]).deep.equals([1, 1, 1]);
            expect(quietTimer(peer)).equals(1);

            watcher.close();
            expect([reports.attached, structures.attached, items.attached]).deep.equals([0, 0, 0]);
            expect(quietTimer(peer)).equals(0);
            expect([...watcher.startPass().suspects]).deep.equals([]);
        });

        it("hands nothing over, whatever time advances or is called", async () => {
            await using site = new MockSite();
            const { device, peer } = await pair(site);
            const kind = new LabelKind();
            const host = new FakeHost();
            await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
            const watcher = newWatcher(peer, registryWith(kind), host);

            await report(device, peer, "nodeLabel", "theirs-1");
            await MockTime.advance(Seconds(30));
            expect(host.passes.length).equals(1);
            const open = host.last;

            watcher.close();
            readNothing(open);
            await MockTime.advance(Seconds(30));
            expect(host.passes.length).equals(1);
            expect(quietTimer(peer)).equals(0);

            const evaluations = kind.evaluations.length;
            await report(device, peer, "nodeLabel", "theirs-2");
            await MockTime.advance(Seconds(30));
            expect(host.passes.length).equals(1);
            expect(kind.evaluations.length).equals(evaluations);
        });

        it("attaches nothing on a rebuild or a start", async () => {
            await using site = new MockSite();
            const { peer } = await pair(site);
            const kind = new LabelKind();
            await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
            const reports = observersOf(peer.eventsOf(BasicInformationClient).nodeLabel$Changed);
            const structures = observersOf(peer.owner.peers.structureApplied);
            const watcher = newWatcher(peer, registryWith(kind), new FakeHost());

            watcher.close();
            watcher.rebuild();
            watcher.start();
            expect([reports.attached, structures.attached]).deep.equals([0, 0]);
        });
    });

    it("warns once per kind when satisfiedBy throws, and suspects every item of it", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const log = captureWatcherLog();
        const kind = new LabelKind();
        kind.throws = true;
        const host = new FakeHost();
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        await commitLabel(peer, "location", { attribute: "location", value: "XX" });
        const watcher = newWatcher(peer, registryWith(kind), host);

        await report(device, peer, "nodeLabel", "theirs-1");
        await report(device, peer, "location", "YY");
        await report(device, peer, "nodeLabel", "theirs-2");
        await MockTime.advance(Seconds(30));

        expect(host.passes.map(pass => new Set(pass.suspects))).deep.equals([new Set([LABEL_KEY, LOCATION_KEY])]);
        const warnings = warningsIn(log);
        expect(warnings.length).equals(1);
        expect(warnings[0]).contains('"label"');
        watcher.close();
    });

    it("skips a watch of a changes-omitted attribute with one warning", async () => {
        await using site = new MockSite();
        const { peer } = await pair(site);
        const log = captureWatcherLog();
        let evaluations = 0;
        const kind: ItemKind = {
            kind: "keymap",
            priority: 0,
            apply: async () => {},
            watches: node => [{ endpoint: node, behavior: GroupKeyManagementClient, attribute: "groupKeyMap" }],
            verify: async () => true,
            satisfiedBy: () => {
                evaluations++;
                return false;
            },
        };
        await MockTime.resolve(
            peer.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                ds.setIntent("keymap", "k1", {});
                ds.updateStatus("keymap", "k1", "committed");
            }),
        );
        newWatcher(peer, registryWith(kind), new FakeHost());
        await MockTime.resolve(
            peer.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                ds.setIntent("keymap", "k2", {});
                ds.updateStatus("keymap", "k2", "committed");
            }),
        );

        // A live read updates the cache of a changes-omitted attribute too
        peer.eventsOf(GroupKeyManagementClient).groupKeyMap$Changed.emit([], [], undefined);

        expect(evaluations).equals(0);
        const warnings = warningsIn(log);
        expect(warnings.length).equals(1);
        expect(warnings[0]).contains("groupKeyMap");
    });

    describe("warns once when the default subscription does not cover a watch", () => {
        async function warningsWith(defaultSubscription: NetworkClient.State["defaultSubscription"]) {
            await using site = new MockSite();
            const { peer } = await pair(site);
            await MockTime.resolve(
                peer.act(agent => {
                    agent.get(NetworkClient).state.defaultSubscription = defaultSubscription;
                }),
            );
            const log = captureWatcherLog();
            await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
            const watcher = newWatcher(peer, registryWith(new LabelKind()), new FakeHost());
            await commitLabel(peer, "location", { attribute: "location", value: "XX" });
            watcher.close();
            return warningsIn(log);
        }

        it("not for the default of all attributes", async () => {
            expect(await warningsWith(undefined)).deep.equals([]);
        });

        it("not for a wildcard path", async () => {
            expect(await warningsWith({ attributes: [{}] })).deep.equals([]);
        });

        it("not for a path of the watched cluster", async () => {
            expect(await warningsWith({ attributes: [{ clusterId: BasicInformationClient.cluster.id }] })).deep.equals(
                [],
            );
        });

        it("for paths of another endpoint", async () => {
            const warnings = await warningsWith({ attributes: [{ endpointId: EndpointNumber(1) }] });
            expect(warnings.length).equals(1);
        });

        it("for paths of another cluster", async () => {
            const warnings = await warningsWith({ attributes: [{ clusterId: OnOff.Cluster.id }] });
            expect(warnings.length).equals(1);
            expect(warnings[0]).contains("nodeLabel");
        });

        it("for a wildcard path that skips the root endpoint", async () => {
            const warnings = await warningsWith({ attributes: [{ wildcardPathFlags: { skipRootNode: true } }] });
            expect(warnings.length).equals(1);
        });

        it("for a path of the watched cluster's other attribute", async () => {
            const warnings = await warningsWith({
                attributes: [{ clusterId: BasicInformationClient.cluster.id, attributeId: attributeIdOf("location") }],
            });
            expect(warnings.length).equals(1);
            expect(warnings[0]).contains("nodeLabel");
            expect(warnings[0]).not.contains("location");
        });

        it("not for options that name no attributes", async () => {
            expect(await warningsWith({ keepSubscriptions: false })).deep.equals([]);
        });

        it("for a built request of another cluster", async () => {
            const request = Subscribe({ fabricFilter: true, attributes: [{ clusterId: OnOff.Cluster.id }] });
            const warnings = await warningsWith(request);
            expect(warnings.length).equals(1);
        });

        it("again after a subscription that covered every watch", async () => {
            await using site = new MockSite();
            const { peer } = await pair(site);
            const narrow = { attributes: [{ clusterId: OnOff.Cluster.id }] };
            const setSubscription = (defaultSubscription: NetworkClient.State["defaultSubscription"]) =>
                MockTime.resolve(
                    peer.act(agent => {
                        agent.get(NetworkClient).state.defaultSubscription = defaultSubscription;
                    }),
                    { macrotasks: true },
                );
            await setSubscription(narrow);
            const log = captureWatcherLog();
            await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
            const watcher = newWatcher(peer, registryWith(new LabelKind()), new FakeHost());
            watcher.rebuild();
            expect(warningsIn(log).length).equals(1);

            await setSubscription(undefined);
            watcher.rebuild();
            expect(warningsIn(log).length).equals(1);

            await setSubscription(narrow);
            watcher.rebuild();
            expect(warningsIn(log).length).equals(2);
        });
    });

    it("neither warns nor hands anything over for a binding on an absent endpoint", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const log = captureWatcherLog();
        const host = new FakeHost();
        await MockTime.resolve(
            peer.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                ds.setIntent("binding", "k1", { localEndpoint: 99, target: { group: GroupId(1) } });
                ds.updateStatus("binding", "k1", "committed");
            }),
        );
        newWatcher(peer, registryWith(new BindingItemKind()), host);

        // The report's structure is applied after it, which rebuilds the watcher once more
        await report(device, peer, "nodeLabel", "theirs");
        await MockTime.advance(Seconds(30));

        expect(host.passes).deep.equals([]);
        expect(log).deep.equals([]);
    });

    it("warns once per kind for a watch of an attribute that reports no changes", async () => {
        await using site = new MockSite();
        const { peer } = await pair(site);
        const log = captureWatcherLog();
        const kind: ItemKind = {
            kind: "misnamed",
            priority: 0,
            apply: async () => {},
            watches: node => [{ endpoint: node, behavior: BasicInformationClient, attribute: "noSuchAttribute" }],
            verify: async () => true,
            satisfiedBy: () => false,
        };
        await MockTime.resolve(
            peer.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                ds.setIntent("misnamed", "k1", {});
                ds.updateStatus("misnamed", "k1", "committed");
            }),
        );
        newWatcher(peer, registryWith(kind), new FakeHost());
        await MockTime.resolve(
            peer.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                ds.setIntent("misnamed", "k2", {});
                ds.updateStatus("misnamed", "k2", "committed");
            }),
        );

        const warnings = warningsIn(log);
        expect(warnings.length).equals(1);
        expect(warnings[0]).contains('"misnamed"');
        expect(warnings[0]).contains("watches");
    });

    it("warns once per kind when watches throws, and watches nothing of it", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const log = captureWatcherLog();
        const kind = new LabelKind();
        const host = new FakeHost();
        const watches = kind.watches.bind(kind);
        let throws = true;
        kind.watches = (node, item) => {
            if (throws) {
                throw new InternalError("watches failed");
            }
            return watches(node, item);
        };
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        newWatcher(peer, registryWith(kind), host);
        await commitLabel(peer, "location", { attribute: "location", value: "XX" });

        await report(device, peer, "nodeLabel", "theirs-1");
        await MockTime.advance(Seconds(30));
        expect(kind.evaluations).deep.equals([]);
        expect(host.passes).deep.equals([]);
        const warnings = warningsIn(log);
        expect(warnings.length).equals(1);
        expect(warnings[0]).contains("watches");

        throws = false;
        await report(device, peer, "nodeLabel", "theirs-2");
        await report(device, peer, "nodeLabel", "theirs-3");
        expect(kind.evaluations.map(evaluation => evaluation.key)).deep.equals(["name"]);
    });

    it("neither warns nor asks a kind without watches", async () => {
        await using site = new MockSite();
        const { peer } = await pair(site);
        const log = captureWatcherLog();
        const kind: ItemKind = { kind: "verify-only", priority: 0, apply: async () => {}, verify: async () => true };
        await MockTime.resolve(
            peer.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                ds.setIntent("verify-only", "k1", {});
                ds.updateStatus("verify-only", "k1", "committed");
            }),
        );
        newWatcher(peer, registryWith(kind), new FakeHost());

        expect(log).deep.equals([]);
    });

    it("warns once per kind for a watch of a cluster the endpoint does not have", async () => {
        await using site = new MockSite();
        const { peer } = await pair(site);
        const log = captureWatcherLog();
        const kind: ItemKind = {
            kind: "elsewhere",
            priority: 0,
            apply: async () => {},
            watches: node => [{ endpoint: node, behavior: BindingClient, attribute: "binding" }],
            verify: async () => true,
            satisfiedBy: () => false,
        };
        await MockTime.resolve(
            peer.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                ds.setIntent("elsewhere", "k1", {});
                ds.updateStatus("elsewhere", "k1", "committed");
            }),
        );
        newWatcher(peer, registryWith(kind), new FakeHost());

        const warnings = warningsIn(log);
        expect(warnings.length).equals(1);
        expect(warnings[0]).contains("the endpoint has no binding");
    });

    it("keeps its observers when a rebuild finds the same watches", async () => {
        await using site = new MockSite();
        const { peer } = await pair(site);
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        const reports = observersOf(peer.eventsOf(BasicInformationClient).nodeLabel$Changed);
        const watcher = newWatcher(peer, registryWith(new LabelKind()), new FakeHost());
        expect([reports.attached, reports.registrations]).deep.equals([1, 1]);

        watcher.rebuild();
        watcher.rebuild();
        expect([reports.attached, reports.registrations]).deep.equals([1, 1]);
    });

    it("warns about a failing satisfiedBy after a failing watches of the same kind", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const log = captureWatcherLog();
        const kind = new LabelKind();
        const watches = kind.watches.bind(kind);
        let watchesThrows = true;
        kind.watches = (node, item) => {
            if (watchesThrows) {
                throw new InternalError("watches failed");
            }
            return watches(node, item);
        };
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        const watcher = newWatcher(peer, registryWith(kind), new FakeHost());
        watchesThrows = false;
        kind.throws = true;
        watcher.rebuild();
        await report(device, peer, "nodeLabel", "theirs");

        const warnings = warningsIn(log);
        expect(warnings.length).equals(2);
        expect(warnings[0]).contains("in watches");
        expect(warnings[1]).contains("in satisfiedBy");
    });

    describe("ends a pass", () => {
        async function handedOverTwice(site: MockSite) {
            const { device, peer } = await pair(site);
            const kind = new LabelKind();
            const host = new FakeHost();
            await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
            await commitLabel(peer, "location", { attribute: "location", value: "XX" });
            const watcher = newWatcher(peer, registryWith(kind), host);
            await report(device, peer, "nodeLabel", "theirs");
            await report(device, peer, "location", "YY");
            await MockTime.advance(Seconds(30));
            expect(host.passes.map(pass => pass.suspects)).deep.equals([new Set([LABEL_KEY, LOCATION_KEY])]);
            return { device, peer, kind, host, watcher };
        }

        it("by trying again only the suspect it did not read, after twice the wait", async () => {
            await using site = new MockSite();
            const { host } = await handedOverTwice(site);

            const endedAt = Time.nowUs;
            readAll(host.last, new Set([LABEL_KEY]), new Map([[LOCATION_KEY, new InternalError("read failed")]]));
            await MockTime.advance(Seconds(30));

            expect(host.passes.map(pass => [...pass.suspects])).deep.equals([
                [LABEL_KEY, LOCATION_KEY],
                [LOCATION_KEY],
            ]);
            expect(host.last.at - endedAt).equals(Seconds(4));
        });

        it("by leaving out a suspect whose item is gone when the pass starts", async () => {
            await using site = new MockSite();
            const { peer, host } = await handedOverTwice(site);

            readNothing(host.last);
            await MockTime.resolve(peer.act(agent => agent.get(DesiredStateBehavior).dropItem("label", "location")));
            await MockTime.advance(Seconds(30));

            expect([...host.last.suspects]).deep.equals([LABEL_KEY]);
        });

        it("by waiting the quiet period again after a full read without suspects that failed nowhere", async () => {
            await using site = new MockSite();
            const { device, peer, kind, host, watcher } = await handedOverTwice(site);
            readNothing(host.last);
            await MockTime.advance(Seconds(30));

            const full = watcher.startPass();
            full.result = { verified: new Set(), drifted: new Set(), unread: new Map() };
            full[Symbol.dispose]();
            await report(device, peer, "nodeLabel", "theirs-2");
            const reportedAt = kind.evaluations[kind.evaluations.length - 1].at;
            await MockTime.advance(Seconds(30));

            expect(host.last.at - reportedAt).equals(QUIET);
        });

        it("by keeping the longer wait after a full read without suspects that failed somewhere", async () => {
            await using site = new MockSite();
            const { device, peer, kind, host, watcher } = await handedOverTwice(site);
            readNothing(host.last);
            await MockTime.advance(Seconds(30));

            const full = watcher.startPass();
            full.result = {
                verified: new Set(),
                drifted: new Set(),
                unread: new Map([["other", new InternalError("read failed")]]),
            };
            full[Symbol.dispose]();
            await report(device, peer, "nodeLabel", "theirs-2");
            const reportedAt = kind.evaluations[kind.evaluations.length - 1].at;
            await MockTime.advance(Seconds(30));

            expect(host.last.at - reportedAt).equals(Seconds(4));
        });
    });

    it("waits at least the quiet period after a failed read, whatever the cap", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const host = new FakeHost();
        host.backoffCap = Seconds(1);
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        newWatcher(peer, registryWith(new LabelKind()), host);
        await report(device, peer, "nodeLabel", "theirs");
        await MockTime.advance(Seconds(30));

        const failedAt = Time.nowUs;
        readNothing(host.last);
        await MockTime.advance(Seconds(30));

        expect(host.passes.length).equals(2);
        expect(host.last.at - failedAt).equals(QUIET);
    });

    it("hands nothing over for a report that reaches it after an observer of the same report closed it", async () => {
        await using site = new MockSite();
        const { device, peer } = await pair(site);
        const kind = new LabelKind();
        const host = new FakeHost();
        await commitLabel(peer, "name", { attribute: "nodeLabel", value: "ours" });
        let closeOnReport: DriftWatcher | undefined;
        peer.eventsOf(BasicInformationClient).nodeLabel$Changed.on(() => closeOnReport?.close());
        closeOnReport = newWatcher(peer, registryWith(kind), host);

        await report(device, peer, "nodeLabel", "theirs");
        await MockTime.advance(Seconds(30));

        expect(kind.evaluations).deep.equals([]);
        expect(host.passes).deep.equals([]);
    });
});
