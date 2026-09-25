/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { DescriptorBehavior, DescriptorServer } from "#behaviors/descriptor";
import { OnOffServer } from "#behaviors/on-off";
import { ColorTemperatureLightDevice } from "#devices/color-temperature-light";
import { OnOffLightDevice } from "#devices/on-off-light";
import { OnOffLightSwitchDevice } from "#devices/on-off-light-switch";
import { TemperatureSensorDevice } from "#devices/temperature-sensor";
import { Endpoint } from "#endpoint/Endpoint.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { BridgedNodeEndpoint } from "#endpoints/bridged-node";
import type { Node } from "#node/Node.js";
import { ClusterId, DeviceTypeId, EndpointNumber } from "@matter/types";
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

    describe("composition", () => {
        it("lists every descendant for an aggregator and only children for a bridged node", async () => {
            // A bridged node carries IndexBehavior as root and aggregator do, but composes a tree
            // (Matter Core § 9.2.3), so only its own children belong in its list
            const node = await MockServerNode.create({
                number: 0,
                parts: [
                    {
                        type: AggregatorEndpoint,
                        number: 1,
                        parts: [
                            {
                                type: BridgedNodeEndpoint,
                                number: 2,
                                parts: [
                                    {
                                        type: OnOffLightDevice,
                                        number: 3,
                                        parts: [{ type: OnOffLightDevice, number: 4 }],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            });

            await node.env.get(NodeActivity).inactive;

            const aggregator = [...node.parts][0];
            const bridgedNode = [...aggregator.parts][0];
            const light = [...bridgedNode.parts][0];

            expect(aggregator.stateOf(DescriptorBehavior).partsList).deep.equals([2, 3, 4]);
            expect(bridgedNode.stateOf(DescriptorBehavior).partsList).deep.equals([3]);
            expect(light.stateOf(DescriptorBehavior).partsList).deep.equals([4]);
        });
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

    describe("membership changes that keep the count", () => {
        async function settledPartsListOf(endpoint: Endpoint) {
            await endpoint.env.get(NodeActivity).inactive;
            await MockTime.yield3();
            return [...endpoint.stateOf(DescriptorBehavior).partsList];
        }

        /**
         * Close one of two children, then add a replacement after {@link delay} microtasks. Returns the settled
         * parts list together with whether the closed child was still a part of {@link parentType} at the moment
         * the replacement was added, so a caller can assert the timing window it means to exercise.
         */
        async function replaceChild(parentType: typeof OnOffLightDevice | typeof AggregatorEndpoint, delay: number) {
            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            const parent = await node.add(parentType, { id: "parent", number: 1 });
            await parent.add(TemperatureSensorDevice, { id: "c1", number: 2 });
            const closing = await parent.add(TemperatureSensorDevice, { id: "c2", number: 3 });
            expect(await settledPartsListOf(parent)).deep.equals([2, 3]);

            const closed = closing.close();
            for (let i = 0; i < delay; i++) {
                await Promise.resolve();
            }
            const closedChildStillPresent = parent.parts.has(closing);

            await parent.add(TemperatureSensorDevice, { id: "c3", number: 4 });
            await closed;

            const partsList = await settledPartsListOf(parent);
            await node.close();
            return { partsList, closedChildStillPresent };
        }

        for (const [name, parentType, delay, expectStillPresent] of [
            ["a composed parent while the closed child is still a part", OnOffLightDevice, 20, true],
            [
                "a composed parent whose replacement is listed before the closed child's removal is",
                OnOffLightDevice,
                16,
                true,
            ],
            ["an aggregator while the closed child is still a part", AggregatorEndpoint, 29, true],
            ["an aggregator after the closed child is gone (characterization)", AggregatorEndpoint, 40, false],
        ] as const) {
            it(`updates ${name}`, async () => {
                const { partsList, closedChildStillPresent } = await replaceChild(parentType, delay);
                expect(closedChildStillPresent).equals(expectStillPresent);
                expect(partsList).deep.equals([2, 4]);
            });
        }
    });

    it("orders PartsList numerically", async () => {
        const numbers = [1, 2, 4, 6, 8, 9, 10];
        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        for (const number of [10, 9, 8, 6, 4, 2, 1]) {
            await node.add(OnOffLightDevice, { id: `light${number}`, number });
        }
        await node.env.get(NodeActivity).inactive;
        await MockTime.yield3();

        expect(node.stateOf(DescriptorBehavior).partsList).deep.equals(numbers);

        await node.close();
    });
});
