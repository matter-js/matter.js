/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { BasicInformationClient } from "#behaviors/basic-information";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { ClientEventEmitter } from "#node/client/ClientEventEmitter.js";
import { ClientNodeInteraction } from "#node/client/ClientNodeInteraction.js";
import { FabricOperationInProgressError } from "#node/client/Peers.js";
import type { ClientNode } from "#node/ClientNode.js";
import {
    CrashedDependencyError,
    Crypto,
    DestroyedDependencyError,
    Lifecycle,
    MockCrypto,
    Minutes,
    Seconds,
} from "@matter/general";
import { clientStructureOf, MockSite, settled, subscribedPeer } from "@matter/node/testing";
import { PeerMessageMissingError, PeerSet, PeerUnresponsiveError, Read, ReadResult } from "@matter/protocol";
import { EndpointNumber, EventId, EventNumber, FabricIndex, Priority, TlvAny } from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";

/**
 * Replace the exact `removeFabric` the decommission path invokes, on the runtime prototype of the peer's
 * OperationalCredentialsClient facade.  Robust to per-endpoint behavior specialization.  Returns a restore fn.
 *
 * `impl` runs with `this` bound to the behavior facade (has `.endpoint` and `.context`), so it can emit a client-side
 * leave event before resolving/rejecting to mimic the device's teardown.
 */
async function patchRemoveFabric(
    peer: any,
    impl: (this: any, request: { fabricIndex: FabricIndex }) => Promise<unknown>,
) {
    const proto = await peer.act((agent: any) => Object.getPrototypeOf(agent.get(OperationalCredentialsClient)));
    const original = proto.removeFabric;
    proto.removeFabric = impl;
    return () => {
        proto.removeFabric = original;
    };
}

