/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DesiredStateBehavior } from "#behavior/system/desired-state/DesiredStateBehavior.js";
import { AclCapacityExceededError } from "#behavior/system/desired-state/errors.js";
import { ManagedItem } from "#behavior/system/desired-state/types.js";
import { MockEndpoint } from "../../../endpoint/mock-endpoint.js";

describe("DesiredStateBehavior", () => {
    it("setIntent creates a pending item and emits itemChanged", async () => {
        await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
        await endpoint.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            const events = new Array<ManagedItem>();
            ds.events.itemChanged.on(item => {
                events.push(item);
            });

            const item = ds.setIntent("acl", "1", { privilege: 5 }, "converge");

            expect(item.status.state).equals("pending");
            expect(item.mode).equals("converge");
            expect(ds.getItem("acl", "1")?.intent).deep.equals({ privilege: 5 });
            expect(events.length).equals(1);
            expect(events[0].kind).equals("acl");
        });
    });

    it("setIntent defaults mode to converge and re-pends on update", async () => {
        await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
        await endpoint.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("nodeLabel", "0", "Kitchen");
            expect(ds.getItem("nodeLabel", "0")?.mode).equals("converge");
            ds.updateStatus("nodeLabel", "0", "committed");
            expect(ds.getItem("nodeLabel", "0")?.status.state).equals("committed");
            ds.setIntent("nodeLabel", "0", "Living Room");
            expect(ds.getItem("nodeLabel", "0")?.status.state).equals("pending");
            expect(ds.getItem("nodeLabel", "0")?.intent).equals("Living Room");
        });
    });

    it("removeIntent marks the item deletePending", async () => {
        await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
        await endpoint.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("binding", "7", { node: 2 });
            ds.removeIntent("binding", "7");
            expect(ds.getItem("binding", "7")?.status.state).equals("deletePending");
        });
    });

    it("dropItem removes the item and emits itemRemoved", async () => {
        await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
        await endpoint.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("binding", "7", { node: 2 });
            const removed = new Array<string>();
            ds.events.itemRemoved.on((kind, key) => {
                removed.push(`${kind}/${key}`);
            });
            ds.dropItem("binding", "7");
            expect(ds.getItem("binding", "7")).equals(undefined);
            expect(removed).deep.equals(["binding/7"]);
        });
    });

    it("query helpers filter by kind", async () => {
        await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
        await endpoint.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("acl", "1", {});
            ds.setIntent("acl", "2", {});
            ds.setIntent("binding", "1", {});
            expect(ds.allItems().length).equals(3);
            expect(ds.itemsByKind("acl").length).equals(2);
        });
    });

    it("assertCanAdd enforces the capacity cache", async () => {
        await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
        await endpoint.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setCapacity("acl", { limit: 4, used: 3 });
            expect(ds.getCapacity("acl")).deep.equals({ limit: 4, used: 3 });
            expect(() => ds.assertCanAdd("acl", 1)).not.throws();
            expect(() => ds.assertCanAdd("acl", 2)).throws(AclCapacityExceededError);
        });
    });
});
