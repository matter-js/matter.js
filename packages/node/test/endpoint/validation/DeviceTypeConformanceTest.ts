/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AdministratorCommissioningServer } from "#behaviors/administrator-commissioning";
import { BindingServer } from "#behaviors/binding";
import { BooleanStateBehavior, BooleanStateServer } from "#behaviors/boolean-state";
import { DescriptorServer } from "#behaviors/descriptor";
import { GroupKeyManagementBehavior } from "#behaviors/group-key-management";
import { GroupsServer } from "#behaviors/groups";
import { IdentifyClient, IdentifyServer } from "#behaviors/identify";
import { OnOffClient, OnOffServer } from "#behaviors/on-off";
import { DoorLockDevice } from "#devices/door-lock";
import { OnOffLightDevice, OnOffLightRequirements } from "#devices/on-off-light";
import { OnOffLightSwitchDevice } from "#devices/on-off-light-switch";
import { RainSensorDevice } from "#devices/rain-sensor";
import { Endpoint } from "#endpoint/Endpoint.js";
import { SupportedBehaviors } from "#endpoint/properties/SupportedBehaviors.js";
import { SupportedClientClusters } from "#endpoint/properties/SupportedClientClusters.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { ConditionAssertions } from "#endpoint/validation/ConditionAssertions.js";
import { DeviceTypeConformance } from "#endpoint/validation/DeviceTypeConformance.js";
import { EndpointFacts } from "#endpoint/validation/EndpointFacts.js";
import { ValidationPass } from "#endpoint/validation/ValidationPass.js";
import { DeviceTypeConformanceError, DeviceTypeViolationError } from "#endpoint/validation/Violation.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { BridgedNodeEndpoint } from "#endpoints/bridged-node";
import { ImplementationError, MatterAggregateError } from "@matter/general";
import {
    ClusterModel,
    ConditionModel,
    DeviceTypeModel,
    FeatureMap,
    FieldModel,
    Matter,
    MatterModel,
    RequirementModel,
    RequirementResolver,
} from "@matter/model";
import { DoorLock } from "@matter/types/clusters/door-lock";
import { MockServerNode } from "../../node/mock-server-node.js";
import { createNode, deviceTypeList, violationsOf } from "./validation-helpers.js";

const { Identify, Groups, OnOff, ScenesManagement } = OnOffLightRequirements.server.mandatory;

function lightWith(...behaviors: SupportedBehaviors.List) {
    return MutableEndpoint({
        name: "OnOffLight",
        deviceType: OnOffLightDevice.deviceType,
        deviceRevision: OnOffLightDevice.deviceRevision,
        behaviors: SupportedBehaviors(...behaviors),
    });
}

// Lacks the mandatory Identify server, whose own nested TriggerEffect requirement must not repeat the finding
const lightWithoutIdentify = lightWith(Groups, OnOff, ScenesManagement);

// Lacks the mandatory ScenesManagement server, whose nested CopyScene requirement must not repeat the finding
const lightWithoutScenes = lightWith(Identify, Groups, OnOff);

// OnOff lacks the Lighting feature, which OnOffLight names by its title LIGHTING
const lightWithoutLighting = lightWith(Identify, Groups, OnOffServer, ScenesManagement);

// Identify lacks the TriggerEffect command
const lightWithoutTriggerEffect = lightWith(IdentifyServer, Groups, OnOff, ScenesManagement);

// Carries the Groups server that DoorLock disallows
const lockWithGroups = DoorLockDevice.with(GroupsServer);

const lockState = {
    lockState: DoorLock.LockState.Locked,
    lockType: DoorLock.LockType.DeadBolt,
    actuatorEnabled: true,
    operatingMode: DoorLock.OperatingMode.Normal,
};

function switchWith(servers: SupportedBehaviors.List, clients: SupportedClientClusters.List) {
    return MutableEndpoint({
        name: "OnOffLightSwitch",
        deviceType: OnOffLightSwitchDevice.deviceType,
        deviceRevision: OnOffLightSwitchDevice.deviceRevision,
        behaviors: SupportedBehaviors(...Object.values(OnOffLightSwitchDevice.behaviors), ...servers),
        clientClusters: SupportedClientClusters(...clients),
    });
}