describe("Decommission", () => {
    before(() => {
        MockTime.init();
    });

    describe("of a peer commissioned without a structure read or subscription", () => {
        async function unstructuredPeer(site: MockSite) {
            const { controller, device } = await site.addUncommissionedPair();

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            await controller.start();
            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(
                controller.peers.commission({
                    passcode,
                    discriminator,
                    timeout: Seconds(90),
                    autoSubscribe: false,
                    autoStateInitialize: false,
                }),
                { macrotasks: true },
            );
            controllerCrypto.entropic = deviceCrypto.entropic = false;

            return { controller, device, peer: controller.peers.get("peer1")! };
        }

        async function readFabricsOnly(peer: ClientNode) {
            const fabrics = Read(
                Read.Attribute({ endpoint: peer, cluster: OperationalCredentials.Cluster, attributes: "fabrics" }),
            );
            await MockTime.resolve(
                (async () => {
                    for await (const _chunk of peer.interaction.read(fabrics));
                })(),
                { macrotasks: true },
            );
            expect(peer.behaviors.has(OperationalCredentialsClient)).true;
            expect(peer.stateOf(OperationalCredentialsClient).currentFabricIndex).equals(FabricIndex.NO_FABRIC);
        }

        it("removes it although it holds no OperationalCredentials or BasicInformation behavior", async () => {
            await using site = new MockSite();
            const { controller, device, peer } = await unstructuredPeer(site);
            expect(peer.behaviors.has(OperationalCredentialsClient)).false;
            expect(peer.behaviors.has(BasicInformationClient)).false;

            await MockTime.resolve(peer.decommission(), { macrotasks: true });

            expect(controller.peers.size).equals(0);
            expect(device.lifecycle.isCommissioned).is.false;
        });

        it("removes the fabric recorded at commissioning when the peer holds no current fabric index", async () => {
            await using site = new MockSite();
            const { controller, device, peer } = await unstructuredPeer(site);
            await readFabricsOnly(peer);

            await MockTime.resolve(peer.decommission(), { macrotasks: true });

            expect(controller.peers.size).equals(0);
            expect(device.lifecycle.isCommissioned).is.false;
        });

        it("reads the current fabric index when none was recorded at commissioning", async () => {
            await using site = new MockSite();
            const { controller, device, peer } = await unstructuredPeer(site);
            await readFabricsOnly(peer);
            await peer.setStateOf(CommissioningClient, { fabricIndexOnPeer: undefined });

            await MockTime.resolve(peer.decommission(), { macrotasks: true });

            expect(controller.peers.size).equals(0);
            expect(device.lifecycle.isCommissioned).is.false;
        });
    });

    it("removes the node when removeFabric is delivered but the response is lost", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.peerAddress!;
        expect(controller.peers.size).equals(1);

        let stubCalled = false;
        const restore = await patchRemoveFabric(peer1, async function () {
            stubCalled = true;
            // Device tore down the session keyed to our fabric before delivering NocResponse.
            throw new PeerMessageMissingError(Seconds(11));
        });

        try {
            await MockTime.resolve(peer1.decommission());
        } finally {
            restore();
        }

        expect(stubCalled).is.true;
        expect(controller.peers.size).equals(0);
        expect(controller.env.get(PeerSet).has(peerAddress)).is.false;
    });

    it("keeps the node when removeFabric is never acknowledged", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.peerAddress!;

        const restore = await patchRemoveFabric(peer1, async function () {
            // Outbound MRP ack never arrived: the device may never have received the command.
            throw new PeerUnresponsiveError(Seconds(11));
        });

        try {
            await expect(MockTime.resolve(peer1.decommission())).rejectedWith(PeerUnresponsiveError);
        } finally {
            restore();
        }

        expect(controller.peers.size).equals(1);
        expect(controller.env.get(PeerSet).has(peerAddress)).is.true;
        expect(peer1.lifecycle.isReady).is.true;
        expect(peer1.lifecycle.isReadable).is.true;
        expect(peer1.lifecycle.isGone).is.false;
    });

    it("accepts another decommission after a failed one", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const restore = await patchRemoveFabric(peer1, async function () {
            throw new PeerUnresponsiveError(Seconds(11));
        });

        try {
            await expect(MockTime.resolve(peer1.decommission())).rejectedWith(PeerUnresponsiveError);
            await expect(MockTime.resolve(peer1.decommission())).rejectedWith(PeerUnresponsiveError);
        } finally {
            restore();
        }

        expect(controller.peers.size).equals(1);
    });

    it("removes the node when a matching leave event arrives even if removeFabric rejects", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = await subscribedPeer(controller, "peer1");
        const peerAddress = peer1.peerAddress!;
        const fabricIndex = peer1.stateOf(OperationalCredentialsClient).currentFabricIndex;

        let decommissioned = 0;
        peer1.lifecycle.decommissioned.on(() => void decommissioned++);
        let destroyed = 0;
        peer1.lifecycle.destroyed.on(() => void destroyed++);

        const restore = await patchRemoveFabric(peer1, async function () {
            // Device emits leave as a side effect of removal, then never acks our request.
            this.endpoint.eventsOf(BasicInformationClient).leave.emit({ fabricIndex }, this.context);
            throw new PeerUnresponsiveError(Seconds(11));
        });

        try {
            await MockTime.resolve(peer1.decommission());
        } finally {
            restore();
        }

        await MockTime.resolve(settled(controller));

        expect(controller.peers.size).equals(0);
        expect(controller.env.get(PeerSet).has(peerAddress)).is.false;
        expect(decommissioned).equals(1);
        expect(destroyed).equals(1);
    });

    it("does not treat a leave for a different fabric as confirmation", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = await subscribedPeer(controller, "peer1");
        const peerAddress = peer1.peerAddress!;
        const fabricIndex = peer1.stateOf(OperationalCredentialsClient).currentFabricIndex;
        const otherFabricIndex = FabricIndex(fabricIndex + 1);

        const restore = await patchRemoveFabric(peer1, async function () {
            this.endpoint.eventsOf(BasicInformationClient).leave.emit({ fabricIndex: otherFabricIndex }, this.context);
            throw new PeerUnresponsiveError(Seconds(11));
        });

        try {
            await expect(MockTime.resolve(peer1.decommission())).rejectedWith(PeerUnresponsiveError);
        } finally {
            restore();
        }

        expect(controller.peers.size).equals(1);
        expect(controller.env.get(PeerSet).has(peerAddress)).is.true;
    });

    it("keeps the node and throws when removeFabric returns a non-Ok status, even if a leave arrives", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = await subscribedPeer(controller, "peer1");
        const fabricIndex = peer1.stateOf(OperationalCredentialsClient).currentFabricIndex;

        const restore = await patchRemoveFabric(peer1, async function () {
            // A stale/racing leave for our own fabric must NOT rescue an explicit refusal.
            this.endpoint.eventsOf(BasicInformationClient).leave.emit({ fabricIndex }, this.context);
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.InvalidFabricIndex,
                debugText: "no such fabric",
            };
        });

        try {
            await expect(MockTime.resolve(peer1.decommission())).rejectedWith(/failed with status/);
        } finally {
            restore();
        }

        await MockTime.resolve(settled(controller));

        expect(controller.peers.size).equals(1);
        expect(peer1.lifecycle.isReadable).is.true;
    });

    it("probe resolves false on a destroyed node instead of throwing", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const interaction = peer1.interaction as ClientNodeInteraction;

        const restore = await patchRemoveFabric(peer1, async function () {
            throw new PeerMessageMissingError(Seconds(11));
        });
        try {
            await MockTime.resolve(peer1.decommission());
        } finally {
            restore();
        }

        // Node is now destroyed; a late monitor probe must not throw.
        const reachable = await MockTime.resolve(interaction.probe());
        expect(reachable).is.false;
    });

    it("rejects a decommission while one is in progress", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const restore = await patchRemoveFabric(peer1, async function () {
            throw new PeerMessageMissingError(Seconds(11));
        });

        try {
            const first = peer1.decommission();
            await expect(MockTime.resolve(peer1.decommission())).rejectedWith(
                FabricOperationInProgressError,
                /a decommission attempt is already in progress/,
            );
            await MockTime.resolve(first);
        } finally {
            restore();
        }

        expect(controller.peers.size).equals(0);
    });

    it("rejects a decommission of a node that is being deleted", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const deleting = peer1.delete();

        await expect(MockTime.resolve(peer1.decommission())).rejectedWith(
            DestroyedDependencyError,
            /is closing or being deleted/,
        );
        await MockTime.resolve(deleting);
    });

    it("rejects a decommission queued behind a leave that deletes the node", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = await subscribedPeer(controller, "peer1");
        const fabricIndex = peer1.stateOf(OperationalCredentialsClient).currentFabricIndex;

        peer1.eventsOf(BasicInformationClient).leave.emit({ fabricIndex }, LocalActorContext.ReadOnly);
        await expect(MockTime.resolve(peer1.decommission())).rejectedWith(
            DestroyedDependencyError,
            /is closing or being deleted/,
        );

        expect(controller.peers.size).equals(0);
    });

    it("rejects a decommission of a deleted node", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        await MockTime.resolve(peer1.delete());

        await expect(MockTime.resolve(peer1.decommission())).rejectedWith(
            DestroyedDependencyError,
            /is closing or being deleted/,
        );
    });

    it("rejects a commission while a decommission is in progress", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        let release!: () => void;
        const released = new Promise<void>(resolve => (release = resolve));
        const restore = await patchRemoveFabric(peer1, async function () {
            await released;
            throw new PeerMessageMissingError(Seconds(11));
        });

        const decommissioning = peer1.decommission();
        try {
            const { passcode } = device.state.commissioning;
            await expect(MockTime.resolve(peer1.commission({ passcode }))).rejectedWith(
                FabricOperationInProgressError,
                /a decommission attempt is already in progress/,
            );
        } finally {
            release();
            try {
                await MockTime.resolve(decommissioning);
            } finally {
                restore();
            }
        }

        expect(controller.peers.size).equals(0);
    });

    for (const { removed, failure } of [
        { removed: true, failure: () => new PeerMessageMissingError(Seconds(11)) },
        { removed: false, failure: () => new PeerUnresponsiveError(Seconds(11)) },
    ]) {
        it(`waits for a running decommission before handing out a node (${removed ? "removed" : "kept"})`, async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();

            const peer1 = controller.peers.get("peer1")!;
            const { deviceIdentifier } = peer1.state.commissioning;
            expect(deviceIdentifier).not.undefined;

            let release!: () => void;
            const released = new Promise<void>(resolve => (release = resolve));
            let removing!: () => void;
            const removalSent = new Promise<void>(resolve => (removing = resolve));
            let answered = false;
            const restore = await patchRemoveFabric(peer1, async function () {
                removing();
                await released;
                answered = true;
                throw failure();
            });

            const decommissioning = peer1.decommission().catch(() => {});
            let found: ClientNode | undefined;
            let foundAfterAnswer: boolean | undefined;
            let lookupError: unknown;
            let finding: Promise<void> | undefined;
            try {
                await MockTime.resolve(removalSent);
                finding = controller.peers.forDescriptor({ deviceIdentifier }).then(
                    node => {
                        found = node;
                        foundAfterAnswer = answered;
                    },
                    error => void (lookupError = error),
                );
                release();
                await MockTime.resolve(decommissioning);
                await MockTime.resolve(finding);
            } finally {
                release();
                restore();
            }

            expect(lookupError).undefined;
            expect(foundAfterAnswer).is.true;
            expect(controller.peers.size).equals(1);
            if (removed) {
                expect(found).not.equals(peer1);
            } else {
                expect(found).equals(peer1);
            }
        });
    }

    it("rejects a decommission while a commission is in progress", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        let release!: () => void;
        const released = new Promise<void>(resolve => (release = resolve));
        const commissioning = controller.peers.runCommissioning(peer1, () => released);

        try {
            await expect(MockTime.resolve(peer1.decommission())).rejectedWith(
                FabricOperationInProgressError,
                /a commission attempt is already in progress/,
            );
        } finally {
            release();
            await MockTime.resolve(commissioning);
        }

        expect(peer1.lifecycle.isReadable).is.true;
    });

    it("rejects a commission of a deleted node", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        await MockTime.resolve(peer1.delete());

        const { passcode } = device.state.commissioning;
        await expect(MockTime.resolve(peer1.commission({ passcode }))).rejectedWith(
            DestroyedDependencyError,
            /is closing or being deleted/,
        );
    });

    it("rejects a decommission of a crashed node with its lifecycle error", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        peer1.construction.setStatus(Lifecycle.Status.Crashed);

        await expect(MockTime.resolve(peer1.decommission())).rejectedWith(CrashedDependencyError, /crashed/);
    });

    it("rejects a commission of a crashed node with its lifecycle error", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        peer1.construction.setStatus(Lifecycle.Status.Crashed);

        const { passcode } = device.state.commissioning;
        await expect(MockTime.resolve(peer1.commission({ passcode }))).rejectedWith(CrashedDependencyError, /crashed/);
    });

    it("rejects a commission attempt registered for a crashed node", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        peer1.construction.setStatus(Lifecycle.Status.Crashed);

        let ran = false;
        await expect(
            MockTime.resolve(
                controller.peers.runCommissioning(peer1, () => {
                    ran = true;
                }),
            ),
        ).rejectedWith(CrashedDependencyError, /crashed/);
        expect(ran).false;
    });

    it("does not cull the node while its decommission deletes it", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const restore = await patchRemoveFabric(peer1, async function () {
            throw new PeerMessageMissingError(Seconds(11));
        });

        // Hold the decommission between clearing the peer address and deleting the node
        let deletes = 0;
        let release!: () => void;
        const released = new Promise<void>(resolve => (release = resolve));
        const deleteNode = peer1.delete.bind(peer1);
        peer1.delete = async () => {
            deletes++;
            await released;
            await deleteNode();
        };

        try {
            const decommissioning = peer1.decommission();
            await MockTime.advance(Minutes(20));
            release();
            await MockTime.resolve(decommissioning);
        } finally {
            peer1.delete = deleteNode;
            restore();
        }

        expect(deletes).equals(1);
        expect(controller.peers.size).equals(0);
    });

    it("reports the node gone as soon as its deletion begins", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const deleting = peer1.delete();

        expect(peer1.lifecycle.isGone).is.true;
        await MockTime.resolve(deleting);
    });

    it("rejects acting on a node whose deletion has begun instead of restarting it", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        let actError: unknown;
        let acted = false;
        const statuses = new Array<Lifecycle.Status>();
        peer1.construction.change.on(status => {
            statuses.push(status);
            if (status === Lifecycle.Status.Inactive && !acted) {
                acted = true;
                try {
                    peer1.act(() => {});
                } catch (error) {
                    actError = error;
                }
            }
        });

        await MockTime.resolve(peer1.delete());

        expect(acted).is.true;
        expect(actError).instanceOf(DestroyedDependencyError);
        expect(statuses).not.include(Lifecycle.Status.Initializing);
        expect(controller.peers.size).equals(0);
    });

    it("ignores an event that arrives for a node while it is deleted", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const fabricIndex = peer1.stateOf(OperationalCredentialsClient).currentFabricIndex;
        const emit = ClientEventEmitter(peer1, clientStructureOf(peer1));
        const leave: ReadResult.EventValue = {
            kind: "event-value",
            path: {
                endpointId: EndpointNumber(0),
                clusterId: BasicInformation.id,
                eventId: EventId(BasicInformation.events.leave.id),
            },
            number: EventNumber(1_000),
            timestamp: 1_000,
            priority: Priority.Info,
            value: { fabricIndex },
            tlv: TlvAny,
        };

        let delivering: Promise<void> | undefined;
        peer1.construction.change.on(status => {
            if (status === Lifecycle.Status.Inactive && delivering === undefined) {
                delivering = emit(leave);
            }
        });

        await MockTime.resolve(peer1.delete());

        expect(delivering).not.undefined;
        await MockTime.resolve(delivering!);
        expect(controller.peers.size).equals(0);
    });
});
