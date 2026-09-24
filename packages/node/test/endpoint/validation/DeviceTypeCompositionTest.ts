/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorServer } from "#behaviors/descriptor";
import { DeviceEnergyManagementServer } from "#behaviors/device-energy-management";
import { ElectricalEnergyMeasurementServer } from "#behaviors/electrical-energy-measurement";
import { ElectricalPowerMeasurementServer } from "#behaviors/electrical-power-measurement";
import { PowerSourceServer } from "#behaviors/power-source";
import { PowerTopologyServer } from "#behaviors/power-topology";
import { BatteryStorageDevice } from "#devices/battery-storage";
import { MeterReferencePointDevice } from "#devices/meter-reference-point";
import { OnOffLightDevice } from "#devices/on-off-light";
import { TemperatureSensorDevice } from "#devices/temperature-sensor";
import { Endpoint } from "#endpoint/Endpoint.js";
import { DeviceEnergyManagementEndpoint } from "#endpoints/device-energy-management";
import { ElectricalSensorEndpoint } from "#endpoints/electrical-sensor";
import { PowerSourceEndpoint } from "#endpoints/power-source";
import { MeasurementType } from "@matter/types";
import { DeviceEnergyManagement } from "@matter/types/clusters/device-energy-management";
import { ElectricalPowerMeasurement } from "@matter/types/clusters/electrical-power-measurement";
import { PowerSource } from "@matter/types/clusters/power-source";
import { addCabinet, addRefrigerator, createNode, deviceTypeList, violationsOf } from "./validation-helpers.js";

const DescribedLight = OnOffLightDevice.with(DescriptorServer);
const TaggedDescriptor = DescriptorServer.with("TagList");
const tagList = [{ mfgCode: null, namespaceId: 7, tag: 0, label: null }];

type Current = "AlternatingCurrent" | "DirectCurrent";
type Energy = "ImportedEnergy" | "ExportedEnergy";

function electricalSensor(current: Current, energy: Energy) {
    return ElectricalSensorEndpoint.with(
        TaggedDescriptor,
        PowerTopologyServer.with("NodeTopology"),
        ElectricalPowerMeasurementServer.with(current),
        ElectricalEnergyMeasurementServer.with(energy, "CumulativeEnergy"),
    );
}

function accuracyOf(measurementType: MeasurementType) {
    return {
        measurementType,
        measured: true,
        minMeasuredValue: 0,
        maxMeasuredValue: 100000,
        accuracyRanges: [{ rangeMin: 0, rangeMax: 100000, fixedMax: 10 }],
    };
}

const sensorState = {
    descriptor: { tagList },
    electricalPowerMeasurement: {
        powerMode: ElectricalPowerMeasurement.PowerMode.Ac,
        numberOfMeasurementTypes: 1,
        accuracy: [accuracyOf(MeasurementType.ActivePower)],
        activePower: null,
        voltage: null,
        activeCurrent: null,
    },
    electricalEnergyMeasurement: { accuracy: accuracyOf(MeasurementType.ElectricalEnergy) },
};

async function addSensor(parent: Endpoint, id: string, current: Current, energy: Energy = "ExportedEnergy") {
    return parent.add(electricalSensor(current, energy), { id, ...sensorState });
}

async function addWiredSource(parent: Endpoint) {
    return parent.add(PowerSourceEndpoint.with(TaggedDescriptor, PowerSourceServer.with("Wired")), {
        id: "wired",
        descriptor: { tagList },
        powerSource: { status: PowerSource.PowerSourceStatus.Active, order: 0, description: "Mains" },
    });
}

