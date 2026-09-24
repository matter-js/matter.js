/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorServer } from "#behaviors/descriptor";
import { GroupKeyManagementBehavior } from "#behaviors/group-key-management";
import { OnOffLightDevice, OnOffLightRequirements } from "#devices/on-off-light";
import { SupportedBehaviors } from "#endpoint/properties/SupportedBehaviors.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { ConditionAssertions } from "#endpoint/validation/ConditionAssertions.js";
import { DeviceTypeConformanceService } from "#endpoint/validation/DeviceTypeConformanceService.js";
import { EndpointFacts } from "#endpoint/validation/EndpointFacts.js";
import { ValidationPass } from "#endpoint/validation/ValidationPass.js";
import { DeviceTypeConformanceError, DeviceTypeViolationError } from "#endpoint/validation/Violation.js";
import { Diagnostic, Environment, LogDestination, Logger, LogFormat, LogLevel } from "@matter/general";
import { ClusterModel, DeviceTypeModel, MatterModel, RequirementModel } from "@matter/model";
import { MockServerNode } from "../../node/mock-server-node.js";
import { createNode, deviceTypeList } from "./validation-helpers.js";

const { Groups, OnOff, ScenesManagement } = OnOffLightRequirements.server.mandatory;

function lightWith(...behaviors: SupportedBehaviors.List) {
    return MutableEndpoint({
        name: "OnOffLight",
        deviceType: OnOffLightDevice.deviceType,
        deviceRevision: OnOffLightDevice.deviceRevision,
        behaviors: SupportedBehaviors(...behaviors),
    });
}

// Lacks the mandatory Identify and ScenesManagement servers
const lightWithoutIdentifyAndScenes = lightWith(Groups, OnOff);

// Lacks the mandatory Identify server. Descriptor is listed so a test can change the device types
const lightWithoutIdentify = lightWith(Groups, OnOff, ScenesManagement, DescriptorServer);

// Carries GroupKeyManagement, a singleton of RootNode. Stand-in: the unimplemented behavior, because the server
// cannot initialize off the root
const lightWithGroupKeyManagement = OnOffLightDevice.with(GroupKeyManagementBehavior);

interface Captured {
    level: LogLevel;
    text: string;
    origin?: Diagnostic.Origin;
}

function captureLog(actor: () => void) {
    const messages = new Array<Captured>();
    Logger.destinations.capture = LogDestination({
        format: LogFormat.formats.plain,
        write(text, { level, origin }) {
            messages.push({ level, text, origin });
        },
    });
    try {
        actor();
    } finally {
        delete Logger.destinations.capture;
    }
    return messages.filter(({ text }) => text.includes("does not conform"));
}

function serviceOf(node: MockServerNode) {
    return node.env.get(DeviceTypeConformanceService);
}

async function createStrictNode(strict: boolean) {
    const environment = new Environment("test");
    environment.vars.set("endpoint.validation.strict", strict);
    return MockServerNode.createOnline(undefined, { environment, device: undefined });
}

