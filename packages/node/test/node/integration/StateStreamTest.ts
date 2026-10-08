/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffServer } from "#behaviors/on-off";
import { OnOffLightDevice } from "#devices/on-off-light";
import { EndpointBehaviorsError } from "#endpoint/errors.js";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import { StateStream } from "#node/integration/StateStream.js";
import { Abort, ImplementationError, Lifecycle, Millis } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import type { CommissionableDevice } from "@matter/protocol";

class FailingOnOffServer extends OnOffServer {
    override initialize() {
        throw new ImplementationError("Initialization refused for test");
    }
}

const FailingLight = OnOffLightDevice.with(FailingOnOffServer);

const DEVICE: CommissionableDevice = {
    deviceIdentifier: "device-a",
    D: 1000,
    CM: 1,
    addresses: [{ type: "udp", ip: "fe80::1", port: 5540 }],
};

/**
 * Collect what a {@link StateStream} yields while {@link actor} runs.
 */
async function streamedBy(node: MockServerNode, actor: () => Promise<void>) {
    const abort = new Abort();
    const changes = new Array<StateStream.Change>();
    const stream = StateStream(node, { abort, coalesceInterval: Millis(0) });
    const consumer = (async () => {
        for await (const change of { [Symbol.asyncIterator]: () => stream }) {
            changes.push(change);
        }
    })();

    await settle(changes);
    changes.length = 0;

    await actor();
    await settle(changes);

    abort();
    await consumer;
    return changes;
}

/**
 * Pull everything a {@link StateStream} has queued, then stop it.
 */
async function drain(stream: StateStream, abort: Abort) {
    const changes = new Array<StateStream.Change>();
    const pull = (async () => {
        for (let next = await stream.next(); !next.done; next = await stream.next()) {
            changes.push(next.value);
        }
    })();
    await settle(changes);
    abort();
    await pull;
    return changes;
}

/**
 * Let a stream drain until it yields nothing new.
 */
async function settle(changes: StateStream.Change[]) {
    for (let length = -1; length !== changes.length;) {
        length = changes.length;
        for (let i = 0; i < 10; i++) {
            await MockTime.advance(Millis(1));
            await MockTime.yield3();
        }
    }
}

