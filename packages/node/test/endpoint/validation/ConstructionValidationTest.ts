/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { AdministratorCommissioningServer } from "#behaviors/administrator-commissioning";
import { BridgedDeviceBasicInformationServer } from "#behaviors/bridged-device-basic-information";
import { DescriptorServer } from "#behaviors/descriptor";
import {
    GroupKeyManagementBehavior,
    GroupKeyManagementClient,
    GroupKeyManagementServer,
} from "#behaviors/group-key-management";
import { OnOffServer } from "#behaviors/on-off";
import { OnOffLightDevice, OnOffLightRequirements } from "#devices/on-off-light";
import { RefrigeratorDevice } from "#devices/refrigerator";
import { TemperatureControlledCabinetDevice } from "#devices/temperature-controlled-cabinet";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointPartsError } from "#endpoint/errors.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { BridgedNodeEndpoint } from "#endpoints/bridged-node";
import { ClientStructureEvents } from "#node/client/ClientStructureEvents.js";
import { DeviceTypeConformanceError } from "#node/server/DeviceTypeConformanceError.js";
import { DeviceTypeConformanceService } from "#node/server/DeviceTypeConformanceService.js";
import { ServerNode } from "#node/ServerNode.js";
import { Environment, ImplementationError } from "@matter/general";
import {
    AttributeModel,
    ClusterModel,
    DeviceTypeConformance,
    DeviceTypeModel,
    DeviceTypeValidationPass,
    MatterModel,
    RequirementModel,
} from "@matter/model";
import { MockServerNode, MockSite } from "@matter/node/testing";
import {
    captureLogOf,
    createNode,
    deviceTypeList,
    lightWith,
    lightWithGroupKeyManagement,
    lightWithoutIdentify,
    unjudgedModel,
    withBle,
} from "./validation-helpers.js";

function cabinet() {
    return {
        type: TemperatureControlledCabinetDevice,
        id: "cabinet",
        temperatureControl: { minTemperature: 0, maxTemperature: 1000, temperatureSetpoint: 400 },
    };
}

const Fridge = RefrigeratorDevice.with(DescriptorServer);

const { Groups, OnOff, ScenesManagement } = OnOffLightRequirements.server.mandatory;

/**
 * A started node that refuses any violation.
 */
async function createStrictNode() {
    return MockServerNode.createOnline(undefined, { environment: strictEnvironment(), device: undefined });
}

function strictEnvironment() {
    return environmentWith("strict");
}

function environmentWith(mode: string) {
    const environment = new Environment("test");
    environment.vars.set("endpoint.validation", mode);
    return environment;
}

/**
 * Counts the calls of the service's public validation entry points and the passes that judge an endpoint until
 * disposed.
 */
function countingValidations() {
    const { prototype } = DeviceTypeConformanceService;
    const { validate, validateNodeScope } = prototype;
    const { check } = DeviceTypeConformance;
    const passes = new Set<DeviceTypeValidationPass<unknown>>();
    const calls = { validate: 0, validateNodeScope: 0, passes: 0 };

    prototype.validate = function (...args: Parameters<DeviceTypeConformanceService["validate"]>) {
        calls.validate++;
        return validate.apply(this, args);
    };
    prototype.validateNodeScope = function (...args: Parameters<DeviceTypeConformanceService["validateNodeScope"]>) {
        calls.validateNodeScope++;
        return validateNodeScope.apply(this, args);
    };
    DeviceTypeConformance.check = (endpoint, pass) => {
        passes.add(pass);
        calls.passes = passes.size;
        return check(endpoint, pass);
    };

    return {
        calls,

        [Symbol.dispose]() {
            Object.assign(prototype, { validate, validateNodeScope });
            DeviceTypeConformance.check = check;
        },
    };
}

class CrashingBehavior extends Behavior {
    static override readonly id = "crashing";
    static override readonly early = true;

    override initialize() {
        throw new ImplementationError("Crashes on purpose");
    }
}

const COMPOSER_ID = 0xfff1_0030;

/**
 * A model whose Composer requires OnOffLight components implementing the OnOff attribute of their OnOff server.
 */
