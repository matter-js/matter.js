/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DesiredStateBehavior } from "#behavior/system/desired-state/DesiredStateBehavior.js";
import { AclCapacityExceededError } from "#behavior/system/desired-state/errors.js";
import { ItemDrift, ManagedItem } from "#behavior/system/desired-state/types.js";
import { Timestamp } from "@matter/general";
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

    it("dropItem removes the item and announces it", async () => {
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
            expect(() => ds.assertCanAdd("acl", ["a"])).not.throws();
            expect(() => ds.assertCanAdd("acl", ["a", "b"])).throws(AclCapacityExceededError);
        });
    });

    describe("drift mark", () => {
        const recorded: ItemDrift = { confirmedAt: Timestamp(1000), disposition: "recorded" };
        const held: ItemDrift = { confirmedAt: Timestamp(2000), disposition: "held" };

        function track(ds: DesiredStateBehavior) {
            const edges = new Array<[string, string, ItemDrift | undefined]>();
            ds.events.itemDriftChanged.on((kind, key, drift) => {
                edges.push([kind, key, drift]);
            });
            return edges;
        }

        function committed(ds: DesiredStateBehavior) {
            const item = ds.setIntent("acl", "1", { privilege: 5 }, "maintain");
            ds.updateStatus("acl", "1", "committed");
            return item;
        }

        it("markDrift sets the mark and emits once per change of disposition", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                committed(ds);
                const edges = track(ds);

                ds.markDrift("acl", "1", recorded);
                expect(ds.driftOf("acl", "1")).deep.equals(recorded);
                expect(edges).deep.equals([["acl", "1", recorded]]);

                ds.markDrift("acl", "1", { ...recorded, confirmedAt: Timestamp(1500) });
                expect(edges.length).equals(1);

                ds.markDrift("acl", "1", held);
                expect(ds.driftOf("acl", "1")).deep.equals(held);
                expect(edges.length).equals(2);
                expect(edges[1]).deep.equals(["acl", "1", held]);
            });
        });

        it("markDrift ignores a stale generation, a pending item and a missing item", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                const edges = track(ds);

                ds.markDrift("acl", "9", recorded);
                expect(ds.driftOf("acl", "9")).equals(undefined);

                const item = ds.setIntent("acl", "1", {}, "maintain");
                ds.markDrift("acl", "1", recorded, item.generation);
                expect(ds.driftOf("acl", "1")).equals(undefined);

                ds.updateStatus("acl", "1", "committed");
                ds.markDrift("acl", "1", recorded, item.generation + 1);
                expect(ds.driftOf("acl", "1")).equals(undefined);

                expect(edges).deep.equals([]);

                ds.markDrift("acl", "1", recorded, item.generation);
                expect(ds.driftOf("acl", "1")).deep.equals(recorded);
                expect(edges.length).equals(1);
            });
        });

        const writers: Record<string, (ds: DesiredStateBehavior) => void> = {
            setIntent: ds => {
                ds.setIntent("acl", "1", { privilege: 3 }, "maintain");
            },
            removeIntent: ds => ds.removeIntent("acl", "1"),
            dropItem: ds => ds.dropItem("acl", "1"),
            updateStatus: ds => ds.updateStatus("acl", "1", "committed"),
        };

        for (const [name, write] of Object.entries(writers)) {
            it(`${name} clears an existing mark and emits the clearing edge`, async () => {
                await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
                await endpoint.act(agent => {
                    const ds = agent.get(DesiredStateBehavior);
                    committed(ds);
                    ds.markDrift("acl", "1", recorded);
                    const edges = track(ds);

                    write(ds);

                    expect(ds.driftOf("acl", "1")).equals(undefined);
                    expect(edges).deep.equals([["acl", "1", undefined]]);
                });
            });

            it(`${name} without a mark emits no drift event`, async () => {
                await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
                await endpoint.act(agent => {
                    const ds = agent.get(DesiredStateBehavior);
                    committed(ds);
                    const edges = track(ds);

                    write(ds);

                    expect(edges).deep.equals([]);
                });
            });
        }

        it("clearDrift emits only when a mark existed", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                committed(ds);
                const edges = track(ds);

                ds.clearDrift("acl", "1");
                expect(edges).deep.equals([]);

                ds.markDrift("acl", "1", recorded);
                ds.clearDrift("acl", "1");
                expect(ds.driftOf("acl", "1")).equals(undefined);
                expect(edges).deep.equals([
                    ["acl", "1", recorded],
                    ["acl", "1", undefined],
                ]);
            });
        });
    });
});
