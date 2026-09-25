/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { BridgedDeviceBasicInformationServer } from "#behaviors/bridged-device-basic-information";
import { DescriptorServer } from "#behaviors/descriptor";
import { OnOffLightDevice } from "#devices/on-off-light";
import { RefrigeratorDevice } from "#devices/refrigerator";
import { TemperatureControlledCabinetDevice } from "#devices/temperature-controlled-cabinet";
import { TemperatureSensorDevice } from "#devices/temperature-sensor";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointPartsError } from "#endpoint/errors.js";
import { DeviceTypeConformanceService } from "#endpoint/validation/DeviceTypeConformanceService.js";
import { DeviceTypeConformanceError } from "#endpoint/validation/Violation.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { Environment, ImplementationError } from "@matter/general";
import { ClusterModel, ConditionModel, DeviceTypeModel, MatterModel, RequirementModel } from "@matter/model";
import { NodeId } from "@matter/types";
import { MockServerNode } from "../../node/mock-server-node.js";
import {
    addCabinet,
    addRefrigerator,
    captureErrorsOf,
    captureLog,
    captureLogOf,
    createNode,
    deviceTypeList,
    lightWithGroupKeyManagement,
    recordingChecks,
    recordingReads,
    WiFiCommissioningServer,
} from "./validation-helpers.js";

const BridgedLight = OnOffLightDevice.with(BridgedDeviceBasicInformationServer);

const TaggedLight = OnOffLightDevice.with(DescriptorServer.with("TagList"));

const DescribedLight = OnOffLightDevice.with(DescriptorServer);

const tagList = [{ mfgCode: null, namespaceId: 7, tag: 0, label: null }];

const WiFiLight = OnOffLightDevice.with(WiFiCommissioningServer);

const missingTagList = "missing Descriptor.TAGLIST";

const Fridge = RefrigeratorDevice.with(DescriptorServer);

const brokenFridge = ["instanceCount device:TemperatureControlledCabinet", "instanceCount condition:Cooler"];

const COMPOSER_ID = 0xfff1_0030;

/**
 * A model whose Composer allows at most one OnOffLight component.
 */
function singleComponentModel() {
    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "Base", classification: "base" }),
        new DeviceTypeModel({ name: "RootNode", id: 0x16, classification: "node" }),
        new DeviceTypeModel(
            { name: "Composer", id: COMPOSER_ID, classification: "simple" },
            new RequirementModel({
                name: "OnOffLight",
                id: OnOffLightDevice.deviceType,
                element: "deviceType",
                conformance: "O",
                constraint: "max 1",
            }),
        ),
        new DeviceTypeModel({ name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" }),
    );
    model.finalize();
    return model;
}

const WIDGET_ID = 0xfff1_0031;
const ASSERTER_ID = 0xfff1_0032;
const DUPLICATE_ASSERTER_ID = 0xfff1_0033;
const DECLARER_ID = 0xfff1_0034;

/**
 * A model whose RootNode requires a Widget component carrying ColorControl, which an OnOffLight lacks, only under its
 * condition Guarded. Asserter asserts Guarded on the node endpoint; DuplicateAsserter does only while it shares an
 * application device type with a sibling. Declarer declares ColorControl a singleton.
 */
function guardedRootModel() {
    const guarded = (conformance: string) =>
        new RequirementModel({
            name: "Guarded",
            type: "RootNode.Guarded",
            element: "condition",
            conformance,
            location: "Root",
        });

    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "Base", classification: "base" }, new ConditionModel({ name: "Duplicate" })),
        new DeviceTypeModel(
            { name: "RootNode", id: 0x16, classification: "node" },
            new ConditionModel({ name: "Guarded" }),
            new RequirementModel(
                { name: "Widget", id: WIDGET_ID, element: "deviceType", conformance: "Guarded" },
                new RequirementModel({ name: "ColorControl", id: 0x300, element: "serverCluster", conformance: "M" }),
            ),
        ),
        new DeviceTypeModel({ name: "Widget", id: WIDGET_ID, classification: "simple" }),
        new DeviceTypeModel({ name: "Asserter", id: ASSERTER_ID, classification: "simple" }, guarded("M")),
        new DeviceTypeModel(
            { name: "DuplicateAsserter", id: DUPLICATE_ASSERTER_ID, classification: "simple" },
            guarded("Duplicate"),
        ),
        new DeviceTypeModel(
            { name: "Declarer", id: DECLARER_ID, classification: "simple" },
            new RequirementModel({
                name: "ColorControl",
                id: 0x300,
                element: "serverCluster",
                conformance: "O",
                quality: "I",
            }),
        ),
        new DeviceTypeModel({ name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" }),
        new ClusterModel({ name: "ColorControl", id: 0x300 }),
    );
    model.finalize();
    return model;
}

