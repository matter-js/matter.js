/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UncachedValueError } from "#behavior/state/managed/errors.js";
import { Api } from "#behavior/system/remote/api/Api.js";
import type { RemoteRequest } from "#behavior/system/remote/api/RemoteRequest.js";
import { BindingClient, BindingServer } from "#behaviors/binding";
import { LevelControlClient, LevelControlServer } from "#behaviors/level-control";
import { DimmableLightDevice } from "#devices/dimmable-light";
import type { ClientNode } from "#node/ClientNode.js";
import { ServerNode } from "#node/ServerNode.js";
import { MaybePromise, Millis } from "@matter/general";
import { MockSite, seedPeerCache, settled, subscribedPeer } from "@matter/node/testing";
import { Val, Write } from "@matter/protocol";
import { EndpointNumber, FabricIndex, NodeId } from "@matter/types";
import { Binding } from "@matter/types/clusters/binding";
import { LevelControl } from "@matter/types/clusters/level-control";

const OURS = FabricIndex(1);
const onDevice = { node: NodeId(9), endpoint: EndpointNumber(2), fabricIndex: OURS };
const target = { node: NodeId(7), endpoint: EndpointNumber(1) };

/**
 * Commissions a dimmable light whose binding list holds {@link onDevice} and whose level control options have
 * `executeIfOff` set, and returns a peer.  Unless {@link cached} is true, the peer's cache holds neither value, as before
 * the device reported them.  The peer has no subscription, so the cache holds a written value until a test reports
 * another.
 */
async function peerOf(site: MockSite, { cached = false } = {}) {
    const { controller, device } = await site.addCommissionedPair({
        device: { type: ServerNode.RootEndpoint, device: DimmableLightDevice.with(BindingServer) },
    });
    const deviceEndpoint = device.endpoints.for(1);
    await MockTime.resolve(deviceEndpoint.setStateOf(BindingServer, { binding: [onDevice] }));
    await MockTime.resolve(deviceEndpoint.setStateOf(LevelControlServer, { options: { executeIfOff: true } }));

    const peer = await subscribedPeer(controller, "peer1");
    const peerEndpoint = peer.endpoints.require(1);
    const reported = () =>
        peerEndpoint.stateOf(BindingClient).binding.length === 1 &&
        peerEndpoint.stateOf(LevelControlClient).options.executeIfOff;
    for (let wait = 0; wait < 100 && !reported(); wait++) {
        await MockTime.resolve(MockTime.sleep("device report pending", Millis(100)));
    }
    expect(reported()).true;

    await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
    await MockTime.resolve(settled(controller, device, peer), { macrotasks: true });
    expect(peer.state.commissioning.fabricIndexOnPeer).equals(OURS);

    if (!cached) {
        await seedPeerCache(peer, peerEndpoint, BindingClient, unreported(Binding.attributes.binding.id));
        await seedPeerCache(peer, peerEndpoint, LevelControlClient, unreported(LevelControl.attributes.options.id));

        // The device holds values the peer's defaults lack, so the peer reads defaults only while it caches nothing
        expect(peerEndpoint.stateOf(BindingClient).binding).deep.equals([]);
        expect(peerEndpoint.stateOf(LevelControlClient).options.executeIfOff).not.true;
    }

    expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([onDevice]);
    expect(deviceEndpoint.stateOf(LevelControlServer).options).deep.equals({
        executeIfOff: true,
        coupleColorTempToLevel: false,
    });

    return { controller, deviceEndpoint, peer, peerEndpoint, writes: recordWrites(peer) };
}

/** Cache values that drop the attribute {@link id}. */
function unreported(id: number): Val.StructMap {
    return new Map([[String(id), undefined]]);
}

/** Cache values that report {@link value} for the attribute {@link id}. */
function reported(id: number, value: Val): Val.StructMap {
    return new Map([[String(id), value]]);
}

/** Records the Write Requests {@link peer} sends. */
function recordWrites(peer: ClientNode) {
    const requests = new Array<Write>();
    const { interaction } = peer;
    const write = interaction.write.bind(interaction);
    interaction.write = request => {
        requests.push(request);
        return write(request);
    };
    return requests;
}

/** The entries of {@link list} as plain objects without the fields that hold no value. */
function entriesOf(list: readonly object[]) {
    return list.map(entry => Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)));
}

/** What {@link operation} rejected with, or undefined if it resolved. */
async function rejectionOf(operation: () => MaybePromise) {
    try {
        await MockTime.resolve(Promise.resolve(operation()));
    } catch (e) {
        return e;
    }
}

async function execute(controller: ServerNode, request: RemoteRequest) {
    return MockTime.resolve(Api.execute("test", controller, request, new AbortController().signal), {
        macrotasks: true,
    });
}