describe("DeviceTypeConformanceService", () => {
    it("logs one warning listing every violation of an endpoint", async () => {
        const node = await createNode();
        const light = await node.add(lightWithoutIdentifyAndScenes, { id: "light" });

        const logged = captureLog(() => serviceOf(node).validate(light));

        expect(logged.length).equals(1);
        expect(logged[0].level).equals(LogLevel.WARN);
        expect(logged[0].text).contains("missing OnOffLight Identify: Mandatory server cluster Identify is missing");
        expect(logged[0].text).contains("missing OnOffLight ScenesManagement");
        expect(serviceOf(node).knows(light)).true;

        await node.close();
    });

    it("names the node as the origin of its warning", async () => {
        const node = await createNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });

        const logged = captureLog(() => serviceOf(node).validate(light));

        expect(logged.length).equals(1);
        expect(logged[0].origin).equals(node.env.logOrigin);

        await node.close();
    });

    it("does not log the same violation twice", async () => {
        const node = await createNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = serviceOf(node);

        expect(captureLog(() => service.validate(light)).length).equals(1);
        expect(captureLog(() => service.validate(light))).deep.equals([]);

        await node.close();
    });

    it("logs only the new violation of an endpoint it reported before", async () => {
        const node = await createNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = serviceOf(node);
        captureLog(() => service.validate(light));

        // DimmableLight adds the mandatory LevelControl server the light lacks
        await light.set({ descriptor: { deviceTypeList: deviceTypeList("OnOffLight", "DimmableLight") } });
        const logged = captureLog(() => service.validate(light));

        expect(logged.length).equals(1);
        expect(logged[0].text).contains("LevelControl");
        expect(logged[0].text).not.contains("Identify");

        await node.close();
    });

    it("logs a violation again once it disappeared and returned", async () => {
        const node = await createNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = serviceOf(node);
        captureLog(() => service.validate(light));

        // Without a device type the endpoint violates nothing
        await light.set({ descriptor: { deviceTypeList: [] } });
        expect(captureLog(() => service.validate(light))).deep.equals([]);
        expect(service.knows(light)).false;

        await light.set({ descriptor: { deviceTypeList: deviceTypeList("OnOffLight") } });
        expect(captureLog(() => service.validate(light)).length).equals(1);

        await node.close();
    });

    it("is not strict unless the environment says so", async () => {
        const node = await createStrictNode(false);
        const light = await node.add(lightWithoutIdentify, { id: "light" });

        expect(serviceOf(node).strict).false;
        expect(captureLog(() => serviceOf(node).validate(light)).length).equals(1);

        await node.close();
    });

    it("throws when validation is strict", async () => {
        const node = await createStrictNode(true);
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = serviceOf(node);

        expect(service.strict).true;

        let error: unknown;
        const logged = captureLog(() => {
            try {
                service.validate(light);
            } catch (e) {
                error = e;
            }
        });

        expect(error).instanceOf(DeviceTypeConformanceError);
        if (error instanceof DeviceTypeConformanceError) {
            expect(error.errors.length).equals(1);
            expect(error.errors[0]).instanceOf(DeviceTypeViolationError);
            expect(error.errors[0].message).equals("OnOffLight Identify: Mandatory server cluster Identify is missing");
        }
        expect(logged).deep.equals([]);

        await node.close();
    });

    it("logs rather than throws in strict mode when told not to refuse", async () => {
        const node = await createStrictNode(true);
        const light = await node.add(lightWithoutIdentify, { id: "light" });

        expect(captureLog(() => serviceOf(node).validate(light, { refuse: false })).length).equals(1);

        await node.close();
    });

    it("throws a misplaced singleton when validation is not strict", async () => {
        const node = await createNode();
        const light = await node.add(lightWithGroupKeyManagement, { id: "light" });
        const service = serviceOf(node);

        expect(service.strict).false;
        expect(() => service.validate(light)).throws(DeviceTypeConformanceError);

        await node.close();
    });

    it("throws the first refused endpoint and logs the others", async () => {
        const node = await createStrictNode(true);
        const first = await node.add(lightWithoutIdentify, { id: "first" });
        const second = await node.add(lightWithoutIdentify, { id: "second" });

        let error: unknown;
        const logged = captureLog(() => {
            try {
                serviceOf(node).validate([first, second]);
            } catch (e) {
                error = e;
            }
        });

        expect(error).instanceOf(DeviceTypeConformanceError);
        expect(error instanceof DeviceTypeConformanceError && error.message).contains("first");
        expect(logged.length).equals(1);
        expect(logged[0].text).contains("second");

        await node.close();
    });

    it("validates every endpoint of a node scope", async () => {
        const node = await createNode();
        const first = await node.add(lightWithoutIdentify, { id: "first" });
        const second = await node.add(lightWithoutIdentify, { id: "second" });
        const service = serviceOf(node);

        const logged = captureLog(() => service.validateNodeScope(first));

        expect(logged.filter(({ text }) => text.includes("first")).length).equals(1);
        expect(logged.filter(({ text }) => text.includes("second")).length).equals(1);
        expect(service.knows(first) && service.knows(second)).true;

        await node.close();
    });

    it("does not judge an endpoint in no node scope", async () => {
        const node = await createNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });

        // RootNode is not a node here, so nothing is judged, though OnOffLight requires the missing Identify
        const model = new MatterModel(
            {},
            new DeviceTypeModel({ name: "Base", classification: "base" }),
            new DeviceTypeModel({ name: "RootNode", id: 0x16, classification: "simple" }),
            new DeviceTypeModel(
                { name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" },
                new RequirementModel({ name: "Identify", id: 3, element: "serverCluster", conformance: "M" }),
            ),
            new ClusterModel({ name: "Identify", id: 3 }),
        );
        model.finalize();
        const service = new DeviceTypeConformanceService(node, node.env, model);

        expect(captureLog(() => service.validate(light))).deep.equals([]);
        expect(service.knows(light)).false;

        await node.close();
    });

    it("reports an endpoint's violations again once it is forgotten", async () => {
        const node = await createNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = serviceOf(node);
        captureLog(() => service.validate(light));

        service.forget(light);

        expect(service.knows(light)).false;
        expect(captureLog(() => service.validate(light)).length).equals(1);

        await node.close();
    });

    it("forgets every endpoint on factory reset", async () => {
        const node = await createNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = serviceOf(node);
        captureLog(() => service.validate(light));
        expect(service.knows(light)).true;

        await MockTime.resolve(node.erase(), { macrotasks: true });

        expect(serviceOf(node)).equals(service);
        expect(service.knows(light)).false;

        await node.close();
    });
});

describe("ValidationPass", () => {
    async function createPair() {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });
        return { node, light };
    }

    it("reads each endpoint once per pass", async () => {
        const { node, light } = await createPair();
        const pass = new ValidationPass();

        expect(EndpointFacts.of(light, pass)).equals(EndpointFacts.of(light, pass));
        expect(EndpointFacts.of(light, pass)).not.equals(EndpointFacts.of(light, new ValidationPass()));

        await node.close();
    });

    it("collects each node scope once per pass", async () => {
        const { node } = await createPair();
        const pass = new ValidationPass();

        expect(ConditionAssertions.collect(node, pass)).equals(ConditionAssertions.collect(node, pass));
        expect(ConditionAssertions.collect(node, pass)).not.equals(ConditionAssertions.collect(node));

        await node.close();
    });
});
