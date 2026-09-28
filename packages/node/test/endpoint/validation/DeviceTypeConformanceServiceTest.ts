/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffLightDevice } from "#devices/on-off-light";
import { DeviceTypeConformanceError, DeviceTypeViolationError } from "#node/server/DeviceTypeConformanceError.js";
import { DeviceTypeConformanceService } from "#node/server/DeviceTypeConformanceService.js";
import { DeviceTypeValidation } from "#node/server/DeviceTypeValidation.js";
import { Environment, ImplementationError, LogLevel } from "@matter/general";
import {
    ClusterModel,
    ConditionAssertions,
    DeviceTypeModel,
    Matter,
    MatterModel,
    RequirementModel,
    ResolvedEndpoint,
} from "@matter/model";
import { MockServerNode } from "../../node/mock-server-node.js";
import {
    captureLog,
    captureLogOf,
    createNode,
    createUnjudgedNode,
    deviceTypeList,
    lightWithGroupKeyManagement,
    lightWithoutIdentify,
    lightWithoutIdentifyAndScenes,
    serverPass,
} from "./validation-helpers.js";

function serviceOf(node: MockServerNode) {
    return node.env.get(DeviceTypeConformanceService);
}

/**
 * A service of {@link node} that has reported nothing yet and resolves in the standard model, in the {@link mode} given
 * or the one the node's environment sets without it.
 */
function judgeOf(node: MockServerNode, mode?: DeviceTypeValidation.Mode) {
    if (mode === undefined) {
        return new DeviceTypeConformanceService(node, { model: Matter });
    }
    const environment = new Environment("test");
    environment.vars.set("endpoint.validation", mode);
    return new DeviceTypeConformanceService(node, { environment, model: Matter });
}

/**
 * A model in which no device type is classified a node, so no endpoint belongs to a node scope. Its OnOffLight requires
 * Identify.
 */
function modelWithoutNodes() {
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
    return model;
}