// Carries the mandatory Identify and OnOff clients and the Binding server Base requires of a simple client
const completeSwitch = switchWith([BindingServer], [IdentifyClient, OnOffClient]);

// Lacks the mandatory OnOff client
const switchWithoutOnOffClient = switchWith([BindingServer], [IdentifyClient]);

// Lacks both the Identify server and the Identify client
const switchWithoutIdentify = MutableEndpoint({
    name: "OnOffLightSwitch",
    deviceType: OnOffLightSwitchDevice.deviceType,
    deviceRevision: OnOffLightSwitchDevice.deviceRevision,
    behaviors: SupportedBehaviors(BindingServer),
    clientClusters: SupportedClientClusters(OnOffClient),
});

// Lacks the Binding server that Base requires of a simple device type with an application client
const switchWithoutBinding = switchWith([], [IdentifyClient, OnOffClient]);

// Stand-in base for a device type that cannot start without implementations; only its Descriptor names the device type
const DescribedLight = OnOffLightDevice.with(DescriptorServer);

// BooleanState lacks the ChangeEvent feature, whose requirement depends on the revision; the StateChange emitter its
// base had remains, but the event is no longer emitted
const rainSensorWithoutChangeEvent = RainSensorDevice.with(BooleanStateServer.with());

// BooleanState derived without the ChangeEvent feature from a base that never had it, so no StateChange emitter exists
const rainSensorWithoutStateChange = RainSensorDevice.with(BooleanStateBehavior.with());

// Carries GroupKeyManagement, a singleton of RootNode. Stand-in: the unimplemented behavior, because the server
// cannot initialize off the root
const lightWithGroupKeyManagement = OnOffLightDevice.with(GroupKeyManagementBehavior);

// Carries OnOff, which RainSensor does not list and OnOffLight lists without the singleton quality
const rainSensorWithOnOff = RainSensorDevice.with(OnOffServer);

// Carries AdministratorCommissioning, a singleton of RootNode
const bridgedNodeWithAdministratorCommissioning = BridgedNodeEndpoint.with(AdministratorCommissioningServer);

/**
 * A model whose RootNode declares GroupKeyManagement a singleton and whose OnOffLight lists nothing. With
 * {@link bridgedNodeIsNode} BridgedNode is classified `node` and declares Identify a singleton.
 */
function singletonModel({ rootIsNode = true, bridgedNodeIsNode = false } = {}) {
    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "Base", classification: "base" }),
        new DeviceTypeModel(
            { name: "RootNode", id: 0x16, classification: rootIsNode ? "node" : "simple" },
            new RequirementModel({
                name: "GroupKeyManagement",
                id: 0x3f,
                element: "serverCluster",
                quality: "I",
            }),
        ),
        new DeviceTypeModel(
            { name: "BridgedNode", id: 0x13, classification: bridgedNodeIsNode ? "node" : "utility" },
            new RequirementModel({ name: "Identify", id: 3, element: "serverCluster", quality: "I" }),
        ),
        new DeviceTypeModel({ name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" }),
        new ClusterModel({ name: "Identify", id: 3 }),
        new ClusterModel({ name: "GroupKeyManagement", id: 0x3f }),
    );
    model.finalize();
    return model;
}

function singletonViolationsOf(endpoint: Endpoint, model?: MatterModel) {
    return violationsOf(endpoint, model)
        .filter(v => v.kind === "singletonMisplaced")
        .map(v => [v.deviceType, v.requirement]);
}

/**
 * A model whose OnOffLight requires OnOff with its Lighting feature under {@link conformance}, which may name the
 * OnOff feature `OFFONLY`, off on a standard light, and OnOffLight's condition `Wanted`.
 */
function lightingFeatureModel(conformance: string) {
    const featureMap = FeatureMap.clone();
    featureMap.children = [
        new FieldModel({ name: "LT", title: "Lighting", constraint: "0" }),
        new FieldModel({ name: "OFFONLY", title: "OffOnly", constraint: "2" }),
    ];

    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "Base", classification: "base" }),
        new DeviceTypeModel(
            { name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" },
            new ConditionModel({ name: "Wanted" }),
            new RequirementModel(
                { name: "OnOff", id: 6, element: "serverCluster", conformance: "M" },
                new RequirementModel({ name: "LT", element: "feature", conformance }),
            ),
        ),
        new ClusterModel({ name: "OnOff", id: 6, children: [featureMap] }),
    );
    model.finalize();
    return model;
}

