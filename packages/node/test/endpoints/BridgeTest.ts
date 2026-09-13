/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BridgedDeviceBasicInformationServer } from "#behaviors/bridged-device-basic-information";
import { DescriptorBehavior, DescriptorServer } from "#behaviors/descriptor";
import { OnOffLightDevice } from "#devices/on-off-light";
import { TemperatureSensorDevice } from "#devices/temperature-sensor";
import { Endpoint } from "#endpoint/Endpoint.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { BridgedNodeEndpoint } from "#endpoints/bridged-node";
import { Environment, MockStorageService } from "@matter/general";
import { DeviceTypeId } from "@matter/types";
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
            new MockStorageService(environment);

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
            const mockStorage = new MockStorageService(environment);

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

            const store = mockStorage.store("node0");
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
            expect(store.get(["root", "parts", "part0", "parts", "light2"], "__number__")).deep.equals(light2);
            expect(store.get(["root", "parts", "part0", "parts", "light3"], "__number__")).deep.equals(light3);
            expect(store.get(["root", "parts", "part0", "parts", "light2-1"], "__number__")).deep.equals(light21);
            expect(store.get(["root", "parts", "part0", "parts", "light4"], "__number__")).deep.equals(light3 + 1);

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
            const mockStorage = new MockStorageService(environment);

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
            const store = mockStorage.store("node0");
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
            const mockStorage = new MockStorageService(environment);

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
            const store = mockStorage.store("node0");
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

describe("a bridge that bridges a bridge", () => {
    /**
     * The "Multiple aggregators" shape of Matter Device Library § 11.2: an endpoint that is a bridged
     * node and an aggregator of its own, below the aggregator that bridges it.
     */
    const NestedAggregatorDevice = AggregatorEndpoint.with(BridgedDeviceBasicInformationServer);

    async function createNestedBridge() {
        const bridge = await createBridge({
            type: AggregatorEndpoint,
            parts: [
                { type: BridgedLightDevice, id: "white" },
                { type: BridgedLightDevice, id: "color" },
                {
                    type: NestedAggregatorDevice,
                    id: "dali",
                    parts: [
                        { type: BridgedLightDevice, id: "dali1" },
                        { type: BridgedLightDevice, id: "dali2" },
                        { type: BridgedLightDevice, id: "dali3" },
                    ],
                },
            ],
        });

        await MockTime.yield();

        return bridge;
    }

    function partsListOf(endpoint: Endpoint) {
        return endpoint.stateOf(DescriptorBehavior).partsList;
    }

    it("names it an aggregator and a bridged node", async () => {
        const bridge = await createNestedBridge();

        const dali = bridge.parts.require("dali");
        expect(dali.stateOf(DescriptorBehavior).deviceTypeList).deep.equals([
            {
                deviceType: AggregatorEndpoint.deviceType,
                revision: AggregatorEndpoint.deviceRevision,
            },
            {
                deviceType: BridgedNodeEndpoint.deviceType,
                revision: BridgedNodeEndpoint.deviceRevision,
            },
        ]);

        await bridge.owner?.close();
    });

    it("gives each aggregator a full-family PartsList of its own descendants", async () => {
        const bridge = await createNestedBridge();

        const dali = bridge.parts.require("dali");
        const daliLights = ["dali1", "dali2", "dali3"].map(id => dali.parts.require(id).number);
        const outerLights = ["white", "color"].map(id => bridge.parts.require(id).number);

        const ascending = (numbers: number[]) => [...numbers].sort((a, b) => a - b);

        expect(partsListOf(dali)).deep.equals(ascending(daliLights));
        expect(partsListOf(bridge)).deep.equals(ascending([...outerLights, dali.number, ...daliLights]));

        const root = bridge.owner!;
        expect(partsListOf(root)).deep.equals(ascending([bridge.number, ...outerLights, dali.number, ...daliLights]));

        await bridge.owner?.close();
    });

    // The spec's own example lists the endpoint's types in the other order, and how an endpoint composes
    // its list is a property of all of them, not of the first
    it("composes a full family when the aggregator device type is not the first", async () => {
        const BridgedFirstAggregator = AggregatorEndpoint.with(
            BridgedDeviceBasicInformationServer,
            DescriptorServer,
        ).set({
            descriptor: {
                deviceTypeList: [
                    {
                        deviceType: DeviceTypeId(BridgedNodeEndpoint.deviceType),
                        revision: BridgedNodeEndpoint.deviceRevision,
                    },
                    {
                        deviceType: DeviceTypeId(AggregatorEndpoint.deviceType),
                        revision: AggregatorEndpoint.deviceRevision,
                    },
                ],
            },
        });

        const bridge = await createBridge({
            type: AggregatorEndpoint,
            parts: [
                {
                    type: BridgedFirstAggregator,
                    id: "dali",
                    parts: [
                        {
                            type: BridgedLightDevice,
                            id: "dali1",
                            parts: [{ type: TemperatureSensorDevice, id: "sensor" }],
                        },
                        { type: BridgedLightDevice, id: "dali2" },
                    ],
                },
            ],
        });

        await MockTime.yield();

        const dali = bridge.parts.require("dali");
        expect(dali.stateOf(DescriptorBehavior).deviceTypeList[0].deviceType).equals(BridgedNodeEndpoint.deviceType);

        const light = dali.parts.require("dali1");
        const descendants = [light.number, light.parts.require("sensor").number, dali.parts.require("dali2").number];
        expect(partsListOf(dali)).deep.equals([...descendants].sort((a, b) => a - b));

        await bridge.owner?.close();
    });

    it("keeps the lists as the nested aggregator gains and loses a device", async () => {
        const bridge = await createNestedBridge();

        const dali = bridge.parts.require("dali");
        const root = bridge.owner!;

        // Each list is maintained by its own endpoint, so wait for all three rather than for the
        // number of task turns it currently takes them
        const listsSettle = () =>
            Promise.all(
                [dali, bridge, root].map(endpoint =>
                    Promise.resolve(endpoint.eventsOf(DescriptorBehavior).partsList$Changed),
                ),
            );

        let changed = listsSettle();
        const added = await dali.add({ type: BridgedLightDevice, id: "dali4" });
        await MockTime.resolve(changed);

        expect(partsListOf(dali)).contains(added.number);
        expect(partsListOf(bridge)).contains(added.number);
        expect(partsListOf(root)).contains(added.number);

        changed = listsSettle();
        await added.delete();
        await MockTime.resolve(changed);

        expect(partsListOf(dali)).not.contains(added.number);
        expect(partsListOf(bridge)).not.contains(added.number);
        expect(partsListOf(root)).not.contains(added.number);

        await bridge.owner?.close();
    });
});
