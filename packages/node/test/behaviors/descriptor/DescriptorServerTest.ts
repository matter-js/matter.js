/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { DescriptorBehavior, DescriptorServer } from "#behaviors/descriptor";
import { OnOffServer } from "#behaviors/on-off";
import { ColorTemperatureLightDevice } from "#devices/color-temperature-light";
import { OnOffLightDevice } from "#devices/on-off-light";
import { OnOffLightSwitchDevice } from "#devices/on-off-light-switch";
import { Endpoint } from "#endpoint/Endpoint.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import type { Node } from "#node/Node.js";
import { ClusterId, DeviceTypeId, EndpointNumber } from "#types";
import { MockEndpointType } from "../../behavior/mock-behavior.js";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";
import { MockServerNode } from "../../node/mock-server-node.js";

async function createFamily() {
    const parent = await MockEndpoint.create({
        type: MockEndpointType,
        number: 1,
    });

    const child = await MockEndpoint.create({ type: MockEndpointType, number: 2, owner: parent });

    return { parent, child };
}

describe("DescriptorServer", () => {
    it("properly extends endpoint type", () => {
        const device = MutableEndpoint({
            name: "Foo",
            deviceType: 1,
            deviceRevision: 1,
        }).with(DescriptorServer);

        device.defaults satisfies {
            descriptor: {
                deviceTypeList?: Array<{ deviceType: DeviceTypeId; revision: number }>;
                partsList: Array<EndpointNumber>;
                serverList: Array<ClusterId>;
                clientList: Array<ClusterId>;
            };
        };
    });

    it("adds device type automatically if necessary", async () => {
        const device = await MockEndpoint.create(MockEndpointType);
        expect(device.state.descriptor.deviceTypeList).deep.equals([
            {
                deviceType: 1,
                revision: 1,
            },
        ]);
    });

    it("does not add device type automatically if unnecessary", async () => {
        const Device2Endpoint = MockEndpointType.set({
            descriptor: { deviceTypeList: [{ deviceType: DeviceTypeId(2), revision: 2 }] },
        });

        const device = await MockEndpoint.create(Device2Endpoint);
        expect(device.state.descriptor.deviceTypeList).deep.equals([
            {
                deviceType: 2,
                revision: 2,
            },
        ]);
    });

    it("adds servers automatically", async () => {
        const device = await MockEndpoint.create(MockEndpointType);

        const promise = new Promise<void>(resolve => {
            device.events.descriptor.serverList$Changed.once(() => {
                resolve();
            });
        });

        device.behaviors.require(OnOffServer);

        await promise;

        expect(device.state.descriptor.serverList).deep.equals([29, 6]);
    });

    it("adds parts automatically", async () => {
        const { parent } = await createFamily();

        if (!parent.state.descriptor.partsList.length) {
            await parent.events.descriptor.partsList$Changed;
        }

        const partsList = parent.state.descriptor.partsList;
        expect(partsList).deep.equals([2]);
    });

    it("removes parts automatically", async () => {
        const { parent, child } = await createFamily();

        if (!parent.state.descriptor.partsList.length) {
            await parent.events.descriptor.partsList$Changed;
        }

        const partsState = parent.state.descriptor;
        expect(partsState.partsList).deep.equals([2]);

        await child.close();

        if (parent.state.descriptor.partsList.length) {
            await parent.events.descriptor.partsList$Changed;
        }
        expect(parent.state.descriptor.partsList.length).equals(0);

        expect(partsState.partsList).deep.equals([]);
    });

    it("fully populates device types", async () => {
        const light = await MockEndpoint.create(ColorTemperatureLightDevice, {
            colorControl: {
                colorMode: 0,
                colorTempPhysicalMinMireds: 1,
                colorTempPhysicalMaxMireds: 65279,
                coupleColorTempToLevelMinMireds: 1,
                startUpColorTemperatureMireds: null,
            },
        });

        expect(light.state.descriptor.deviceTypeList).deep.equals([
            { deviceType: 268, revision: 4 },
            // Code to add these is currently disabled
            // { deviceType: 257, revision: 3 },
            // { deviceType: 256, revision: 3 },
        ]);
    });

    describe("adds parts automatically with indexed grandparent and parent", () => {
        async function expectFullPartsLists(node: Node, ...extraChildren: Endpoint[]) {
            const parent = [...node.parts][0];
            const child = [...parent.parts][0];
            const extraNumbers = [...extraChildren].map(child => child.number);

            const activity = node.env.get(NodeActivity);
            await activity.inactive;

            expect(node.stateOf(DescriptorBehavior).partsList).deep.equals([
                parent.number,
                child.number,
                ...extraNumbers,
            ]);
            expect(parent.stateOf(DescriptorBehavior).partsList).deep.equals([child.number, ...extraNumbers]);
        }

        it("when constructed with full hierarchy (auto ID)", async () => {
            const node = await MockServerNode.create({
                parts: [
                    {
                        type: AggregatorEndpoint,
                        parts: [
                            {
                                type: OnOffLightDevice,
                            },
                        ],
                    },
                ],
            });

            await expectFullPartsLists(node);
        });

        it("when constructed with full hierarchy (manual ID)", async () => {
            const node = await MockServerNode.create({
                id: "grandparent",
                number: 0,
                parts: [
                    {
                        type: AggregatorEndpoint,
                        id: "parent",
                        number: 1,
                        parts: [
                            {
                                type: OnOffLightDevice,
                                id: "child",
                                number: 2,
                            },
                        ],
                    },
                ],
            });

            await expectFullPartsLists(node);
        });

        it("when child is added before parent (auto ID)", async () => {
            const parent = new Endpoint({
                type: AggregatorEndpoint,
                parts: [OnOffLightDevice],
            });

            const node = await MockServerNode.create();
            await node.add(parent);

            await expectFullPartsLists(node);
        });

        it("when child is added before parent (manual ID)", async () => {
            const parent = new Endpoint({
                id: "parent",
                number: 1,
                type: AggregatorEndpoint,
                parts: [
                    {
                        id: "child",
                        number: 2,
                        type: OnOffLightDevice,
                    },
                ],
            });

            const node = await MockServerNode.create({
                id: "grandparent",
                number: 0,
            });
            await node.add(parent);

            await expectFullPartsLists(node);
        });

        it("when parent is added before child (auto ID)", async () => {
            const child = new Endpoint(OnOffLightDevice);

            const node = await MockServerNode.create({ parts: [AggregatorEndpoint] });

            const parent = [...node.parts][0];

            await parent.add(child);

            await expectFullPartsLists(node);
        });

        it("when parent is added before child (manual ID)", async () => {
            const child = new Endpoint(OnOffLightDevice, { id: "child", number: 2 });

            const node = await MockServerNode.create({
                id: "grandparent",
                number: 0,

                parts: [
                    {
                        id: "parent",
                        number: 1,
                        type: AggregatorEndpoint,
                    },
                ],
            });

            const parent = [...node.parts][0];

            await parent.add(child);

            await expectFullPartsLists(node);
        });

        it("when additional child is added (auto ID)", async () => {
            const node = await MockServerNode.create({
                parts: [
                    {
                        type: AggregatorEndpoint,
                        parts: [
                            {
                                type: OnOffLightDevice,
                            },
                        ],
                    },
                ],
            });

            await expectFullPartsLists(node);

            const secondChild = await [...node.parts][0].add(OnOffLightSwitchDevice);

            await expectFullPartsLists(node, secondChild);
        });

        it("when additional child is added (manual ID)", async () => {
            const node = await MockServerNode.create({
                parts: [
                    {
                        type: AggregatorEndpoint,
                        parts: [
                            {
                                type: OnOffLightDevice,
                            },
                        ],
                    },
                ],
            });

            await expectFullPartsLists(node);

            const secondChild = await [...node.parts][0].add(OnOffLightSwitchDevice, { id: "secondChild", number: 3 });

            await expectFullPartsLists(node, secondChild);
        });
    });
});