function onOffComponentModel() {
    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "Base", classification: "base" }),
        new DeviceTypeModel({ name: "RootNode", id: 0x16, classification: "node" }),
        new DeviceTypeModel(
            { name: "Composer", id: COMPOSER_ID, classification: "simple" },
            new RequirementModel(
                {
                    name: "OnOffLight",
                    id: OnOffLightDevice.deviceType,
                    element: "deviceType",
                    conformance: "M",
                    constraint: "min 1",
                },
                new RequirementModel(
                    { name: "OnOff", id: 6, element: "serverCluster", conformance: "M" },
                    new RequirementModel({ name: "OnOff", id: 0, element: "attribute", conformance: "M" }),
                ),
            ),
        ),
        new DeviceTypeModel({ name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" }),
        new ClusterModel(
            { name: "OnOff", id: 6 },
            new AttributeModel({ name: "OnOff", id: 0, type: "bool", conformance: "M" }),
        ),
    );
    model.finalize();
    return model;
}

/**
 * A model in which no device type is a node. RootNode declares GroupKeyManagement a singleton and OnOffLight requires
 * Identify.
 */
function nodelessModel() {
    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "Base", classification: "base" }),
        new DeviceTypeModel(
            { name: "RootNode", id: 0x16, classification: "simple" },
            new RequirementModel({ name: "GroupKeyManagement", id: 0x3f, element: "serverCluster", quality: "I" }),
        ),
        new DeviceTypeModel(
            { name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" },
            new RequirementModel({ name: "Identify", id: 3, element: "serverCluster", conformance: "M" }),
        ),
        new ClusterModel({ name: "GroupKeyManagement", id: 0x3f }),
        new ClusterModel({ name: "Identify", id: 3 }),
    );
    model.finalize();
    return model;
}

function lights(count: number) {
    return Array.from({ length: count }, (_, index) => ({ type: lightWithoutIdentify, id: `light${index}` }));
}

