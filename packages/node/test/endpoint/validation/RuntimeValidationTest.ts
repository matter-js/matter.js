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
import { DeviceTypeModel, MatterModel, RequirementModel } from "@matter/model";
import { MockServerNode } from "../../node/mock-server-node.js";
import {
    addCabinet,
    addRefrigerator,
    captureErrorsOf,
    captureLogOf,
    createNode,
    deviceTypeList,
    lightWithGroupKeyManagement,
    recordingChecks,
} from "./validation-helpers.js";

const BridgedLight = OnOffLightDevice.with(BridgedDeviceBasicInformationServer);

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

    describe("a later addition", () => {
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
