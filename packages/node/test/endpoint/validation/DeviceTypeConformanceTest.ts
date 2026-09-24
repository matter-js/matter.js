/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BooleanStateServer } from "#behaviors/boolean-state";
import { DescriptorServer } from "#behaviors/descriptor";
import { GroupsServer } from "#behaviors/groups";
import { IdentifyClient, IdentifyServer } from "#behaviors/identify";
import { OnOffClient, OnOffServer } from "#behaviors/on-off";
import { DoorLockDevice } from "#devices/door-lock";
import { OnOffLightDevice, OnOffLightRequirements } from "#devices/on-off-light";
import { OnOffLightSwitchDevice } from "#devices/on-off-light-switch";
import { RainSensorDevice } from "#devices/rain-sensor";
import { SupportedBehaviors } from "#endpoint/properties/SupportedBehaviors.js";
import { SupportedClientClusters } from "#endpoint/properties/SupportedClientClusters.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { DeviceTypeConformanceError, DeviceTypeViolationError } from "#endpoint/validation/Violation.js";
import { ImplementationError, MatterAggregateError } from "@matter/general";
import { Matter, RequirementModel, RequirementResolver } from "@matter/model";
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

function switchWith(...clients: SupportedClientClusters.List) {
    return MutableEndpoint({
        name: "OnOffLightSwitch",
        deviceType: OnOffLightSwitchDevice.deviceType,
        deviceRevision: OnOffLightSwitchDevice.deviceRevision,
        behaviors: OnOffLightSwitchDevice.behaviors,
        clientClusters: SupportedClientClusters(...clients),
    });
}

// Carries the mandatory Identify and OnOff clients
const completeSwitch = switchWith(IdentifyClient, OnOffClient);

// Lacks the mandatory OnOff client
const switchWithoutOnOffClient = switchWith(IdentifyClient);

// Stand-in base for a device type that cannot start without implementations; only its Descriptor names the device type
const DescribedLight = OnOffLightDevice.with(DescriptorServer);

// BooleanState lacks the ChangeEvent feature, whose requirement depends on the revision
const rainSensorWithoutChangeEvent = RainSensorDevice.with(BooleanStateServer.with());

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

        expect(violationsOf(endpoint)).deep.equals([]);

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