describe("device type validation at construction", () => {
    before(() => {
        MockTime.init();
    });

    it("judges a node's initial tree in one pass", async () => {
        using counting = countingValidations();

        const logged = await captureLogOf(async () => {
            const node = new MockServerNode(undefined, { device: undefined, parts: lights(100) });
            await node.construction;
            await node.close();
        });

        expect(counting.calls).deep.equals({ validate: 0, validateNodeScope: 1, passes: 1 });
        expect(logged.filter(({ text }) => text.includes("Identify")).length).equals(100);
    });

    it("judges an endpoint added with its descendants in one pass", async () => {
        const node = await createNode();
        using counting = countingValidations();

        const logged = await captureLogOf(() =>
            node.add({ type: AggregatorEndpoint, id: "aggregator", parts: lights(50) }),
        );

        expect(counting.calls).deep.equals({ validate: 0, validateNodeScope: 0, passes: 1 });
        expect(logged.filter(({ text }) => text.includes("Identify")).length).equals(50);

        await node.close();
    });

    it("refuses a strict violation at construction and leaves no child behind", async () => {
        const node = await createStrictNode();

        await expect(node.add(lightWithoutIdentify, { id: "light" })).rejectedWith(DeviceTypeConformanceError);

        expect(node.parts.has("light")).false;

        await node.close();
    });

    it("judges a composition in strict mode once the parts are constructed", async () => {
        const node = await createStrictNode();

        await expect(node.add(Fridge, { id: "empty" })).rejectedWith(DeviceTypeConformanceError);
        expect(node.parts.has("empty")).false;

        const fridge = await node.add({ type: Fridge, id: "fridge", parts: [cabinet()] });
        expect(node.parts.has(fridge)).true;

        await node.close();
    });

    it("logs a composition violation when not strict", async () => {
        const node = await createNode();

        const logged = await captureLogOf(() => node.add(Fridge, { id: "fridge" }));

        const fridgeWarnings = logged.filter(({ text }) => text.includes("fridge"));
        expect(fridgeWarnings.length).equals(1);
        expect(fridgeWarnings[0].text).contains("instanceCount Refrigerator device:TemperatureControlledCabinet");
        expect(node.parts.has("fridge")).true;

        await node.close();
    });

    it("judges the composing ancestor when a child is added later", async () => {
        const node = await createNode();
        const fridge = await node.add(Fridge, { id: "fridge" });
        const service = node.env.get(DeviceTypeConformanceService);
        expect(service.violationsOf(fridge).length).not.equals(0);

        await fridge.add(cabinet());

        expect(service.violationsOf(fridge)).deep.equals([]);

        await node.close();
    });

    it("refuses a misplaced singleton before the behaviors initialize", async () => {
        const node = await createNode();
        expect(node.env.get(DeviceTypeConformanceService).mode).equals("warn");

        await expect(node.add(OnOffLightDevice.with(GroupKeyManagementServer), { id: "light" })).rejectedWith(
            DeviceTypeConformanceError,
        );
        expect(node.parts.has("light")).false;

        await node.close();
    });

    for (const mode of ["warn", "strict"]) {
        it(`accepts a RootNode singleton on a bridged node whose device type lists it, in ${mode} mode`, async () => {
            const node = await MockServerNode.createOnline(undefined, {
                environment: environmentWith(mode),
                device: undefined,
            });
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });

            // A Fabric Synchronization bridged node, which carries AdministratorCommissioning for its bridged node
            const logged = await captureLogOf(() =>
                aggregator.add(
                    BridgedNodeEndpoint.with(BridgedDeviceBasicInformationServer, AdministratorCommissioningServer),
                    {
                        id: "bridged",
                        bridgedDeviceBasicInformation: { nodeLabel: "bridged" },
                    },
                ),
            );

            expect(aggregator.parts.has("bridged")).true;
            expect(logged).deep.equals([]);

            await node.close();
        });
    }

    it("refuses a misplaced singleton below an added endpoint before any behavior initializes", async () => {
        const node = await createNode();

        await expect(
            node.add({
                type: AggregatorEndpoint,
                id: "aggregator",
                parts: [{ type: OnOffLightDevice.with(GroupKeyManagementServer), id: "light" }],
            }),
        ).rejectedWith(DeviceTypeConformanceError, "aggregator.light");
        expect(node.parts.has("aggregator")).false;

        await node.close();
    });

    it("refuses only the first endpoint in tree order that misplaces a singleton", async () => {
        const node = await createNode();

        let error: unknown;
        await node
            .add({
                type: AggregatorEndpoint,
                id: "aggregator",
                parts: [
                    { type: OnOffLightDevice.with(GroupKeyManagementServer), id: "first" },
                    { type: OnOffLightDevice.with(GroupKeyManagementServer), id: "second" },
                ],
            })
            .catch(e => {
                error = e;
            });

        expect(error).instanceOf(DeviceTypeConformanceError);
        if (error instanceof DeviceTypeConformanceError) {
            expect(error.message).equals(`Endpoint ${node}.aggregator.first violates device type requirements`);
            expect(error.errors.map(({ endpoint }) => endpoint.id)).deep.equals(["first"]);
        }

        await node.close();
    });

    it("accepts a singleton on an endpoint configured as a node endpoint of its own", async () => {
        const node = await createNode();

        const nested = await node.add(lightWithGroupKeyManagement.with(DescriptorServer), {
            id: "nested",
            descriptor: { deviceTypeList: deviceTypeList("RootNode") },
        });

        expect(node.parts.has(nested)).true;

        await node.close();
    });

    it("reads nothing of an endpoint that crashed", async () => {
        const node = await createNode();
        const fridge = await node.add({ type: Fridge, id: "fridge", parts: [cabinet()] });

        // Its behaviors initialize, then its part crashes it
        await expect(
            fridge.add({
                ...cabinet(),
                id: "crashed",
                isEssential: false,
                parts: [{ type: OnOffLightDevice.with(CrashingBehavior), id: "part" }],
            }),
        ).rejectedWith(EndpointPartsError);
        expect(fridge.parts.has("crashed")).true;

        const second = await fridge.add({ ...cabinet(), id: "second" });

        expect(fridge.parts.has(second)).true;

        await node.close();
    });

    it("does not count a crashed endpoint as a present component", async () => {
        const node = await createStrictNode();

        await expect(
            node.add({
                type: Fridge,
                id: "fridge",
                parts: [
                    {
                        ...cabinet(),
                        id: "crashed",
                        isEssential: false,
                        parts: [{ type: OnOffLightDevice.with(CrashingBehavior), id: "part" }],
                    },
                ],
            }),
        ).rejectedWith(DeviceTypeConformanceError);
        expect(node.parts.has("fridge")).false;

        await node.close();
    });

    it("judges an addition under a constructed part without its ancestors still under construction", async () => {
        const node = await createStrictNode();

        let release = () => {};
        const gate = new Promise<void>(resolve => (release = resolve));
        class SlowBehavior extends Behavior {
            static override readonly id = "slow";
            static override readonly early = true;
            override async initialize() {
                await gate;
            }
        }

        const light = new Endpoint(OnOffLightDevice, { id: "light" });
        let grandchild: Promise<Endpoint> | undefined;
        light.lifecycle.partsReady.once(() => {
            grandchild = light.add(OnOffLightDevice, { id: "grandchild" }).finally(release);
        });

        const fridge = await node.add({
            type: Fridge,
            id: "fridge",
            parts: [light, { ...cabinet(), type: TemperatureControlledCabinetDevice.with(SlowBehavior) }],
        });

        expect(grandchild).not.undefined;
        expect(light.parts.has(await grandchild!)).true;
        expect(fridge.parts.has(light)).true;

        await node.close();
    });

    it("judges no endpoint under construction below a sibling whose duplicate status changes", async () => {
        const node = await createStrictNode();
        const Tagged = OnOffLightDevice.with(DescriptorServer.with("TagList"));
        const tag = (value: number) => [{ mfgCode: null, namespaceId: 4, tag: value, label: null }];

        let release = () => {};
        const gate = new Promise<void>(resolve => (release = resolve));
        class SlowBehavior extends Behavior {
            static override readonly id = "slow";
            static override readonly early = true;
            override async initialize() {
                await gate;
            }
        }

        const first = await node.add(Tagged, { id: "first", descriptor: { tagList: tag(0) } });
        let constructing = true;
        const fridge = first
            .add({
                type: Fridge,
                id: "fridge",
                parts: [{ ...cabinet(), type: TemperatureControlledCabinetDevice.with(SlowBehavior) }],
            })
            .finally(() => (constructing = false));
        while (!first.parts.has("fridge")) {
            await MockTime.yield();
        }

        const second = await node.add(Tagged, { id: "second", descriptor: { tagList: tag(1) } });
        expect(constructing).true;
        release();

        expect(node.parts.has(second)).true;
        expect(first.parts.has(await fridge)).true;

        await node.close();
    });

    it("reads nothing of a sibling whose behaviors are still initializing", async () => {
        const node = await createNode(onOffComponentModel());
        const composer = await node.add(lightWithoutIdentify.with(DescriptorServer), {
            id: "composer",
            descriptor: { deviceTypeList: deviceTypeList(COMPOSER_ID) },
            parts: [{ type: OnOffLightDevice, id: "first" }],
        });

        let release = () => {};
        const gate = new Promise<void>(resolve => (release = resolve));
        class SlowOnOffServer extends OnOffServer {
            override async initialize() {
                await gate;
                await super.initialize();
            }
        }
        const slow = composer.add({ type: OnOffLightDevice.with(SlowOnOffServer), id: "slow" });

        const second = await composer.add({ type: OnOffLightDevice, id: "second" });
        release();

        expect(composer.parts.has(second)).true;
        expect(composer.parts.has(await slow)).true;

        await node.close();
    });

    it("judges nothing in a tree without a node endpoint", async () => {
        const node = await createNode(nodelessModel());

        const logged = await captureLogOf(() =>
            node.add(lightWith(Groups, OnOff, ScenesManagement, GroupKeyManagementBehavior), { id: "light" }),
        );

        expect(node.parts.has("light")).true;
        expect(logged).deep.equals([]);

        await node.close();
    });

    it("never judges a peer's endpoints", async () => {
        await using site = new MockSite();

        const pair = site.addCommissionedPair({
            device: { type: ServerNode.RootEndpoint, device: lightWithoutIdentify },
        });
        const logged = await captureLogOf(() => pair);
        const { controller, device } = await pair;
        const peer = controller.peers.get("peer1");
        expect(peer).not.undefined;

        expect(logged.filter(({ text }) => text.includes(`${device}.part0 `)).length).equals(1);
        expect(logged.filter(({ text }) => text.includes(`${peer}`))).deep.equals([]);
    });

    it("never refuses a peer's misplaced singleton", async () => {
        await using site = new MockSite();

        // The device would refuse the endpoint, so it judges in a model without a node
        const { controller, device } = await site.addCommissionedPair({
            device: { type: ServerNode.RootEndpoint, matter: unjudgedModel() },
        });
        const peer = controller.peers.get("peer1");
        expect(peer).not.undefined;

        await MockTime.resolve(device.stop());
        await device.add(lightWithGroupKeyManagement, { id: "misplaced" });

        const logged = await captureLogOf(async () => {
            const installed = new Promise(resolve =>
                peer?.env.get(ClientStructureEvents).clusterInstalled(GroupKeyManagementClient).on(resolve),
            );
            await MockTime.resolve(device.start());
            await MockTime.resolve(installed);
        });

        const mirrored = [...(peer?.parts ?? [])].filter(part => part.behaviors.has(GroupKeyManagementClient));
        expect(mirrored.length).equals(1);
        expect(logged).deep.equals([]);
    });

    it("constructs a strict node in default configuration", async () => {
        const node = await createStrictNode();

        expect(node.lifecycle.isOnline).true;

        await node.close();
    });

    it("refuses a strict node that commissions over BLE without NetworkCommissioning", async () => {
        const node = new MockServerNode(undefined, { environment: withBle(strictEnvironment()), device: undefined });

        const error = await node.construction.then(
            () => undefined,
            (e: unknown) => e,
        );

        expect(error).property("cause").instanceOf(DeviceTypeConformanceError);
        expect(error)
            .nested.property("cause.errors[0].message")
            .match(/^RootNode NetworkCommissioning: /);

        await node.close();
    });

    describe("in off mode", () => {
        it("judges neither the initial tree nor an addition", async () => {
            using counting = countingValidations();

            const logged = await captureLogOf(async () => {
                const node = new MockServerNode(undefined, {
                    environment: environmentWith("off"),
                    device: undefined,
                    parts: lights(3),
                });
                await node.start();
                const fridge = await node.add(Fridge, { id: "fridge" });
                expect(node.env.get(DeviceTypeConformanceService).violationsOf(fridge)).deep.equals([]);
                await node.close();
            });

            expect(counting.calls).deep.equals({ validate: 0, validateNodeScope: 0, passes: 0 });
            expect(logged).deep.equals([]);
        });

        it("still refuses a misplaced singleton before the behaviors initialize", async () => {
            const node = await MockServerNode.createOnline(undefined, {
                environment: environmentWith("off"),
                device: undefined,
            });

            await expect(node.add(OnOffLightDevice.with(GroupKeyManagementServer), { id: "light" })).rejectedWith(
                DeviceTypeConformanceError,
            );
            expect(node.parts.has("light")).false;

            await node.close();
        });
    });

    it("fails the node's construction for an unknown mode", async () => {
        const node = new MockServerNode(undefined, { environment: environmentWith("loud"), device: undefined });

        const error = await node.construction.then(
            () => undefined,
            (e: unknown) => e,
        );

        expect(error).property("cause").instanceOf(ImplementationError);
        expect(error).nested.property("cause.message").contains('is "loud"');

        await node.close();
    });

    describe("in default configuration", () => {
        it("logs no warning for a plain light", async () => {
            const logged = await captureLogOf(async () => {
                const node = await MockServerNode.createOnline();
                await node.close();
            });

            expect(logged).deep.equals([]);
        });

        it("logs no warning for a bridge", async () => {
            const logged = await captureLogOf(async () => {
                const node = await MockServerNode.createOnline(undefined, { device: undefined });
                const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
                for (const id of ["light1", "light2"]) {
                    await aggregator.add(OnOffLightDevice.with(BridgedDeviceBasicInformationServer), {
                        id,
                        bridgedDeviceBasicInformation: { nodeLabel: id },
                    });
                }
                await node.close();
            });

            expect(logged).deep.equals([]);
        });
    });
});
