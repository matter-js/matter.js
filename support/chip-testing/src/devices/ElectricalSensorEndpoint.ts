/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommonPositionTag, Endpoint } from "@matter/main";
import { DescriptorServer } from "@matter/main/behaviors/descriptor";
import { ElectricalEnergyMeasurementServer } from "@matter/main/behaviors/electrical-energy-measurement";
import { ElectricalPowerMeasurementServer } from "@matter/main/behaviors/electrical-power-measurement";
import { PowerTopologyServer } from "@matter/main/behaviors/power-topology";
import { ElectricalEnergyMeasurement } from "@matter/main/clusters/electrical-energy-measurement";
import { ElectricalPowerMeasurement } from "@matter/main/clusters/electrical-power-measurement";
import { PowerTopology } from "@matter/main/clusters/power-topology";
import { ElectricalSensorEndpoint } from "@matter/main/endpoints/electrical-sensor";
import { EndpointNumber, MeasurementType } from "@matter/main/types";
import { FakeElectricalReadingsHandler } from "../cluster/FakeElectricalReadingsHandler.js";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

// CHIP's SimulatedElectricalSensor in its generic role: every feature and every optional attribute, with readings
// from FakeElectricalReadingsHandler
const SimulatedElectricalSensor = ElectricalSensorEndpoint.with(
    DescriptorServer.with("TagList"),
    PowerTopologyServer.with(PowerTopology.Feature.SetTopology, PowerTopology.Feature.DynamicPowerFlow),
    ElectricalPowerMeasurementServer.with(
        ElectricalPowerMeasurement.Feature.AlternatingCurrent,
        ElectricalPowerMeasurement.Feature.PolyphasePower,
        ElectricalPowerMeasurement.Feature.DirectCurrent,
        ElectricalPowerMeasurement.Feature.Harmonics,
        ElectricalPowerMeasurement.Feature.PowerQuality,
    ),
    ElectricalEnergyMeasurementServer.with(
        ElectricalEnergyMeasurement.Feature.ImportedEnergy,
        ElectricalEnergyMeasurement.Feature.ExportedEnergy,
        ElectricalEnergyMeasurement.Feature.CumulativeEnergy,
        ElectricalEnergyMeasurement.Feature.PeriodicEnergy,
        ElectricalEnergyMeasurement.Feature.ApparentEnergy,
        ElectricalEnergyMeasurement.Feature.ReactiveEnergy,
    ),
    FakeElectricalReadingsHandler,
);

registerDeviceType({
    name: "electrical-sensor",
    async create(parent: Endpoint, endpoint: EndpointNumber) {
        const ep = new Endpoint(SimulatedElectricalSensor, {
            number: endpoint,
            descriptor: { tagList: [CommonPositionTag.Top] },
            powerTopology: { availableEndpoints: [], activeEndpoints: [] },
            electricalPowerMeasurement: {
                powerMode: ElectricalPowerMeasurement.PowerMode.Ac,
                numberOfMeasurementTypes: 1,
                accuracy: [
                    {
                        measurementType: MeasurementType.ActivePower,
                        measured: false,
                        minMeasuredValue: 0,
                        maxMeasuredValue: 10,
                        // CHIP gives no percent or fixed value here, which the spec requires at least one of
                        accuracyRanges: [{ rangeMin: 0, rangeMax: 10, percentMax: 100 }],
                    },
                ],
                ranges: [],
                activePower: 0,
                voltage: 0,
                activeCurrent: 0,
                reactiveCurrent: null,
                apparentCurrent: null,
                reactivePower: null,
                apparentPower: null,
                rmsVoltage: null,
                rmsCurrent: null,
                rmsPower: null,
                frequency: null,
                powerFactor: null,
                harmonicCurrents: [],
                harmonicPhases: [],
                neutralCurrent: null,
            },
            electricalEnergyMeasurement: {
                accuracy: {
                    measurementType: MeasurementType.ElectricalEnergy,
                    measured: false,
                    minMeasuredValue: 0,
                    maxMeasuredValue: 10,
                    accuracyRanges: [{ rangeMin: 0, rangeMax: 10, percentMax: 100 }],
                },
                cumulativeEnergyImported: null,
                cumulativeEnergyExported: null,
                periodicEnergyImported: null,
                periodicEnergyExported: null,
                cumulativeEnergyReset: null,
            },
        });
        await parent.add(ep);
        return { endpoint: ep };
    },
});
