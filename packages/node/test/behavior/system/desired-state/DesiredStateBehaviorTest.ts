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

    it("dropItem removes the item and says how it ended", async () => {
        await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
        await endpoint.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("binding", "7", { node: 2 });
            const concluded = new Array<string>();
            ds.events.itemConcluded.on((kind, key, conclusion) => {
                concluded.push(`${kind}/${key}/${conclusion.outcome}`);
            });
            ds.dropItem("binding", "7", { outcome: "removed" });
            expect(ds.getItem("binding", "7")).equals(undefined);
            expect(concluded).deep.equals(["binding/7/removed"]);
        });
    });

    it("distinguishes an item it gave up on from one that was removed", async () => {
        await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
        await endpoint.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("binding", "7", { node: 2 });
            let seen: { outcome: string; reason?: string } | undefined;
            ds.events.itemConcluded.on((_kind, _key, conclusion) => {
                seen = conclusion;
            });
            // Absence is the same either way, which is why the conclusion carries the difference.
            ds.dropItem("binding", "7", { outcome: "abandoned", reason: "the device refused it", failureCode: 133 });
            expect(seen?.outcome).equals("abandoned");
            expect(seen?.reason).equals("the device refused it");
        });
    });

    it("counts a new intent as a new thing to converge, whatever its value", async () => {
        await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
        await endpoint.act(agent => {
            const ds = agent.get(DesiredStateBehavior);

            // The same value twice, and the same object twice: neither tells a slow apply that what it is
            // working on has been replaced, which is why the count exists rather than a comparison.
            const shared = { node: 2 };
            const first = ds.setIntent("binding", "7", shared).generation;
            const second = ds.setIntent("binding", "7", shared).generation;
            expect(second).greaterThan(first);

            const primitive = ds.setIntent("counter", "1", 5).generation;
            expect(ds.setIntent("counter", "1", 5).generation).greaterThan(primitive);

            // A status write is not a new intent.
            const before = ds.getItem("binding", "7")?.generation;
            ds.updateStatus("binding", "7", "committed");
            expect(ds.getItem("binding", "7")?.generation).equals(before);

            // Asking for removal is.
            ds.removeIntent("binding", "7");
            expect(ds.getItem("binding", "7")?.generation).greaterThan(before!);
        });
    });

    it("remembers which operation an item is waiting for", async () => {
        await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
        await endpoint.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("binding", "7", { node: 2 });
            expect(ds.getItem("binding", "7")?.outstanding).equals("apply");

            // A failure reports `commitFailed` either way, so what failed has to survive somewhere else.
            ds.updateStatus("binding", "7", "commitFailed", 133);
            expect(ds.getItem("binding", "7")?.outstanding).equals("apply");

            ds.removeIntent("binding", "7");
            expect(ds.getItem("binding", "7")?.outstanding).equals("remove");
            ds.updateStatus("binding", "7", "commitFailed", 133);
            expect(ds.getItem("binding", "7")?.outstanding).equals("remove");
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
