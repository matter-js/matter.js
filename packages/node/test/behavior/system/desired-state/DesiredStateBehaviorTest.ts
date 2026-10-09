/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DesiredStateBehavior } from "#behavior/system/desired-state/DesiredStateBehavior.js";
import { AclCapacityExceededError } from "#behavior/system/desired-state/errors.js";
import { ItemEnforcement, ManagedItem, currentReapplies } from "#behavior/system/desired-state/types.js";
import { Minutes, Timestamp } from "@matter/general";
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

    it("never reuses a generation for a key, even after the item was dropped", async () => {
        await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
        await endpoint.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            const original = ds.setIntent("acl", "1", { privilege: 5 }, "maintain");
            ds.updateStatus("acl", "1", "committed");
            ds.dropItem("acl", "1");

            const readded = ds.setIntent("acl", "1", { privilege: 5 }, "maintain");
            expect(readded.generation).greaterThan(original.generation);

            // A slow operation on the dropped original carries its generation; none of its writes may land.
            ds.updateStatus("acl", "1", "committed", undefined, original.generation);
            expect(ds.getItem("acl", "1")?.status.state).equals("pending");
            ds.updateStatus("acl", "1", "committed");
            ds.markDrift("acl", "1", original.generation);
            ds.recordReapply("acl", "1", Minutes(10), original.generation);
            expect(ds.enforcementOf("acl", "1")).equals(undefined);
            ds.dropItem("acl", "1", original.generation);
            expect(ds.getItem("acl", "1")).not.equals(undefined);
        });
    });

    describe("enforcement record", () => {
        const window = Minutes(10);

        function track(ds: DesiredStateBehavior) {
            const edges = new Array<[string, string, ItemEnforcement | undefined]>();
            ds.events.itemEnforcementChanged.on((kind, key, enforcement) => {
                edges.push([kind, key, enforcement]);
            });
            return edges;
        }

        function committed(ds: DesiredStateBehavior) {
            const item = ds.setIntent("acl", "1", { privilege: 5 }, "maintain");
            ds.updateStatus("acl", "1", "committed");
            return item;
        }

        /** A committed item with an observed drift, a hold and one re-apply. */
        function enforced(ds: DesiredStateBehavior) {
            const item = committed(ds);
            ds.recordReapply("acl", "1", window);
            ds.hold("acl", "1");
            return item;
        }

        it("markDrift records an observed drift and emits once", async () => {
            MockTime.reset(1000);
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(async agent => {
                const ds = agent.get(DesiredStateBehavior);
                committed(ds);
                const edges = track(ds);

                ds.markDrift("acl", "1");
                const expected: ItemEnforcement = {
                    drift: { confirmedAt: Timestamp(1000) },
                    held: false,
                    reappliesUntil: [],
                };
                expect(ds.enforcementOf("acl", "1")).deep.equals(expected);
                expect(edges).deep.equals([["acl", "1", expected]]);

                await MockTime.advance(500);
                ds.markDrift("acl", "1");
                expect(ds.enforcementOf("acl", "1")?.drift?.confirmedAt).equals(1000);
                expect(edges.length).equals(1);
            });
        });

        it("hold records the drift and the hold, and emits once per change", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                committed(ds);
                ds.markDrift("acl", "1");
                const edges = track(ds);

                ds.hold("acl", "1");
                expect(ds.enforcementOf("acl", "1")?.held).equals(true);
                expect(ds.enforcementOf("acl", "1")?.drift).not.equals(undefined);
                expect(edges.length).equals(1);

                ds.hold("acl", "1");
                expect(edges.length).equals(1);
            });
        });

        for (const [name, write] of Object.entries({
            markDrift: (ds: DesiredStateBehavior, generation?: number) => ds.markDrift("acl", "1", generation),
            hold: (ds: DesiredStateBehavior, generation?: number) => ds.hold("acl", "1", generation),
            recordReapply: (ds: DesiredStateBehavior, generation?: number) => {
                ds.recordReapply("acl", "1", window, generation);
            },
        })) {
            it(`${name} ignores a missing item, a pending item and a stale generation`, async () => {
                await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
                await endpoint.act(agent => {
                    const ds = agent.get(DesiredStateBehavior);
                    const edges = track(ds);

                    write(ds);
                    expect(ds.enforcementOf("acl", "1")).equals(undefined);

                    const item = ds.setIntent("acl", "1", {}, "maintain");
                    write(ds, item.generation);
                    expect(ds.enforcementOf("acl", "1")).equals(undefined);

                    ds.updateStatus("acl", "1", "committed");
                    write(ds, item.generation + 1);
                    expect(ds.enforcementOf("acl", "1")).equals(undefined);
                    expect(edges).deep.equals([]);

                    write(ds, item.generation);
                    expect(ds.enforcementOf("acl", "1")).not.equals(undefined);
                });
            });
        }

        it("releaseHold ignores a missing item, a pending item and a stale generation", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                ds.releaseHold("acl", "9");
                expect(ds.enforcementOf("acl", "9")).equals(undefined);

                const item = enforced(ds);
                ds.releaseHold("acl", "1", item.generation + 1);
                expect(ds.enforcementOf("acl", "1")?.held).equals(true);

                ds.updateStatus("acl", "1", "pending");
                ds.releaseHold("acl", "1", item.generation);
                expect(ds.enforcementOf("acl", "1")?.held).equals(true);

                ds.updateStatus("acl", "1", "committed");
                ds.releaseHold("acl", "1", item.generation);
                expect(ds.enforcementOf("acl", "1")).equals(undefined);
            });
        });

        it("recordReapply says whether it recorded", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                const item = committed(ds);
                expect(ds.recordReapply("acl", "1", window, item.generation + 1)).equals(false);
                expect(ds.recordReapply("acl", "1", window, item.generation)).equals(true);
            });
        });

        it("enforcementOf reports nothing once the only re-applies have stopped counting", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(async agent => {
                const ds = agent.get(DesiredStateBehavior);
                committed(ds);
                ds.recordReapply("acl", "1", window);
                ds.recordReapply("acl", "1", Minutes(20));
                expect(ds.enforcementOf("acl", "1")?.reappliesUntil.length).equals(2);

                await MockTime.advance(Minutes(11));
                expect(ds.enforcementOf("acl", "1")?.reappliesUntil.length).equals(1);

                await MockTime.advance(Minutes(10));
                expect(ds.enforcementOf("acl", "1")).equals(undefined);
            });
        });

        it("clearDrift ends the observed drift but not the hold", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                enforced(ds);
                const edges = track(ds);

                ds.clearDrift("acl", "1");

                const after = ds.enforcementOf("acl", "1");
                expect(after?.drift).equals(undefined);
                expect(after?.held).equals(true);
                expect(after?.reappliesUntil.length).equals(1);
                expect(edges).deep.equals([["acl", "1", after]]);

                ds.clearDrift("acl", "1");
                expect(edges.length).equals(1);
            });
        });

        it("clearDrift of a drift-only record removes the record", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                committed(ds);
                ds.markDrift("acl", "1");
                const edges = track(ds);

                ds.clearDrift("acl", "1");

                expect(ds.enforcementOf("acl", "1")).equals(undefined);
                expect(edges).deep.equals([["acl", "1", undefined]]);
            });
        });

        it("updateStatus ends the observed drift and keeps the hold and the re-applies", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                enforced(ds);
                const edges = track(ds);

                ds.updateStatus("acl", "1", "committed");

                const after = ds.enforcementOf("acl", "1");
                expect(after?.drift).equals(undefined);
                expect(after?.held).equals(true);
                expect(after?.reappliesUntil.length).equals(1);
                expect(edges).deep.equals([["acl", "1", after]]);
            });
        });

        const resets: Record<string, (ds: DesiredStateBehavior) => void> = {
            setIntent: ds => {
                ds.setIntent("acl", "1", { privilege: 3 }, "maintain");
            },
            removeIntent: ds => ds.removeIntent("acl", "1"),
            dropItem: ds => ds.dropItem("acl", "1"),
        };

        for (const [name, write] of Object.entries(resets)) {
            it(`${name} removes the whole record, re-applies included, and emits the clearing edge`, async () => {
                await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
                await endpoint.act(agent => {
                    const ds = agent.get(DesiredStateBehavior);
                    enforced(ds);
                    const edges = track(ds);

                    write(ds);

                    expect(ds.enforcementOf("acl", "1")).equals(undefined);
                    expect(edges).deep.equals([["acl", "1", undefined]]);
                });
            });

            it(`${name} of an item with re-applies only removes them without an event`, async () => {
                await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
                await endpoint.act(agent => {
                    const ds = agent.get(DesiredStateBehavior);
                    committed(ds);
                    ds.recordReapply("acl", "1", window);
                    const edges = track(ds);

                    write(ds);

                    expect(ds.enforcementOf("acl", "1")).equals(undefined);
                    expect(edges).deep.equals([]);
                });
            });
        }

        it("a re-added item starts with no re-applies", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                committed(ds);
                ds.recordReapply("acl", "1", window);
                ds.recordReapply("acl", "1", window);
                ds.dropItem("acl", "1");

                ds.setIntent("acl", "1", { privilege: 5 }, "maintain");
                ds.updateStatus("acl", "1", "committed");

                expect(currentReapplies(ds.enforcementOf("acl", "1"))).equals(0);
            });
        });

        it("recordReapply counts within the window, forgets older ones and emits nothing", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(async agent => {
                const ds = agent.get(DesiredStateBehavior);
                committed(ds);
                const edges = track(ds);

                ds.recordReapply("acl", "1", window);
                await MockTime.advance(Minutes(6));
                ds.recordReapply("acl", "1", window);
                expect(currentReapplies(ds.enforcementOf("acl", "1"))).equals(2);

                await MockTime.advance(Minutes(6));
                expect(currentReapplies(ds.enforcementOf("acl", "1"))).equals(1);

                ds.recordReapply("acl", "1", window);
                expect(ds.enforcementOf("acl", "1")?.reappliesUntil.length).equals(2);
                expect(edges).deep.equals([]);
            });
        });

        it("releaseHold ends the hold and starts the re-applies over, and keeps the observed drift", async () => {
            await using endpoint = await MockEndpoint.createWith(DesiredStateBehavior);
            await endpoint.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                const item = enforced(ds);
                const edges = track(ds);

                ds.releaseHold("acl", "1", item.generation + 1);
                expect(ds.enforcementOf("acl", "1")?.held).equals(true);

                ds.releaseHold("acl", "1", item.generation);

                const after = ds.enforcementOf("acl", "1");
                expect(after?.held).equals(false);
                expect(after?.reappliesUntil).deep.equals([]);
                expect(after?.drift).not.equals(undefined);
                expect(edges).deep.equals([["acl", "1", after]]);
            });
        });
    });
});
