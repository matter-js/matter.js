/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient } from "#behaviors/on-off";
import { OnOffLightSwitchDevice } from "#devices/on-off-light-switch";
import { Endpoint } from "#endpoint/Endpoint.js";
import { InvalidGroupOperationError } from "#node/client/ClientGroupInteraction.js";
import { ClientStructure } from "#node/client/ClientStructure.js";
import { ClientGroup } from "#node/ClientGroup.js";
import { ClientNode } from "#node/ClientNode.js";
import { Lifecycle } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { EndpointNumber, GroupId, NodeId } from "@matter/types";

async function groupWithEndpoint() {
    const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
    const fabric = await node.addFabric();
    const group = await node.peers.forAddress({
        fabricIndex: fabric.fabricIndex,
        nodeId: NodeId.fromGroupId(GroupId(7)),
    });
    expect(group).instanceof(ClientGroup);
    const endpoint = group.endpoints.require(1);
    endpoint.behaviors.require(OnOffClient);
    await endpoint.construction.ready;
    return { node, group, endpoint };
}

async function applyOnOff(group: ClientNode, endpoint: Endpoint, onOff: boolean) {
    const changed = new Promise<boolean>(resolve => endpoint.eventsOf(OnOffClient).onOff$Changed.once(resolve));
    await group.env.get(ClientStructure).applyWireChanges([
        {
            kind: "update",
            node: group.id,
            endpoint: EndpointNumber(1),
            version: 2,
            behavior: "onOff",
            changes: { onOff },
        },
    ]);
    expect(await changed).equals(onOff);
    expect(endpoint.stateOf(OnOffClient).onOff).equals(onOff);
}

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

    it("resolves the number of a deleted endpoint to a new endpoint that applies changes", async () => {
        const { node, group, endpoint } = await groupWithEndpoint();
        await using _node = node;

        await endpoint.delete();

        expect(endpoint.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(group.parts.size).equals(0);
        const required = group.endpoints.require(1);
        required.behaviors.require(OnOffClient);
        await required.construction.ready;
        expect(required).not.equals(endpoint);
        expect(required.stateOf(OnOffClient)).not.undefined;
        expect(group.env.get(ClientStructure).endpointFor(EndpointNumber(1))).equals(required);
        await applyOnOff(group, required, true);
    });

    it("applies a change to an endpoint after its erase", async () => {
        const { node, group, endpoint } = await groupWithEndpoint();
        await using _node = node;

        await endpoint.erase();

        await applyOnOff(group, endpoint, true);
    });

    it("erases and closes an endpoint", async () => {
        const { node, group, endpoint } = await groupWithEndpoint();
        await using _node = node;

        await endpoint.erase();

        expect(endpoint.construction.status).equals(Lifecycle.Status.Active);
        expect(endpoint.stateOf(OnOffClient)).not.undefined;

        await endpoint.close();

        expect(endpoint.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(group.parts.size).equals(0);
    });

    it("keeps its endpoints on erase", async () => {
        const { node, group, endpoint } = await groupWithEndpoint();
        await using _node = node;

        await group.erase();

        expect(endpoint.construction.status).equals(Lifecycle.Status.Active);
        expect(group.endpoints.require(1)).equals(endpoint);
        expect(endpoint.stateOf(OnOffClient)).not.undefined;
    });
});
