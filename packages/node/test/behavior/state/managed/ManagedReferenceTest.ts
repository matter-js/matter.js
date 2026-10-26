/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { MaybePromise, MockCrypto } from "@matter/general";
import { DataModelPath, FieldElement } from "@matter/model";
import { MockExchange } from "@matter/node/testing";
import { ConstraintError, ExpiredReferenceError, PhantomReferenceError, Val } from "@matter/protocol";
import { EndpointNumber, FabricIndex, NodeId } from "@matter/types";
import { DeviceEnergyManagement } from "@matter/types/clusters/device-energy-management";
import { aclEndpoint, listOf, structOf, TestStruct } from "./values/value-utils.js";

interface Entry {
    x: number;
    sub: number[] | null;
}

interface Holder {
    id: number;
    list: Entry[];
}

interface State extends Val.Struct {
    holder: Holder | null;
    optionalHolder?: Holder;
    nullableList: { inner: { x: number } }[] | null;
    bits: { flag: boolean; level: number } | null;
}

function entries(...xs: number[]): Entry[] {
    return xs.map(x => ({ x, sub: [x] }));
}

function holder(id: number, ...xs: number[]): Holder {
    return { id, list: entries(...xs) };
}

function TestState() {
    const holderSchema = (quality?: Partial<FieldElement>) =>
        structOf(
            { id: "uint8", list: listOf(structOf({ x: "uint8", sub: listOf("uint8", { quality: "X" }) })) },
            quality,
        );

    const struct = TestStruct(
        {
            holder: holderSchema({ quality: "X" }),
            optionalHolder: holderSchema(),
            nullableList: listOf(structOf({ inner: structOf({ x: "uint8" }) }), { quality: "X" }),
            bits: {
                type: "map8",
                quality: "X",
                children: [
                    FieldElement({ name: "flag", constraint: "0" }),
                    FieldElement({ name: "level", constraint: "1 to 2" }),
                ],
            },
        },
        {
            holder: holder(1, 10, 11, 12),
            optionalHolder: holder(1, 10, 11),
            nullableList: [{ inner: { x: 10 } }],
            bits: { flag: false, level: 0 },
        },
    );

    return {
        get view() {
            return struct.fields as State;
        },

        reference(cx: ActionContext) {
            return struct.reference(cx) as State;
        },

        write(mutator: (state: State) => void) {
            return LocalActorContext.act("test", cx => mutator(this.reference(cx)));
        },
    };
}

interface FabricEntry {
    n?: number;
    targets?: { cluster: number }[] | null;
}

/**
 * A nullable fabric-scoped list, accessed by a remote actor of fabric 1 with fabric filtering.
 */
function FabricState() {
    const struct = TestStruct(
        {
            acl: listOf(
                structOf({
                    fabricIndex: "fabric-idx",
                    n: { type: "uint8", constraint: "max 10" },
                    targets: listOf(structOf({ cluster: "uint32" }), { quality: "X" }),
                }),
                { access: "F", quality: "X" },
            ),
        },
        { acl: [] },
    );

    const cx = {
        fabricFiltered: true,
        exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
        node: aclEndpoint(),
    };

    return {
        online(actor: (state: { acl: FabricEntry[] | null }, cx: ActionContext) => MaybePromise) {
            return struct.online(cx, (ref, cx) => actor(ref as { acl: FabricEntry[] | null }, cx));
        },
    };
}

function xsOf(list: Entry[]) {
    return list.map(entry => entry.x);
}

