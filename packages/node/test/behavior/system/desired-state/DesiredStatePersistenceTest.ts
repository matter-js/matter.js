/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DesiredStateBehavior } from "#behavior/system/desired-state/DesiredStateBehavior.js";
import { ClientNode } from "#node/ClientNode.js";
import { Environment, Timestamp } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";

describe("DesiredState integration", () => {
    it("is mounted on every ClientNode", () => {
        expect(ClientNode.RootEndpoint.behaviors.desiredState).equals(DesiredStateBehavior);
    });

    it("persists intent across a node restart", async () => {
        const environment = new Environment("test");
        const RootEndpoint = MockServerNode.RootEndpoint.with(DesiredStateBehavior);

        const node1 = await MockServerNode.create(RootEndpoint, { environment, id: "testnode" });
        await node1.act(agent => {
            agent.get(DesiredStateBehavior).setIntent("acl", "1", { privilege: 5 }, "converge");
        });
        await node1.close();

        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "testnode" });
        await node2.act(agent => {
            const item = agent.get(DesiredStateBehavior).getItem("acl", "1");
            expect(item?.intent).deep.equals({ privilege: 5 });
            expect(item?.status.state).equals("pending");
        });
        await node2.close();
    });

    it("does NOT persist capacities across a restart", async () => {
        const environment = new Environment("test");
        const RootEndpoint = MockServerNode.RootEndpoint.with(DesiredStateBehavior);

        const node1 = await MockServerNode.create(RootEndpoint, { environment, id: "captest" });
        await node1.act(agent => {
            agent.get(DesiredStateBehavior).setCapacity("acl", { limit: 4, used: 3 });
        });
        await node1.close();

        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "captest" });
        await node2.act(agent => {
            expect(agent.get(DesiredStateBehavior).getCapacity("acl")).equals(undefined);
        });
        await node2.close();
    });

    it("does NOT persist drift marks across a restart", async () => {
        const environment = new Environment("test");
        const RootEndpoint = MockServerNode.RootEndpoint.with(DesiredStateBehavior);

        const node1 = await MockServerNode.create(RootEndpoint, { environment, id: "drifttest" });
        await node1.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("acl", "1", { privilege: 5 }, "maintain");
            ds.updateStatus("acl", "1", "committed");
            ds.markDrift("acl", "1", { confirmedAt: Timestamp(1000), disposition: "recorded" });
            expect(ds.driftOf("acl", "1")?.disposition).equals("recorded");
        });
        await node1.close();

        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "drifttest" });
        await node2.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            expect(ds.getItem("acl", "1")).not.equals(undefined);
            expect(ds.driftOf("acl", "1")).equals(undefined);
        });
        await node2.close();
    });
});