describe("StateStream", () => {
    before(() => {
        MockTime.init();
    });

    // Characterization: the stream reported this deletion before the deletion fixes as well
    it("tells a state stream about a destroyed endpoint it announced", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });

        const streamed = await streamedBy(node, () => light.close());

        expect(streamed.filter(change => change.kind === "delete").map(change => change.endpoint)).deep.equals([light]);
    });

    it("tells a state stream nothing of an endpoint destroyed before the stream yielded it", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const abort = new Abort();
        const stream = StateStream(node, { abort });

        // The first pull scans the node; the stream yields nothing more until pulled again
        await stream.next();
        const light = await node.add(OnOffLightDevice, { id: "light" });
        await light.close();

        const changes = await drain(stream, abort);
        expect(changes.filter(change => change.endpoint === light)).deep.equals([]);
    });

    it("tells a state stream of an endpoint's deletion when the consumer knew it from an earlier connection", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const abort = new Abort();
        const stream = StateStream(node, {
            abort,
            versions: [{ node: node.id, endpoint: light.number, cluster: "onOff", version: 1 }],
        });

        await stream.next();
        await light.close();

        const changes = await drain(stream, abort);
        expect(changes.filter(change => change.endpoint === light).map(change => change.kind)).deep.equals(["delete"]);
    });

    it("tells a state stream filtered by node of an endpoint's deletion known from an earlier connection", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const abort = new Abort();
        const stream = StateStream(node, {
            abort,
            nodes: [node.id],
            versions: [{ node: node.id, endpoint: light.number, cluster: "onOff", version: 1 }],
        });

        await stream.next();
        await light.close();

        const changes = await drain(stream, abort);
        expect(changes.filter(change => change.endpoint === light).map(change => change.kind)).deep.equals(["delete"]);
    });

    it("sends all properties of a behavior once its endpoint is readable again after dropping its changes", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const abort = new Abort();
        const stream = StateStream(node, { abort, clusters: ["onOff"] });

        // The scan queues only the light's OnOff, so the stream then waits until pulled again
        const scanned = await stream.next();
        expect(scanned.value?.endpoint).equals(light);

        await light.set({ onOff: { onOff: true } });
        await light.reset();

        // Nothing pulls while the change waits, so the next pull finds the endpoint unreadable
        const next = stream.next();
        await MockTime.yield3();
        light.construction.start();
        await light.construction;

        const { value } = await MockTime.resolve(next);
        expect(value?.kind).equals("update");
        expect(Object.keys(value?.kind === "update" ? value.changes : {}).sort()).deep.equals(
            Object.keys(light.stateOf(OnOffServer)).sort(),
        );

        abort();
        await stream.return?.();
    });

    it("keeps a state stream running past a non-essential endpoint that crashes", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const abort = new Abort();
        const stream = StateStream(node, { abort });

        await stream.next();
        await expect(node.add(FailingLight, { id: "crashed", isEssential: false })).rejectedWith(
            EndpointBehaviorsError,
        );
        const light = await node.add(OnOffLightDevice, { id: "light" });

        const changes = await drain(stream, abort);
        expect(changes.some(change => change.kind === "update" && change.endpoint === light)).true;
    });

    it("scans past a peer whose state is unreadable", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const peer = await MockTime.resolve(node.peers.forDescriptor(DEVICE));
        await MockTime.resolve(peer.construction);
        peer.construction.setStatus(Lifecycle.Status.Crashed);
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const abort = new Abort();
        const stream = StateStream(node, { abort });

        const changes = await drain(stream, abort);
        expect(changes.some(change => change.kind === "update" && change.endpoint === light)).true;
        expect(changes.some(change => change.node === peer)).false;
    });

    it("yields a behavior the scan queued once although it changes before the stream reaches it", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const first = await node.add(OnOffLightDevice, { id: "first" });
        const second = await node.add(OnOffLightDevice, { id: "second" });
        const abort = new Abort();
        const stream = StateStream(node, { abort, clusters: ["onOff"] });

        // The first pull scans and yields the first light; the second light's OnOff stays queued behind it
        const { value } = await stream.next();
        expect(value?.endpoint).equals(first);
        await second.set({ onOff: { onOff: true } });

        const changes = await drain(stream, abort);
        expect(changes.filter(change => change.kind === "update" && change.endpoint === second).length).equals(1);
    });

    it("tells a state stream nothing of a peer deleted before the stream yielded it", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const abort = new Abort();
        const stream = StateStream(node, { abort });

        await stream.next();
        const peer = await MockTime.resolve(node.peers.forDescriptor(DEVICE));
        await MockTime.resolve(peer.construction);
        await MockTime.resolve(peer.delete());

        const changes = await drain(stream, abort);
        expect(changes.filter(change => change.node === peer)).deep.equals([]);
    });

    it("scans a peer that is still initializing once it is readable, yielding each behavior once", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const abort = new Abort();
        const stream = StateStream(node, { abort });

        const creation = node.peers.forDescriptor(DEVICE);
        const peer = [...node.peers].find(candidate => candidate.construction.status === Lifecycle.Status.Initializing);
        if (peer === undefined) {
            expect.fail("No peer is initializing");
        }

        // The first pull scans while the peer initializes
        const first = stream.next();
        await MockTime.resolve(creation);
        await MockTime.resolve(peer.construction);
        const { value: firstChange } = await MockTime.resolve(first);
        const changes = [...(firstChange ? [firstChange] : []), ...(await drain(stream, abort))];

        const updates = changes.filter(change => change.kind === "update" && change.node === peer);
        const behaviors = updates.map(change =>
            change.kind === "update" ? `${change.endpoint.number}/${change.behavior.id}` : "",
        );
        expect(behaviors.length).greaterThan(0);
        expect(new Set(behaviors).size).equals(behaviors.length);
        const expected = Object.keys(peer.behaviors.supported).map(id => `0/${id}`);
        expect(behaviors.filter(behavior => behavior.startsWith("0/")).sort()).deep.equals(expected.sort());
    });

    it("sends the behaviors of an endpoint added while the stream runs in full", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const abort = new Abort();
        const stream = StateStream(node, { abort, clusters: ["onOff"] });

        // Nothing matches the filter yet, so the first pull waits for the light
        const first = stream.next();
        const light = await node.add(OnOffLightDevice, { id: "light" });

        const { value: firstChange } = await MockTime.resolve(first);
        const changes = [...(firstChange ? [firstChange] : []), ...(await drain(stream, abort))];
        const updates = changes.filter(change => change.kind === "update" && change.endpoint === light);
        expect(updates.length).equals(1);
        const [update] = updates;
        expect(Object.keys(update.kind === "update" ? update.changes : {}).sort()).deep.equals(
            Object.keys(light.stateOf(OnOffServer)).sort(),
        );
    });

    it("tells a state stream of an endpoint's deletion known only from versions of clusters it does not scan", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const abort = new Abort();
        const stream = StateStream(node, {
            abort,
            clusters: ["levelControl"],
            versions: [{ node: node.id, endpoint: light.number, cluster: "onOff", version: 1 }],
        });

        // Nothing matches the filter, so the first pull waits for the deletion
        const first = stream.next();
        await light.close();

        const { value: firstChange } = await MockTime.resolve(first);
        expect(firstChange?.endpoint).equals(light);
        expect(firstChange?.kind).equals("delete");
        abort();
        await stream.return?.();
    });

    it("sends the node's state to a stream that began while the node was initializing", async () => {
        const node = new MockServerNode({ parts: [OnOffLightDevice] });
        const abort = new Abort();
        let pulled: Promise<StateStream.Change[]> | undefined;
        node.lifecycle.ready.once(() => {
            pulled = drain(StateStream(node, { abort, clusters: ["basicInformation", "onOff"] }), abort);
        });
        try {
            await MockTime.resolve(node.construction);
            if (pulled === undefined) {
                expect.fail("The node never reported ready");
            }
            const changes = await pulled;

            const sent = changes.map(change => (change.kind === "update" ? change.behavior.id : change.kind));
            expect(sent).contains("basicInformation");
            expect(sent).contains("onOff");
        } finally {
            await node.close();
        }
    });

    it("sends the state of a part that became readable before its node to a stream that began in between", async () => {
        const node = new MockServerNode({ parts: [OnOffLightDevice] });
        const [light] = [...node.parts];
        const abort = new Abort();
        let pulled: Promise<StateStream.Change[]> | undefined;

        // Begin the stream as the part's readability is reported, so the stream misses that report
        node.lifecycle.ready.once(() => {
            node.env.get(ChangeNotificationService).change.on(change => {
                if (change.kind === "readable" && change.endpoint === light && pulled === undefined) {
                    expect(node.lifecycle.isReadable).false;
                    pulled = drain(StateStream(node, { abort, clusters: ["onOff"] }), abort);
                }
            });
        });
        try {
            await MockTime.resolve(node.construction);
            if (pulled === undefined) {
                expect.fail("The part never became active");
            }
            const changes = await pulled;

            expect(changes.some(change => change.kind === "update" && change.endpoint === light)).true;
        } finally {
            await node.close();
        }
    });

    it("drops the state of an endpoint that is being reset and sends it in full once it is readable", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const abort = new Abort();
        const stream = StateStream(node, { abort, clusters: ["onOff"] });

        // The scan queues the light's OnOff and yields it
        await stream.next();
        await light.set({ onOff: { onOff: true } });

        // Pull while the reset is closing the behaviors
        const reset = light.reset();
        expect(light.lifecycle.isReadable).false;
        const next = stream.next();
        await MockTime.resolve(reset);
        light.construction.start();
        await MockTime.resolve(light.construction);

        const { value } = await MockTime.resolve(next);
        expect(value?.kind).equals("update");
        expect(Object.keys(value?.kind === "update" ? value.changes : {}).sort()).deep.equals(
            Object.keys(light.stateOf(OnOffServer)).sort(),
        );

        abort();
        await stream.return?.();
    });

    it("sends the initial state of a node a stream is filtered by", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const abort = new Abort();
        const stream = StateStream(node, { abort, nodes: [node.id], clusters: ["onOff"] });

        const changes = await drain(stream, abort);
        expect(changes.some(change => change.kind === "update" && change.endpoint === light)).true;
    });
});