describe("DeviceTypeConformanceService", () => {
    it("logs one warning listing every violation of an endpoint", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentifyAndScenes, { id: "light" });
        const service = judgeOf(node);

        const logged = captureLog(() => service.validate(light));

        expect(logged.length).equals(1);
        expect(logged[0].level).equals(LogLevel.WARN);
        expect(logged[0].text).contains("missing OnOffLight Identify: Mandatory server cluster Identify is missing");
        expect(logged[0].text).contains("missing OnOffLight ScenesManagement");
        expect(service.violationsOf(light).length).not.equals(0);

        await node.close();
    });

    it("names the node as the origin of its warning", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });

        const logged = captureLog(() => judgeOf(node).validate(light));

        expect(logged.length).equals(1);
        expect(logged[0].origin).equals(node.env.logOrigin);

        await node.close();
    });

    it("does not log the same violation twice", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = judgeOf(node);

        expect(captureLog(() => service.validate(light)).length).equals(1);
        expect(captureLog(() => service.validate(light))).deep.equals([]);

        await node.close();
    });

    it("logs only the new violation of an endpoint it reported before", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = judgeOf(node);
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
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = judgeOf(node);
        captureLog(() => service.validate(light));

        // Without a device type the endpoint violates nothing
        await light.set({ descriptor: { deviceTypeList: [] } });
        expect(captureLog(() => service.validate(light))).deep.equals([]);
        expect(service.violationsOf(light)).deep.equals([]);

        await light.set({ descriptor: { deviceTypeList: deviceTypeList("OnOffLight") } });
        expect(captureLog(() => service.validate(light)).length).equals(1);

        await node.close();
    });

    it("is in warn mode unless the environment says otherwise", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });

        const service = new DeviceTypeConformanceService(node, { environment: new Environment("test"), model: Matter });

        expect(service.mode).equals("warn");
        expect(captureLog(() => service.validate(light)).length).equals(1);

        await node.close();
    });

    it("reads the mode from MATTER_ENDPOINT_VALIDATION", async () => {
        const node = await createUnjudgedNode();
        const environment = new Environment("test");
        environment.vars.addUnixEnvStyle({ MATTER_ENDPOINT_VALIDATION: "off" });

        expect(new DeviceTypeConformanceService(node, { environment }).mode).equals("off");

        await node.close();
    });

    it("rejects an unknown mode, naming the variable, the value and the modes", async () => {
        const node = await createUnjudgedNode();
        const environment = new Environment("test");
        environment.vars.set("endpoint.validation", "loud");

        expect(() => new DeviceTypeConformanceService(node, { environment })).throws(
            ImplementationError,
            'Variable endpoint.validation (environment variable MATTER_ENDPOINT_VALIDATION) is "loud" but must be one of "off", "warn", "strict"',
        );

        await node.close();
    });

    it("judges on request in off mode, like warn mode, but records nothing", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = judgeOf(node, "off");

        let verdict: DeviceTypeValidation.Verdict | undefined;
        expect(captureLog(() => (verdict = service.validate(light))).length).equals(1);
        expect(verdict?.get(light)?.map(({ requirement }) => requirement)).deep.equals(["Identify"]);
        expect(service.violationsOf(light)).deep.equals([]);

        // Nothing recorded, so each call logs again
        expect(captureLog(() => service.validate(light)).length).equals(1);

        await node.close();
    });

    it("returns every violation of each judged endpoint, reported before or not", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = judgeOf(node);
        captureLog(() => service.validate(light));

        let verdict: DeviceTypeValidation.Verdict | undefined;
        expect(captureLog(() => (verdict = service.validate(light)))).deep.equals([]);

        expect([...(verdict?.keys() ?? [])]).deep.equals([light]);
        expect(verdict?.get(light)).deep.equals(service.violationsOf(light));
        expect(service.violationsOf(light).map(({ requirement }) => requirement)).deep.equals(["Identify"]);

        await node.close();
    });

    it("throws when validation is strict", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = judgeOf(node, "strict");

        expect(service.mode).equals("strict");

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

    it("refuses an endpoint again until it conforms", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = judgeOf(node, "strict");

        expect(() => service.validate(light)).throws(DeviceTypeConformanceError);
        expect(service.violationsOf(light)).deep.equals([]);
        expect(() => service.validate(light)).throws(DeviceTypeConformanceError);

        await node.close();
    });

    it("keeps what it reported for an endpoint it refuses", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = judgeOf(node, "strict");
        expect(captureLog(() => service.validate(light, { refuse: false })).length).equals(1);

        // DimmableLight adds the mandatory LevelControl server the light lacks
        await light.set({ descriptor: { deviceTypeList: deviceTypeList("OnOffLight", "DimmableLight") } });
        const refusedWith = () => {
            try {
                service.validate(light);
            } catch (error) {
                if (error instanceof DeviceTypeConformanceError) {
                    return error.errors.map(({ message }) => message.split(":")[0]);
                }
                throw error;
            }
        };

        expect(refusedWith()).deep.equals(["DimmableLight LevelControl"]);
        expect(refusedWith()).deep.equals(["DimmableLight LevelControl"]);

        const logged = captureLog(() => service.validate(light, { refuse: false }));
        expect(logged.length).equals(1);
        expect(logged[0].text).contains("LevelControl");
        expect(logged[0].text).not.contains("Identify");

        await node.close();
    });

    it("logs rather than throws in strict mode when told not to refuse", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });

        expect(captureLog(() => judgeOf(node, "strict").validate(light, { refuse: false })).length).equals(1);

        await node.close();
    });

    it("throws a misplaced singleton when validation is not strict", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithGroupKeyManagement, { id: "light" });
        const service = judgeOf(node);

        expect(service.mode).equals("warn");
        expect(() => service.validate(light)).throws(DeviceTypeConformanceError);

        await node.close();
    });

    it("throws the first refused endpoint carrying the others and logs none", async () => {
        const node = await createUnjudgedNode();
        const first = await node.add(lightWithoutIdentify, { id: "first" });
        const second = await node.add(lightWithoutIdentify, { id: "second" });
        const service = judgeOf(node, "strict");

        let error: unknown;
        const logged = captureLog(() => {
            try {
                service.validate([first, second]);
            } catch (e) {
                error = e;
            }
        });

        expect(error).instanceOf(DeviceTypeConformanceError);
        if (error instanceof DeviceTypeConformanceError) {
            expect(error.message).contains("first");
            const nested = error.errors.filter(cause => cause instanceof DeviceTypeConformanceError);
            expect(nested.map(({ message }) => message)).deep.equals([
                `Endpoint ${second} violates device type requirements`,
            ]);
            expect(nested[0].errors.map(({ message }: Error) => message)).contains(
                "OnOffLight Identify: Mandatory server cluster Identify is missing",
            );
        }
        expect(logged).deep.equals([]);

        // Neither counts as reported, so both are refused again
        expect(service.violationsOf(first).length || service.violationsOf(second).length).equals(0);
        expect(() => service.validate(first)).throws(DeviceTypeConformanceError);
        expect(() => service.validate(second)).throws(DeviceTypeConformanceError);

        await node.close();
    });

    it("records nothing for an addition it refuses", async () => {
        const node = await createUnjudgedNode();
        const parent = await node.add(lightWithoutIdentify, { id: "parent" });
        const child = await parent.add(lightWithoutIdentify, { id: "child" });
        const service = judgeOf(node, "strict");

        captureLog(() => expect(() => service.constructed(child)).throws(DeviceTypeConformanceError));

        expect(service.violationsOf(parent)).deep.equals([]);

        await node.close();
    });

    it("validates every endpoint of a node scope", async () => {
        const node = await createUnjudgedNode();
        const first = await node.add(lightWithoutIdentify, { id: "first" });
        const second = await node.add(lightWithoutIdentify, { id: "second" });
        const service = judgeOf(node);

        const logged = captureLog(() => service.validateNodeScope(first));

        expect(logged.filter(({ text }) => text.includes("first")).length).equals(1);
        expect(logged.filter(({ text }) => text.includes("second")).length).equals(1);
        expect(service.violationsOf(first).length && service.violationsOf(second).length).not.equals(0);

        await node.close();
    });

    it("does not judge an endpoint in no node scope", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });

        // RootNode is not a node here, so nothing is judged, though OnOffLight requires the missing Identify
        const service = new DeviceTypeConformanceService(node, { model: modelWithoutNodes() });

        expect(captureLog(() => service.validate(light))).deep.equals([]);
        expect(service.violationsOf(light)).deep.equals([]);

        await node.close();
    });

    it("validates no node scope for an endpoint in none", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = new DeviceTypeConformanceService(node, { model: modelWithoutNodes() });

        expect(captureLog(() => service.validateNodeScope(light))).deep.equals([]);
        expect(service.violationsOf(light)).deep.equals([]);

        await node.close();
    });

    it("reports an endpoint's violations again once it is forgotten", async () => {
        const node = await createUnjudgedNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = judgeOf(node);
        captureLog(() => service.validate(light));

        service.forget(light);

        expect(service.violationsOf(light)).deep.equals([]);
        expect(captureLog(() => service.validate(light)).length).equals(1);

        await node.close();
    });

    it("reports every endpoint again after a factory reset", async () => {
        const node = await createNode();
        const light = await node.add(lightWithoutIdentify, { id: "light" });
        const service = serviceOf(node);
        expect(service.violationsOf(light).length).not.equals(0);

        const logged = await captureLogOf(() => MockTime.resolve(node.erase(), { macrotasks: true }));

        expect(serviceOf(node)).equals(service);
        expect(logged.filter(({ text }) => text.includes("light")).length).equals(1);

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
        const pass = serverPass();

        expect(ResolvedEndpoint.of(light, pass)).equals(ResolvedEndpoint.of(light, pass));
        expect(ResolvedEndpoint.of(light, pass)).not.equals(ResolvedEndpoint.of(light, serverPass()));

        await node.close();
    });

    it("collects each node scope once per pass", async () => {
        const { node } = await createPair();
        const pass = serverPass();

        expect(ConditionAssertions.collect(node, pass)).equals(ConditionAssertions.collect(node, pass));
        expect(ConditionAssertions.collect(node, pass)).not.equals(ConditionAssertions.collect(node, serverPass()));

        await node.close();
    });
});