describe("ManagedReference", () => {
    describe("container that becomes absent and returns", () => {
        it("view serves the new entries", async () => {
            const state = TestState();
            expect(xsOf(state.view.holder!.list)).deep.equals([10, 11, 12]);

            await state.write(s => (s.holder = null));
            await state.write(s => (s.holder = holder(2, 20, 21, 22)));

            expect(xsOf(state.view.holder!.list)).deep.equals([20, 21, 22]);
        });

        it("view serves an index a shorter list removed before", async () => {
            const state = TestState();
            expect(state.view.holder!.list[1].x).equals(11);

            await state.write(s => (s.holder = holder(2, 20)));
            await state.write(s => (s.holder = null));
            await state.write(s => (s.holder = holder(3, 30, 31)));

            expect(state.view.holder!.list[1].x).equals(31);
        });

        it("serves the new entries within one transaction", async () => {
            const state = TestState();
            await state.write(s => {
                expect(xsOf(s.holder!.list)).deep.equals([10, 11, 12]);
                s.holder = null;
                s.holder = holder(2, 20, 21);
                expect(xsOf(s.holder.list)).deep.equals([20, 21]);
            });
        });

        it("accepts a nested write within one transaction", async () => {
            const state = TestState();
            await state.write(s => {
                expect(s.holder!.list[0].x).equals(10);
                s.holder = null;
                s.holder = holder(2, 20, 21);
                s.holder.list[0].x = 25;
            });

            expect(xsOf(state.view.holder!.list)).deep.equals([25, 21]);
        });

        it("accepts a push within one transaction", async () => {
            const state = TestState();
            await state.write(s => {
                expect(s.holder!.list.length).equals(3);
                s.holder = null;
                s.holder = holder(2, 20);
                s.holder.list.push({ x: 21, sub: null });
            });

            expect(xsOf(state.view.holder!.list)).deep.equals([20, 21]);
        });

        it("view serves the new entries of an optional member", async () => {
            const state = TestState();
            expect(xsOf(state.view.optionalHolder!.list)).deep.equals([10, 11]);

            await state.write(s => (s.optionalHolder = undefined));
            await state.write(s => (s.optionalHolder = holder(2, 20, 21)));

            expect(xsOf(state.view.optionalHolder!.list)).deep.equals([20, 21]);
        });

        it("view serves nested structs of a nullable list", async () => {
            const state = TestState();
            expect(state.view.nullableList![0].inner.x).equals(10);

            await state.write(s => (s.nullableList = null));
            await state.write(s => (s.nullableList = [{ inner: { x: 20 } }]));

            expect(state.view.nullableList![0].inner.x).equals(20);
        });

        it("view serves the members of an entry a list removed and then added again (characterization)", async () => {
            const state = TestState();
            expect(state.view.holder!.list[1].sub![0]).equals(11);

            await state.write(s => (s.holder!.list.length = 1));
            await state.write(s => s.holder!.list.push({ x: 21, sub: [21] }));

            expect(state.view.holder!.list[1].sub![0]).equals(21);
        });

        it("accepts a nested write into an entry a list removed and then added again", async () => {
            const state = TestState();
            await state.write(s => {
                expect(s.holder!.list[1].sub![0]).equals(11);
                s.holder!.list.length = 1;
                s.holder!.list.push({ x: 21, sub: [21] });
                s.holder!.list[1].sub!.push(22);
            });

            expect(state.view.holder!.list[1].sub).deep.equals([21, 22]);
        });

        it("accepts a nested write after the removal is rolled back", async () => {
            const state = TestState();
            await LocalActorContext.act("test", async cx => {
                const s = state.reference(cx);
                expect(s.holder!.list[0].x).equals(10);
                s.holder = null;
                await cx.transaction.rollback();

                s.holder!.list[0].x = 15;
            });

            expect(xsOf(state.view.holder!.list)).deep.equals([15, 11, 12]);
        });

        it("held proxy serves the new entries", async () => {
            const state = TestState();
            const list = state.view.holder!.list;
            expect(list[0].x).equals(10);

            await state.write(s => (s.holder = null));
            await state.write(s => (s.holder = holder(2, 20)));

            expect(list[0].x).equals(20);
        });

        it("held proxy serves the new entries after a non-null replacement (characterization)", async () => {
            const state = TestState();
            const list = state.view.holder!.list;
            expect(list[0].x).equals(10);

            await state.write(s => (s.holder = holder(2, 20)));

            expect(list[0].x).equals(20);
            expect(xsOf(state.view.holder!.list)).deep.equals([20]);
        });

        it("accepts a nested write into a nullable list of a fabric-scoped entry after it was null", async () => {
            await FabricState().online(async (state, cx) => {
                const acl = state.acl!;
                acl[0] = { targets: [{ cluster: 1 }] };
                await cx.transaction.commit();
                expect(acl[0].targets![0].cluster).equals(1);
                expect(5 in acl).equals(false);

                const held = acl[0].targets!;
                acl[0].targets = null;
                await cx.transaction.commit();
                expect(() => 0 in held).throws(PhantomReferenceError);
                acl[0].targets = [{ cluster: 2 }];
                await cx.transaction.commit();

                acl[0].targets[0].cluster = 3;
                await cx.transaction.commit();
                expect(acl[0].targets[0].cluster).equals(3);
            });
        });
    });

    describe("absent container", () => {
        it("stays absent after a failed fabric-scoped list assignment", async () => {
            await FabricState().online(async (state, cx) => {
                state.acl = [{ n: 1 }];
                await cx.transaction.commit();
                const held = state.acl!;
                expect(held[0].n).equals(1);

                state.acl = null;
                await cx.transaction.commit();
                expect(() => (state.acl = [{ n: 99 }])).throws(ConstraintError);

                expect(state.acl).equals(null);
                expect(() => held.length).throws(PhantomReferenceError);
                expect(() => held.push({ n: 2 })).throws(PhantomReferenceError);
            });
        });

        it("refuses a write through a held list proxy", async () => {
            const state = TestState();
            await state.write(s => {
                const list = s.holder!.list;
                s.holder = null;
                expect(() => list.push({ x: 1, sub: null })).throws(PhantomReferenceError);
                expect(() => Reflect.deleteProperty(list, "0")).throws(PhantomReferenceError);
            });
        });

        it("refuses reads through a held list proxy", async () => {
            const state = TestState();
            const list = state.view.holder!.list;

            await state.write(s => (s.holder = null));

            expect(() => list.length).throws(PhantomReferenceError);
            expect(() => 0 in list).throws(PhantomReferenceError);
        });

        it("refuses reads and writes through a held struct proxy", async () => {
            const state = TestState();
            await state.write(s => {
                const held = s.holder!;
                s.holder = null;
                expect(() => held.id).throws(PhantomReferenceError);
                expect(() => held.list).throws(PhantomReferenceError);
                expect(() => (held.id = 2)).throws(PhantomReferenceError);
            });
        });

        it("refuses a write through a held proxy of a member set to null", async () => {
            const state = TestState();
            await state.write(s => {
                const sub = s.holder!.list[0].sub!;
                s.holder!.list[0].sub = null;
                expect(() => sub.push(1)).throws(PhantomReferenceError);
            });

            expect(state.view.holder!.list[0].sub).equals(null);
        });

        it("refuses reads and writes through a held bitmap proxy", async () => {
            const state = TestState();
            await state.write(s => {
                const bits = s.bits!;
                s.bits = null;
                expect(() => bits.flag).throws(PhantomReferenceError);
                expect(() => bits.level).throws(PhantomReferenceError);
                expect(() => (bits.flag = true)).throws(PhantomReferenceError);
                expect(() => (bits.level = 2)).throws(PhantomReferenceError);
            });

            expect(state.view.bits).equals(null);
        });
    });

    describe("after the context exits", () => {
        it("refuses a list write through a proxy held while its container was absent (characterization)", async () => {
            const state = TestState();
            let list: Entry[] | undefined;
            await state.write(s => {
                list = s.holder!.list;
                s.holder = null;
            });

            expect(() => (list![0] = { x: 1, sub: null })).throws(ExpiredReferenceError);
            expect(() => (list!.length = 0)).throws(ExpiredReferenceError);
        });

        it("refuses reads and array methods through a proxy held while its container was absent", async () => {
            const state = TestState();
            let list: Entry[] | undefined;
            await state.write(s => {
                list = s.holder!.list;
                s.holder = null;
            });

            expect(() => list!.length).throws(ExpiredReferenceError);
            expect(() => list!.push({ x: 1, sub: null })).throws(ExpiredReferenceError);
            expect(() => list!.splice(0, 1)).throws(ExpiredReferenceError);
        });

        it("refuses a struct write through a proxy held while it was absent", async () => {
            const state = TestState();
            let held: Holder | undefined;
            await state.write(s => {
                held = s.holder!;
                s.holder = null;
            });

            expect(() => (held!.id = 2)).throws(ExpiredReferenceError);
        });

        it("refuses a fabric-filtered list write through a proxy held while it was absent (characterization)", async () => {
            let held: FabricEntry[] | undefined;
            await FabricState().online(async (state, cx) => {
                state.acl = [{ n: 1 }];
                await cx.transaction.commit();
                held = state.acl!;
                state.acl = null;
            });

            expect(() => Reflect.deleteProperty(held!, "0")).throws(ExpiredReferenceError);
            expect(() => (held!.length = 0)).throws(ExpiredReferenceError);
        });

        it("refuses a read through a held root proxy (characterization)", async () => {
            const state = TestState();
            let root: State | undefined;
            await state.write(s => {
                root = s;
            });

            expect(() => root!.holder).throws(ExpiredReferenceError);
        });

        it("serves the last values through held nested proxies (characterization)", async () => {
            const state = TestState();
            let entry: Entry | undefined;
            await state.write(s => {
                entry = s.holder!.list[0];
                entry.x = 15;
            });

            expect(entry!.x).equals(15);
            expect(entry!.sub).deep.equals([10]);
        });

        it("refuses writes through held nested proxies (characterization)", async () => {
            const state = TestState();
            let entry: Entry | undefined;
            let sub: number[] | undefined;
            await state.write(s => {
                entry = s.holder!.list[0];
                sub = entry.sub!;
            });

            expect(() => (entry!.x = 1)).throws(ExpiredReferenceError);
            expect(() => sub!.push(1)).throws(ExpiredReferenceError);
        });
    });

    describe("client mirror", () => {
        const schema = DeviceEnergyManagement.schema.clone();
        schema.supportedFeatures = ["PFR"];
        const forecastId = String(schema.attributes.require("Forecast").id);

        class MirrorStore implements Datasource.ExternallyMutableStore {
            initialValues: Val.Struct;
            version = 1;
            consumer?: Datasource.ExternallyMutableStore.Consumer;

            constructor(initialValues: Val.Struct) {
                this.initialValues = initialValues;
            }

            async set() {}

            async forgetVersion() {}

            async externalSet(values: Val.StructMap) {
                await this.consumer?.integrate(values)?.();
                return {};
            }
        }

        function slot(duration: number) {
            return {
                minDuration: duration,
                maxDuration: duration,
                defaultDuration: duration,
                elapsedSlotTime: 0,
                remainingSlotTime: duration,
                nominalPower: 1000,
                minPower: 0,
                maxPower: 2000,
                nominalEnergy: 1,
            };
        }

        function forecast(forecastId: number, ...durations: number[]) {
            return {
                forecastId,
                activeSlotNumber: null,
                startTime: 1_000_000_000,
                endTime: 1_000_000_001,
                isPausable: false,
                forecastUpdateReason: 0,
                slots: durations.map(slot),
            };
        }

        it("view serves the slots of a forecast reported after a null forecast", async () => {
            const store = new MirrorStore({ [forecastId]: forecast(1, 100, 200) });
            const datasource = Datasource({
                entropy: MockCrypto(),
                type: class {},
                supervisor: RootSupervisor.for(schema),
                location: { endpoint: EndpointNumber(1), path: new DataModelPath("DeviceEnergyManagement") },
                primaryKey: "id",
                store,
            });

            type Forecast = { slots: { defaultDuration: number }[] } | null;
            const view = () => (datasource.view as Val.Struct).forecast as Forecast;
            const durations = () => view()!.slots.map(slot => slot.defaultDuration);

            expect(durations()).deep.equals([100, 200]);

            await store.externalSet(new Map([[forecastId, forecast(2, 300)]]));
            await store.externalSet(new Map([[forecastId, null]]));
            expect(view()).equals(null);

            await store.externalSet(new Map([[forecastId, forecast(3, 400, 500)]]));

            expect(durations()).deep.equals([400, 500]);
        });
    });
});
