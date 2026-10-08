/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningController } from "#CommissioningController.js";
import { NodeStateInformation, NodeStates, PairedNode } from "#device/PairedNode.js";
import { ImplementationError, Lifecycle, MatterAggregateError, MatterError, Seconds, Time } from "@matter/general";
import { ChangeNotificationService, ClusterBehavior, NetworkClient, Node, ServerNode } from "@matter/node";
import { OnOffServer } from "@matter/node/behaviors/on-off";
import { settled } from "@matter/node/testing";
import { LegacyControllerSite } from "../util/LegacyControllerSite.js";

class StateCallbackError extends MatterError {}
class HandlerError extends MatterError {}

function activeSubscriptionsOf(device: ServerNode) {
    return Object.values(device.state.sessions.sessions).reduce(
        (count, { numberOfActiveSubscriptions }) => count + numberOfActiveSubscriptions,
        0,
    );
}

function networkOf(node: PairedNode) {
    return node.node.stateOf(NetworkClient);
}

/**
 * Waits until work the node started has finished, including interactions with the device that node activity does not
 * track.
 */
async function idle(controller: CommissioningController, node: PairedNode) {
    await settled(controller.node, node.node);
    await MockTime.resolve(Time.sleep("idle", Seconds(5)), { macrotasks: true });
    await settled(controller.node, node.node);
}

/**
 * Whether the change carries data read from the device: endpoints becoming readable or cluster attributes updating.
 */
function isReadDataOf(node: PairedNode, change: ChangeNotificationService.Change) {
    if (Node.forEndpoint(change.endpoint).id !== node.id) {
        return false;
    }
    return change.kind === "readable" || (change.kind === "update" && ClusterBehavior.is(change.behavior));
}

function countReadDataOf(controller: CommissioningController, node: PairedNode) {
    const counter = { changes: 0 };
    controller.node.env.get(ChangeNotificationService).change.on(change => {
        if (isReadDataOf(node, change)) {
            counter.changes++;
        }
    });
    return counter;
}

describe("PairedNode close", () => {
    before(() => {
        MockTime.init();
    });

    describe("while a connect is in flight", () => {
        it("does not activate the subscription", async () => {
            await using site = new LegacyControllerSite();
            const { controller, nodeId } = await site.addCommissionedPair();
            const node = await MockTime.resolve(controller.getNode(nodeId), { macrotasks: true });

            node.connect({ subscribeMaxIntervalCeilingSeconds: 60 });
            node.close();
            await idle(controller, node);

            expect(networkOf(node).autoSubscribe).false;
            expect(node.connectionState).equals(NodeStates.Disconnected);
        });

        it("does not re-enable a disconnected node", async () => {
            await using site = new LegacyControllerSite();
            const { controller, nodeId } = await site.addCommissionedPair();
            const node = await MockTime.resolve(controller.getNode(nodeId), { macrotasks: true });
            await MockTime.resolve(node.disconnect(), { macrotasks: true });
            expect(networkOf(node).isDisabled).true;

            node.connect({ subscribeMaxIntervalCeilingSeconds: 60 });
            node.close();
            await idle(controller, node);

            expect(networkOf(node).isDisabled).true;
            expect(networkOf(node).autoSubscribe).false;
        });

        it("does not start the read-only initialization once enabling the node completes", async () => {
            await using site = new LegacyControllerSite();
            const { controller, nodeId } = await site.addCommissionedPair();
            const node = await MockTime.resolve(controller.getNode(nodeId), { macrotasks: true });
            await MockTime.resolve(node.disconnect(), { macrotasks: true });
            await idle(controller, node);

            let closedWhileEnabling = false;
            node.node.eventsOf(NetworkClient).isDisabled$Changed.on(isDisabled => {
                if (!isDisabled) {
                    closedWhileEnabling = true;
                    node.close();
                }
            });
            const counter = countReadDataOf(controller, node);

            node.connect({ autoSubscribe: false });
            await idle(controller, node);

            expect(closedWhileEnabling).true;
            expect(counter.changes).equals(0);
            expect(node.remoteInitializationDone).false;
        });
    });

    describe("while a reconnect is in flight", () => {
        it("does not activate the subscription", async () => {
            await using site = new LegacyControllerSite();
            const { controller, nodeId } = await site.addCommissionedPair();
            const node = await MockTime.resolve(controller.getNode(nodeId), { macrotasks: true });

            const reconnecting = node.reconnect();
            node.close();
            await MockTime.resolve(reconnecting, { macrotasks: true });
            await idle(controller, node);

            expect(networkOf(node).autoSubscribe).false;
        });
    });

    describe("with autoSubscribe disabled", () => {
        it("does not complete an initializing read that was in flight", async () => {
            await using site = new LegacyControllerSite();
            const { controller, nodeId } = await site.addCommissionedPair();
            const node = await MockTime.resolve(controller.getNode(nodeId), { macrotasks: true });

            const emitted = new Array<string>();
            node.events.initialized.on(() => void emitted.push("initialized"));
            node.events.initializedFromRemote.on(() => void emitted.push("initializedFromRemote"));

            let closedDuringRead = false;
            const changes = controller.node.env.get(ChangeNotificationService).change;
            const closeOnFirstChange = (change: ChangeNotificationService.Change) => {
                if (isReadDataOf(node, change)) {
                    changes.off(closeOnFirstChange);
                    closedDuringRead = true;
                    node.close();
                }
            };
            changes.on(closeOnFirstChange);

            node.connect({ autoSubscribe: false });
            await idle(controller, node);

            expect(closedDuringRead).true;
            expect(emitted).deep.equals([]);
            expect(node.remoteInitializationDone).false;
            expect(node.connectionState).equals(NodeStates.Disconnected);
        });
    });

    describe("of a subscribed node", () => {
        it("ends the subscription, also on the device", async () => {
            await using site = new LegacyControllerSite();
            const { controller, device, nodeId } = await site.addCommissionedPair();
            const node = await MockTime.resolve(controller.connectNode(nodeId), { macrotasks: true });
            await MockTime.resolve(node.events.initialized, { macrotasks: true });
            expect(activeSubscriptionsOf(device)).equals(1);

            node.close();
            await idle(controller, node);
            const [light] = device.parts;
            await MockTime.resolve(light.setStateOf(OnOffServer, { onOff: true }), { macrotasks: true });
            await idle(controller, node);

            expect(node.node.behaviors.internalsOf(NetworkClient).activeSubscription).undefined;
            expect(activeSubscriptionsOf(device)).equals(0);
            expect(networkOf(node).autoSubscribe).true;
        });

        it("finishes closing when a decommissioned handler throws", async () => {
            await using site = new LegacyControllerSite();
            const { controller, nodeId } = await site.addCommissionedPair();
            const node = await MockTime.resolve(controller.getNode(nodeId), { macrotasks: true });

            node.events.decommissioned.on(() => {
                throw new HandlerError("decommissioned handler failed");
            });

            node.close(true);
            await idle(controller, node);

            expect(node.isClosed).true;
            expect(node.connectionState).equals(NodeStates.Disconnected);
            expect(node.construction.status).equals(Lifecycle.Status.Destroyed);
        });

        it("is replaced by a new instance on the next getNode()", async () => {
            await using site = new LegacyControllerSite();
            const { controller, nodeId } = await site.addCommissionedPair();
            const node = await MockTime.resolve(controller.connectNode(nodeId), { macrotasks: true });
            await MockTime.resolve(node.events.initialized, { macrotasks: true });

            node.close();
            const next = await MockTime.resolve(controller.getNode(nodeId), { macrotasks: true });

            expect(next).not.equals(node);
            expect(next.isClosed).false;
        });
    });

    describe("then connect() and reconnect()", () => {
        it("do nothing", async () => {
            await using site = new LegacyControllerSite();
            const { controller, nodeId } = await site.addCommissionedPair();
            const node = await MockTime.resolve(controller.connectNode(nodeId), { macrotasks: true });
            await MockTime.resolve(node.events.initialized, { macrotasks: true });
            expect(networkOf(node).autoSubscribe).true;
            const defaultSubscription = networkOf(node).defaultSubscription;

            node.close();

            node.connect({ subscribeMaxIntervalCeilingSeconds: 3600 });
            await MockTime.resolve(node.reconnect(), { macrotasks: true });
            await idle(controller, node);

            expect(networkOf(node).autoSubscribe).true;
            expect(networkOf(node).defaultSubscription).deep.equals(defaultSubscription);
            expect(node.connectionState).equals(NodeStates.Disconnected);
        });
    });
});

