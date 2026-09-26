/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
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
import { EndpointPartsError } from "#endpoint/errors.js";
import { DeviceTypeConformanceService } from "#endpoint/validation/DeviceTypeConformanceService.js";
import { DeviceTypeConformanceError } from "#endpoint/validation/Violation.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { ClientStructureEvents } from "#node/client/ClientStructureEvents.js";
import { ServerNode } from "#node/ServerNode.js";
import { Environment, ImplementationError } from "@matter/general";
import { AttributeModel, ClusterModel, DeviceTypeModel, MatterModel, RequirementModel } from "@matter/model";
import { MockServerNode } from "../../node/mock-server-node.js";
import { MockSite } from "../../node/mock-site.js";
import {
    captureLogOf,
    createNode,
    deviceTypeList,
    lightWith,
    lightWithGroupKeyManagement,
    lightWithoutIdentify,
    unjudgedServiceOf,
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
    const environment = new Environment("test");
    environment.vars.set("endpoint.validation.strict", true);
    return environment;
}

/**
 * Counts the calls of the service's validation entry points until disposed.
 */
function countingValidations() {
    const { prototype } = DeviceTypeConformanceService;
    const { validate, validateNodeScope, validateAddition } = prototype;
    const calls = { validate: 0, validateNodeScope: 0, validateAddition: 0 };

    prototype.validate = function (...args: Parameters<DeviceTypeConformanceService["validate"]>) {
        calls.validate++;
        return validate.apply(this, args);
    };
    prototype.validateNodeScope = function (...args: Parameters<DeviceTypeConformanceService["validateNodeScope"]>) {
        calls.validateNodeScope++;
        return validateNodeScope.apply(this, args);
    };
    prototype.validateAddition = function (...args: Parameters<DeviceTypeConformanceService["validateAddition"]>) {
        calls.validateAddition++;
        return validateAddition.apply(this, args);
    };

    return {
        calls,

        [Symbol.dispose]() {
            Object.assign(prototype, { validate, validateNodeScope, validateAddition });
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

        expect(counting.calls).deep.equals({ validate: 0, validateNodeScope: 1, validateAddition: 0 });
        expect(logged.filter(({ text }) => text.includes("Identify")).length).equals(100);
    });

    it("judges an endpoint added with its descendants in one pass", async () => {
        const node = await createNode();
        using counting = countingValidations();

        const logged = await captureLogOf(() =>
            node.add({ type: AggregatorEndpoint, id: "aggregator", parts: lights(50) }),
        );

        expect(counting.calls).deep.equals({ validate: 0, validateNodeScope: 0, validateAddition: 1 });
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
        expect(service.knows(fridge)).true;

        await fridge.add(cabinet());

        expect(service.knows(fridge)).false;

        await node.close();
    });

    it("refuses a misplaced singleton before the behaviors initialize", async () => {
        const node = await createNode();
        expect(node.env.get(DeviceTypeConformanceService).strict).false;

        await expect(node.add(OnOffLightDevice.with(GroupKeyManagementServer), { id: "light" })).rejectedWith(
            DeviceTypeConformanceError,
        );
        expect(node.parts.has("light")).false;

        await node.close();
    });

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

    it("reads nothing of a sibling whose behaviors are still initializing", async () => {
        const node = await createNode();
        node.env.set(
            DeviceTypeConformanceService,
            new DeviceTypeConformanceService(node, node.env, onOffComponentModel()),
        );
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
        const node = await createNode();
        node.env.set(DeviceTypeConformanceService, new DeviceTypeConformanceService(node, node.env, nodelessModel()));

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

        // The device reports its light; the peer mirroring it reports nothing
        expect(logged.filter(({ text }) => text.includes(`${device}.part0 `)).length).equals(1);
        expect(logged.filter(({ text }) => text.includes(`${peer}`))).deep.equals([]);
    });

    it("never refuses a peer's misplaced singleton", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = controller.peers.get("peer1");
        expect(peer).not.undefined;

        // The device would refuse the endpoint, so it is built without judgement
        await MockTime.resolve(device.stop());
        device.env.set(DeviceTypeConformanceService, unjudgedServiceOf(device));
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