const unguardedWidget = "missing device:RootNode/Widget";

const NEEDY_ID = 0xfff1_0035;

/**
 * A model whose Declarer declares OnOff a singleton and whose Needy requires ColorControl, which the stand-ins lack.
 */
function onOffSingletonModel() {
    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "Base", classification: "base" }),
        new DeviceTypeModel({ name: "RootNode", id: 0x16, classification: "node" }),
        new DeviceTypeModel(
            { name: "Declarer", id: DECLARER_ID, classification: "simple" },
            new RequirementModel({ name: "OnOff", id: 6, element: "serverCluster", conformance: "O", quality: "I" }),
        ),
        new DeviceTypeModel(
            { name: "Needy", id: NEEDY_ID, classification: "simple" },
            new RequirementModel({ name: "ColorControl", id: 0x300, element: "serverCluster", conformance: "M" }),
        ),
        new DeviceTypeModel({ name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" }),
        new ClusterModel({ name: "OnOff", id: 6 }),
        new ClusterModel({ name: "ColorControl", id: 0x300 }),
    );
    model.finalize();
    return model;
}

/**
 * A model whose OnOffLight requires ColorControl, which the stand-ins lack, only when the node supports Wi-Fi.
 */
function wiFiGatedModel() {
    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "Base", classification: "base" }, new ConditionModel({ name: "WiFi" })),
        new DeviceTypeModel({ name: "RootNode", id: 0x16, classification: "node" }),
        new DeviceTypeModel(
            { name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" },
            new RequirementModel({ name: "ColorControl", id: 0x300, element: "serverCluster", conformance: "WiFi" }),
        ),
        new ClusterModel({ name: "ColorControl", id: 0x300 }),
    );
    model.finalize();
    return model;
}

/**
 * A node judged in {@link guardedRootModel}, with a Widget child.
 */
async function createGuardedNode() {
    const node = await createNode();
    node.env.set(DeviceTypeConformanceService, new DeviceTypeConformanceService(node, node.env, guardedRootModel()));
    const widget = await addStandIn(node, "widget", WIDGET_ID);
    return { node, widget };
}

/**
 * An endpoint whose Descriptor lists only {@link deviceTypes}.
 */
async function addStandIn(parent: Endpoint, id: string, ...deviceTypes: (string | number)[]) {
    return parent.add(DescribedLight, { id, descriptor: { deviceTypeList: deviceTypeList(...deviceTypes) } });
}

class CrashingBehavior extends Behavior {
    static override readonly id = "crashing";
    static override readonly early = true;

    override initialize() {
        throw new ImplementationError("Crashes on purpose");
    }
}

function strictEnvironment() {
    const environment = new Environment("test");
    environment.vars.set("endpoint.validation.strict", true);
    return environment;
}

/**
 * A fridge with one cabinet, added in one step so a strict node accepts it.
 */
async function addFridge(parent: Endpoint) {
    const cabinet = {
        type: TemperatureControlledCabinetDevice,
        id: "cabinet",
        temperatureControl: { minTemperature: 0, maxTemperature: 1000, temperatureSetpoint: 400 },
    };
    const fridge = await parent.add({ type: Fridge, id: "fridge", parts: [cabinet] });
    return { fridge, cabinet: fridge.parts.require("cabinet") };
}

async function createStrictNode() {
    return MockServerNode.createOnline(undefined, { environment: strictEnvironment(), device: undefined });
}

function serviceOf(node: MockServerNode) {
    return node.env.get(DeviceTypeConformanceService);
}

function requirementsOf(node: MockServerNode, endpoint: Endpoint) {
    return serviceOf(node)
        .violationsOf(endpoint)
        .map(({ kind, requirement }) => `${kind} ${requirement}`);
}

async function addDeviceTypes(endpoint: Endpoint, ...deviceTypes: string[]) {
    await endpoint.act(agent => agent.get(DescriptorServer).addDeviceTypes(...deviceTypes));
}

async function addBridgedLight(aggregator: Endpoint, id: string) {
    return aggregator.add(BridgedLight, { id, bridgedDeviceBasicInformation: { nodeLabel: id } });
}