async function addBatterySource(parent: Endpoint) {
    return parent.add(PowerSourceEndpoint.with(TaggedDescriptor, PowerSourceServer.with("Battery", "Rechargeable")), {
        id: "battery",
        descriptor: { tagList },
        powerSource: {
            status: PowerSource.PowerSourceStatus.Active,
            order: 1,
            description: "Battery",
            batVoltage: null,
            batPercentRemaining: null,
            batTimeRemaining: null,
            activeBatFaults: [],
            batCapacity: 10000,
            batReplacementNeeded: false,
            batReplaceability: PowerSource.BatReplaceability.NotReplaceable,
            batChargeLevel: PowerSource.BatChargeLevel.Ok,
            batChargeState: PowerSource.BatChargeState.IsCharging,
            batFunctionalWhileCharging: true,
            batTimeToFullCharge: null,
            batChargingCurrent: null,
            activeBatChargeFaults: [],
        },
    });
}

async function addEnergyManagement(parent: Endpoint) {
    return parent.add(DeviceEnergyManagementEndpoint.with(DeviceEnergyManagementServer.with("PowerAdjustment")), {
        id: "dem",
        deviceEnergyManagement: {
            esaType: DeviceEnergyManagement.EsaType.BatteryStorage,
            esaCanGenerate: true,
            esaState: DeviceEnergyManagement.EsaState.Online,
            absMinPower: 0,
            absMaxPower: 1000,
            optOutState: DeviceEnergyManagement.OptOutState.NoOptOut,
            powerAdjustmentCapability: null,
        },
    });
}

/**
 * A battery storage with its power sources and energy management but no electrical sensors.
 */
async function addStorage(parent: Endpoint) {
    const storage = await parent.add(BatteryStorageDevice, { id: "storage" });
    await addWiredSource(storage);
    await addBatterySource(storage);
    await addEnergyManagement(storage);
    return storage;
}

/**
 * An endpoint whose Descriptor lists only {@link deviceType}, standing in for a device that cannot start without
 * implementations. Composition reads no more than the Descriptor of an endpoint that no nested requirement judges.
 */
async function addStandIn(parent: Endpoint, id: string, deviceType: string) {
    return parent.add(DescribedLight, { id, descriptor: { deviceTypeList: deviceTypeList(deviceType) } });
}

