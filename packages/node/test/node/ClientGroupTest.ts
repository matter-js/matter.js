/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { Internal } from "#behavior/state/managed/Internal.js";
import { BasicInformationClient } from "#behaviors/basic-information";
import { BindingClient } from "#behaviors/binding";
import { LevelControlClient } from "#behaviors/level-control";
import { OnOffClient } from "#behaviors/on-off";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { InvalidGroupOperationError } from "#node/client/ClientGroupInteraction.js";
import { ClientGroup } from "#node/ClientGroup.js";
import { MaybePromise } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { Write } from "@matter/protocol";
import { EndpointNumber, FabricIndex, GroupId, NodeId } from "@matter/types";

describe("ClientGroup", () => {
    it("throws InvalidGroupOperationError on get()", async () => {
        // get() throws before accessing instance state, so we can exercise it via prototype
        const group = Object.create(ClientGroup.prototype) as ClientGroup;
        let threw = false;
        try {
            await group.get();
        } catch (e) {
            threw = true;
            expect(e).to.be.instanceof(InvalidGroupOperationError);
            expect((e as Error).message).to.equal("Groups do not support reading attributes");
        }
        expect(threw).to.be.true;
    });

    it("throws InvalidGroupOperationError on getStateOf()", async () => {
        const group = Object.create(ClientGroup.prototype) as ClientGroup;
        let threw = false;
        try {
            await group.getStateOf("someCluster");
        } catch (e) {
            threw = true;
            expect(e).to.be.instanceof(InvalidGroupOperationError);
            expect((e as Error).message).to.equal("Groups do not support reading attributes");
        }
        expect(threw).to.be.true;
    });

    describe("state write on a group endpoint", () => {
        /**
         * Runs {@link write} on endpoint 1 of a group with {@link type} active, and returns what it rejected with, the
         * Write Requests the group sent and the state of {@link type} before and after.
         */
        async function writeOnGroup(type: ClusterBehavior.Type, write: (endpoint: Endpoint) => MaybePromise) {
            const node = await MockServerNode.createOnline();
            try {
                const fabric = await node.addFabric();
                const group = await node.peers.forAddress({
                    fabricIndex: fabric.fabricIndex,
                    nodeId: NodeId.fromGroupId(GroupId(5)),
                });
                if (!(group instanceof ClientGroup)) {
                    expect.fail("Expected a group node");
                }
                const writes = new Array<Write>();
                const { interaction } = group;
                const send = interaction.write.bind(interaction);
                interaction.write = <T extends Write>(request: T) => {
                    writes.push(request);
                    return send(request);
                };

                const endpoint = group.endpoints.require(1);
                endpoint.behaviors.require(type);
                const before = Internal.copy(endpoint.stateOf(type));

                let caught: unknown;
                try {
                    await MockTime.resolve(Promise.resolve(write(endpoint)));
                } catch (e) {
                    caught = e;
                }
                return { caught, writes, before, after: Internal.copy(endpoint.stateOf(type)) };
            } finally {
                await node.close();
            }
        }

        const undefinedEnumValue: number = 9;
        const entry = { node: NodeId(5), endpoint: EndpointNumber(1), fabricIndex: FabricIndex(2) };

        for (const { label, type, write } of [
            {
                label: "a value a non-group node's local model refuses",
                type: OnOffClient,
                write: (endpoint: Endpoint) =>
                    endpoint.act(agent => {
                        agent.get(OnOffClient).state.startUpOnOff = undefinedEnumValue;
                    }),
            },
            {
                label: "a value a non-group node's local model accepts",
                type: LevelControlClient,
                write: (endpoint: Endpoint) => endpoint.setStateOf(LevelControlClient, { onLevel: 5 }),
            },
            {
                label: "a list assigned in an act",
                type: BindingClient,
                write: (endpoint: Endpoint) =>
                    endpoint.act(agent => {
                        agent.get(BindingClient).state.binding = [entry];
                    }),
            },
            {
                label: "a list given in full to setStateOf",
                type: BindingClient,
                write: (endpoint: Endpoint) => endpoint.setStateOf(BindingClient, { binding: [entry] }),
            },
            {
                label: "a list an act pushes an entry to",
                type: BindingClient,
                write: (endpoint: Endpoint) =>
                    endpoint.act(agent => {
                        agent.get(BindingClient).state.binding.push(entry);
                    }),
            },
            {
                label: "a delete of a list entry",
                type: BindingClient,
                write: (endpoint: Endpoint) =>
                    endpoint.act(agent => {
                        Reflect.deleteProperty(agent.get(BindingClient).state.binding, 0);
                    }),
            },
            {
                label: "a bitmap an act sets a flag of",
                type: LevelControlClient,
                write: (endpoint: Endpoint) =>
                    endpoint.act(agent => {
                        agent.get(LevelControlClient).state.options.executeIfOff = true;
                    }),
            },
            {
                label: "a struct an act sets a field of",
                type: BasicInformationClient,
                write: (endpoint: Endpoint) =>
                    endpoint.act(agent => {
                        agent.get(BasicInformationClient).state.capabilityMinima.caseSessionsPerFabric = 4;
                    }),
            },
            {
                label: "a struct given to setStateOf",
                type: BasicInformationClient,
                write: (endpoint: Endpoint) =>
                    endpoint.setStateOf(BasicInformationClient, {
                        capabilityMinima: { caseSessionsPerFabric: 4, subscriptionsPerFabric: 4 },
                    }),
            },
        ]) {
            it(`refuses ${label} as a group operation without sending or storing anything`, async () => {
                const { caught, writes, before, after } = await writeOnGroup(type, write);

                expect(caught).instanceOf(InvalidGroupOperationError);
                expect(String(caught)).contains("use group.interaction.write() with a group path");
                expect(writes).length(0);
                expect(after).deep.equals(before);
            });
        }
    });
});