describe("CommissioningController close", () => {
    before(() => {
        MockTime.init();
    });

    it("removes a node although closing its paired node fails", async () => {
        await using site = new LegacyControllerSite();
        const { controller, nodeId } = await site.addCommissionedPair();
        await MockTime.resolve(
            controller.connectNode(nodeId, {
                autoConnect: false,
                stateInformationCallback: (_nodeId, state) => {
                    if (state === NodeStateInformation.Decommissioned) {
                        throw new StateCallbackError("State callback failed");
                    }
                },
            }),
            { macrotasks: true },
        );

        let removeError: unknown;
        try {
            await MockTime.resolve(controller.removeNode(nodeId, false), { macrotasks: true });
        } catch (error) {
            removeError = error;
        }

        expect(removeError).instanceOf(MatterAggregateError);
        expect(controller.getCommissionedNodes()).not.contains(nodeId);
    });

    it("closes the controller node and allows a restart when closing a paired node fails", async () => {
        await using site = new LegacyControllerSite();
        const { controller, nodeId } = await site.addCommissionedPair();

        let failOnDisconnect = true;
        const node = await MockTime.resolve(
            controller.connectNode(nodeId, {
                autoConnect: false,
                stateInformationCallback: (_nodeId, state) => {
                    if (failOnDisconnect && state === NodeStateInformation.Disconnected) {
                        throw new StateCallbackError("State callback failed");
                    }
                },
            }),
            { macrotasks: true },
        );
        const serverNode = controller.node;

        let closeError: unknown;
        try {
            await MockTime.resolve(controller.close(), { macrotasks: true });
        } catch (error) {
            closeError = error;
        }
        failOnDisconnect = false;

        expect(serverNode.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(node.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(closeError).instanceOf(MatterAggregateError);
        expect(() => controller.node).throws(ImplementationError);

        await MockTime.resolve(controller.start(), { macrotasks: true });

        expect(controller.node).not.equals(serverNode);
        expect(controller.node.lifecycle.isOnline).true;
    });
});
