/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BridgedDeviceBasicInformationServer } from "#behaviors/bridged-device-basic-information";
import { DescriptorBehavior } from "#behaviors/descriptor";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { BridgedNodeEndpoint } from "#endpoints/bridged-node";
import { Environment, StorageBackendMemory, StorageService } from "#general";
import { BridgedLightDevice, createBridge } from "./bridge-helpers.js";

function expectBridgedLight(bridge: Endpoint) {
    const light = bridge.parts.require("light");
    expect(light.behaviors.isActive(BridgedDeviceBasicInformationServer));

    const descriptor = light.stateOf(DescriptorBehavior);
    expect(descriptor.deviceTypeList).deep.equals([
        {
            deviceType: OnOffLightDevice.deviceType,
            revision: OnOffLightDevice.deviceRevision,
        },
        {
            deviceType: BridgedNodeEndpoint.deviceType,
            revision: BridgedNodeEndpoint.deviceRevision,
        },
    ]);
}

describe("a bridge", () => {
    describe("makes children bridged", () => {
        it("at startup", async () => {
            const bridge = await createBridge({
                type: AggregatorEndpoint,
                parts: [{ type: BridgedLightDevice, id: "light" }],
            });

            expectBridgedLight(bridge);

            await bridge.owner?.close();
        });

        it("adding endpoint dynamically", async () => {
            const bridge = await createBridge(AggregatorEndpoint);

            await bridge.add({
                type: BridgedLightDevice,
                id: "light",
            });
            await MockTime.yield();

            expectBridgedLight(bridge);

            await bridge.owner?.close();
        });

        it("with multiple dynamic endpoints in different re-init order on restart", async () => {
            const environment = new Environment("test");
            const storages = new Map<string, StorageBackendMemory>();
            const storage = environment.get(StorageService);
            storage.location = "(memory-for-test)";
            storage.factory = namespace => {
                const existing = storages.get(namespace);
                if (existing) {
                    return existing;
                }
                const store = new StorageBackendMemory();
                storages.set(namespace, store);
                return store;
            };

            // Have a bridge with 4 endpoints
            const bridge = await createBridge(AggregatorEndpoint, { environment });

            await bridge.add({
                type: BridgedLightDevice,
                id: "light1",
            });
            await MockTime.yield();

            await bridge.add({
                type: BridgedLightDevice,
                id: "light2",
            });
            await MockTime.yield();

            await bridge.add({
                type: BridgedLightDevice,
                id: "light2-1",
            });
            await MockTime.yield();

            await bridge.add({
                type: BridgedLightDevice,
                id: "light3",
            });
            await MockTime.yield();

            // Store their numbers
            const light1 = bridge.parts.require("light1").number;
            const light2 = bridge.parts.require("light2").number;
            const light3 = bridge.parts.require("light3").number;

            await bridge.owner?.close();

            // Initialize second bridge with same storage
            const bridge2 = await createBridge(AggregatorEndpoint, { environment });

            // Initialize the bridges in a different order, leave one out and add one more
            await bridge2.add({
                type: BridgedLightDevice,
                id: "light3",
            });
            await MockTime.yield();

            await bridge2.add({
                type: BridgedLightDevice,
                id: "light1",
            });
            await MockTime.yield();

            await bridge2.add({
                type: BridgedLightDevice,
                id: "light2",
            });
            await MockTime.yield();

            await bridge2.add({
                type: BridgedLightDevice,
                id: "light4",
            });
            await MockTime.yield();

            // Verify that the endpoint numbers are preserved and new ones are allocated
            expect(bridge2.parts.require("light1").number).equals(light1);
            expect(bridge2.parts.require("light2").number).equals(light2);
            expect(bridge2.parts.require("light3").number).equals(light3);
            expect(bridge2.parts.require("light4").number).equals(light3 + 1);

            await bridge2.owner?.close();
        });

        it("with multiple dynamic endpoints in different re-init order with reset nextNumber on restart", async () => {
            const environment = new Environment("test");
            const storages = new Map<string, StorageBackendMemory>();
            const storage = environment.get(StorageService);
            storage.location = "(memory-for-test)";
            storage.factory = namespace => {
                const existing = storages.get(namespace);
                if (existing) {
                    return existing;
                }
                const store = new StorageBackendMemory();
                storages.set(namespace, store);
                return store;
            };

            // Have a bridge with 4 endpoints
            const bridge = await createBridge(AggregatorEndpoint, { environment });

            await bridge.add({
                type: BridgedLightDevice,
                id: "light1",
            });
            await MockTime.yield();

            await bridge.add({
                type: BridgedLightDevice,
                id: "light2",
            });
            await MockTime.yield();

            await bridge.add({
                type: BridgedLightDevice,
                id: "light2-1",
            });
            await MockTime.yield();

            await bridge.add({
                type: BridgedLightDevice,
                id: "light3",
            });
            await MockTime.yield();

            // Store their numbers
            const light1 = bridge.parts.require("light1").number;
            const light2 = bridge.parts.require("light2").number;
            const light21 = bridge.parts.require("light2-1").number;
            const light3 = bridge.parts.require("light3").number;

            await bridge.owner?.close();

            const store = storages.get("node0")!;
            store.initialize();
            expect(store.get(["root"], "__nextNumber__")).equals(6);
            store.delete(["root"], "__nextNumber__");
            await store.close();

            // Initialize second bridge with same storage
            const bridge2 = await createBridge(AggregatorEndpoint, { environment });

            // Initialize the bridges in a different order, leave one out and add one more
            await bridge2.add({
                type: BridgedLightDevice,
                id: "light3",
            });
            await MockTime.yield();

            await bridge2.add({
                type: BridgedLightDevice,
                id: "light1",
            });
            await MockTime.yield();

            await bridge2.add({
                type: BridgedLightDevice,
                id: "light2",
            });
            await MockTime.yield();

            await bridge2.add({
                type: BridgedLightDevice,
                id: "light4",
            });
            await MockTime.yield();

            // Verify that the endpoint numbers are preserved and new ones are allocated
            expect(bridge2.parts.require("light1").number).equals(light1);
            expect(bridge2.parts.require("light2").number).equals(light2);
            expect(bridge2.parts.require("light3").number).equals(light3);
            expect(store.get(["root", "parts", "part0", "parts", "light1"], "__number__")).deep.equals(light1);
            expect(store.get(["root.parts.part0.parts.light2"], "__number__")).deep.equals(light2);
            expect(store.get(["root.parts.part0.parts.light3"], "__number__")).deep.equals(light3);
            expect(store.get(["root.parts.part0.parts.light2-1"], "__number__")).deep.equals(light21);
            expect(store.get(["root.parts.part0.parts.light4"], "__number__")).deep.equals(light3 + 1);

            await bridge2.owner?.close();

            store.initialize();

            expect(store.get(["root", "parts", "part0", "parts", "light1"], "__number__")).deep.equals(light1);
            expect(store.get(["root", "parts", "part0", "parts", "light2"], "__number__")).deep.equals(light2);
            expect(store.get(["root", "parts", "part0", "parts", "light3"], "__number__")).deep.equals(light3);
            expect(store.get(["root", "parts", "part0", "parts", "light2-1"], "__number__")).deep.equals(light21);
            expect(store.get(["root", "parts", "part0", "parts", "light4"], "__number__")).deep.equals(light3 + 1);
        });

        it("closing and re-adding dynamic endpoints during runtime", async () => {
            // Have a bridge with 4 endpoints
            const bridge = await createBridge(AggregatorEndpoint);

            await bridge.add({
                type: BridgedLightDevice,
                id: "light1",
            });
            await MockTime.yield();

            const ep2 = new Endpoint({
                type: BridgedLightDevice,
                id: "light2",
            });
            await bridge.add(ep2);
            await MockTime.yield();

            await bridge.add({
                type: BridgedLightDevice,
                id: "light3",
            });
            await MockTime.yield();

            const light2 = bridge.parts.require("light2").number;

            await ep2.close();
            await MockTime.yield();

            await bridge.add({
                type: BridgedLightDevice,
                id: "light2",
            });
            await MockTime.yield();

            // Numbers are reused
            expect(bridge.parts.require("light2").number).equals(light2);

            await bridge.owner?.close();
        });

        it("with multiple dynamic endpoints close and re-add during runtime", async () => {
            const environment = new Environment("test");
            const storages = new Map<string, StorageBackendMemory>();
            const storage = environment.get(StorageService);
            storage.location = "(memory-for-test)";
            storage.factory = namespace => {
                const existing = storages.get(namespace);
                if (existing) {
                    return existing;
                }
                const store = new StorageBackendMemory();
                storages.set(namespace, store);
                return store;
            };

            // Have a bridge with 4 endpoints
            const bridge = await createBridge(AggregatorEndpoint, { environment });

            const endpoint1 = await bridge.add({
                type: BridgedLightDevice,
                id: "light1",
            });
            await MockTime.yield();

            const endpoint2 = await bridge.add({
                type: BridgedLightDevice,
                id: "light2",
            });
            await MockTime.yield();

            await bridge.add({
                type: BridgedLightDevice,
                id: "light3",
            });
            await MockTime.yield();

            // Store their numbers
            const light1 = bridge.parts.require("light1").number;
            const light2 = bridge.parts.require("light2").number;
            const light3 = bridge.parts.require("light3").number;

            // Close 2 endpoints
            await endpoint2.close();
            await MockTime.yield();
            await endpoint1.close();
            await MockTime.yield();

            // Verify data are still existing in storage
            const store = storages.get("node0")!;
            expect(store.get(["root", "parts", "part0", "parts", "light1"], "__number__")).deep.equals(light1);
            expect(store.get(["root", "parts", "part0", "parts", "light2"], "__number__")).deep.equals(light2);
            expect(store.get(["root", "parts", "part0", "parts", "light3"], "__number__")).deep.equals(light3);
            expect(store.get(["root", "parts", "part0", "parts", "light4"], "__number__")).deep.equals(undefined);

            // Add one endpoint again
            await bridge.add({
                type: BridgedLightDevice,
                id: "light1",
            });
            await MockTime.yield();

            // Add one endpoint again
            await bridge.add({
                type: BridgedLightDevice,
                id: "light4",
            });
            await MockTime.yield();

            // Verify that the endpoint numbers are preserved and new ones are allocated
            expect(bridge.parts.require("light1").number).equals(light1);
            expect(bridge.parts.require("light3").number).equals(light3);
            expect(bridge.parts.require("light4").number).equals(light3 + 1);

            await bridge.owner?.close();

            store.initialize();

            expect(store.get(["root", "parts", "part0", "parts", "light1"], "__number__")).deep.equals(light1);
            expect(store.get(["root", "parts", "part0", "parts", "light2"], "__number__")).deep.equals(light2);
            expect(store.get(["root", "parts", "part0", "parts", "light3"], "__number__")).deep.equals(light3);
            expect(store.get(["root", "parts", "part0", "parts", "light4"], "__number__")).deep.equals(light3 + 1);
        });

        it("with multiple dynamic endpoints delete and re-add during runtime", async () => {
            const environment = new Environment("test");
            const storages = new Map<string, StorageBackendMemory>();
            const storage = environment.get(StorageService);
            storage.location = "(memory-for-test)";
            storage.factory = namespace => {
                const existing = storages.get(namespace);
                if (existing) {
                    return existing;
                }
                const store = new StorageBackendMemory();
                storages.set(namespace, store);
                return store;
            };

            // Have a bridge with 4 endpoints
            const bridge = await createBridge(AggregatorEndpoint, { environment });

            const endpoint1 = await bridge.add({
                type: BridgedLightDevice,
                id: "light1",
            });
            await MockTime.yield();

            const endpoint2 = await bridge.add({
                type: BridgedLightDevice,
                id: "light2",
            });
            await MockTime.yield();

            await bridge.add({
                type: BridgedLightDevice,
                id: "light3",
            });
            await MockTime.yield();

            // Store their numbers
            const light1 = bridge.parts.require("light1").number;
            const light2 = bridge.parts.require("light2").number;
            const light3 = bridge.parts.require("light3").number;

            // Verify the entries are existing in storage
            const store = storages.get("node0")!;
            expect(store.get(["root", "parts", "part0", "parts", "light1"], "__number__")).deep.equals(light1);
            expect(store.get(["root", "parts", "part0", "parts", "light2"], "__number__")).deep.equals(light2);
            expect(store.get(["root", "parts", "part0", "parts", "light3"], "__number__")).deep.equals(light3);

            // Close 2 endpoints
            await endpoint2.delete();
            await MockTime.yield();
            await endpoint1.delete();
            await MockTime.yield();

            // Verify the entries are deleted in storage
            expect(store.get(["root", "parts", "part0", "parts", "light1"], "__number__")).deep.equals(undefined);
            expect(store.get(["root", "parts", "part0", "parts", "light2"], "__number__")).deep.equals(undefined);
            expect(store.get(["root", "parts", "part0", "parts", "light3"], "__number__")).deep.equals(light3);

            // Add one endpoint again
            await bridge.add({
                type: BridgedLightDevice,
                id: "light1",
            });
            await MockTime.yield();

            // Add one endpoint again
            await bridge.add({
                type: BridgedLightDevice,
                id: "light4",
            });
            await MockTime.yield();

            expect(store.get(["root", "parts", "part0", "parts", "light1"], "__number__")).deep.equals(light3 + 1);
            expect(store.get(["root", "parts", "part0", "parts", "light2"], "__number__")).deep.equals(undefined);
            expect(store.get(["root", "parts", "part0", "parts", "light3"], "__number__")).deep.equals(light3);
            expect(store.get(["root", "parts", "part0", "parts", "light4"], "__number__")).deep.equals(light3 + 2);

            // Verify that the endpoint numbers are preserved and new ones are allocated
            expect(bridge.parts.require("light1").number).equals(light3 + 1);
            expect(bridge.parts.require("light3").number).equals(light3);
            expect(bridge.parts.require("light4").number).equals(light3 + 2);

            expect(store.get(["root", "parts", "part0", "parts", "light1"], "__number__")).deep.equals(light3 + 1);
            expect(store.get(["root", "parts", "part0", "parts", "light2"], "__number__")).deep.equals(undefined);
            expect(store.get(["root", "parts", "part0", "parts", "light3"], "__number__")).deep.equals(light3);
            expect(store.get(["root", "parts", "part0", "parts", "light4"], "__number__")).deep.equals(light3 + 2);

            await bridge.owner?.close();

            store.initialize();

            expect(store.get(["root", "parts", "part0", "parts", "light1"], "__number__")).deep.equals(light3 + 1);
            expect(store.get(["root", "parts", "part0", "parts", "light2"], "__number__")).deep.equals(undefined);
            expect(store.get(["root", "parts", "part0", "parts", "light3"], "__number__")).deep.equals(light3);
            expect(store.get(["root", "parts", "part0", "parts", "light4"], "__number__")).deep.equals(light3 + 2);
        });
    });
});