function requirementOf(deviceType: string, ...path: string[]) {
    let model = Matter.deviceTypes(deviceType)?.get(RequirementModel, path[0]);
    for (const name of path.slice(1)) {
        model = model?.get(RequirementModel, name);
    }
    if (model === undefined) {
        throw new ImplementationError(`Test fixture names unknown requirement ${deviceType}.${path.join(".")}`);
    }
    return model;
}

describe("DeviceTypeConformance", () => {
    it("accepts a device type built from its own definition", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });

        expect(violationsOf(light)).deep.equals([]);

        await node.close();
    });

    it("reports a mandatory server cluster the endpoint lacks", async () => {
        const node = await createNode();
        const endpoint = await node.add(lightWithoutIdentify, { id: "light" });

        expect(requirementOf("OnOffLight", "Identify", "TriggerEffect").isMandatory).true;

        const violations = violationsOf(endpoint);

        expect(violations.length).equals(1);
        expect(violations[0].endpoint).equals(endpoint);
        expect(violations[0].deviceType).equals("OnOffLight");
        expect(violations[0].kind).equals("missing");
        expect(violations[0].requirement).equals("Identify");

        await node.close();
    });

    it("reports a missing cluster once, not again for its nested requirements", async () => {
        const node = await createNode();
        const endpoint = await node.add(lightWithoutScenes, { id: "light" });

        expect(requirementOf("OnOffLight", "ScenesManagement", "CopyScene").isMandatory).true;

        expect(violationsOf(endpoint).map(v => [v.kind, v.requirement])).deep.equals([["missing", "ScenesManagement"]]);

        await node.close();
    });

    it("reports a disallowed cluster the endpoint carries", async () => {
        const node = await createNode();
        const endpoint = await node.add(lockWithGroups, { id: "lock", doorLock: lockState });

        expect(String(requirementOf("DoorLock", "Groups").conformance)).equals("X");
        expect(violationsOf(endpoint).map(v => [v.kind, v.requirement])).deep.equals([["disallowed", "Groups"]]);

        await node.close();
    });

    it("accepts a disallowed cluster the endpoint does not carry", async () => {
        const node = await createNode();
        const endpoint = await node.add(DoorLockDevice, { id: "lock", doorLock: lockState });

        expect(requirementOf("DoorLock", "Groups").isDisallowed).true;

        expect(violationsOf(endpoint)).deep.equals([]);

        await node.close();
    });

    it("does not disallow an element only a false condition forbids", async () => {
        const node = await MockServerNode.createOnline();

        expect(String(requirementOf("RootNode", "AccessControl", "Extension").conformance)).equals("AclExtensionCond");
        expect(EndpointFacts.of(node).features("AccessControl").has("EXTS")).true;
        expect(ConditionAssertions.collect(node).conditions.get(node)?.has("AclExtensionCond")).false;

        expect(violationsOf(node).map(v => v.requirement)).not.includes("AccessControl.Extension");

        await node.close();
    });

    it("reports an element present that a feature term forbids", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });

        expect(violationsOf(light, lightingFeatureModel("OFFONLY")).map(v => [v.kind, v.requirement])).deep.equals([
            ["disallowed", "OnOff.LT"],
        ]);

        await node.close();
    });

    it("disallows by a feature term whatever condition it is combined with", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });

        const judged = (conformance: string) =>
            violationsOf(light, lightingFeatureModel(conformance)).map(v => [v.kind, v.requirement]);

        expect(judged("Wanted & OFFONLY")).deep.equals([["disallowed", "OnOff.LT"]]);
        expect(judged("Wanted | OFFONLY")).deep.equals([]);

        await node.close();
    });

    it("reports a mandatory feature named by its title by the feature's code", async () => {
        const node = await createNode();
        const endpoint = await node.add(lightWithoutLighting, { id: "light" });

        const requirement = requirementOf("OnOffLight", "OnOff", "LIGHTING");
        expect(RequirementResolver.featureOf(requirement)?.name).equals("LT");

        expect(violationsOf(endpoint).map(v => [v.kind, v.requirement])).deep.equals([["missing", "OnOff.LT"]]);

        await node.close();
    });

    it("reports a mandatory command the cluster does not implement", async () => {
        const node = await createNode();
        const endpoint = await node.add(lightWithoutTriggerEffect, { id: "light" });

        expect(violationsOf(endpoint).map(v => [v.kind, v.requirement])).deep.equals([
            ["missing", "Identify.TriggerEffect"],
        ]);

        await node.close();
    });

    it("does not report a requirement whose conformance it cannot decide", async () => {
        const node = await createNode();
        const endpoint = await node.add(rainSensorWithoutChangeEvent, { id: "rain" });

        expect(String(requirementOf("RainSensor", "BooleanState", "CHANGEEVENT").conformance)).equals("Rev >= v2");
        expect(EndpointFacts.of(endpoint).features("BooleanState").has("CHGEVENT")).false;

        expect(violationsOf(endpoint).map(v => v.requirement)).not.includes("BooleanState.CHGEVENT");

        await node.close();
    });

    it("accepts a mandatory event the cluster emits", async () => {
        const node = await createNode();
        const endpoint = await node.add(RainSensorDevice, { id: "rain" });

        expect(violationsOf(endpoint)).deep.equals([]);

        await node.close();
    });

    it("reports a mandatory event whose emitter survives from a base with the feature on", async () => {
        const node = await createNode();
        const endpoint = await node.add(rainSensorWithoutChangeEvent, { id: "rain" });

        expect(violationsOf(endpoint).map(v => [v.kind, v.requirement])).deep.equals([
            ["missing", "BooleanState.StateChange"],
        ]);

        await node.close();
    });

    it("reports a mandatory event the cluster has no emitter for", async () => {
        const node = await createNode();
        const endpoint = await node.add(rainSensorWithoutStateChange, { id: "rain" });

        expect(violationsOf(endpoint).map(v => [v.kind, v.requirement])).deep.equals([
            ["missing", "BooleanState.StateChange"],
        ]);

        await node.close();
    });

    it("accepts mandatory client clusters in the client list", async () => {
        const node = await createNode();
        const endpoint = await node.add(completeSwitch, { id: "switch" });

        expect(violationsOf(endpoint)).deep.equals([]);

        await node.close();
    });

    it("reports a mandatory client cluster missing from the client list", async () => {
        const node = await createNode();
        const endpoint = await node.add(switchWithoutOnOffClient, { id: "switch" });

        expect(violationsOf(endpoint).map(v => [v.kind, v.requirement])).deep.equals([["missing", "client:OnOff"]]);

        await node.close();
    });

    it("reports a cluster missing on both sides once per side", async () => {
        const node = await createNode();
        const endpoint = await node.add(switchWithoutIdentify, { id: "switch" });

        expect(violationsOf(endpoint).map(v => [v.kind, v.requirement])).deep.equals([
            ["missing", "Identify"],
            ["missing", "client:Identify"],
        ]);

        await node.close();
    });

    it("skips a device type the model does not know", async () => {
        const node = await createNode();

        // Stand-in: a light lacking Identify whose Descriptor lists only a manufacturer-specific device type
        const endpoint = await node.add(lightWithoutIdentify.with(DescriptorServer), {
            id: "custom",
            descriptor: { deviceTypeList: deviceTypeList(0xfff1_0000) },
        });

        expect(violationsOf(endpoint)).deep.equals([]);

        await node.close();
    });

    it("does not report a component's requirements against the composing endpoint", async () => {
        const node = await createNode();

        // Stand-in: a light whose Descriptor lists BatteryStorage, which requires its ElectricalSensor component to
        // carry ElectricalPowerMeasurement
        const endpoint = await node.add(DescribedLight, {
            id: "battery",
            descriptor: { deviceTypeList: deviceTypeList("BatteryStorage") },
        });

        expect(requirementOf("BatteryStorage", "ElectricalSensor", "ElectricalPowerMeasurement").isMandatory).true;

        // The missing components are reported by count; their nested requirements are not
        expect(violationsOf(endpoint).filter(({ kind }) => kind !== "instanceCount")).deep.equals([]);

        await node.close();
    });

    it("reports a stated condition the scope does not name, with the declared spelling", async () => {
        const node = await createNode();
        const endpoint = await node.add(OnOffLightDevice, { id: "light", deviceConditions: ["duplicate"] });

        expect(violationsOf(endpoint).map(v => [v.kind, v.requirement, v.detail])).deep.equals([
            ["unknownCondition", "duplicate", 'Unknown condition "duplicate"; did you mean "Duplicate"?'],
        ]);

        await node.close();
    });

    describe("Base requirements", () => {
        it("requires Binding of a simple device type with an application client", async () => {
            const node = await createNode();
            const endpoint = await node.add(switchWithoutBinding, { id: "switch" });

            expect(violationsOf(endpoint).map(v => [v.deviceType, v.kind, v.requirement])).deep.equals([
                ["Base", "missing", "Binding"],
            ]);

            await node.close();
        });

        it("does not report Binding on an endpoint Base does not require it of", async () => {
            const node = await createNode();
            const endpoint = await node.add(OnOffLightDevice.with(BindingServer), { id: "light" });

            expect(violationsOf(endpoint)).deep.equals([]);

            await node.close();
        });

        it("requires TagList of endpoints that duplicate a sibling's device type", async () => {
            const node = await createNode();
            const first = await node.add(OnOffLightDevice, { id: "first" });
            const second = await node.add(OnOffLightDevice, { id: "second" });

            for (const endpoint of [first, second]) {
                expect(violationsOf(endpoint).map(v => [v.deviceType, v.kind, v.requirement])).deep.equals([
                    ["Base", "missing", "Descriptor.TAGLIST"],
                ]);
            }

            await node.close();
        });

        it("requires no TagList of an aggregator's children, which disambiguate by NodeLabel", async () => {
            const node = await createNode();
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            const bridged = [
                await aggregator.add(OnOffLightDevice, { id: "first" }),
                await aggregator.add(OnOffLightDevice, { id: "second" }),
            ];
            const parent = await node.add(DescribedLight, { id: "parent" });
            const composed = [
                await parent.add(OnOffLightDevice, { id: "first" }),
                await parent.add(OnOffLightDevice, { id: "second" }),
            ];

            const tagList = (endpoint: Endpoint) =>
                violationsOf(endpoint)
                    .filter(v => v.requirement === "Descriptor.TAGLIST")
                    .map(v => v.deviceType);
            for (const endpoint of bridged) {
                expect(ConditionAssertions.collect(node).conditions.get(endpoint)?.has("Duplicate")).true;
                expect(tagList(endpoint)).deep.equals([]);
            }
            for (const endpoint of composed) {
                expect(tagList(endpoint)).deep.equals(["Base"]);
            }

            await node.close();
        });

        it("requires neither Binding nor TagList of the node endpoint", async () => {
            const node = await createNode();
            await node.add(completeSwitch, { id: "switch" });

            expect(violationsOf(node).map(v => v.requirement))
                .not.includes("Binding")
                .and.not.includes("Descriptor.TAGLIST");

            await node.close();
        });

        it("reports a requirement Base and a device type both state once, as the device type's", async () => {
            const node = await createNode();

            // Stand-ins: two siblings whose Descriptors list ClosurePanel, which requires TagList itself
            const endpoints = new Array<Endpoint>();
            for (const id of ["panel1", "panel2"]) {
                endpoints.push(
                    await node.add(DescribedLight, {
                        id,
                        descriptor: { deviceTypeList: deviceTypeList("ClosurePanel") },
                    }),
                );
            }

            expect(requirementOf("ClosurePanel", "Descriptor", "TAGLIST").isMandatory).true;

            const tagList = violationsOf(endpoints[0]).filter(v => v.requirement === "Descriptor.TAGLIST");
            expect(tagList.map(v => [v.deviceType, v.kind])).deep.equals([["ClosurePanel", "missing"]]);

            await node.close();
        });
    });

    describe("singleton placement", () => {
        it("accepts the singletons on the endpoint that declares them", async () => {
            const node = await MockServerNode.createOnline();

            expect(singletonViolationsOf(node)).deep.equals([]);

            await node.close();
        });

        it("reports a singleton on another endpoint of the node scope", async () => {
            const node = await createNode();
            const light = await node.add(lightWithGroupKeyManagement, { id: "light" });

            expect(requirementOf("RootNode", "GroupKeyManagement").quality.singleton).true;

            const violations = violationsOf(light).filter(v => v.kind === "singletonMisplaced");
            expect(violations.length).equals(1);
            expect(violations[0].endpoint).equals(light);
            expect(violations[0].deviceType).equals("RootNode");
            expect(violations[0].requirement).equals("GroupKeyManagement");

            await node.close();
        });

        it("reports a RootNode singleton on a bridged node", async () => {
            // A bridged node is inside the root's node scope until Bridged Node is classified as a node
            const node = await createNode();
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            const bridged = await aggregator.add(bridgedNodeWithAdministratorCommissioning, { id: "bridged" });

            expect(singletonViolationsOf(bridged)).deep.equals([["RootNode", "AdministratorCommissioning"]]);

            await node.close();
        });

        it("accepts a cluster that another device type lists as no singleton", async () => {
            const node = await createNode();
            await node.add(OnOffLightDevice, { id: "light" });
            const sensor = await node.add(rainSensorWithOnOff, { id: "sensor" });

            expect(requirementOf("OnOffLight", "OnOff").quality.singleton).not.true;

            expect(singletonViolationsOf(sensor)).deep.equals([]);

            await node.close();
        });

        it("judges no singleton outside a node scope", async () => {
            const node = await createNode();
            const light = await node.add(lightWithGroupKeyManagement, { id: "light" });

            // Stand-in model: the same tree has a node scope only while RootNode is classified node
            expect(singletonViolationsOf(light, singletonModel())).deep.equals([["RootNode", "GroupKeyManagement"]]);
            expect(singletonViolationsOf(light, singletonModel({ rootIsNode: false }))).deep.equals([]);

            await node.close();
        });

        it("keeps a nested node scope's singletons to itself", async () => {
            const node = await createNode();
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            const bridged = await aggregator.add(BridgedNodeEndpoint.with(GroupKeyManagementBehavior), {
                id: "bridged",
            });
            const light = await node.add(OnOffLightDevice, { id: "light" });

            // Stand-in model: BridgedNode is a node declaring Identify a singleton, so neither scope sees the other's
            // declarations
            const model = singletonModel({ bridgedNodeIsNode: true });
            expect(singletonViolationsOf(bridged, model)).deep.equals([]);
            expect(singletonViolationsOf(light, model)).deep.equals([]);

            await node.close();
        });
    });

    it("does not treat another device type's condition as known to a requirement", async () => {
        // OnOffLight's Groups requirement names a condition only Foreigner declares; the name is unknown to OnOffLight,
        // so the requirement is undecided rather than disallowed
        const model = new MatterModel(
            {},
            new DeviceTypeModel({ name: "Base", classification: "base" }),
            new DeviceTypeModel(
                { name: "Foreigner", id: 0xfff1_0010, classification: "simple" },
                new ConditionModel({ name: "Foreign" }),
            ),
            new DeviceTypeModel(
                { name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" },
                new RequirementModel({ name: "Groups", id: 4, element: "serverCluster", conformance: "Foreign" }),
            ),
            new ClusterModel({ name: "Groups", id: 4 }),
        );
        model.finalize();

        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const pass = new ValidationPass(model);

        expect(DeviceTypeConformance.check(light, ConditionAssertions.collect(node, pass), pass)).deep.equals([]);

        await node.close();
    });

    it("aggregates violation errors", () => {
        const error = new DeviceTypeConformanceError("light", [
            new DeviceTypeViolationError({
                deviceType: "OnOffLight",
                requirement: "Identify",
                detail: "Mandatory server cluster Identify is missing",
            }),
        ]);

        expect(error).instanceof(MatterAggregateError);
        expect(error.errors[0]).instanceof(ImplementationError);
        expect(error.message).equals("Endpoint light does not conform to its device types");
        expect(error.errors[0].message).equals("OnOffLight Identify: Mandatory server cluster Identify is missing");
    });
});
