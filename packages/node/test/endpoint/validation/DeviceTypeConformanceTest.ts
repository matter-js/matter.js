/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BindingServer } from "#behaviors/binding";
import { BooleanStateBehavior, BooleanStateServer } from "#behaviors/boolean-state";
import { DescriptorServer } from "#behaviors/descriptor";
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
import { DeviceTypeConformanceError, DeviceTypeViolationError } from "#endpoint/validation/Violation.js";
import { ImplementationError, MatterAggregateError } from "@matter/general";
import {
    ClusterModel,
    ConditionModel,
    DeviceTypeModel,
    Matter,
    MatterModel,
    RequirementModel,
    RequirementResolver,
} from "@matter/model";
import { DoorLock } from "@matter/types/clusters/door-lock";
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

// Lacks the Binding server that Base requires of a simple device type with an application client
const switchWithoutBinding = switchWith([], [IdentifyClient, OnOffClient]);

// Stand-in base for a device type that cannot start without implementations; only its Descriptor names the device type
const DescribedLight = OnOffLightDevice.with(DescriptorServer);

// BooleanState lacks the ChangeEvent feature, whose requirement depends on the revision; the StateChange emitter its
// base had remains, but the event is no longer emitted
const rainSensorWithoutChangeEvent = RainSensorDevice.with(BooleanStateServer.with());

// BooleanState derived without the ChangeEvent feature from a base that never had it, so no StateChange emitter exists
const rainSensorWithoutStateChange = RainSensorDevice.with(BooleanStateBehavior.with());

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

        expect(violationsOf(endpoint).map(v => [v.kind, v.requirement])).deep.equals([["missing", "OnOff"]]);

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

        expect(violationsOf(endpoint)).deep.equals([]);

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

        const { conditions } = ConditionAssertions.collect(node, model);
        expect(DeviceTypeConformance.check(light, conditions, model)).deep.equals([]);

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