describe("ClientNode change of a mandatory value its cache does not hold", () => {
    before(() => {
        MockTime.init();
    });

    it("reads the default without writing or announcing a change", async () => {
        await using site = new MockSite();
        const { peerEndpoint, writes } = await peerOf(site);
        const changes = new Array<unknown>();
        peerEndpoint.eventsOf(BindingClient).binding$Changed.on(value => {
            changes.push(value);
        });

        await MockTime.resolve(
            peerEndpoint.act(agent => {
                const { state } = agent.get(BindingClient);
                expect(state.binding).deep.equals([]);
                expect(state.binding).equals(state.binding);
                expect(agent.get(LevelControlClient).state.options.executeIfOff).false;
            }),
        );

        expect(writes).length(0);
        expect(changes).length(0);
    });

    it("refuses a list an act pushes an entry to, without writing", async () => {
        await using site = new MockSite();
        const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site);

        const caught = await rejectionOf(() =>
            peerEndpoint.act(agent => {
                agent.get(BindingClient).state.binding.push({ ...target, fabricIndex: FabricIndex.OMIT_FABRIC });
            }),
        );

        expect(caught).instanceOf(UncachedValueError);
        expect(String(caught)).contains("binding");
        expect(writes).length(0);
        expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([onDevice]);
        expect(peerEndpoint.stateOf(BindingClient).binding).deep.equals([]);
    });

    it("refuses a bitmap an act sets a flag of, without writing", async () => {
        await using site = new MockSite();
        const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site);

        const caught = await rejectionOf(() =>
            peerEndpoint.act(agent => {
                agent.get(LevelControlClient).state.options.coupleColorTempToLevel = true;
            }),
        );

        expect(caught).instanceOf(UncachedValueError);
        expect(writes).length(0);
        expect(deviceEndpoint.stateOf(LevelControlServer).options).deep.equals({
            executeIfOff: true,
            coupleColorTempToLevel: false,
        });
        expect(peerEndpoint.stateOf(LevelControlClient).options.coupleColorTempToLevel).false;
    });

    describe("refuses each change in place of the list", () => {
        const entry = { ...target, fabricIndex: FabricIndex.OMIT_FABRIC };

        for (const { label, change } of [
            { label: "an entry set by index", change: (list: Binding.Target[]) => (list[0] = entry) },
            { label: "the length set", change: (list: Binding.Target[]) => (list.length = 0) },
            { label: "an entry spliced in", change: (list: Binding.Target[]) => list.splice(0, 0, entry) },
            { label: "an entry unshifted", change: (list: Binding.Target[]) => list.unshift(entry) },
            { label: "a sort of the empty default", change: (list: Binding.Target[]) => list.sort() },
            { label: "a pop of the empty default", change: (list: Binding.Target[]) => list.pop() },
            {
                label: "a delete of an entry the empty default does not have",
                change: (list: Binding.Target[]) => Reflect.deleteProperty(list, 0),
            },
        ]) {
            it(`refuses ${label}, without writing`, async () => {
                await using site = new MockSite();
                const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site);

                const caught = await rejectionOf(() =>
                    peerEndpoint.act(agent => {
                        change(agent.get(BindingClient).state.binding);
                    }),
                );

                expect(caught).instanceOf(UncachedValueError);
                expect(writes).length(0);
                expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([onDevice]);
                expect(peerEndpoint.stateOf(BindingClient).binding).deep.equals([]);
            });
        }
    });

    // Characterization: a report during the act ends the default, so the act changes the reported list
    it("writes a list a report delivers during the act and the act then pushes an entry to", async () => {
        await using site = new MockSite();
        const { deviceEndpoint, peer, peerEndpoint, writes } = await peerOf(site);

        await MockTime.resolve(
            peerEndpoint.act(async agent => {
                const { state } = agent.get(BindingClient);
                expect(state.binding).deep.equals([]);

                await seedPeerCache(
                    peer,
                    peerEndpoint,
                    BindingClient,
                    reported(Binding.attributes.binding.id, [onDevice]),
                );

                state.binding.push({ ...target, fabricIndex: FabricIndex.OMIT_FABRIC });
            }),
        );

        expect(writes).length(1);
        expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([
            onDevice,
            { ...target, fabricIndex: OURS },
        ]);
    });

    // An act that already changed the cluster keeps the values it started with, so a report during the act does not
    // end the default
    it("refuses a bitmap a report delivers after the act changed another attribute of the cluster", async () => {
        await using site = new MockSite();
        const { deviceEndpoint, peer, peerEndpoint, writes } = await peerOf(site);

        const caught = await rejectionOf(() =>
            peerEndpoint.act(async agent => {
                const { state } = agent.get(LevelControlClient);
                state.onLevel = 5;

                await seedPeerCache(
                    peer,
                    peerEndpoint,
                    LevelControlClient,
                    reported(LevelControl.attributes.options.id, { executeIfOff: true }),
                );

                state.options.coupleColorTempToLevel = true;
            }),
        );

        expect(caught).instanceOf(UncachedValueError);
        expect(writes).length(0);
        expect(deviceEndpoint.stateOf(LevelControlServer).options).deep.equals({
            executeIfOff: true,
            coupleColorTempToLevel: false,
        });
        expect(peerEndpoint.stateOf(LevelControlClient).options.executeIfOff).true;
    });

    // Characterization: a list assigned whole is the act's own and may be changed in place
    it("writes a list an act assigns and then pushes an entry to, in one Write Request", async () => {
        await using site = new MockSite();
        const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site);
        const second = { node: NodeId(8), endpoint: EndpointNumber(3) };

        await MockTime.resolve(
            peerEndpoint.act(agent => {
                const { state } = agent.get(BindingClient);
                state.binding = [{ ...target, fabricIndex: FabricIndex.OMIT_FABRIC }];
                state.binding.push({ ...second, fabricIndex: FabricIndex.OMIT_FABRIC });
            }),
        );

        expect(writes).length(1);
        expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([
            { ...target, fabricIndex: OURS },
            { ...second, fabricIndex: OURS },
        ]);
    });

    // Characterization: assigning a complete list needs no cached value
    it("writes a list an act assigns", async () => {
        await using site = new MockSite();
        const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site);

        await MockTime.resolve(
            peerEndpoint.act(agent => {
                agent.get(BindingClient).state.binding = [{ ...target, fabricIndex: FabricIndex.OMIT_FABRIC }];
            }),
        );

        expect(writes).length(1);
        expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([
            { ...target, fabricIndex: OURS },
        ]);
        expect(entriesOf(peerEndpoint.stateOf(BindingClient).binding)).deep.equals([{ ...target, fabricIndex: OURS }]);
    });

    it("writes a list setStateOf gives in full", async () => {
        await using site = new MockSite();
        const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site);

        await MockTime.resolve(peerEndpoint.setStateOf(BindingClient, { binding: [target] }));

        expect(writes).length(1);
        expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([
            { ...target, fabricIndex: OURS },
        ]);
        expect(entriesOf(peerEndpoint.stateOf(BindingClient).binding)).deep.equals([{ ...target, fabricIndex: OURS }]);
    });

    // Characterization: setStateOf assigns a bitmap whole, as before
    it("writes the bitmap setStateOf gives", async () => {
        await using site = new MockSite();
        const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site);

        await MockTime.resolve(
            peerEndpoint.setStateOf(LevelControlClient, { options: { coupleColorTempToLevel: true } }),
        );

        expect(writes).length(1);
        expect(deviceEndpoint.stateOf(LevelControlServer).options).deep.equals({
            executeIfOff: false,
            coupleColorTempToLevel: true,
        });
    });

    it("refuses an entry the Remote API adds to the list, without writing", async () => {
        await using site = new MockSite();
        const { controller, deviceEndpoint, peerEndpoint, writes } = await peerOf(site);

        const response = await execute(controller, {
            target: "peers/peer1/1/binding/binding",
            method: "add",
            value: { node: 7, endpoint: 1 },
        });

        expect(response.kind === "error" && response.error).instanceOf(UncachedValueError);
        expect(writes).length(0);
        expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([onDevice]);
        expect(peerEndpoint.stateOf(BindingClient).binding).deep.equals([]);
    });

    describe("through the Remote API", () => {
        it("refuses a delete of an entry of the list, without writing", async () => {
            await using site = new MockSite();
            const { controller, deviceEndpoint, writes } = await peerOf(site);

            const response = await execute(controller, { target: "peers/peer1/1/binding/binding/0", method: "delete" });

            expect(response.kind === "error" && response.error).instanceOf(UncachedValueError);
            expect(writes).length(0);
            expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([onDevice]);
        });

        // Characterization: writing a complete list needs no cached value
        it("writes a list it writes in full", async () => {
            await using site = new MockSite();
            const { controller, deviceEndpoint, writes } = await peerOf(site);

            const response = await execute(controller, {
                target: "peers/peer1/1/binding/binding",
                method: "write",
                value: [{ node: 7, endpoint: 1 }],
            });

            expect(response.kind).not.equals("error");
            expect(writes).length(1);
            expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([
                { ...target, fabricIndex: OURS },
            ]);
        });
    });

    // Characterization: a cached value is changed as before
    describe("once cached", () => {
        it("writes an entry of the list an act changes a field of", async () => {
            await using site = new MockSite();
            const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site, { cached: true });

            await MockTime.resolve(
                peerEndpoint.act(agent => {
                    agent.get(BindingClient).state.binding[0].node = NodeId(10);
                }),
            );

            expect(writes).length(1);
            expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([
                { ...onDevice, node: NodeId(10) },
            ]);
        });

        it("writes a list an act splices", async () => {
            await using site = new MockSite();
            const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site, { cached: true });

            await MockTime.resolve(
                peerEndpoint.act(agent => {
                    agent
                        .get(BindingClient)
                        .state.binding.splice(0, 1, { ...target, fabricIndex: FabricIndex.OMIT_FABRIC });
                }),
            );

            expect(writes).length(1);
            expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([
                { ...target, fabricIndex: OURS },
            ]);
        });

        it("writes a list an act sets the length of", async () => {
            await using site = new MockSite();
            const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site, { cached: true });

            await MockTime.resolve(
                peerEndpoint.act(agent => {
                    agent.get(BindingClient).state.binding.length = 0;
                }),
            );

            expect(writes).length(1);
            expect(deviceEndpoint.stateOf(BindingServer).binding).deep.equals([]);
        });

        it("writes a list an act pushes an entry to", async () => {
            await using site = new MockSite();
            const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site, { cached: true });

            await MockTime.resolve(
                peerEndpoint.act(agent => {
                    agent.get(BindingClient).state.binding.push({ ...target, fabricIndex: FabricIndex.OMIT_FABRIC });
                }),
            );

            expect(writes).length(1);
            expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([
                onDevice,
                { ...target, fabricIndex: OURS },
            ]);
        });

        it("writes a list an act deletes the last entry of", async () => {
            await using site = new MockSite();
            const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site, { cached: true });

            await MockTime.resolve(
                peerEndpoint.act(agent => {
                    expect(Reflect.deleteProperty(agent.get(BindingClient).state.binding, 0)).true;
                }),
            );

            expect(writes).length(1);
            expect(deviceEndpoint.stateOf(BindingServer).binding).deep.equals([]);
            expect(peerEndpoint.stateOf(BindingClient).binding).deep.equals([]);
        });

        it("ignores a delete of an entry the cached list does not have, without writing", async () => {
            await using site = new MockSite();
            const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site, { cached: true });

            await MockTime.resolve(
                peerEndpoint.act(agent => {
                    expect(Reflect.deleteProperty(agent.get(BindingClient).state.binding, 1)).true;
                }),
            );

            expect(writes).length(0);
            expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([onDevice]);
        });

        it("writes a bitmap an act sets a flag of", async () => {
            await using site = new MockSite();
            const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site, { cached: true });

            await MockTime.resolve(
                peerEndpoint.act(agent => {
                    agent.get(LevelControlClient).state.options.coupleColorTempToLevel = true;
                }),
            );

            expect(writes).length(1);
            expect(deviceEndpoint.stateOf(LevelControlServer).options).deep.equals({
                executeIfOff: true,
                coupleColorTempToLevel: true,
            });
        });

        it("writes the bitmap setStateOf gives instead of the flags of the cached bitmap", async () => {
            await using site = new MockSite();
            const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site, { cached: true });

            await MockTime.resolve(
                peerEndpoint.setStateOf(LevelControlClient, { options: { coupleColorTempToLevel: true } }),
            );

            expect(writes).length(1);
            expect(deviceEndpoint.stateOf(LevelControlServer).options).deep.equals({
                executeIfOff: false,
                coupleColorTempToLevel: true,
            });
        });

        it("writes a list setStateOf gives in full", async () => {
            await using site = new MockSite();
            const { deviceEndpoint, peerEndpoint, writes } = await peerOf(site, { cached: true });

            await MockTime.resolve(peerEndpoint.setStateOf(BindingClient, { binding: [onDevice, target] }));

            expect(writes).length(1);
            expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([
                onDevice,
                { ...target, fabricIndex: OURS },
            ]);
        });

        it("writes an entry the Remote API adds to the list", async () => {
            await using site = new MockSite();
            const { controller, deviceEndpoint, writes } = await peerOf(site, { cached: true });

            const response = await execute(controller, {
                target: "peers/peer1/1/binding/binding",
                method: "add",
                value: { node: 7, endpoint: 1 },
            });

            expect(response.kind).not.equals("error");
            expect(writes).length(1);
            expect(entriesOf(deviceEndpoint.stateOf(BindingServer).binding)).deep.equals([
                onDevice,
                { ...target, fabricIndex: OURS },
            ]);
        });
    });
});