describe("composition", () => {
    it("accepts a refrigerator with a cabinet", async () => {
        const node = await createNode();
        const { fridge } = await addRefrigerator(node, { cabinets: 1 });

        expect(violationsOf(fridge)).deep.equals([]);

        await node.close();
    });

    it("reports a refrigerator with no cabinet", async () => {
        const node = await createNode();
        const { fridge } = await addRefrigerator(node, { cabinets: 0 });

        const violations = violationsOf(fridge);

        expect(violations.map(({ kind, requirement, deviceType }) => ({ kind, requirement, deviceType }))).deep.equals([
            { kind: "instanceCount", requirement: "device:TemperatureControlledCabinet", deviceType: "Refrigerator" },
            { kind: "instanceCount", requirement: "condition:Cooler", deviceType: "Refrigerator" },
        ]);
        expect(violations[0].detail).includes("min 1");
        expect(violations[1].detail).includes("min 1");

        await node.close();
    });

    it("does not count a child of another device type", async () => {
        const node = await createNode();
        const { fridge } = await addRefrigerator(node, { cabinets: 0 });
        await fridge.add(OnOffLightDevice, { id: "light" });

        expect(violationsOf(fridge).map(({ requirement }) => requirement)).includes(
            "device:TemperatureControlledCabinet",
        );

        await node.close();
    });

    it("does not count an endpoint of a nested node", async () => {
        const node = await createNode();
        const { fridge } = await addRefrigerator(node, { cabinets: 0, fullFamily: true });
        const nested = await addStandIn(fridge, "nested", "RootNode");
        await addCabinet(nested, "beyond");

        expect(violationsOf(fridge).map(({ requirement }) => requirement)).includes(
            "device:TemperatureControlledCabinet",
        );

        await node.close();
    });

    it("matches two instances of one component device type", async () => {
        const node = await createNode();
        const storage = await addStorage(node);
        await addSensor(storage, "ac", "AlternatingCurrent");
        await addSensor(storage, "dc", "DirectCurrent");

        expect(violationsOf(storage)).deep.equals([]);

        await node.close();
    });

    it("reports a second instance no child satisfies", async () => {
        const node = await createNode();
        const storage = await addStorage(node);
        await addSensor(storage, "ac1", "AlternatingCurrent");
        const ac2 = await addSensor(storage, "ac2", "AlternatingCurrent");

        const violations = violationsOf(storage);

        expect(violations.map(({ kind, requirement }) => ({ kind, requirement }))).deep.equals([
            { kind: "instanceCount", requirement: "device:ElectricalSensor#2" },
        ]);
        expect(violations[0].detail).includes("ElectricalPowerMeasurement.DIRC");
        expect(violationsOf(ac2)).deep.equals([]);

        await node.close();
    });

    it("reports on the component a child that satisfies no instance, naming the closest", async () => {
        const node = await createNode();
        const storage = await addStorage(node);
        await addSensor(storage, "ac", "AlternatingCurrent");
        await addSensor(storage, "dc", "DirectCurrent");
        // Measures imported energy where both instances require exported energy
        const importing = await addSensor(storage, "importing", "AlternatingCurrent", "ImportedEnergy");

        const violations = violationsOf(importing);

        expect(violations.map(({ kind, requirement, deviceType }) => ({ kind, requirement, deviceType }))).deep.equals([
            { kind: "missing", requirement: "device:BatteryStorage/ElectricalSensor", deviceType: "BatteryStorage" },
        ]);
        expect(violations[0].detail).includes("instance 1, the closest, fails ElectricalEnergyMeasurement.EXPE");
        expect(violationsOf(storage)).deep.equals([]);

        await node.close();
    });

    it("judges an optional component that is present", async () => {
        const node = await createNode();
        const storage = await addStorage(node);
        await addSensor(storage, "ac", "AlternatingCurrent");
        await addSensor(storage, "dc", "DirectCurrent");
        const sensor = await storage.add(TemperatureSensorDevice, { id: "temperature" });

        const violations = violationsOf(sensor);

        expect(violations.map(({ kind, requirement }) => ({ kind, requirement }))).deep.equals([
            { kind: "missing", requirement: "device:BatteryStorage/TemperatureSensor" },
        ]);
        expect(violations[0].detail).includes("Descriptor.TAGLIST");
        expect(violationsOf(storage)).deep.equals([]);

        await node.close();
    });

    it("reports the root when a descendant asserts a condition that requires a component", async () => {
        const node = await createNode();
        await addStandIn(node, "camera", "Camera");

        expect(violationsOf(node).map(({ requirement }) => requirement)).includes("device:PowerSource");

        await addWiredSource(node);

        expect(violationsOf(node).map(({ requirement }) => requirement)).not.includes("device:PowerSource");

        await node.close();
    });

    describe("choice", () => {
        it("requires one of the choice once its condition holds", async () => {
            const node = await createNode();
            const meter = await node.add(MeterReferencePointDevice, {
                id: "meter",
                deviceConditions: ["ElectricalEnergy"],
            });

            const violations = violationsOf(meter);

            expect(violations.map(({ kind, requirement }) => ({ kind, requirement }))).deep.equals([
                { kind: "instanceCount", requirement: "device:ElectricalEnergyTariff|ElectricalMeter" },
            ]);
            expect(violations[0].detail).includes("at least 1");

            await node.close();
        });

        it("accepts one member of the choice", async () => {
            const node = await createNode();
            const meter = await node.add(MeterReferencePointDevice, {
                id: "meter",
                deviceConditions: ["ElectricalEnergy"],
            });
            await addStandIn(meter, "electrical", "ElectricalMeter");

            expect(violationsOf(meter)).deep.equals([]);

            await node.close();
        });

        it("disallows a member while its condition does not hold", async () => {
            const node = await createNode();
            const meter = await node.add(MeterReferencePointDevice, { id: "meter" });
            await addStandIn(meter, "electrical", "ElectricalMeter");

            expect(violationsOf(meter).map(({ kind, requirement }) => ({ kind, requirement }))).deep.equals([
                { kind: "disallowed", requirement: "device:ElectricalMeter" },
            ]);

            await node.close();
        });
    });
});