describe("device type validation after construction", () => {
    before(() => {
        MockTime.init();
    });

    describe("when a child is destroyed", () => {
        it("reports the composition it breaks, judging only its ancestors", async () => {
            const node = await createNode();
            const { fridge, cabinets } = await addRefrigerator(node, { cabinets: 1 });
            expect(requirementsOf(node, fridge)).deep.equals([]);

            using recording = recordingChecks();
            const logged = await captureLogOf(() => cabinets[0].close());

            expect(recording.judged).deep.equals([fridge, node]);
            expect(logged.map(({ text }) => text).join("\n")).contains(
                "instanceCount Refrigerator device:TemperatureControlledCabinet",
            );
            expect(requirementsOf(node, fridge)).deep.equals(brokenFridge);

            await node.close();
        });

        it("logs a violation once while it persists and again once it returns", async () => {
            const node = await createNode();
            const { fridge, cabinet } = await addFridge(node);
            const light = await fridge.add(OnOffLightDevice, { id: "light" });

            const first = await captureLogOf(() => cabinet.close());
            const persisting = await captureLogOf(() => light.close());
            await captureLogOf(() => addCabinet(fridge, "second"));
            const returning = await captureLogOf(() => fridge.parts.require("second").close());

            expect(first.length).equals(1);
            expect(persisting).deep.equals([]);
            expect(returning.length).equals(1);

            await node.close();
        });

        it("forgets the destroyed endpoint and its descendants", async () => {
            const node = await createNode();
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            const { fridge } = await addRefrigerator(aggregator, { cabinets: 0 });
            const service = serviceOf(node);
            expect(service.knows(fridge)).true;

            await aggregator.delete();

            expect(service.knows(fridge)).false;

            await node.close();
        });

        it("judges once for a destroyed subtree", async () => {
            const node = await createNode();
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            await addRefrigerator(aggregator, { cabinets: 2 });

            using recording = recordingChecks();
            const logged = await captureLogOf(() => aggregator.close());

            expect(recording.judged).deep.equals([node]);
            expect(logged).deep.equals([]);

            await node.close();
        });

        for (const order of ["child first", "owner first"]) {
            it(`judges only above the owner when an endpoint and its owner close together, ${order}`, async () => {
                const node = await createNode();
                const { fridge, cabinets } = await addRefrigerator(node, { cabinets: 1 });
                const closing = order === "child first" ? [cabinets[0], fridge] : [fridge, cabinets[0]];

                using recording = recordingChecks();
                const logged = await captureLogOf(() => Promise.all(closing.map(endpoint => endpoint.close())));

                expect(recording.judged).deep.equals([node]);
                expect(logged).deep.equals([]);
                expect(serviceOf(node).knows(fridge)).false;

                await node.close();
            });
        }

        it("judges nothing when the owner crashed", async () => {
            const node = await createNode();
            const { fridge } = await addFridge(node);
            await expect(
                fridge.add({
                    type: TemperatureControlledCabinetDevice,
                    id: "crashed",
                    isEssential: false,
                    temperatureControl: { minTemperature: 0, maxTemperature: 1000, temperatureSetpoint: 400 },
                    parts: [{ type: OnOffLightDevice.with(CrashingBehavior), id: "part" }],
                }),
            ).rejectedWith(EndpointPartsError);
            const crashed = fridge.parts.require("crashed");

            using recording = recordingChecks();
            const errors = await captureErrorsOf(() => crashed.parts.require("part").close());

            expect(errors).deep.equals([]);
            expect(recording.judged).deep.equals([]);

            await node.close();
        });

        it("logs rather than refuses in strict mode", async () => {
            const node = await createStrictNode();
            const { fridge, cabinet } = await addFridge(node);

            const logged = await captureLogOf(() => cabinet.close());

            expect(logged.length).equals(1);
            expect(requirementsOf(node, fridge)).deep.equals(brokenFridge);
            expect(node.lifecycle.isOnline).true;

            await node.close();
        });
    });

    describe("when a device type list changes", () => {
        it("reports the endpoint", async () => {
            const node = await createNode();
            const light = await node.add(OnOffLightDevice, { id: "light" });

            const logged = await captureLogOf(() => addDeviceTypes(light, "TemperatureSensor"));

            expect(logged.length).equals(1);
            expect(logged[0].text).contains("missing TemperatureSensor TemperatureMeasurement");
            expect(requirementsOf(node, light)).deep.equals(["missing TemperatureMeasurement"]);

            await node.close();
        });

        it("judges the endpoint's descendants", async () => {
            const node = await createNode();
            const light = await node.add(OnOffLightDevice, { id: "light" });
            const sensor = await light.add(TemperatureSensorDevice, { id: "sensor" });
            expect(requirementsOf(node, sensor)).deep.equals([]);

            await captureLogOf(() => addDeviceTypes(light, "BatteryStorage"));

            expect(requirementsOf(node, sensor)).deep.equals(["missing device:BatteryStorage/TemperatureSensor"]);

            await node.close();
        });

        it("judges the endpoint's ancestors", async () => {
            const node = await createNode();
            const { fridge, cabinets } = await addRefrigerator(node, { cabinets: 1 });

            // A node endpoint leaves the composition of the endpoints above it
            await captureLogOf(() => addDeviceTypes(cabinets[0], "RootNode"));

            expect(requirementsOf(node, fridge)).deep.equals(brokenFridge);

            await node.close();
        });

        it("judges nothing for a device type an endpoint adds while it is constructed", async () => {
            const node = await createNode();

            using recording = recordingChecks();
            const light = await node.add({
                type: OnOffLightDevice,
                id: "light",
                parts: [{ type: TemperatureSensorDevice, id: "sensor" }],
            });

            expect(recording.judged).deep.equals([light, light.parts.require("sensor"), node]);

            await node.close();
        });
    });

    describe("siblings", () => {
        it("judges the sibling a second light makes a duplicate", async () => {
            const node = await createNode();
            const first = await node.add(OnOffLightDevice, { id: "first" });
            expect(requirementsOf(node, first)).deep.equals([]);

            using recording = recordingChecks();
            const logged = await captureLogOf(() => node.add(OnOffLightDevice, { id: "second" }));
            const second = node.parts.require("second");

            expect(recording.judged).deep.equals([second, first, node]);
            expect(logged.length).equals(2);
            expect(requirementsOf(node, first)).deep.equals([missingTagList]);

            await node.close();
        });

        it("clears the violation of the sibling a removal leaves unique", async () => {
            const node = await createNode();
            const first = await node.add(OnOffLightDevice, { id: "first" });
            const second = await captureLogOf(() => node.add(OnOffLightDevice, { id: "second" })).then(() =>
                node.parts.require("second"),
            );
            expect(requirementsOf(node, first)).deep.equals([missingTagList]);

            using recording = recordingChecks();
            await second.close();

            expect(recording.judged).deep.equals([first, node]);
            expect(requirementsOf(node, first)).deep.equals([]);

            await node.close();
        });

        it("judges the siblings a device type change makes duplicates", async () => {
            const node = await createNode();
            const light = await node.add(OnOffLightDevice, { id: "light" });
            const sensor = await node.add(TemperatureSensorDevice.with(DescriptorServer), { id: "sensor" });

            await captureLogOf(() => addDeviceTypes(sensor, "OnOffLight"));

            expect(requirementsOf(node, light)).deep.equals([missingTagList]);

            await node.close();
        });

        it("judges a constant number of endpoints per identical bridged light", async () => {
            const node = await createNode();
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            await addBridgedLight(aggregator, "light1");
            await addBridgedLight(aggregator, "light2");

            for (let i = 3; i <= 100; i++) {
                using recording = recordingChecks();
                const light = await addBridgedLight(aggregator, `light${i}`);
                expect(recording.judged).deep.equals([light, aggregator, node]);
            }

            using recording = recordingChecks();
            await aggregator.parts.require("light50").close();
            expect(recording.judged).deep.equals([aggregator, node]);

            await node.close();
        });
    });

    describe("a fact that reaches the node scope", () => {
        it("judges the whole node scope when an endpoint supporting a network interface is added", async () => {
            const node = await createNode();
            const sensor = await node.add(TemperatureSensorDevice, { id: "sensor" });

            using recording = recordingChecks();
            await captureLogOf(() => node.add(WiFiLight, { id: "wifi" }));

            expect(recording.judged).contains(sensor);

            await node.close();
        });

        it("judges the whole node scope when a subtree with such an endpoint is added", async () => {
            const node = await createNode();
            const sensor = await node.add(TemperatureSensorDevice, { id: "sensor" });

            using recording = recordingChecks();
            await captureLogOf(() =>
                node.add({ type: AggregatorEndpoint, id: "aggregator", parts: [{ type: WiFiLight, id: "wifi" }] }),
            );

            expect(recording.judged).contains(sensor);

            await node.close();
        });

        it("judges the whole node scope when an endpoint declaring a singleton is added", async () => {
            const { node, widget } = await createGuardedNode();

            using recording = recordingChecks();
            await captureLogOf(() => addStandIn(node, "declarer", DECLARER_ID));

            expect(recording.judged).contains(widget);

            await node.close();
        });

        it("judges the whole node scope when an endpoint without a recorded judgement changes", async () => {
            const node = await createNode();
            const sensor = await node.add(TemperatureSensorDevice, { id: "sensor" });
            const light = await node.add(DescribedLight, { id: "light" });
            serviceOf(node).forget(light);

            using recording = recordingChecks();
            await captureLogOf(() => addDeviceTypes(light, "OnOffLightSwitch"));

            expect(recording.judged).deep.equals([light, node, sensor]);

            await node.close();
        });

        it("judges the whole node scope when an endpoint without a recorded judgement is destroyed", async () => {
            const node = await createNode();
            const sensor = await node.add(TemperatureSensorDevice, { id: "sensor" });
            const light = await node.add(OnOffLightDevice, { id: "light" });
            serviceOf(node).forget(light);

            using recording = recordingChecks();
            await light.close();

            expect(recording.judged).deep.equals([node, sensor]);

            await node.close();
        });

        it("judges the whole node scope when a destroyed descendant has no recorded judgement", async () => {
            const node = await createNode();
            const sensor = await node.add(TemperatureSensorDevice, { id: "sensor" });
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            const light = await addBridgedLight(aggregator, "light");
            serviceOf(node).forget(light);

            using recording = recordingChecks();
            await aggregator.close();

            expect(recording.judged).deep.equals([node, sensor]);

            await node.close();
        });

        it("judges only the node endpoint when a nested node endpoint with such a descendant is destroyed", async () => {
            const node = await createNode();
            await node.add(TemperatureSensorDevice, { id: "sensor" });
            const nested = await node.add(DescribedLight, { id: "nested" });
            await captureLogOf(() => nested.add(WiFiLight, { id: "wifi" }));
            await captureLogOf(() => nested.set({ descriptor: { deviceTypeList: deviceTypeList("RootNode") } }));

            using recording = recordingChecks();
            await captureLogOf(() => nested.close());

            expect(recording.judged).deep.equals([node]);

            await node.close();
        });

        it("judges the whole node scope when an endpoint above such an endpoint becomes a node endpoint", async () => {
            const node = await createNode();
            const sensor = await node.add(TemperatureSensorDevice, { id: "sensor" });
            const light = await node.add(OnOffLightDevice.with(DescriptorServer), { id: "light" });
            await captureLogOf(() => light.add(WiFiLight, { id: "wifi" }));

            using recording = recordingChecks();
            await captureLogOf(() => addDeviceTypes(light, "RootNode"));

            expect(recording.judged).contains(sensor);

            await node.close();
        });

        it("judges the whole node scope when a subtree with such an endpoint is destroyed", async () => {
            const node = await createNode();
            const sensor = await node.add(TemperatureSensorDevice, { id: "sensor" });
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            await captureLogOf(() => aggregator.add(WiFiLight, { id: "wifi" }));

            using recording = recordingChecks();
            await captureLogOf(() => aggregator.close());

            expect(recording.judged).deep.equals([node, sensor]);

            await node.close();
        });
    });

    describe("a condition asserted on the node endpoint", () => {
        it("judges a constant number of endpoints per bridged lock", async () => {
            const node = await createNode();
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            const addLock = (id: string) =>
                captureLogOf(() =>
                    aggregator.add(BridgedLight.with(DescriptorServer), {
                        id,
                        bridgedDeviceBasicInformation: { nodeLabel: id },
                        descriptor: { deviceTypeList: deviceTypeList("DoorLock", "BridgedNode") },
                    }),
                ).then(() => aggregator.parts.require(id));
            await addLock("lock1");
            await addLock("lock2");

            for (let i = 3; i <= 30; i++) {
                using recording = recordingChecks();
                const lock = await addLock(`lock${i}`);
                expect(recording.judged).deep.equals([lock, aggregator, node]);
            }

            using recording = recordingChecks();
            await captureLogOf(() => aggregator.parts.require("lock10").close());
            expect(recording.judged).deep.equals([aggregator, node]);

            await node.close();
        });

        it("judges the endpoints whose component judgement reads the node endpoint's conditions", async () => {
            const { node, widget } = await createGuardedNode();
            const bystander = await addStandIn(node, "bystander", "OnOffLight");
            expect(requirementsOf(node, widget)).deep.equals([]);

            using recording = recordingChecks();
            const asserter = await captureLogOf(() => addStandIn(node, "asserter", ASSERTER_ID)).then(() =>
                node.parts.require("asserter"),
            );

            expect(recording.judged).deep.equals([asserter, node, widget]);
            expect(recording.judged).not.contains(bystander);
            expect(requirementsOf(node, widget)).deep.equals([unguardedWidget]);

            await node.close();
        });

        it("judges them when a sibling starts asserting because it becomes a duplicate", async () => {
            const { node, widget } = await createGuardedNode();
            await addStandIn(node, "asserter", DUPLICATE_ASSERTER_ID, "OnOffLight");
            expect(requirementsOf(node, widget)).deep.equals([]);

            await captureLogOf(() => addStandIn(node, "light", "OnOffLight"));

            expect(requirementsOf(node, widget)).deep.equals([unguardedWidget]);

            await node.close();
        });

        it("judges them when an endpoint starts asserting", async () => {
            const { node, widget } = await createGuardedNode();
            const light = await addStandIn(node, "light", "OnOffLight");

            await captureLogOf(() =>
                light.set({ descriptor: { deviceTypeList: deviceTypeList("OnOffLight", ASSERTER_ID) } }),
            );

            expect(requirementsOf(node, widget)).deep.equals([unguardedWidget]);

            await node.close();
        });

        it("judges them when an endpoint stops asserting", async () => {
            const { node, widget } = await createGuardedNode();
            const asserter = await captureLogOf(() => addStandIn(node, "asserter", ASSERTER_ID)).then(() =>
                node.parts.require("asserter"),
            );
            expect(requirementsOf(node, widget)).deep.equals([unguardedWidget]);

            await captureLogOf(() => asserter.set({ descriptor: { deviceTypeList: deviceTypeList("OnOffLight") } }));

            expect(requirementsOf(node, widget)).deep.equals([]);

            await node.close();
        });

        it("judges no reader above a nested node endpoint the assertion targets", async () => {
            const { node, widget } = await createGuardedNode();

            using recording = recordingChecks();
            await captureLogOf(() =>
                node.add(DescribedLight, {
                    id: "nested",
                    descriptor: { deviceTypeList: deviceTypeList("RootNode") },
                    parts: [
                        new Endpoint(DescribedLight, {
                            id: "asserter",
                            descriptor: { deviceTypeList: deviceTypeList(ASSERTER_ID) },
                        }),
                    ],
                }),
            );

            expect(recording.judged).not.contains(widget);

            await node.close();
        });

        it("judges no reader when a nested node endpoint starts asserting on itself", async () => {
            const { node, widget } = await createGuardedNode();
            await addStandIn(node, "light", "OnOffLight");
            const nested = await addStandIn(node, "nested", "RootNode", DUPLICATE_ASSERTER_ID);

            using recording = recordingChecks();
            await captureLogOf(() =>
                nested.set({
                    descriptor: { deviceTypeList: deviceTypeList("RootNode", DUPLICATE_ASSERTER_ID, "OnOffLight") },
                }),
            );

            expect(recording.judged).contains(nested);
            expect(recording.judged).not.contains(widget);

            await node.close();
        });

        it("judges them when an asserting endpoint is destroyed", async () => {
            const { node, widget } = await createGuardedNode();
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            await captureLogOf(() => addStandIn(aggregator, "asserter", ASSERTER_ID));
            expect(requirementsOf(node, widget)).deep.equals([unguardedWidget]);

            await captureLogOf(() => aggregator.close());

            expect(requirementsOf(node, widget)).deep.equals([]);

            await node.close();
        });
    });

    describe("what passes keep of a node scope", () => {
        it("reads nothing outside the judged endpoints when an addition adds nothing that reaches the node scope", async () => {
            const node = await createNode();
            node.env.set(
                DeviceTypeConformanceService,
                new DeviceTypeConformanceService(node, node.env, onOffSingletonModel()),
            );
            const shelf = await addStandIn(node, "shelf", "OnOffLight");
            const stored = [
                await addStandIn(shelf, "stored1", "OnOffLight"),
                await addStandIn(shelf, "stored2", "OnOffLight"),
            ];
            const bay = await addStandIn(node, "bay", "OnOffLight");

            // Needy states a server cluster requirement that is no singleton
            using reads = recordingReads();
            await captureLogOf(() => addStandIn(bay, "needy", NEEDY_ID));

            expect(stored.filter(endpoint => reads.read.has(endpoint))).deep.equals([]);

            await node.close();
        });

        it("reads the node scope again once a nested node endpoint stops being one", async () => {
            const { node, widget } = await createGuardedNode();
            const nested = await captureLogOf(() =>
                node.add(DescribedLight, {
                    id: "nested",
                    descriptor: { deviceTypeList: deviceTypeList("RootNode") },
                    parts: [
                        new Endpoint(DescribedLight, {
                            id: "asserter",
                            descriptor: { deviceTypeList: deviceTypeList(ASSERTER_ID) },
                        }),
                    ],
                }),
            ).then(() => node.parts.require("nested"));
            expect(requirementsOf(node, widget)).deep.equals([]);

            await captureLogOf(() => nested.set({ descriptor: { deviceTypeList: deviceTypeList("OnOffLight") } }));

            expect(requirementsOf(node, widget)).deep.equals([unguardedWidget]);

            await node.close();
        });

        it("reads a network interface of a server cluster added at runtime", async () => {
            const node = await createNode();
            node.env.set(
                DeviceTypeConformanceService,
                new DeviceTypeConformanceService(node, node.env, wiFiGatedModel()),
            );
            const light = await addStandIn(node, "light", "OnOffLight");
            const other = await addStandIn(node, "other", "OnOffLight");
            expect(requirementsOf(node, light)).deep.equals([]);

            other.behaviors.require(WiFiCommissioningServer);

            expect(captureLog(() => serviceOf(node).validate(light)).length).equals(1);
            expect(requirementsOf(node, light)).deep.equals(["missing ColorControl"]);

            await node.close();
        });

        for (const isEssential of [true, false]) {
            it(`drops an endpoint whose addition it refused, ${isEssential ? "rolled back" : "left crashed"}`, async () => {
                const node = await createStrictNode();
                node.env.set(
                    DeviceTypeConformanceService,
                    new DeviceTypeConformanceService(node, strictEnvironment(), guardedRootModel()),
                );
                const widget = await addStandIn(node, "widget", WIDGET_ID);

                await expect(
                    node.add(DescribedLight, {
                        id: "asserter",
                        isEssential,
                        descriptor: { deviceTypeList: deviceTypeList(ASSERTER_ID) },
                    }),
                ).rejected;
                expect(node.parts.has("asserter")).equals(!isEssential);

                expect(() => serviceOf(node).validate(widget)).not.throws();
                expect(requirementsOf(node, widget)).deep.equals([]);

                await node.close();
            });
        }
    });

    describe("a refused addition", () => {
        it("logs nothing and throws every endpoint strict mode refuses", async () => {
            const node = await createStrictNode();
            const first = await node.add(OnOffLightDevice, { id: "first" });

            let error: unknown;
            const logged = await captureLogOf(() =>
                node.add(OnOffLightDevice, { id: "second" }).catch(e => {
                    error = e;
                }),
            );

            expect(logged).deep.equals([]);
            expect(node.parts.has("second")).false;
            expect(requirementsOf(node, first)).deep.equals([]);
            expect(error).instanceOf(DeviceTypeConformanceError);
            if (error instanceof DeviceTypeConformanceError) {
                expect(error.message).contains("second");
                const nested = error.errors.filter(cause => cause instanceof DeviceTypeConformanceError);
                expect(nested.map(({ message }) => message)).deep.equals([
                    `Endpoint ${first} violates device type requirements`,
                ]);
            }

            await node.close();
        });

        it("logs nothing for an endpoint judged in the pass that it does not refuse", async () => {
            const node = await createNode();
            node.env.set(
                DeviceTypeConformanceService,
                new DeviceTypeConformanceService(node, node.env, onOffSingletonModel()),
            );
            await addStandIn(node, "light", "OnOffLight");

            let error: unknown;
            const logged = await captureLogOf(() =>
                addStandIn(node, "declarer", DECLARER_ID, NEEDY_ID).catch(e => {
                    error = e;
                }),
            );

            expect(error).instanceOf(DeviceTypeConformanceError);
            expect(error instanceof DeviceTypeConformanceError && error.message).contains("light");
            expect(node.parts.has("declarer")).false;
            expect(logged).deep.equals([]);

            await node.close();
        });
    });

    describe("a later addition", () => {
        it("is not refused in strict mode for a sibling violation a runtime change caused", async () => {
            const node = await createStrictNode();
            const light = await node.add(OnOffLightDevice, { id: "light" });
            const sensor = await node.add(TemperatureSensorDevice.with(DescriptorServer), { id: "sensor" });
            await captureLogOf(() => addDeviceTypes(sensor, "OnOffLight"));

            const logged = await captureLogOf(() => light.add(OnOffLightDevice, { id: "child" }));

            expect(light.parts.has("child")).true;
            expect(logged).deep.equals([]);

            await node.close();
        });

        it("is refused in strict mode for a sibling violation it causes", async () => {
            const node = await createStrictNode();
            await node.add(OnOffLightDevice, { id: "untagged" });

            await expect(node.add(TaggedLight, { id: "tagged", descriptor: { tagList } })).rejectedWith(
                DeviceTypeConformanceError,
                "untagged",
            );
            expect(node.parts.has("tagged")).false;

            await node.close();
        });

        it("is not refused in strict mode for an ancestor violation a runtime change caused", async () => {
            const node = await createStrictNode();
            const { fridge, cabinet } = await addFridge(node);
            await captureLogOf(() => cabinet.close());

            const logged = await captureLogOf(() => fridge.add(OnOffLightDevice, { id: "light" }));

            expect(fridge.parts.has("light")).true;
            expect(logged).deep.equals([]);

            await node.close();
        });

        it("is not refused in strict mode for an ancestor's added device type", async () => {
            const node = await createStrictNode();
            const light = await node.add(OnOffLightDevice, { id: "light" });
            await captureLogOf(() => addDeviceTypes(light, "TemperatureSensor"));

            const logged = await captureLogOf(() => light.add(OnOffLightDevice, { id: "child" }));

            expect(light.parts.has("child")).true;
            expect(logged).deep.equals([]);

            await node.close();
        });

        it("is not refused for a singleton a runtime change misplaced in an ancestor", async () => {
            const node = await createNode();
            const nested = await node.add(lightWithGroupKeyManagement.with(DescriptorServer), {
                id: "nested",
                descriptor: { deviceTypeList: deviceTypeList("RootNode") },
            });
            const logged = await captureLogOf(() =>
                nested.set({ descriptor: { deviceTypeList: deviceTypeList("OnOffLight") } }),
            );
            expect(logged.map(({ text }) => text).join("\n")).contains("singletonMisplaced");

            await nested.add(OnOffLightDevice, { id: "child" });

            expect(nested.parts.has("child")).true;

            await node.close();
        });

        it("is refused in strict mode for an ancestor violation it causes", async () => {
            const node = await createStrictNode();
            node.env.set(
                DeviceTypeConformanceService,
                new DeviceTypeConformanceService(node, strictEnvironment(), singleComponentModel()),
            );
            const composer = await node.add(OnOffLightDevice.with(DescriptorServer), {
                id: "composer",
                descriptor: { deviceTypeList: deviceTypeList(COMPOSER_ID) },
                parts: [{ type: OnOffLightDevice, id: "light1" }],
            });

            await expect(composer.add(OnOffLightDevice, { id: "light2" })).rejectedWith(
                DeviceTypeConformanceError,
                "composer",
            );
            expect(composer.parts.has("light2")).false;

            await node.close();
        });
    });

    describe("node teardown", () => {
        it("judges and logs nothing and forgets every endpoint", async () => {
            const node = await createNode();
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            const { fridge } = await addRefrigerator(aggregator, { cabinets: 0 });
            const service = serviceOf(node);
            expect(service.knows(fridge)).true;

            using recording = recordingChecks();
            const logged = await captureLogOf(() => node.close());

            expect(recording.judged).deep.equals([]);
            expect(logged).deep.equals([]);
            expect(service.knows(fridge)).false;
        });
    });

    describe("a peer", () => {
        it("judges nothing when an endpoint of a peer changes or is destroyed", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            const address = { fabricIndex: fabric.fabricIndex, nodeId: NodeId(BigInt(fabric.nodeId) + 1n) };
            await node.peers.forAddress(address);
            const peer = node.peers.get(address);
            if (peer === undefined) {
                throw new ImplementationError("Test peer is missing");
            }
            const endpoint = peer.endpoints.require(1);
            await endpoint.construction.ready;
            const service = serviceOf(node);

            using recording = recordingChecks();
            const logged = await captureLogOf(async () => {
                service.deviceTypesChanged(endpoint);
                service.deviceTypesChanged(peer);
                service.endpointDestroyed(endpoint);
                await endpoint.close();
            });

            expect(recording.judged).deep.equals([]);
            expect(logged).deep.equals([]);

            await node.close();
        });
    });

    describe("in default configuration", () => {
        it("logs no warning for a light through start, runtime changes and close", async () => {
            const logged = await captureLogOf(async () => {
                const node = await MockServerNode.createOnline();
                const sensor = await node.add(TemperatureSensorDevice, { id: "sensor" });
                await sensor.delete();
                await node.close();
            });

            expect(logged).deep.equals([]);
        });

        it("logs no warning for a bridge through start, runtime changes and close", async () => {
            const logged = await captureLogOf(async () => {
                const node = await MockServerNode.createOnline(undefined, { device: undefined });
                const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
                const lights = new Array<Endpoint>();
                for (const id of ["light1", "light2", "light3"]) {
                    lights.push(await addBridgedLight(aggregator, id));
                }
                await lights[0].delete();
                await lights[1].close();
                await addBridgedLight(aggregator, "light4");
                await node.close();
            });

            expect(logged).deep.equals([]);
        });
    });
});
